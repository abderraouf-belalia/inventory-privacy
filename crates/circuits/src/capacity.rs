//! CapacityProofCircuit: Proves that an inventory's used volume is within capacity.
//!
//! This circuit proves: "My inventory uses <= max_capacity volume units"
//! without revealing the actual inventory contents.

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
use crate::inventory::{Inventory, InventoryVar};
use crate::volume_lookup::{compute_used_volume, VolumeRegistry, VolumeRegistryVar};

/// Circuit that proves: "Inventory uses <= max_capacity volume"
///
/// Public inputs:
/// - commitment: The Poseidon hash of the inventory
/// - max_capacity: The maximum allowed volume
/// - registry_hash: Hash of the volume registry (for binding)
/// - volume_registry: The volume values for each item_id (0-15)
///
/// Private witnesses:
/// - inventory: The actual inventory contents
/// - blinding: The blinding factor used in the commitment
#[derive(Clone)]
pub struct CapacityProofCircuit<F: PrimeField> {
    /// Private: The inventory contents
    pub inventory: Option<Inventory>,
    /// Private: The blinding factor
    pub blinding: Option<F>,

    /// Public: The commitment to verify against
    pub commitment: Option<F>,
    /// Public: The maximum allowed volume
    pub max_capacity: u64,
    /// Public: Hash of the volume registry
    pub registry_hash: Option<F>,
    /// Public: Volume registry values
    pub volume_registry: Option<VolumeRegistry>,

    /// Poseidon configuration
    pub poseidon_config: Arc<PoseidonConfig<F>>,
}

impl<F: PrimeField> CapacityProofCircuit<F> {
    /// Create a new circuit instance for proving.
    pub fn new(
        inventory: Inventory,
        blinding: F,
        commitment: F,
        max_capacity: u64,
        registry_hash: F,
        volume_registry: VolumeRegistry,
        poseidon_config: Arc<PoseidonConfig<F>>,
    ) -> Self {
        Self {
            inventory: Some(inventory),
            blinding: Some(blinding),
            commitment: Some(commitment),
            max_capacity,
            registry_hash: Some(registry_hash),
            volume_registry: Some(volume_registry),
            poseidon_config,
        }
    }

    /// Create an empty circuit for setup (constraint generation only).
    pub fn empty(poseidon_config: Arc<PoseidonConfig<F>>) -> Self {
        Self {
            inventory: None,
            blinding: None,
            commitment: None,
            max_capacity: 0,
            registry_hash: None,
            volume_registry: None,
            poseidon_config,
        }
    }
}

impl<F: PrimeField + ark_crypto_primitives::sponge::Absorb> ConstraintSynthesizer<F>
    for CapacityProofCircuit<F>
{
    fn generate_constraints(self, cs: ConstraintSystemRef<F>) -> Result<(), SynthesisError> {
        // 1. Allocate private witnesses
        let inventory = self.inventory.unwrap_or_default();
        let inventory_var = InventoryVar::new_witness(cs.clone(), &inventory)?;

        let blinding_var = FpVar::new_witness(cs.clone(), || {
            self.blinding.ok_or(SynthesisError::AssignmentMissing)
        })?;

        // 2. Allocate public inputs
        let commitment_var = FpVar::new_input(cs.clone(), || {
            self.commitment.ok_or(SynthesisError::AssignmentMissing)
        })?;

        let max_capacity_var = FpVar::new_input(cs.clone(), || Ok(F::from(self.max_capacity)))?;

        let registry_hash_var = FpVar::new_input(cs.clone(), || {
            self.registry_hash.ok_or(SynthesisError::AssignmentMissing)
        })?;

        // Volume registry is a WITNESS (private), not a public input.
        // The circuit verifies that the volumes hash to registry_hash.
        // This keeps public inputs within Sui's 8-input limit.
        let volume_registry = self.volume_registry.unwrap_or_default();
        let volume_registry_var = VolumeRegistryVar::new_witness(cs.clone(), &volume_registry)?;

        // 3. Verify commitment: Poseidon(inventory, blinding) == commitment
        let poseidon = PoseidonGadget::new((*self.poseidon_config).clone());
        let computed_commitment =
            poseidon.commit_inventory(cs.clone(), &inventory_var.to_field_vars(), &blinding_var)?;

        computed_commitment.enforce_equal(&commitment_var)?;

        // 4. Verify registry hash: Poseidon(volume_registry) == registry_hash
        let computed_registry_hash = poseidon.hash(cs.clone(), &volume_registry_var.to_field_vars())?;
        computed_registry_hash.enforce_equal(&registry_hash_var)?;

        // 5. Compute used volume
        let used_volume = compute_used_volume(&inventory_var, &volume_registry_var)?;

        // 6. Verify: used_volume <= max_capacity
        // This is equivalent to: max_capacity - used_volume >= 0
        let remaining_capacity = &max_capacity_var - &used_volume;
        remaining_capacity.enforce_cmp(&FpVar::zero(), std::cmp::Ordering::Greater, true)?;

        Ok(())
    }
}

