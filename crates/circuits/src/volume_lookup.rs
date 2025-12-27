//! Volume lookup gadgets for capacity-based inventory circuits.
//!
//! This module provides:
//! - `VolumeRegistry`: Native Rust structure for item volumes
//! - `VolumeRegistryVar`: In-circuit variable for volume lookups
//! - `lookup_volume`: Find volume for a given item_id
//! - `compute_used_volume`: Calculate total volume used by an inventory

use ark_ff::PrimeField;
use ark_r1cs_std::{
    alloc::AllocVar,
    fields::fp::FpVar,
    prelude::*,
};
use ark_relations::r1cs::{ConstraintSystemRef, SynthesisError};

use crate::inventory::InventoryVar;

/// Maximum number of item types in the volume registry.
/// Matches MAX_ITEM_SLOTS for simplicity (item_id 0-15).
pub const MAX_ITEM_TYPES: usize = 16;

/// Volume registry mapping item_id to volume_per_unit.
/// Index i contains the volume for item_id i.
/// item_id 0 (empty slot) should have volume 0.
#[derive(Clone, Debug)]
pub struct VolumeRegistry {
    /// volumes[i] = volume per unit for item_id i
    pub volumes: [u64; MAX_ITEM_TYPES],
}

impl Default for VolumeRegistry {
    fn default() -> Self {
        Self {
            volumes: [0; MAX_ITEM_TYPES],
        }
    }
}

impl VolumeRegistry {
    /// Create a new volume registry with given volumes.
    pub fn new(volumes: [u64; MAX_ITEM_TYPES]) -> Self {
        Self { volumes }
    }

    /// Create a volume registry from a slice (pads with zeros if needed).
    pub fn from_slice(volumes: &[u64]) -> Self {
        let mut registry = Self::default();
        for (i, &vol) in volumes.iter().take(MAX_ITEM_TYPES).enumerate() {
            registry.volumes[i] = vol;
        }
        registry
    }

    /// Get volume for an item_id.
    pub fn get_volume(&self, item_id: u32) -> u64 {
        if (item_id as usize) < MAX_ITEM_TYPES {
            self.volumes[item_id as usize]
        } else {
            0
        }
    }

    /// Convert to field elements for hashing.
    pub fn to_field_elements<F: PrimeField>(&self) -> Vec<F> {
        self.volumes.iter().map(|&v| F::from(v)).collect()
    }

    /// Calculate total volume used by an inventory (native, non-circuit).
    pub fn calculate_used_volume(&self, inventory: &crate::inventory::Inventory) -> u64 {
        inventory
            .slots
            .iter()
            .map(|slot| {
                let volume_per_unit = self.get_volume(slot.item_id);
                slot.quantity * volume_per_unit
            })
            .sum()
    }
}

/// In-circuit variable for a volume registry.
pub struct VolumeRegistryVar<F: PrimeField> {
    /// Volume values as field variables.
    pub volumes: [FpVar<F>; MAX_ITEM_TYPES],
}

impl<F: PrimeField> VolumeRegistryVar<F> {
    /// Allocate volume registry as public input variables.
    pub fn new_input(
        cs: ConstraintSystemRef<F>,
        registry: &VolumeRegistry,
    ) -> Result<Self, SynthesisError> {
        let volumes: [FpVar<F>; MAX_ITEM_TYPES] = std::array::from_fn(|i| {
            FpVar::new_input(cs.clone(), || Ok(F::from(registry.volumes[i]))).unwrap()
        });
        Ok(Self { volumes })
    }

    /// Allocate volume registry as witness variables.
    pub fn new_witness(
        cs: ConstraintSystemRef<F>,
        registry: &VolumeRegistry,
    ) -> Result<Self, SynthesisError> {
        let volumes: [FpVar<F>; MAX_ITEM_TYPES] = std::array::from_fn(|i| {
            FpVar::new_witness(cs.clone(), || Ok(F::from(registry.volumes[i]))).unwrap()
        });
        Ok(Self { volumes })
    }

    /// Allocate with optional values (for empty circuit setup).
    pub fn new_input_optional(
        cs: ConstraintSystemRef<F>,
        registry: Option<&VolumeRegistry>,
    ) -> Result<Self, SynthesisError> {
        let default = VolumeRegistry::default();
        let reg = registry.unwrap_or(&default);
        Self::new_input(cs, reg)
    }

