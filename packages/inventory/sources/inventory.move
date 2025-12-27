/// Private inventory with hidden contents, verifiable via ZK proofs.
module inventory::inventory {
    use sui::groth16;
    use sui::event;
    use inventory::volume_registry::VolumeRegistry;

    // ============ Error Codes ============

    const ENotOwner: u64 = 0;
    const EInvalidProof: u64 = 1;
    const EInvalidCommitmentLength: u64 = 2;
    const EInvalidRegistryHashLength: u64 = 3;

    /// Maximum number of item types (matches circuit constant)
    const MAX_ITEM_TYPES: u64 = 16;

    // ============ Structs ============

    /// A private inventory with hidden contents.
    /// Only the commitment is stored on-chain.
    public struct PrivateInventory has key, store {
        id: UID,
        /// Poseidon commitment to inventory contents: Poseidon(slots..., blinding)
        commitment: vector<u8>,
        /// Owner address
        owner: address,
        /// Nonce for replay protection
        nonce: u64,
        /// Maximum volume capacity (0 = no capacity limit)
        max_capacity: u64,
    }

    /// Verification keys for all circuits.
    /// Created once during deployment.
    public struct VerifyingKeys has key, store {
        id: UID,
        /// ItemExistsCircuit verification key
        item_exists_vk: vector<u8>,
        /// WithdrawCircuit verification key
        withdraw_vk: vector<u8>,
        /// DepositCircuit verification key
        deposit_vk: vector<u8>,
        /// TransferCircuit verification key
        transfer_vk: vector<u8>,
        /// CapacityProofCircuit verification key
        capacity_vk: vector<u8>,
        /// DepositWithCapacityCircuit verification key
        deposit_capacity_vk: vector<u8>,
        /// TransferWithCapacityCircuit verification key
        transfer_capacity_vk: vector<u8>,
        /// Groth16 curve identifier
        curve: groth16::Curve,
    }

    // ============ Events ============

    /// Emitted when an inventory is created
    public struct InventoryCreated has copy, drop {
        inventory_id: ID,
        owner: address,
    }

    /// Emitted when items are withdrawn
    public struct WithdrawEvent has copy, drop {
        inventory_id: ID,
        item_id: u32,
        amount: u64,
        new_nonce: u64,
    }

    /// Emitted when items are deposited
    public struct DepositEvent has copy, drop {
        inventory_id: ID,
        item_id: u32,
        amount: u64,
        new_nonce: u64,
    }

    /// Emitted when items are transferred
    public struct TransferEvent has copy, drop {
        src_inventory_id: ID,
        dst_inventory_id: ID,
        item_id: u32,
        amount: u64,
    }

    // ============ Admin Functions ============

    /// Initialize verification keys (called once during deployment)
    public fun init_verifying_keys(
        item_exists_vk: vector<u8>,
        withdraw_vk: vector<u8>,
        deposit_vk: vector<u8>,
        transfer_vk: vector<u8>,
        capacity_vk: vector<u8>,
        deposit_capacity_vk: vector<u8>,
        transfer_capacity_vk: vector<u8>,
        ctx: &mut TxContext,
    ): VerifyingKeys {
        VerifyingKeys {
            id: object::new(ctx),
            item_exists_vk,
            withdraw_vk,
            deposit_vk,
            transfer_vk,
            capacity_vk,
            deposit_capacity_vk,
            transfer_capacity_vk,
            curve: groth16::bn254(),
        }
    }

