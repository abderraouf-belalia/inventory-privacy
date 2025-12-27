//! DepositWithCapacityCircuit: Proves a valid deposit with capacity constraints.
//!
//! Extends DepositCircuit to verify that the new inventory state
//! does not exceed the maximum capacity.

use std::sync::Arc;

use ark_crypto_primitives::sponge::poseidon::PoseidonConfig;
use ark_ff::PrimeField;
use ark_r1cs_std::{
    alloc::AllocVar,
    fields::{fp::FpVar, FieldVar},
    prelude::*,
};
use ark_relations::r1cs::{ConstraintSynthesizer, ConstraintSystemRef, SynthesisError};

use crate::commitment::PoseidonGadget;
use crate::inventory::{Inventory, InventoryVar, MAX_ITEM_SLOTS};
use crate::volume_lookup::{compute_used_volume, VolumeRegistry, VolumeRegistryVar};

/// Circuit that proves: "old_inventory + amount = new_inventory, capacity not exceeded"
///
/// Public inputs:
/// - old_commitment: Commitment to the old inventory state
/// - new_commitment: Commitment to the new inventory state
/// - item_id: The item being deposited
/// - amount: The amount being deposited
/// - max_capacity: Maximum allowed volume for this inventory
/// - registry_hash: Hash of the volume registry
/// - volume_registry: Volume values for each item_id
///
/// Private witnesses:
/// - old_inventory: The inventory before deposit
/// - new_inventory: The inventory after deposit
/// - old_blinding: Blinding factor for old commitment
/// - new_blinding: Blinding factor for new commitment
#[derive(Clone)]
pub struct DepositWithCapacityCircuit<F: PrimeField> {
    /// Private: Old inventory contents
    pub old_inventory: Option<Inventory>,
    /// Private: New inventory contents
    pub new_inventory: Option<Inventory>,
    /// Private: Old blinding factor
    pub old_blinding: Option<F>,
    /// Private: New blinding factor
    pub new_blinding: Option<F>,

    /// Public: Old commitment
    pub old_commitment: Option<F>,
    /// Public: New commitment
    pub new_commitment: Option<F>,
    /// Public: Item ID being deposited
    pub item_id: u32,
    /// Public: Amount being deposited
    pub amount: u64,
    /// Public: Maximum capacity
    pub max_capacity: u64,
    /// Public: Registry hash
    pub registry_hash: Option<F>,
    /// Public: Volume registry
    pub volume_registry: Option<VolumeRegistry>,

    /// Poseidon configuration
    pub poseidon_config: Arc<PoseidonConfig<F>>,
}

impl<F: PrimeField> DepositWithCapacityCircuit<F> {
    /// Create a new circuit instance for proving.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        old_inventory: Inventory,
        new_inventory: Inventory,
        old_blinding: F,
        new_blinding: F,
        old_commitment: F,
        new_commitment: F,
        item_id: u32,
        amount: u64,
        max_capacity: u64,
        registry_hash: F,
        volume_registry: VolumeRegistry,
        poseidon_config: Arc<PoseidonConfig<F>>,
    ) -> Self {
        Self {
            old_inventory: Some(old_inventory),
            new_inventory: Some(new_inventory),
            old_blinding: Some(old_blinding),
            new_blinding: Some(new_blinding),
            old_commitment: Some(old_commitment),
            new_commitment: Some(new_commitment),
            item_id,
            amount,
            max_capacity,
            registry_hash: Some(registry_hash),
            volume_registry: Some(volume_registry),
            poseidon_config,
        }
    }

    /// Create an empty circuit for setup.
    pub fn empty(poseidon_config: Arc<PoseidonConfig<F>>) -> Self {
        Self {
            old_inventory: None,
            new_inventory: None,
            old_blinding: None,
            new_blinding: None,
            old_commitment: None,
            new_commitment: None,
            item_id: 0,
            amount: 0,
            max_capacity: 0,
            registry_hash: None,
            volume_registry: None,
            poseidon_config,
        }
    }
}

