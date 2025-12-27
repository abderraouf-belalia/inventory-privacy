//! TransferWithCapacityCircuit: Proves a valid transfer with destination capacity check.
//!
//! Extends TransferCircuit to verify that the destination inventory
//! does not exceed its maximum capacity after receiving items.

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

/// Circuit that proves: "src -= amount, dst += amount, dst capacity not exceeded"
///
/// Public inputs:
/// - src_old_commitment: Source inventory before transfer
/// - src_new_commitment: Source inventory after transfer
/// - dst_old_commitment: Destination inventory before transfer
/// - dst_new_commitment: Destination inventory after transfer
/// - item_id: The item being transferred
/// - amount: The amount being transferred
/// - dst_max_capacity: Maximum capacity for destination inventory
/// - registry_hash: Hash of the volume registry
/// - volume_registry: Volume values for each item_id
///
/// Private witnesses:
/// - src_old_inventory, src_new_inventory: Source inventory states
/// - dst_old_inventory, dst_new_inventory: Destination inventory states
/// - src_old_blinding, src_new_blinding: Source blinding factors
/// - dst_old_blinding, dst_new_blinding: Destination blinding factors
#[derive(Clone)]
pub struct TransferWithCapacityCircuit<F: PrimeField> {
    // Source inventory (private)
    pub src_old_inventory: Option<Inventory>,
    pub src_new_inventory: Option<Inventory>,
    pub src_old_blinding: Option<F>,
    pub src_new_blinding: Option<F>,

    // Destination inventory (private)
    pub dst_old_inventory: Option<Inventory>,
    pub dst_new_inventory: Option<Inventory>,
    pub dst_old_blinding: Option<F>,
    pub dst_new_blinding: Option<F>,

    // Public inputs
    pub src_old_commitment: Option<F>,
    pub src_new_commitment: Option<F>,
    pub dst_old_commitment: Option<F>,
    pub dst_new_commitment: Option<F>,
    pub item_id: u32,
    pub amount: u64,
    pub dst_max_capacity: u64,
    pub registry_hash: Option<F>,
    pub volume_registry: Option<VolumeRegistry>,

    pub poseidon_config: Arc<PoseidonConfig<F>>,
}

impl<F: PrimeField> TransferWithCapacityCircuit<F> {
    /// Create a new circuit instance for proving.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        src_old_inventory: Inventory,
        src_new_inventory: Inventory,
        src_old_blinding: F,
        src_new_blinding: F,
        dst_old_inventory: Inventory,
        dst_new_inventory: Inventory,
        dst_old_blinding: F,
        dst_new_blinding: F,
        src_old_commitment: F,
        src_new_commitment: F,
        dst_old_commitment: F,
        dst_new_commitment: F,
        item_id: u32,
        amount: u64,
        dst_max_capacity: u64,
        registry_hash: F,
        volume_registry: VolumeRegistry,
        poseidon_config: Arc<PoseidonConfig<F>>,
    ) -> Self {
        Self {
            src_old_inventory: Some(src_old_inventory),
            src_new_inventory: Some(src_new_inventory),
            src_old_blinding: Some(src_old_blinding),
            src_new_blinding: Some(src_new_blinding),
            dst_old_inventory: Some(dst_old_inventory),
            dst_new_inventory: Some(dst_new_inventory),
            dst_old_blinding: Some(dst_old_blinding),
            dst_new_blinding: Some(dst_new_blinding),
            src_old_commitment: Some(src_old_commitment),
            src_new_commitment: Some(src_new_commitment),
            dst_old_commitment: Some(dst_old_commitment),
            dst_new_commitment: Some(dst_new_commitment),
            item_id,
            amount,
            dst_max_capacity,
            registry_hash: Some(registry_hash),
            volume_registry: Some(volume_registry),
            poseidon_config,
        }
    }

    /// Create an empty circuit for setup.
    pub fn empty(poseidon_config: Arc<PoseidonConfig<F>>) -> Self {
        Self {
            src_old_inventory: None,
            src_new_inventory: None,
            src_old_blinding: None,
            src_new_blinding: None,
            dst_old_inventory: None,
            dst_new_inventory: None,
            dst_old_blinding: None,
            dst_new_blinding: None,
            src_old_commitment: None,
            src_new_commitment: None,
            dst_old_commitment: None,
            dst_new_commitment: None,
            item_id: 0,
            amount: 0,
            dst_max_capacity: 0,
            registry_hash: None,
            volume_registry: None,
            poseidon_config,
        }
    }
}

