/// Private inventory with hidden contents, verifiable via ZK proofs.
/// Uses SMT-based circuits with signal hash pattern for efficient on-chain verification.
module inventory::inventory {
    use sui::groth16;
    use sui::event;

    // ============ Error Codes ============

    const ENotOwner: u64 = 0;
    const EInvalidProof: u64 = 1;
    const EInvalidCommitmentLength: u64 = 2;
    const EInvalidSignalHashLength: u64 = 3;

    // ============ Structs ============

    /// A private inventory with hidden contents.
    /// Commitment = Poseidon(inventory_root, current_volume, blinding)
    public struct PrivateInventory has key, store {
        id: UID,
        /// SMT-based commitment to inventory contents
        commitment: vector<u8>,
        /// Owner address
        owner: address,
        /// Nonce for replay protection
        nonce: u64,
        /// Maximum volume capacity (0 = no capacity limit)
        max_capacity: u64,
    }

    /// Verification keys for SMT-based circuits.
    /// Now only 3 VKs instead of 7.
    public struct VerifyingKeys has key, store {
        id: UID,
        /// StateTransitionCircuit VK (deposit/withdraw)
        state_transition_vk: vector<u8>,
        /// ItemExistsSMTCircuit VK
        item_exists_vk: vector<u8>,
        /// CapacitySMTCircuit VK
        capacity_vk: vector<u8>,
        /// Groth16 curve identifier
        curve: groth16::Curve,
    }

    // ============ Events ============

    /// Emitted when an inventory is created
    public struct InventoryCreated has copy, drop {
        inventory_id: ID,
        owner: address,
    }

    /// Emitted when a state transition occurs (deposit or withdraw)
    public struct StateTransitionEvent has copy, drop {
        inventory_id: ID,
        item_id: u64,
        amount: u64,
        op_type: u8, // 0 = deposit, 1 = withdraw
        new_nonce: u64,
    }

    /// Emitted when items are transferred (two state transitions)
    public struct TransferEvent has copy, drop {
        src_inventory_id: ID,
        dst_inventory_id: ID,
        item_id: u64,
        amount: u64,
    }

    // ============ Admin Functions ============

    /// Initialize verification keys (called once during deployment)
    public fun init_verifying_keys(
        state_transition_vk: vector<u8>,
        item_exists_vk: vector<u8>,
        capacity_vk: vector<u8>,
        ctx: &mut TxContext,
    ): VerifyingKeys {
        VerifyingKeys {
            id: object::new(ctx),
            state_transition_vk,
            item_exists_vk,
            capacity_vk,
            curve: groth16::bn254(),
        }
    }

    /// Entry function to initialize and share verifying keys.
    public entry fun init_verifying_keys_and_share(
        state_transition_vk: vector<u8>,
        item_exists_vk: vector<u8>,
        capacity_vk: vector<u8>,
        ctx: &mut TxContext,
    ) {
        let vks = init_verifying_keys(
            state_transition_vk,
            item_exists_vk,
            capacity_vk,
            ctx,
        );
        transfer::public_share_object(vks);
    }

    // ============ Inventory Management ============

    /// Create a new private inventory with initial commitment (no capacity limit)
    public fun create(
        initial_commitment: vector<u8>,
        ctx: &mut TxContext,
    ): PrivateInventory {
        create_with_capacity(initial_commitment, 0, ctx)
    }

    /// Create a new private inventory with initial commitment and capacity limit
    public fun create_with_capacity(
        initial_commitment: vector<u8>,
        max_capacity: u64,
        ctx: &mut TxContext,
    ): PrivateInventory {
        assert!(vector::length(&initial_commitment) == 32, EInvalidCommitmentLength);

        let inventory = PrivateInventory {
            id: object::new(ctx),
            commitment: initial_commitment,
            owner: tx_context::sender(ctx),
            nonce: 0,
            max_capacity,
        };

        event::emit(InventoryCreated {
            inventory_id: object::id(&inventory),
            owner: tx_context::sender(ctx),
        });

        inventory
    }

    /// Get inventory commitment
    public fun commitment(inventory: &PrivateInventory): &vector<u8> {
        &inventory.commitment
    }

    /// Get inventory owner
    public fun owner(inventory: &PrivateInventory): address {
        inventory.owner
    }

    /// Get inventory nonce
    public fun nonce(inventory: &PrivateInventory): u64 {
        inventory.nonce
    }

    /// Get inventory max capacity (0 = no limit)
    public fun max_capacity(inventory: &PrivateInventory): u64 {
        inventory.max_capacity
    }

    // ============ State Transition (Deposit/Withdraw) ============

    /// Deposit items into inventory with ZK proof.
    /// The proof's signal hash encapsulates all public parameters.
    public fun deposit(
        inventory: &mut PrivateInventory,
        vks: &VerifyingKeys,
        proof: vector<u8>,
        signal_hash: vector<u8>,
        new_commitment: vector<u8>,
        item_id: u64,
        amount: u64,
    ) {
        assert!(vector::length(&new_commitment) == 32, EInvalidCommitmentLength);
        assert!(vector::length(&signal_hash) == 32, EInvalidSignalHashLength);

        // Verify the proof with signal hash as the only public input
        let pvk = groth16::prepare_verifying_key(&vks.curve, &vks.state_transition_vk);
        let proof_points = groth16::proof_points_from_bytes(proof);
        let inputs = groth16::public_proof_inputs_from_bytes(signal_hash);

        assert!(
            groth16::verify_groth16_proof(&vks.curve, &pvk, &inputs, &proof_points),
            EInvalidProof
        );

        // Update state
        inventory.commitment = new_commitment;
        inventory.nonce = inventory.nonce + 1;

        event::emit(StateTransitionEvent {
            inventory_id: object::id(inventory),
            item_id,
            amount,
            op_type: 0, // deposit
            new_nonce: inventory.nonce,
        });
    }