    /// Convert to field variables (for hashing).
    pub fn to_field_vars(&self) -> Vec<FpVar<F>> {
        self.volumes.to_vec()
    }

    /// Lookup volume for a given item_id.
    /// Uses conditional selection across all possible item_ids.
    pub fn lookup_volume(&self, item_id: &FpVar<F>) -> Result<FpVar<F>, SynthesisError> {
        let mut result = FpVar::zero();

        for (i, volume) in self.volumes.iter().enumerate() {
            // Check if item_id == i
            let index_var = FpVar::constant(F::from(i as u64));
            let is_match = item_id.is_eq(&index_var)?;

            // Add volume contribution if this is the matching index
            let contribution = is_match.select(volume, &FpVar::zero())?;
            result += contribution;
        }

        Ok(result)
    }
}

/// Calculate the total volume used by an inventory in-circuit.
///
/// For each slot in the inventory:
/// - Look up the volume_per_unit for that item_id
/// - Multiply by the quantity
/// - Sum all contributions
///
/// Empty slots (item_id = 0) contribute 0 volume since volumes[0] = 0.
pub fn compute_used_volume<F: PrimeField>(
    inventory_var: &InventoryVar<F>,
    volume_registry: &VolumeRegistryVar<F>,
) -> Result<FpVar<F>, SynthesisError> {
    let mut total_volume = FpVar::zero();

    for (slot_id, slot_qty) in &inventory_var.slots {
        // Look up the volume for this item_id
        let volume_per_unit = volume_registry.lookup_volume(slot_id)?;

        // Calculate volume contribution: quantity * volume_per_unit
        let contribution = slot_qty * &volume_per_unit;
        total_volume += contribution;
    }

    Ok(total_volume)
}