impl<F: PrimeField + ark_crypto_primitives::sponge::Absorb> ConstraintSynthesizer<F>
    for DepositWithCapacityCircuit<F>
{
    fn generate_constraints(self, cs: ConstraintSystemRef<F>) -> Result<(), SynthesisError> {
        // 1. Allocate private witnesses
        let old_inventory = self.old_inventory.unwrap_or_default();
        let new_inventory = self.new_inventory.unwrap_or_default();

        let old_inv_var = InventoryVar::new_witness(cs.clone(), &old_inventory)?;
        let new_inv_var = InventoryVar::new_witness(cs.clone(), &new_inventory)?;

        let old_blinding_var = FpVar::new_witness(cs.clone(), || {
            self.old_blinding.ok_or(SynthesisError::AssignmentMissing)
        })?;

        let new_blinding_var = FpVar::new_witness(cs.clone(), || {
            self.new_blinding.ok_or(SynthesisError::AssignmentMissing)
        })?;

        // 2. Allocate public inputs
        let old_commitment_var = FpVar::new_input(cs.clone(), || {
            self.old_commitment.ok_or(SynthesisError::AssignmentMissing)
        })?;

        let new_commitment_var = FpVar::new_input(cs.clone(), || {
            self.new_commitment.ok_or(SynthesisError::AssignmentMissing)
        })?;

        let item_id_var = FpVar::new_input(cs.clone(), || Ok(F::from(self.item_id as u64)))?;
        let amount_var = FpVar::new_input(cs.clone(), || Ok(F::from(self.amount)))?;
        let max_capacity_var = FpVar::new_input(cs.clone(), || Ok(F::from(self.max_capacity)))?;

        let registry_hash_var = FpVar::new_input(cs.clone(), || {
            self.registry_hash.ok_or(SynthesisError::AssignmentMissing)
        })?;

        // Volume registry is a WITNESS (private), not a public input.
        // The circuit verifies that the volumes hash to registry_hash.
        // This keeps public inputs within Sui's 8-input limit.
        let volume_registry = self.volume_registry.unwrap_or_default();
        let volume_registry_var = VolumeRegistryVar::new_witness(cs.clone(), &volume_registry)?;

        let poseidon = PoseidonGadget::new((*self.poseidon_config).clone());

        // 3. Verify old commitment
        let computed_old =
            poseidon.commit_inventory(cs.clone(), &old_inv_var.to_field_vars(), &old_blinding_var)?;
        computed_old.enforce_equal(&old_commitment_var)?;

        // 4. Verify new commitment
        let computed_new =
            poseidon.commit_inventory(cs.clone(), &new_inv_var.to_field_vars(), &new_blinding_var)?;
        computed_new.enforce_equal(&new_commitment_var)?;

        // 5. Verify registry hash
        let computed_registry_hash = poseidon.hash(cs.clone(), &volume_registry_var.to_field_vars())?;
        computed_registry_hash.enforce_equal(&registry_hash_var)?;

        // 6. Get old and new quantities
        let old_quantity = old_inv_var.get_quantity_for_item(cs.clone(), &item_id_var)?;
        let new_quantity = new_inv_var.get_quantity_for_item(cs.clone(), &item_id_var)?;

        // 7. Verify new_inventory[item_id] = old_inventory[item_id] + amount
        let expected_new_quantity = &old_quantity + &amount_var;
        new_quantity.enforce_equal(&expected_new_quantity)?;

        // 8. Verify all other slots unchanged (or new slot created for new item)
        for i in 0..MAX_ITEM_SLOTS {
            let (old_id, old_qty) = &old_inv_var.slots[i];
            let (new_id, new_qty) = &new_inv_var.slots[i];

            // Check if this slot contains the target item (in old or new)
            let is_target_in_old = old_id.is_eq(&item_id_var)?;
            let is_target_in_new = new_id.is_eq(&item_id_var)?;
            let is_target_slot = is_target_in_old.or(&is_target_in_new)?;

            // For non-target slots, both id and quantity must be unchanged
            let id_unchanged = old_id.is_eq(new_id)?;
            let qty_unchanged = old_qty.is_eq(new_qty)?;

            // If not target slot, enforce unchanged
            let slot_valid = is_target_slot.or(&id_unchanged.and(&qty_unchanged)?)?;
            slot_valid.enforce_equal(&Boolean::TRUE)?;
        }

        // 9. Compute new used volume
        let new_used_volume = compute_used_volume(&new_inv_var, &volume_registry_var)?;

        // 10. Verify: new_used_volume <= max_capacity
        let remaining_capacity = &max_capacity_var - &new_used_volume;
        remaining_capacity.enforce_cmp(&FpVar::zero(), std::cmp::Ordering::Greater, true)?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capacity::compute_registry_hash;
    use crate::commitment::{create_inventory_commitment, poseidon_config};
    use crate::volume_lookup::MAX_ITEM_TYPES;
    use ark_bn254::Fr;
    use ark_relations::r1cs::ConstraintSystem;

    fn create_test_registry() -> VolumeRegistry {
        let mut volumes = [0u64; MAX_ITEM_TYPES];
        volumes[1] = 5;   // Item 1: 5 volume each
        volumes[2] = 10;  // Item 2: 10 volume each
        VolumeRegistry::new(volumes)
    }

    #[test]
    fn test_deposit_capacity_valid() {
        let config = Arc::new(poseidon_config::<Fr>());
        let registry = create_test_registry();
        let registry_hash = compute_registry_hash(&registry, &config);

        // Start with 10 of item 1 (50 volume)
        let old_inventory = Inventory::from_items(&[(1, 10)]);
        let old_blinding = Fr::from(12345u64);
        let old_commitment = create_inventory_commitment(&old_inventory, old_blinding, &config);

        // Deposit 5 more of item 1 (25 more volume = 75 total)
        let mut new_inventory = old_inventory.clone();
        new_inventory.deposit(1, 5).unwrap();
        let new_blinding = Fr::from(67890u64);
        let new_commitment = create_inventory_commitment(&new_inventory, new_blinding, &config);

        // Capacity = 100, should pass (75 <= 100)
        let circuit = DepositWithCapacityCircuit::new(
            old_inventory,
            new_inventory,
            old_blinding,
            new_blinding,
            old_commitment,
            new_commitment,
            1,   // item_id
            5,   // amount
            100, // max_capacity
            registry_hash,
            registry,
            config,
        );

        let cs = ConstraintSystem::<Fr>::new_ref();
        circuit.generate_constraints(cs.clone()).unwrap();

        assert!(cs.is_satisfied().unwrap());
        println!("DepositWithCapacity constraints: {}", cs.num_constraints());
    }

    #[test]
    fn test_deposit_capacity_at_limit() {
        let config = Arc::new(poseidon_config::<Fr>());
        let registry = create_test_registry();
        let registry_hash = compute_registry_hash(&registry, &config);

        // Start with 10 of item 1 (50 volume)
        let old_inventory = Inventory::from_items(&[(1, 10)]);
        let old_blinding = Fr::from(12345u64);
        let old_commitment = create_inventory_commitment(&old_inventory, old_blinding, &config);

        // Deposit 10 more (50 more volume = 100 total)
        let mut new_inventory = old_inventory.clone();
        new_inventory.deposit(1, 10).unwrap();
        let new_blinding = Fr::from(67890u64);
        let new_commitment = create_inventory_commitment(&new_inventory, new_blinding, &config);

        // Capacity = 100, should pass (100 <= 100)
        let circuit = DepositWithCapacityCircuit::new(
            old_inventory,
            new_inventory,
            old_blinding,
            new_blinding,
            old_commitment,
            new_commitment,
            1,   // item_id
            10,  // amount
            100, // max_capacity (exact)
            registry_hash,
            registry,
            config,
        );

        let cs = ConstraintSystem::<Fr>::new_ref();
        circuit.generate_constraints(cs.clone()).unwrap();

        assert!(cs.is_satisfied().unwrap());
    }

    #[test]
    fn test_deposit_capacity_exceeded() {
        let config = Arc::new(poseidon_config::<Fr>());
        let registry = create_test_registry();
        let registry_hash = compute_registry_hash(&registry, &config);

        // Start with 10 of item 1 (50 volume)
        let old_inventory = Inventory::from_items(&[(1, 10)]);
        let old_blinding = Fr::from(12345u64);
        let old_commitment = create_inventory_commitment(&old_inventory, old_blinding, &config);

        // Deposit 20 more (100 more volume = 150 total)
        let mut new_inventory = old_inventory.clone();
        new_inventory.deposit(1, 20).unwrap();
        let new_blinding = Fr::from(67890u64);
        let new_commitment = create_inventory_commitment(&new_inventory, new_blinding, &config);

        // Capacity = 100, should FAIL (150 > 100)
        let circuit = DepositWithCapacityCircuit::new(
            old_inventory,
            new_inventory,
            old_blinding,
            new_blinding,
            old_commitment,
            new_commitment,
            1,   // item_id
            20,  // amount
            100, // max_capacity (too small)
            registry_hash,
            registry,
            config,
        );

        let cs = ConstraintSystem::<Fr>::new_ref();
        circuit.generate_constraints(cs.clone()).unwrap();

        // Should NOT be satisfied
        assert!(!cs.is_satisfied().unwrap());
    }

    #[test]
    fn test_deposit_capacity_new_item() {
        let config = Arc::new(poseidon_config::<Fr>());
        let registry = create_test_registry();
        let registry_hash = compute_registry_hash(&registry, &config);

        // Start empty
        let old_inventory = Inventory::new();
        let old_blinding = Fr::from(12345u64);
        let old_commitment = create_inventory_commitment(&old_inventory, old_blinding, &config);

        // Deposit 5 of item 2 (50 volume)
        let mut new_inventory = old_inventory.clone();
        new_inventory.deposit(2, 5).unwrap();
        let new_blinding = Fr::from(67890u64);
        let new_commitment = create_inventory_commitment(&new_inventory, new_blinding, &config);

        // Capacity = 100, should pass
        let circuit = DepositWithCapacityCircuit::new(
            old_inventory,
            new_inventory,
            old_blinding,
            new_blinding,
            old_commitment,
            new_commitment,
            2,   // item_id
            5,   // amount
            100, // max_capacity
            registry_hash,
            registry,
            config,
        );

        let cs = ConstraintSystem::<Fr>::new_ref();
        circuit.generate_constraints(cs.clone()).unwrap();

        assert!(cs.is_satisfied().unwrap());
    }

    #[test]
    fn test_deposit_capacity_wrong_amount() {
        let config = Arc::new(poseidon_config::<Fr>());
        let registry = create_test_registry();
        let registry_hash = compute_registry_hash(&registry, &config);

        let old_inventory = Inventory::from_items(&[(1, 50)]);
        let old_blinding = Fr::from(12345u64);
        let old_commitment = create_inventory_commitment(&old_inventory, old_blinding, &config);

        // Claim to deposit 10 but actually deposit 20
        let mut new_inventory = old_inventory.clone();
        new_inventory.deposit(1, 20).unwrap(); // Actually depositing 20
        let new_blinding = Fr::from(67890u64);
        let new_commitment = create_inventory_commitment(&new_inventory, new_blinding, &config);

        let circuit = DepositWithCapacityCircuit::new(
            old_inventory,
            new_inventory,
            old_blinding,
            new_blinding,
            old_commitment,
            new_commitment,
            1,    // item_id
            10,   // Claiming 10 but new_inventory has +20
            1000, // max_capacity (large enough)
            registry_hash,
            registry,
            config,
        );

        let cs = ConstraintSystem::<Fr>::new_ref();
        circuit.generate_constraints(cs.clone()).unwrap();

        // Should NOT be satisfied - amount mismatch
        assert!(!cs.is_satisfied().unwrap());
    }
}