/// Compute the hash of a volume registry (for use as public input).
pub fn compute_registry_hash<F: PrimeField + ark_crypto_primitives::sponge::Absorb>(
    registry: &VolumeRegistry,
    poseidon_config: &PoseidonConfig<F>,
) -> F {
    use ark_crypto_primitives::sponge::{poseidon::PoseidonSponge, CryptographicSponge};

    let elements: Vec<F> = registry.to_field_elements();
    let mut sponge = PoseidonSponge::new(poseidon_config);
    sponge.absorb(&elements);
    sponge.squeeze_field_elements(1)[0]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commitment::{create_inventory_commitment, poseidon_config};
    use crate::volume_lookup::MAX_ITEM_TYPES;
    use ark_bn254::Fr;
    use ark_relations::r1cs::ConstraintSystem;

    fn create_test_registry() -> VolumeRegistry {
        let mut volumes = [0u64; MAX_ITEM_TYPES];
        volumes[1] = 5;   // Item 1: 5 volume
        volumes[2] = 10;  // Item 2: 10 volume
        volumes[3] = 3;   // Item 3: 3 volume
        VolumeRegistry::new(volumes)
    }

    #[test]
    fn test_capacity_proof_valid() {
        let config = Arc::new(poseidon_config::<Fr>());
        let registry = create_test_registry();
        let registry_hash = compute_registry_hash(&registry, &config);

        // Inventory: 10 of item 1 (50 volume), 5 of item 2 (50 volume) = 100 total
        let inventory = Inventory::from_items(&[(1, 10), (2, 5)]);
        let blinding = Fr::from(12345u64);
        let commitment = create_inventory_commitment(&inventory, blinding, &config);

        // Capacity = 150, should pass (100 <= 150)
        let circuit = CapacityProofCircuit::new(
            inventory,
            blinding,
            commitment,
            150, // max_capacity
            registry_hash,
            registry,
            config,
        );

        let cs = ConstraintSystem::<Fr>::new_ref();
        circuit.generate_constraints(cs.clone()).unwrap();

        assert!(cs.is_satisfied().unwrap());
        println!("CapacityProof constraints: {}", cs.num_constraints());
    }

    #[test]
    fn test_capacity_proof_at_exact_capacity() {
        let config = Arc::new(poseidon_config::<Fr>());
        let registry = create_test_registry();
        let registry_hash = compute_registry_hash(&registry, &config);

        // Inventory: 10 of item 1 (50 volume), 5 of item 2 (50 volume) = 100 total
        let inventory = Inventory::from_items(&[(1, 10), (2, 5)]);
        let blinding = Fr::from(12345u64);
        let commitment = create_inventory_commitment(&inventory, blinding, &config);

        // Capacity = 100, should pass (100 <= 100)
        let circuit = CapacityProofCircuit::new(
            inventory,
            blinding,
            commitment,
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
    fn test_capacity_proof_over_capacity() {
        let config = Arc::new(poseidon_config::<Fr>());
        let registry = create_test_registry();
        let registry_hash = compute_registry_hash(&registry, &config);

        // Inventory: 10 of item 1 (50 volume), 5 of item 2 (50 volume) = 100 total
        let inventory = Inventory::from_items(&[(1, 10), (2, 5)]);
        let blinding = Fr::from(12345u64);
        let commitment = create_inventory_commitment(&inventory, blinding, &config);

        // Capacity = 50, should FAIL (100 > 50)
        let circuit = CapacityProofCircuit::new(
            inventory,
            blinding,
            commitment,
            50, // max_capacity (too small)
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
    fn test_capacity_proof_empty_inventory() {
        let config = Arc::new(poseidon_config::<Fr>());
        let registry = create_test_registry();
        let registry_hash = compute_registry_hash(&registry, &config);

        // Empty inventory (0 volume)
        let inventory = Inventory::new();
        let blinding = Fr::from(12345u64);
        let commitment = create_inventory_commitment(&inventory, blinding, &config);

        // Any positive capacity should pass
        let circuit = CapacityProofCircuit::new(
            inventory,
            blinding,
            commitment,
            1, // Even 1 capacity is enough
            registry_hash,
            registry,
            config,
        );

        let cs = ConstraintSystem::<Fr>::new_ref();
        circuit.generate_constraints(cs.clone()).unwrap();

        assert!(cs.is_satisfied().unwrap());
    }

    #[test]
    fn test_capacity_proof_wrong_registry_hash() {
        let config = Arc::new(poseidon_config::<Fr>());
        let registry = create_test_registry();
        let wrong_registry_hash = Fr::from(99999u64); // Wrong hash

        let inventory = Inventory::from_items(&[(1, 10)]);
        let blinding = Fr::from(12345u64);
        let commitment = create_inventory_commitment(&inventory, blinding, &config);

        let circuit = CapacityProofCircuit::new(
            inventory,
            blinding,
            commitment,
            1000,
            wrong_registry_hash, // Wrong!
            registry,
            config,
        );

        let cs = ConstraintSystem::<Fr>::new_ref();
        circuit.generate_constraints(cs.clone()).unwrap();

        // Should NOT be satisfied due to registry hash mismatch
        assert!(!cs.is_satisfied().unwrap());
    }

    #[test]
    fn test_capacity_proof_wrong_commitment() {
        let config = Arc::new(poseidon_config::<Fr>());
        let registry = create_test_registry();
        let registry_hash = compute_registry_hash(&registry, &config);

        let inventory = Inventory::from_items(&[(1, 10)]);
        let blinding = Fr::from(12345u64);
        let wrong_commitment = Fr::from(99999u64); // Wrong commitment

        let circuit = CapacityProofCircuit::new(
            inventory,
            blinding,
            wrong_commitment, // Wrong!
            1000,
            registry_hash,
            registry,
            config,
        );

        let cs = ConstraintSystem::<Fr>::new_ref();
        circuit.generate_constraints(cs.clone()).unwrap();

        // Should NOT be satisfied due to commitment mismatch
        assert!(!cs.is_satisfied().unwrap());
    }
}