/// Standalone function to lookup volume for an item_id.
/// Convenience wrapper around VolumeRegistryVar::lookup_volume.
pub fn lookup_volume<F: PrimeField>(
    item_id: &FpVar<F>,
    volume_registry: &VolumeRegistryVar<F>,
) -> Result<FpVar<F>, SynthesisError> {
    volume_registry.lookup_volume(item_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inventory::Inventory;
    use ark_bn254::Fr;
    use ark_relations::r1cs::ConstraintSystem;

    #[test]
    fn test_volume_registry_native() {
        // Create a registry: item 1 = 5 volume, item 2 = 10 volume
        let mut volumes = [0u64; MAX_ITEM_TYPES];
        volumes[1] = 5;
        volumes[2] = 10;
        volumes[3] = 3;
        let registry = VolumeRegistry::new(volumes);

        assert_eq!(registry.get_volume(0), 0); // Empty slot
        assert_eq!(registry.get_volume(1), 5);
        assert_eq!(registry.get_volume(2), 10);
        assert_eq!(registry.get_volume(3), 3);
        assert_eq!(registry.get_volume(15), 0); // Unset item
    }

    #[test]
    fn test_calculate_used_volume_native() {
        let mut volumes = [0u64; MAX_ITEM_TYPES];
        volumes[1] = 5;  // Item 1: 5 volume each
        volumes[2] = 10; // Item 2: 10 volume each
        let registry = VolumeRegistry::new(volumes);

        // Inventory with 10 of item 1 and 5 of item 2
        let inventory = Inventory::from_items(&[(1, 10), (2, 5)]);

        // Expected: 10*5 + 5*10 = 50 + 50 = 100
        let used = registry.calculate_used_volume(&inventory);
        assert_eq!(used, 100);
    }

    #[test]
    fn test_volume_lookup_in_circuit() {
        let cs = ConstraintSystem::<Fr>::new_ref();

        let mut volumes = [0u64; MAX_ITEM_TYPES];
        volumes[1] = 5;
        volumes[2] = 10;
        let registry = VolumeRegistry::new(volumes);
        let registry_var = VolumeRegistryVar::new_input(cs.clone(), &registry).unwrap();

        // Look up volume for item_id = 1
        let item_id = FpVar::new_witness(cs.clone(), || Ok(Fr::from(1u64))).unwrap();
        let volume = registry_var.lookup_volume(&item_id).unwrap();

        // Verify it equals 5
        let expected = FpVar::new_input(cs.clone(), || Ok(Fr::from(5u64))).unwrap();
        volume.enforce_equal(&expected).unwrap();

        assert!(cs.is_satisfied().unwrap());
    }

    #[test]
    fn test_compute_used_volume_in_circuit() {
        let cs = ConstraintSystem::<Fr>::new_ref();

        // Registry: item 1 = 5, item 2 = 10
        let mut volumes = [0u64; MAX_ITEM_TYPES];
        volumes[1] = 5;
        volumes[2] = 10;
        let registry = VolumeRegistry::new(volumes);
        let registry_var = VolumeRegistryVar::new_input(cs.clone(), &registry).unwrap();

        // Inventory: 10 of item 1, 5 of item 2
        let inventory = Inventory::from_items(&[(1, 10), (2, 5)]);
        let inventory_var = InventoryVar::new_witness(cs.clone(), &inventory).unwrap();

        // Compute used volume in circuit
        let used_volume = compute_used_volume(&inventory_var, &registry_var).unwrap();

        // Expected: 10*5 + 5*10 = 100
        let expected = FpVar::new_input(cs.clone(), || Ok(Fr::from(100u64))).unwrap();
        used_volume.enforce_equal(&expected).unwrap();

        assert!(cs.is_satisfied().unwrap());
        println!("Volume lookup constraints: {}", cs.num_constraints());
    }

    #[test]
    fn test_empty_inventory_zero_volume() {
        let cs = ConstraintSystem::<Fr>::new_ref();

        let mut volumes = [0u64; MAX_ITEM_TYPES];
        volumes[1] = 5;
        let registry = VolumeRegistry::new(volumes);
        let registry_var = VolumeRegistryVar::new_input(cs.clone(), &registry).unwrap();

        // Empty inventory
        let inventory = Inventory::new();
        let inventory_var = InventoryVar::new_witness(cs.clone(), &inventory).unwrap();

        let used_volume = compute_used_volume(&inventory_var, &registry_var).unwrap();

        // Should be 0
        let expected = FpVar::new_input(cs.clone(), || Ok(Fr::from(0u64))).unwrap();
        used_volume.enforce_equal(&expected).unwrap();

        assert!(cs.is_satisfied().unwrap());
    }

    #[test]
    fn test_capacity_constraint() {
        let cs = ConstraintSystem::<Fr>::new_ref();

        let mut volumes = [0u64; MAX_ITEM_TYPES];
        volumes[1] = 5;
        volumes[2] = 10;
        let registry = VolumeRegistry::new(volumes);
        let registry_var = VolumeRegistryVar::new_input(cs.clone(), &registry).unwrap();

        // Inventory using 100 volume
        let inventory = Inventory::from_items(&[(1, 10), (2, 5)]);
        let inventory_var = InventoryVar::new_witness(cs.clone(), &inventory).unwrap();

        let used_volume = compute_used_volume(&inventory_var, &registry_var).unwrap();

        // Capacity = 150, should pass
        let max_capacity = FpVar::new_input(cs.clone(), || Ok(Fr::from(150u64))).unwrap();
        let remaining = &max_capacity - &used_volume;
        remaining
            .enforce_cmp(&FpVar::zero(), std::cmp::Ordering::Greater, true)
            .unwrap();

        assert!(cs.is_satisfied().unwrap());
    }

    #[test]
    fn test_over_capacity_fails() {
        let cs = ConstraintSystem::<Fr>::new_ref();

        let mut volumes = [0u64; MAX_ITEM_TYPES];
        volumes[1] = 5;
        volumes[2] = 10;
        let registry = VolumeRegistry::new(volumes);
        let registry_var = VolumeRegistryVar::new_input(cs.clone(), &registry).unwrap();

        // Inventory using 100 volume
        let inventory = Inventory::from_items(&[(1, 10), (2, 5)]);
        let inventory_var = InventoryVar::new_witness(cs.clone(), &inventory).unwrap();

        let used_volume = compute_used_volume(&inventory_var, &registry_var).unwrap();

        // Capacity = 50, should fail (used 100 > 50)
        let max_capacity = FpVar::new_input(cs.clone(), || Ok(Fr::from(50u64))).unwrap();
        let remaining = &max_capacity - &used_volume;
        remaining
            .enforce_cmp(&FpVar::zero(), std::cmp::Ordering::Greater, true)
            .unwrap();

        // This should NOT be satisfied
        assert!(!cs.is_satisfied().unwrap());
    }
}