impl<F: PrimeField + ark_crypto_primitives::sponge::Absorb> ConstraintSynthesizer<F>
    for TransferWithCapacityCircuit<F>
{
    fn generate_constraints(self, cs: ConstraintSystemRef<F>) -> Result<(), SynthesisError> {
        let poseidon = PoseidonGadget::new((*self.poseidon_config).clone());

        // === Source inventory witnesses ===
        let src_old_inv = self.src_old_inventory.unwrap_or_default();
        let src_new_inv = self.src_new_inventory.unwrap_or_default();
        let src_old_inv_var = InventoryVar::new_witness(cs.clone(), &src_old_inv)?;
        let src_new_inv_var = InventoryVar::new_witness(cs.clone(), &src_new_inv)?;

        let src_old_blinding_var = FpVar::new_witness(cs.clone(), || {
            self.src_old_blinding.ok_or(SynthesisError::AssignmentMissing)
        })?;
        let src_new_blinding_var = FpVar::new_witness(cs.clone(), || {
            self.src_new_blinding.ok_or(SynthesisError::AssignmentMissing)
        })?;

        // === Destination inventory witnesses ===
        let dst_old_inv = self.dst_old_inventory.unwrap_or_default();
        let dst_new_inv = self.dst_new_inventory.unwrap_or_default();
        let dst_old_inv_var = InventoryVar::new_witness(cs.clone(), &dst_old_inv)?;
        let dst_new_inv_var = InventoryVar::new_witness(cs.clone(), &dst_new_inv)?;

        let dst_old_blinding_var = FpVar::new_witness(cs.clone(), || {
            self.dst_old_blinding.ok_or(SynthesisError::AssignmentMissing)
        })?;
        let dst_new_blinding_var = FpVar::new_witness(cs.clone(), || {
            self.dst_new_blinding.ok_or(SynthesisError::AssignmentMissing)
        })?;

        // === Public inputs ===
        let src_old_commitment_var = FpVar::new_input(cs.clone(), || {
            self.src_old_commitment.ok_or(SynthesisError::AssignmentMissing)
        })?;
        let src_new_commitment_var = FpVar::new_input(cs.clone(), || {
            self.src_new_commitment.ok_or(SynthesisError::AssignmentMissing)
        })?;
        let dst_old_commitment_var = FpVar::new_input(cs.clone(), || {
            self.dst_old_commitment.ok_or(SynthesisError::AssignmentMissing)
        })?;
        let dst_new_commitment_var = FpVar::new_input(cs.clone(), || {
            self.dst_new_commitment.ok_or(SynthesisError::AssignmentMissing)
        })?;

        let item_id_var = FpVar::new_input(cs.clone(), || Ok(F::from(self.item_id as u64)))?;
        let amount_var = FpVar::new_input(cs.clone(), || Ok(F::from(self.amount)))?;
        let dst_max_capacity_var = FpVar::new_input(cs.clone(), || Ok(F::from(self.dst_max_capacity)))?;

        let registry_hash_var = FpVar::new_input(cs.clone(), || {
            self.registry_hash.ok_or(SynthesisError::AssignmentMissing)
        })?;

        // Volume registry is a WITNESS (private), not a public input.
        // The circuit verifies that the volumes hash to registry_hash.
        // This keeps public inputs within Sui's 8-input limit.
        let volume_registry = self.volume_registry.unwrap_or_default();
        let volume_registry_var = VolumeRegistryVar::new_witness(cs.clone(), &volume_registry)?;

        // === Verify all four commitments ===
        let computed_src_old = poseidon.commit_inventory(
            cs.clone(),
            &src_old_inv_var.to_field_vars(),
            &src_old_blinding_var,
        )?;
        computed_src_old.enforce_equal(&src_old_commitment_var)?;

        let computed_src_new = poseidon.commit_inventory(
            cs.clone(),
            &src_new_inv_var.to_field_vars(),
            &src_new_blinding_var,
        )?;
        computed_src_new.enforce_equal(&src_new_commitment_var)?;

        let computed_dst_old = poseidon.commit_inventory(
            cs.clone(),
            &dst_old_inv_var.to_field_vars(),
            &dst_old_blinding_var,
        )?;
        computed_dst_old.enforce_equal(&dst_old_commitment_var)?;

        let computed_dst_new = poseidon.commit_inventory(
            cs.clone(),
            &dst_new_inv_var.to_field_vars(),
            &dst_new_blinding_var,
        )?;
        computed_dst_new.enforce_equal(&dst_new_commitment_var)?;

        // === Verify registry hash ===
        let computed_registry_hash = poseidon.hash(cs.clone(), &volume_registry_var.to_field_vars())?;
        computed_registry_hash.enforce_equal(&registry_hash_var)?;

        // === Verify source withdrawal ===
        let src_old_qty = src_old_inv_var.get_quantity_for_item(cs.clone(), &item_id_var)?;
        let src_new_qty = src_new_inv_var.get_quantity_for_item(cs.clone(), &item_id_var)?;

        // src_old >= amount
        let src_diff = &src_old_qty - &amount_var;
        src_diff.enforce_cmp(&FpVar::zero(), std::cmp::Ordering::Greater, true)?;

        // src_new = src_old - amount
        let expected_src_new = &src_old_qty - &amount_var;
        src_new_qty.enforce_equal(&expected_src_new)?;

        // === Verify destination deposit ===
        let dst_old_qty = dst_old_inv_var.get_quantity_for_item(cs.clone(), &item_id_var)?;
        let dst_new_qty = dst_new_inv_var.get_quantity_for_item(cs.clone(), &item_id_var)?;

        // dst_new = dst_old + amount
        let expected_dst_new = &dst_old_qty + &amount_var;
        dst_new_qty.enforce_equal(&expected_dst_new)?;

        // === Verify other slots unchanged in both inventories ===
        // Source inventory
        for i in 0..MAX_ITEM_SLOTS {
            let (old_id, old_qty) = &src_old_inv_var.slots[i];
            let (new_id, new_qty) = &src_new_inv_var.slots[i];

            let is_target_slot = old_id.is_eq(&item_id_var)?;
            let id_unchanged = old_id.is_eq(new_id)?;
            let qty_unchanged = old_qty.is_eq(new_qty)?;

            let slot_valid = is_target_slot.or(&id_unchanged.and(&qty_unchanged)?)?;
            slot_valid.enforce_equal(&Boolean::TRUE)?;
        }

        // Destination inventory
        for i in 0..MAX_ITEM_SLOTS {
            let (old_id, old_qty) = &dst_old_inv_var.slots[i];
            let (new_id, new_qty) = &dst_new_inv_var.slots[i];

            let is_target_in_old = old_id.is_eq(&item_id_var)?;
            let is_target_in_new = new_id.is_eq(&item_id_var)?;
            let is_target_slot = is_target_in_old.or(&is_target_in_new)?;

            let id_unchanged = old_id.is_eq(new_id)?;
            let qty_unchanged = old_qty.is_eq(new_qty)?;

            let slot_valid = is_target_slot.or(&id_unchanged.and(&qty_unchanged)?)?;
            slot_valid.enforce_equal(&Boolean::TRUE)?;
        }

        // === Verify destination capacity ===
        let dst_new_used_volume = compute_used_volume(&dst_new_inv_var, &volume_registry_var)?;
        let dst_remaining = &dst_max_capacity_var - &dst_new_used_volume;
        dst_remaining.enforce_cmp(&FpVar::zero(), std::cmp::Ordering::Greater, true)?;

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
    fn test_transfer_capacity_valid() {
        let config = Arc::new(poseidon_config::<Fr>());
        let registry = create_test_registry();
        let registry_hash = compute_registry_hash(&registry, &config);

        // Source: 100 of item 1 (500 volume)
        let src_old = Inventory::from_items(&[(1, 100)]);
        let src_old_blinding = Fr::from(111u64);
        let src_old_commitment = create_inventory_commitment(&src_old, src_old_blinding, &config);

        // Destination: 20 of item 1 (100 volume)
        let dst_old = Inventory::from_items(&[(1, 20)]);
        let dst_old_blinding = Fr::from(222u64);
        let dst_old_commitment = create_inventory_commitment(&dst_old, dst_old_blinding, &config);

        // Transfer 30 of item 1 (150 volume)
        let mut src_new = src_old.clone();
        src_new.withdraw(1, 30).unwrap();
        let src_new_blinding = Fr::from(333u64);
        let src_new_commitment = create_inventory_commitment(&src_new, src_new_blinding, &config);

        let mut dst_new = dst_old.clone();
        dst_new.deposit(1, 30).unwrap();
        let dst_new_blinding = Fr::from(444u64);
        let dst_new_commitment = create_inventory_commitment(&dst_new, dst_new_blinding, &config);

        // Destination new volume: (20 + 30) * 5 = 250
        // Capacity = 300, should pass
        let circuit = TransferWithCapacityCircuit::new(
            src_old,
            src_new,
            src_old_blinding,
            src_new_blinding,
            dst_old,
            dst_new,
            dst_old_blinding,
            dst_new_blinding,
            src_old_commitment,
            src_new_commitment,
            dst_old_commitment,
            dst_new_commitment,
            1,   // item_id
            30,  // amount
            300, // dst_max_capacity
            registry_hash,
            registry,
            config,
        );

        let cs = ConstraintSystem::<Fr>::new_ref();
        circuit.generate_constraints(cs.clone()).unwrap();

        assert!(cs.is_satisfied().unwrap());
        println!("TransferWithCapacity constraints: {}", cs.num_constraints());
    }

    #[test]
    fn test_transfer_capacity_destination_full() {
        let config = Arc::new(poseidon_config::<Fr>());
        let registry = create_test_registry();
        let registry_hash = compute_registry_hash(&registry, &config);

        // Source: 100 of item 1
        let src_old = Inventory::from_items(&[(1, 100)]);
        let src_old_blinding = Fr::from(111u64);
        let src_old_commitment = create_inventory_commitment(&src_old, src_old_blinding, &config);

        // Destination: 20 of item 1 (100 volume)
        let dst_old = Inventory::from_items(&[(1, 20)]);
        let dst_old_blinding = Fr::from(222u64);
        let dst_old_commitment = create_inventory_commitment(&dst_old, dst_old_blinding, &config);

        // Transfer 50 of item 1
        let mut src_new = src_old.clone();
        src_new.withdraw(1, 50).unwrap();
        let src_new_blinding = Fr::from(333u64);
        let src_new_commitment = create_inventory_commitment(&src_new, src_new_blinding, &config);

        let mut dst_new = dst_old.clone();
        dst_new.deposit(1, 50).unwrap();
        let dst_new_blinding = Fr::from(444u64);
        let dst_new_commitment = create_inventory_commitment(&dst_new, dst_new_blinding, &config);

        // Destination new volume: (20 + 50) * 5 = 350
        // Capacity = 200, should FAIL
        let circuit = TransferWithCapacityCircuit::new(
            src_old,
            src_new,
            src_old_blinding,
            src_new_blinding,
            dst_old,
            dst_new,
            dst_old_blinding,
            dst_new_blinding,
            src_old_commitment,
            src_new_commitment,
            dst_old_commitment,
            dst_new_commitment,
            1,   // item_id
            50,  // amount
            200, // dst_max_capacity (too small)
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
    fn test_transfer_capacity_insufficient_source() {
        let config = Arc::new(poseidon_config::<Fr>());
        let registry = create_test_registry();
        let registry_hash = compute_registry_hash(&registry, &config);

        // Source: only 10 of item 1
        let src_old = Inventory::from_items(&[(1, 10)]);
        let src_old_blinding = Fr::from(111u64);
        let src_old_commitment = create_inventory_commitment(&src_old, src_old_blinding, &config);

        // Destination: empty
        let dst_old = Inventory::new();
        let dst_old_blinding = Fr::from(222u64);
        let dst_old_commitment = create_inventory_commitment(&dst_old, dst_old_blinding, &config);

        // Try to transfer 50 (more than source has)
        // Fabricate invalid states
        let src_new = Inventory::from_items(&[(1, 0)]);
        let src_new_blinding = Fr::from(333u64);
        let src_new_commitment = create_inventory_commitment(&src_new, src_new_blinding, &config);

        let dst_new = Inventory::from_items(&[(1, 50)]);
        let dst_new_blinding = Fr::from(444u64);
        let dst_new_commitment = create_inventory_commitment(&dst_new, dst_new_blinding, &config);

        let circuit = TransferWithCapacityCircuit::new(
            src_old,
            src_new,
            src_old_blinding,
            src_new_blinding,
            dst_old,
            dst_new,
            dst_old_blinding,
            dst_new_blinding,
            src_old_commitment,
            src_new_commitment,
            dst_old_commitment,
            dst_new_commitment,
            1,    // item_id
            50,   // amount (more than source has)
            1000, // dst_max_capacity (enough)
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
    fn test_transfer_capacity_to_empty_inventory() {
        let config = Arc::new(poseidon_config::<Fr>());
        let registry = create_test_registry();
        let registry_hash = compute_registry_hash(&registry, &config);

        // Source: 100 of item 1
        let src_old = Inventory::from_items(&[(1, 100)]);
        let src_old_blinding = Fr::from(111u64);
        let src_old_commitment = create_inventory_commitment(&src_old, src_old_blinding, &config);

        // Destination: empty
        let dst_old = Inventory::new();
        let dst_old_blinding = Fr::from(222u64);
        let dst_old_commitment = create_inventory_commitment(&dst_old, dst_old_blinding, &config);

        // Transfer 20 of item 1
        let mut src_new = src_old.clone();
        src_new.withdraw(1, 20).unwrap();
        let src_new_blinding = Fr::from(333u64);
        let src_new_commitment = create_inventory_commitment(&src_new, src_new_blinding, &config);

        let mut dst_new = dst_old.clone();
        dst_new.deposit(1, 20).unwrap();
        let dst_new_blinding = Fr::from(444u64);
        let dst_new_commitment = create_inventory_commitment(&dst_new, dst_new_blinding, &config);

        // Destination new volume: 20 * 5 = 100
        let circuit = TransferWithCapacityCircuit::new(
            src_old,
            src_new,
            src_old_blinding,
            src_new_blinding,
            dst_old,
            dst_new,
            dst_old_blinding,
            dst_new_blinding,
            src_old_commitment,
            src_new_commitment,
            dst_old_commitment,
            dst_new_commitment,
            1,   // item_id
            20,  // amount
            100, // dst_max_capacity (exact)
            registry_hash,
            registry,
            config,
        );

        let cs = ConstraintSystem::<Fr>::new_ref();
        circuit.generate_constraints(cs.clone()).unwrap();

        assert!(cs.is_satisfied().unwrap());
    }
}