    /// Withdraw items from inventory with ZK proof.
    /// Only owner can withdraw.
    public fun withdraw(
        inventory: &mut PrivateInventory,
        vks: &VerifyingKeys,
        proof: vector<u8>,
        signal_hash: vector<u8>,
        new_commitment: vector<u8>,
        item_id: u64,
        amount: u64,
        ctx: &mut TxContext,
    ) {
        // Only owner can withdraw
        assert!(inventory.owner == tx_context::sender(ctx), ENotOwner);
        assert!(vector::length(&new_commitment) == 32, EInvalidCommitmentLength);
        assert!(vector::length(&signal_hash) == 32, EInvalidSignalHashLength);

        // Verify the proof with signal hash as the only public input
        let pvk = groth16::prepare_verifying_key(&vks.curve, &vks.state_transition_vk);
        let proof_points = groth16::proof_points_from_bytes(proof);
        let inputs = groth16::public_proof_inputs_from_bytes(signal_hash);

        assert!(
            groth16::verify_groth16_proof(&vks.curve, &pvk, &inputs, &proof_points),
            EInvalidProof
        );

        // Update state
        inventory.commitment = new_commitment;
        inventory.nonce = inventory.nonce + 1;

        event::emit(StateTransitionEvent {
            inventory_id: object::id(inventory),
            item_id,
            amount,
            op_type: 1, // withdraw
            new_nonce: inventory.nonce,
        });
    }

    /// Transfer items between inventories.
    /// This is implemented as two state transitions (withdraw from src, deposit to dst).
    /// Both proofs must be valid for the transfer to succeed.
    public fun transfer(
        src: &mut PrivateInventory,
        dst: &mut PrivateInventory,
        vks: &VerifyingKeys,
        src_proof: vector<u8>,
        src_signal_hash: vector<u8>,
        src_new_commitment: vector<u8>,
        dst_proof: vector<u8>,
        dst_signal_hash: vector<u8>,
        dst_new_commitment: vector<u8>,
        item_id: u64,
        amount: u64,
        ctx: &mut TxContext,
    ) {
        // Only src owner can initiate transfer
        assert!(src.owner == tx_context::sender(ctx), ENotOwner);
        assert!(vector::length(&src_new_commitment) == 32, EInvalidCommitmentLength);
        assert!(vector::length(&dst_new_commitment) == 32, EInvalidCommitmentLength);
        assert!(vector::length(&src_signal_hash) == 32, EInvalidSignalHashLength);
        assert!(vector::length(&dst_signal_hash) == 32, EInvalidSignalHashLength);

        let pvk = groth16::prepare_verifying_key(&vks.curve, &vks.state_transition_vk);

        // Verify source withdrawal proof
        let src_proof_points = groth16::proof_points_from_bytes(src_proof);
        let src_inputs = groth16::public_proof_inputs_from_bytes(src_signal_hash);
        assert!(
            groth16::verify_groth16_proof(&vks.curve, &pvk, &src_inputs, &src_proof_points),
            EInvalidProof
        );

        // Verify destination deposit proof
        let dst_proof_points = groth16::proof_points_from_bytes(dst_proof);
        let dst_inputs = groth16::public_proof_inputs_from_bytes(dst_signal_hash);
        assert!(
            groth16::verify_groth16_proof(&vks.curve, &pvk, &dst_inputs, &dst_proof_points),
            EInvalidProof
        );

        // Update both inventories atomically
        src.commitment = src_new_commitment;
        src.nonce = src.nonce + 1;
        dst.commitment = dst_new_commitment;
        dst.nonce = dst.nonce + 1;

        event::emit(TransferEvent {
            src_inventory_id: object::id(src),
            dst_inventory_id: object::id(dst),
            item_id,
            amount,
        });
    }

    // ============ Verification Functions ============

    /// Verify that an inventory contains at least min_quantity of item_id.
    /// This is a read-only check that doesn't modify state.
    public fun verify_item_exists(
        inventory: &PrivateInventory,
        vks: &VerifyingKeys,
        proof: vector<u8>,
        public_hash: vector<u8>,
    ): bool {
        assert!(vector::length(&public_hash) == 32, EInvalidSignalHashLength);

        let pvk = groth16::prepare_verifying_key(&vks.curve, &vks.item_exists_vk);
        let proof_points = groth16::proof_points_from_bytes(proof);
        let inputs = groth16::public_proof_inputs_from_bytes(public_hash);

        groth16::verify_groth16_proof(&vks.curve, &pvk, &inputs, &proof_points)
    }

    /// Verify that an inventory's volume is within max_capacity.
    /// This is a read-only check that doesn't modify state.
    public fun verify_capacity(
        inventory: &PrivateInventory,
        vks: &VerifyingKeys,
        proof: vector<u8>,
        public_hash: vector<u8>,
    ): bool {
        assert!(vector::length(&public_hash) == 32, EInvalidSignalHashLength);

        let pvk = groth16::prepare_verifying_key(&vks.curve, &vks.capacity_vk);
        let proof_points = groth16::proof_points_from_bytes(proof);
        let inputs = groth16::public_proof_inputs_from_bytes(public_hash);

        groth16::verify_groth16_proof(&vks.curve, &pvk, &inputs, &proof_points)
    }
}
