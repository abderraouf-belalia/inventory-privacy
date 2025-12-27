/// Global volume registry mapping item_id to volume_per_unit.
/// Used by capacity-aware circuits to validate inventory volume constraints.
module inventory::volume_registry {
    use sui::event;

    // ============ Error Codes ============

    const ENotAdmin: u64 = 0;
    const EInvalidVolumesLength: u64 = 1;
    const EInvalidRegistryHashLength: u64 = 2;
    const EItemIdOutOfRange: u64 = 3;

    /// Maximum number of item types (matches circuit constant)
    const MAX_ITEM_TYPES: u64 = 16;

    // ============ Structs ============

    /// Global volume registry storing volume_per_unit for each item type.
    /// Index i contains the volume for item_id i.
    /// item_id 0 (empty slot) should have volume 0.
    public struct VolumeRegistry has key, store {
        id: UID,
        /// volumes[i] = volume per unit for item_id i
        volumes: vector<u64>,
        /// Poseidon hash of volumes for circuit binding
        registry_hash: vector<u8>,
        /// Admin address who can update volumes
        admin: address,
    }

    // ============ Events ============

    /// Emitted when a volume registry is created
    public struct VolumeRegistryCreated has copy, drop {
        registry_id: ID,
        admin: address,
    }

    /// Emitted when volumes are updated
    public struct VolumesUpdated has copy, drop {
        registry_id: ID,
    }

    // ============ Admin Functions ============

    /// Create a new volume registry with initial volumes.
    /// volumes must have exactly MAX_ITEM_TYPES (16) elements.
    /// registry_hash is the Poseidon hash of the volumes (32 bytes).
    public fun create(
        volumes: vector<u64>,
        registry_hash: vector<u8>,
        ctx: &mut TxContext,
    ): VolumeRegistry {
        assert!(vector::length(&volumes) == MAX_ITEM_TYPES, EInvalidVolumesLength);
        assert!(vector::length(&registry_hash) == 32, EInvalidRegistryHashLength);

        let registry = VolumeRegistry {
            id: object::new(ctx),
            volumes,
            registry_hash,
            admin: tx_context::sender(ctx),
        };

        event::emit(VolumeRegistryCreated {
            registry_id: object::id(&registry),
            admin: tx_context::sender(ctx),
        });

        registry
    }

    /// Entry function to create and share a volume registry.
    /// This makes the registry accessible to all capacity-aware operations.
    public entry fun create_and_share(
        volumes: vector<u64>,
        registry_hash: vector<u8>,
        ctx: &mut TxContext,
    ) {
        let registry = create(volumes, registry_hash, ctx);
        transfer::public_share_object(registry);
    }

    /// Update volumes and registry hash (admin only).
    public fun update_volumes(
        registry: &mut VolumeRegistry,
        new_volumes: vector<u64>,
        new_registry_hash: vector<u8>,
        ctx: &TxContext,
    ) {
        assert!(registry.admin == tx_context::sender(ctx), ENotAdmin);
        assert!(vector::length(&new_volumes) == MAX_ITEM_TYPES, EInvalidVolumesLength);
        assert!(vector::length(&new_registry_hash) == 32, EInvalidRegistryHashLength);

        registry.volumes = new_volumes;
        registry.registry_hash = new_registry_hash;

        event::emit(VolumesUpdated {
            registry_id: object::id(registry),
        });
    }

    // ============ Accessor Functions ============

    /// Get volume for a specific item_id.
    public fun get_volume(registry: &VolumeRegistry, item_id: u32): u64 {
        let idx = (item_id as u64);
        assert!(idx < MAX_ITEM_TYPES, EItemIdOutOfRange);
        *vector::borrow(&registry.volumes, idx)
    }

    /// Get all volumes as a vector.
    public fun get_all_volumes(registry: &VolumeRegistry): &vector<u64> {
        &registry.volumes
    }

    /// Get the registry hash (for circuit binding).
    public fun registry_hash(registry: &VolumeRegistry): &vector<u8> {
        &registry.registry_hash
    }

    /// Get the admin address.
    public fun admin(registry: &VolumeRegistry): address {
        registry.admin
    }

    /// Calculate total volume for a list of (item_id, quantity) pairs.
    /// Useful for client-side validation before submitting transactions.
    public fun calculate_total_volume(
        registry: &VolumeRegistry,
        item_ids: vector<u32>,
        quantities: vector<u64>,
    ): u64 {
        assert!(vector::length(&item_ids) == vector::length(&quantities), 0);

        let mut total = 0u64;
        let mut i = 0;
        let len = vector::length(&item_ids);

        while (i < len) {
            let item_id = *vector::borrow(&item_ids, i);
            let quantity = *vector::borrow(&quantities, i);
            let volume_per_unit = get_volume(registry, item_id);
            total = total + (quantity * volume_per_unit);
            i = i + 1;
        };

        total
    }
}