    /// Entry function to initialize and share verifying keys.
    /// This makes the keys accessible to all verification operations.
    public entry fun init_verifying_keys_and_share(
        item_exists_vk: vector<u8>,
        withdraw_vk: vector<u8>,
        deposit_vk: vector<u8>,
        transfer_vk: vector<u8>,
        capacity_vk: vector<u8>,
        deposit_capacity_vk: vector<u8>,
        transfer_capacity_vk: vector<u8>,
        ctx: &mut TxContext,
    ) {
        let vks = init_verifying_keys(
            item_exists_vk,
            withdraw_vk,
            deposit_vk,
            transfer_vk,
            capacity_vk,
            deposit_capacity_vk,
            transfer_capacity_vk,
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

    // ============ Verification Functions ============

    /// Verify that an inventory contains at least min_quantity of item_id.
    /// This is a read-only check that doesn't modify state.
    public fun verify_item_exists(
        inventory: &PrivateInventory,
        vks: &VerifyingKeys,
        proof: vector<u8>,
        item_id: u32,
        min_quantity: u64,
    ): bool {
        let public_inputs = build_item_exists_inputs(
            &inventory.commitment,
            item_id,
            min_quantity,
        );

        let pvk = groth16::prepare_verifying_key(&vks.curve, &vks.item_exists_vk);
        let proof_points = groth16::proof_points_from_bytes(proof);
        let inputs = groth16::public_proof_inputs_from_bytes(public_inputs);

        groth16::verify_groth16_proof(&vks.curve, &pvk, &inputs, &proof_points)
    }

    /// Withdraw items from inventory with ZK proof
    public fun withdraw(
        inventory: &mut PrivateInventory,
        vks: &VerifyingKeys,
        proof: vector<u8>,
        new_commitment: vector<u8>,
        item_id: u32,
        amount: u64,
        ctx: &mut TxContext,
    ) {
        // Only owner can withdraw
        assert!(inventory.owner == tx_context::sender(ctx), ENotOwner);
        assert!(vector::length(&new_commitment) == 32, EInvalidCommitmentLength);

        let public_inputs = build_withdraw_inputs(
            &inventory.commitment,
            &new_commitment,
            item_id,
            amount,
        );

        let pvk = groth16::prepare_verifying_key(&vks.curve, &vks.withdraw_vk);
        let proof_points = groth16::proof_points_from_bytes(proof);
        let inputs = groth16::public_proof_inputs_from_bytes(public_inputs);

        assert!(
            groth16::verify_groth16_proof(&vks.curve, &pvk, &inputs, &proof_points),
            EInvalidProof
        );

        // Update state
        inventory.commitment = new_commitment;
        inventory.nonce = inventory.nonce + 1;

        event::emit(WithdrawEvent {
            inventory_id: object::id(inventory),
            item_id,
            amount,
            new_nonce: inventory.nonce,
        });
    }

    /// Deposit items into inventory with ZK proof
    public fun deposit(
        inventory: &mut PrivateInventory,
        vks: &VerifyingKeys,
        proof: vector<u8>,
        new_commitment: vector<u8>,
        item_id: u32,
        amount: u64,
    ) {
        assert!(vector::length(&new_commitment) == 32, EInvalidCommitmentLength);

        let public_inputs = build_deposit_inputs(
            &inventory.commitment,
            &new_commitment,
            item_id,
            amount,
        );

        let pvk = groth16::prepare_verifying_key(&vks.curve, &vks.deposit_vk);
        let proof_points = groth16::proof_points_from_bytes(proof);
        let inputs = groth16::public_proof_inputs_from_bytes(public_inputs);

        assert!(
            groth16::verify_groth16_proof(&vks.curve, &pvk, &inputs, &proof_points),
            EInvalidProof
        );

        // Update state
        inventory.commitment = new_commitment;
        inventory.nonce = inventory.nonce + 1;

        event::emit(DepositEvent {
            inventory_id: object::id(inventory),
            item_id,
            amount,
            new_nonce: inventory.nonce,
        });
    }

    /// Transfer items between two inventories with ZK proof
    public fun transfer(
        src: &mut PrivateInventory,
        dst: &mut PrivateInventory,
        vks: &VerifyingKeys,
        proof: vector<u8>,
        src_new_commitment: vector<u8>,
        dst_new_commitment: vector<u8>,
        item_id: u32,
        amount: u64,
        ctx: &mut TxContext,
    ) {
        // Only src owner can initiate transfer
        assert!(src.owner == tx_context::sender(ctx), ENotOwner);
        assert!(vector::length(&src_new_commitment) == 32, EInvalidCommitmentLength);
        assert!(vector::length(&dst_new_commitment) == 32, EInvalidCommitmentLength);

        let public_inputs = build_transfer_inputs(
            &src.commitment,
            &src_new_commitment,
            &dst.commitment,
            &dst_new_commitment,
            item_id,
            amount,
        );

        let pvk = groth16::prepare_verifying_key(&vks.curve, &vks.transfer_vk);
        let proof_points = groth16::proof_points_from_bytes(proof);
        let inputs = groth16::public_proof_inputs_from_bytes(public_inputs);

        assert!(
            groth16::verify_groth16_proof(&vks.curve, &pvk, &inputs, &proof_points),
            EInvalidProof
        );

        // Update both inventories
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

    // ============ Capacity-Aware Verification Functions ============

    /// Verify that an inventory's used volume is within its max_capacity.
    /// Requires a ZK proof that proves the volume constraint.
    public fun verify_capacity(
        inventory: &PrivateInventory,
        registry: &VolumeRegistry,
        vks: &VerifyingKeys,
        proof: vector<u8>,
    ): bool {
        let registry_hash = inventory::volume_registry::registry_hash(registry);

        let public_inputs = build_capacity_inputs(
            &inventory.commitment,
            inventory.max_capacity,
            registry_hash,
        );

        let pvk = groth16::prepare_verifying_key(&vks.curve, &vks.capacity_vk);
        let proof_points = groth16::proof_points_from_bytes(proof);
        let inputs = groth16::public_proof_inputs_from_bytes(public_inputs);

        groth16::verify_groth16_proof(&vks.curve, &pvk, &inputs, &proof_points)
    }

    /// Deposit items into inventory with capacity check.
    /// Proves that after deposit, used volume <= max_capacity.
    public fun deposit_with_capacity(
        inventory: &mut PrivateInventory,
        registry: &VolumeRegistry,
        vks: &VerifyingKeys,
        proof: vector<u8>,
        new_commitment: vector<u8>,
        item_id: u32,
        amount: u64,
    ) {
        assert!(vector::length(&new_commitment) == 32, EInvalidCommitmentLength);

        let registry_hash = inventory::volume_registry::registry_hash(registry);

        let public_inputs = build_deposit_capacity_inputs(
            &inventory.commitment,
            &new_commitment,
            item_id,
            amount,
            inventory.max_capacity,
            registry_hash,
        );

        let pvk = groth16::prepare_verifying_key(&vks.curve, &vks.deposit_capacity_vk);
        let proof_points = groth16::proof_points_from_bytes(proof);
        let inputs = groth16::public_proof_inputs_from_bytes(public_inputs);

        assert!(
            groth16::verify_groth16_proof(&vks.curve, &pvk, &inputs, &proof_points),
            EInvalidProof
        );

        // Update state
        inventory.commitment = new_commitment;
        inventory.nonce = inventory.nonce + 1;

        event::emit(DepositEvent {
            inventory_id: object::id(inventory),
            item_id,
            amount,
            new_nonce: inventory.nonce,
        });
    }

    /// Transfer items between inventories with destination capacity check.
    /// Proves that after transfer, destination used volume <= dst.max_capacity.
    public fun transfer_with_capacity(
        src: &mut PrivateInventory,
        dst: &mut PrivateInventory,
        registry: &VolumeRegistry,
        vks: &VerifyingKeys,
        proof: vector<u8>,
        src_new_commitment: vector<u8>,
        dst_new_commitment: vector<u8>,
        item_id: u32,
        amount: u64,
        ctx: &mut TxContext,
    ) {
        // Only src owner can initiate transfer
        assert!(src.owner == tx_context::sender(ctx), ENotOwner);
        assert!(vector::length(&src_new_commitment) == 32, EInvalidCommitmentLength);
        assert!(vector::length(&dst_new_commitment) == 32, EInvalidCommitmentLength);

        let registry_hash = inventory::volume_registry::registry_hash(registry);

        let public_inputs = build_transfer_capacity_inputs(
            &src.commitment,
            &src_new_commitment,
            &dst.commitment,
            &dst_new_commitment,
            item_id,
            amount,
            dst.max_capacity,
            registry_hash,
        );

        let pvk = groth16::prepare_verifying_key(&vks.curve, &vks.transfer_capacity_vk);
        let proof_points = groth16::proof_points_from_bytes(proof);
        let inputs = groth16::public_proof_inputs_from_bytes(public_inputs);

        assert!(
            groth16::verify_groth16_proof(&vks.curve, &pvk, &inputs, &proof_points),
            EInvalidProof
        );

        // Update both inventories
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

    // ============ Helper Functions ============

    /// Build public inputs for ItemExistsCircuit
    fun build_item_exists_inputs(
        commitment: &vector<u8>,
        item_id: u32,
        min_quantity: u64,
    ): vector<u8> {
        let mut inputs = vector::empty<u8>();

        // Append commitment (32 bytes)
        let mut i = 0;
        while (i < vector::length(commitment)) {
            vector::push_back(&mut inputs, *vector::borrow(commitment, i));
            i = i + 1;
        };

        // Append item_id as 32-byte LE
        append_u64_as_field(&mut inputs, (item_id as u64));

        // Append min_quantity as 32-byte LE
        append_u64_as_field(&mut inputs, min_quantity);

        inputs
    }

    /// Build public inputs for WithdrawCircuit
    fun build_withdraw_inputs(
        old_commitment: &vector<u8>,
        new_commitment: &vector<u8>,
        item_id: u32,
        amount: u64,
    ): vector<u8> {
        let mut inputs = vector::empty<u8>();

        // Append old commitment
        append_bytes(&mut inputs, old_commitment);

        // Append new commitment
        append_bytes(&mut inputs, new_commitment);

        // Append item_id
        append_u64_as_field(&mut inputs, (item_id as u64));

        // Append amount
        append_u64_as_field(&mut inputs, amount);

        inputs
    }

    /// Build public inputs for DepositCircuit (same as withdraw)
    fun build_deposit_inputs(
        old_commitment: &vector<u8>,
        new_commitment: &vector<u8>,
        item_id: u32,
        amount: u64,
    ): vector<u8> {
        build_withdraw_inputs(old_commitment, new_commitment, item_id, amount)
    }

    /// Build public inputs for TransferCircuit
    fun build_transfer_inputs(
        src_old_commitment: &vector<u8>,
        src_new_commitment: &vector<u8>,
        dst_old_commitment: &vector<u8>,
        dst_new_commitment: &vector<u8>,
        item_id: u32,
        amount: u64,
    ): vector<u8> {
        let mut inputs = vector::empty<u8>();

        append_bytes(&mut inputs, src_old_commitment);
        append_bytes(&mut inputs, src_new_commitment);
        append_bytes(&mut inputs, dst_old_commitment);
        append_bytes(&mut inputs, dst_new_commitment);
        append_u64_as_field(&mut inputs, (item_id as u64));
        append_u64_as_field(&mut inputs, amount);

        inputs
    }

    /// Append bytes to a vector
    fun append_bytes(dest: &mut vector<u8>, src: &vector<u8>) {
        let mut i = 0;
        while (i < vector::length(src)) {
            vector::push_back(dest, *vector::borrow(src, i));
            i = i + 1;
        };
    }

    /// Append a u64 as a 32-byte little-endian field element
    fun append_u64_as_field(dest: &mut vector<u8>, value: u64) {
        // Write u64 as little-endian
        let mut i = 0;
        let mut v = value;
        while (i < 8) {
            vector::push_back(dest, ((v & 0xFF) as u8));
            v = v >> 8;
            i = i + 1;
        };

        // Pad to 32 bytes with zeros
        while (i < 32) {
            vector::push_back(dest, 0);
            i = i + 1;
        };
    }

    /// Build public inputs for CapacityProofCircuit
    /// Order: commitment, max_capacity, registry_hash (3 inputs)
    /// Note: volume_registry is now a private witness in the circuit
    /// to stay within Sui's 8 public input limit
    fun build_capacity_inputs(
        commitment: &vector<u8>,
        max_capacity: u64,
        registry_hash: &vector<u8>,
    ): vector<u8> {
        let mut inputs = vector::empty<u8>();

        // Append commitment (32 bytes)
        append_bytes(&mut inputs, commitment);

        // Append max_capacity
        append_u64_as_field(&mut inputs, max_capacity);

        // Append registry_hash (32 bytes)
        append_bytes(&mut inputs, registry_hash);

        inputs
    }

    /// Build public inputs for DepositWithCapacityCircuit
    /// Order: old_commitment, new_commitment, item_id, amount, max_capacity, registry_hash (6 inputs)
    /// Note: volume_registry is now a private witness in the circuit
    /// to stay within Sui's 8 public input limit
    fun build_deposit_capacity_inputs(
        old_commitment: &vector<u8>,
        new_commitment: &vector<u8>,
        item_id: u32,
        amount: u64,
        max_capacity: u64,
        registry_hash: &vector<u8>,
    ): vector<u8> {
        let mut inputs = vector::empty<u8>();

        append_bytes(&mut inputs, old_commitment);
        append_bytes(&mut inputs, new_commitment);
        append_u64_as_field(&mut inputs, (item_id as u64));
        append_u64_as_field(&mut inputs, amount);
        append_u64_as_field(&mut inputs, max_capacity);
        append_bytes(&mut inputs, registry_hash);

        inputs
    }

    /// Build public inputs for TransferWithCapacityCircuit
    /// Order: src_old, src_new, dst_old, dst_new, item_id, amount, dst_max_capacity, registry_hash (8 inputs)
    /// Note: volume_registry is now a private witness in the circuit
    /// to stay exactly at Sui's 8 public input limit
    fun build_transfer_capacity_inputs(
        src_old_commitment: &vector<u8>,
        src_new_commitment: &vector<u8>,
        dst_old_commitment: &vector<u8>,
        dst_new_commitment: &vector<u8>,
        item_id: u32,
        amount: u64,
        dst_max_capacity: u64,
        registry_hash: &vector<u8>,
    ): vector<u8> {
        let mut inputs = vector::empty<u8>();

        append_bytes(&mut inputs, src_old_commitment);
        append_bytes(&mut inputs, src_new_commitment);
        append_bytes(&mut inputs, dst_old_commitment);
        append_bytes(&mut inputs, dst_new_commitment);
        append_u64_as_field(&mut inputs, (item_id as u64));
        append_u64_as_field(&mut inputs, amount);
        append_u64_as_field(&mut inputs, dst_max_capacity);
        append_bytes(&mut inputs, registry_hash);

        inputs
    }
}
