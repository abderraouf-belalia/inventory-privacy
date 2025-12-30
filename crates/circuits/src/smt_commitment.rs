//! SMT-based commitment scheme for inventories.
//!
//! The new commitment scheme uses:
//! commitment = Poseidon(inventory_root, current_volume, blinding)
//!
//! Where:
//! - inventory_root: Root of the Sparse Merkle Tree containing all items
//! - current_volume: Total volume of all items in the inventory
//! - blinding: Random value for hiding the commitment

use ark_ff::PrimeField;
use ark_crypto_primitives::sponge::poseidon::{PoseidonConfig, PoseidonSponge};
use ark_crypto_primitives::sponge::{Absorb, CryptographicSponge};
use ark_r1cs_std::prelude::*;
use ark_r1cs_std::fields::fp::FpVar;
use ark_relations::r1cs::{ConstraintSystemRef, SynthesisError};
use ark_crypto_primitives::sponge::poseidon::constraints::PoseidonSpongeVar;
use ark_crypto_primitives::sponge::constraints::CryptographicSpongeVar;

/// Create an SMT-based inventory commitment.
///
/// commitment = Poseidon(inventory_root, current_volume, blinding)
pub fn create_smt_commitment<F: PrimeField + Absorb>(
    inventory_root: F,
    current_volume: u64,
    blinding: F,
    config: &PoseidonConfig<F>,
) -> F {
    let inputs = vec![
        inventory_root,
        F::from(current_volume),
        blinding,
    ];

    let mut sponge = PoseidonSponge::new(config);
    sponge.absorb(&inputs);
    sponge.squeeze_field_elements(1)[0]
}

/// Compute SMT commitment in-circuit.
pub fn create_smt_commitment_var<F: PrimeField>(
    cs: ConstraintSystemRef<F>,
    inventory_root: &FpVar<F>,
    current_volume: &FpVar<F>,
    blinding: &FpVar<F>,
    config: &PoseidonConfig<F>,
) -> Result<FpVar<F>, SynthesisError> {
    let inputs = vec![
        inventory_root.clone(),
        current_volume.clone(),
        blinding.clone(),
    ];

    let mut sponge = PoseidonSpongeVar::new(cs, config);
    sponge.absorb(&inputs)?;
    let result = sponge.squeeze_field_elements(1)?;
    Ok(result[0].clone())
}

/// Inventory state for SMT-based design.
///
/// This tracks all the information needed to generate proofs.
#[derive(Clone, Debug)]
pub struct InventoryState<F: PrimeField> {
    /// Root of the inventory SMT
    pub inventory_root: F,
    /// Current total volume of the inventory
    pub current_volume: u64,
    /// Blinding factor for the commitment
    pub blinding: F,
}

impl<F: PrimeField + Absorb> InventoryState<F> {
    /// Create a new inventory state.
    pub fn new(inventory_root: F, current_volume: u64, blinding: F) -> Self {
        Self {
            inventory_root,
            current_volume,
            blinding,
        }
    }

    /// Create an empty inventory state.
    pub fn empty(empty_root: F, blinding: F) -> Self {
        Self {
            inventory_root: empty_root,
            current_volume: 0,
            blinding,
        }
    }

    /// Compute the commitment for this state.
    pub fn commitment(&self, config: &PoseidonConfig<F>) -> F {
        create_smt_commitment(
            self.inventory_root,
            self.current_volume,
            self.blinding,
            config,
        )
    }

    /// Update state after a deposit.
    ///
    /// Returns the new state and the volume delta.
    pub fn after_deposit(
        &self,
        new_root: F,
        item_volume: u64,
        amount: u64,
        new_blinding: F,
    ) -> Self {
        Self {
            inventory_root: new_root,
            current_volume: self.current_volume + (item_volume * amount),
            blinding: new_blinding,
        }
    }

    /// Update state after a withdrawal.
    ///
    /// Returns the new state. Panics if volume would underflow.
    pub fn after_withdraw(
        &self,
        new_root: F,
        item_volume: u64,
        amount: u64,
        new_blinding: F,
    ) -> Self {
        let volume_delta = item_volume * amount;
        assert!(
            self.current_volume >= volume_delta,
            "Withdrawal would cause volume underflow"
        );

        Self {
            inventory_root: new_root,
            current_volume: self.current_volume - volume_delta,
            blinding: new_blinding,
        }
    }
}

/// Circuit variables for inventory state.
#[derive(Clone)]
pub struct InventoryStateVar<F: PrimeField> {
    /// Root of the inventory SMT
    pub inventory_root: FpVar<F>,
    /// Current total volume
    pub current_volume: FpVar<F>,
    /// Blinding factor
    pub blinding: FpVar<F>,
}

impl<F: PrimeField> InventoryStateVar<F> {
    /// Create new inventory state variables.
    pub fn new(
        inventory_root: FpVar<F>,
        current_volume: FpVar<F>,
        blinding: FpVar<F>,
    ) -> Self {
        Self {
            inventory_root,
            current_volume,
            blinding,
        }
    }

    /// Compute the commitment in-circuit.
    pub fn commitment(
        &self,
        cs: ConstraintSystemRef<F>,
        config: &PoseidonConfig<F>,
    ) -> Result<FpVar<F>, SynthesisError> {
        create_smt_commitment_var(
            cs,
            &self.inventory_root,
            &self.current_volume,
            &self.blinding,
            config,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commitment::poseidon_config;
    use crate::smt::{SparseMerkleTree, DEFAULT_DEPTH};
    use ark_bn254::Fr;
    use ark_relations::r1cs::ConstraintSystem;
    use std::sync::Arc;

    #[test]
    fn test_commitment_deterministic() {
        let config = poseidon_config::<Fr>();
        let root = Fr::from(12345u64);
        let volume = 100u64;
        let blinding = Fr::from(99999u64);

        let commitment1 = create_smt_commitment(root, volume, blinding, &config);
        let commitment2 = create_smt_commitment(root, volume, blinding, &config);

        assert_eq!(commitment1, commitment2);
    }

    #[test]
    fn test_different_roots_different_commitments() {
        let config = poseidon_config::<Fr>();
        let blinding = Fr::from(99999u64);

        let commitment1 = create_smt_commitment(Fr::from(1u64), 100, blinding, &config);
        let commitment2 = create_smt_commitment(Fr::from(2u64), 100, blinding, &config);

        assert_ne!(commitment1, commitment2);
    }

    #[test]
    fn test_different_volumes_different_commitments() {
        let config = poseidon_config::<Fr>();
        let root = Fr::from(12345u64);
        let blinding = Fr::from(99999u64);

        let commitment1 = create_smt_commitment(root, 100, blinding, &config);
        let commitment2 = create_smt_commitment(root, 101, blinding, &config);

        assert_ne!(commitment1, commitment2);
    }

    #[test]
    fn test_different_blindings_different_commitments() {
        let config = poseidon_config::<Fr>();
        let root = Fr::from(12345u64);

        let commitment1 = create_smt_commitment(root, 100, Fr::from(1u64), &config);
        let commitment2 = create_smt_commitment(root, 100, Fr::from(2u64), &config);

        assert_ne!(commitment1, commitment2);
    }

    #[test]
    fn test_in_circuit_matches_native() {
        let config = poseidon_config::<Fr>();
        let root = Fr::from(12345u64);
        let volume = 100u64;
        let blinding = Fr::from(99999u64);

        // Compute native
        let native_commitment = create_smt_commitment(root, volume, blinding, &config);

        // Compute in-circuit
        let cs = ConstraintSystem::<Fr>::new_ref();

        let root_var = FpVar::new_witness(cs.clone(), || Ok(root)).unwrap();
        let volume_var = FpVar::new_witness(cs.clone(), || Ok(Fr::from(volume))).unwrap();
        let blinding_var = FpVar::new_witness(cs.clone(), || Ok(blinding)).unwrap();

        let circuit_commitment = create_smt_commitment_var(
            cs.clone(),
            &root_var,
            &volume_var,
            &blinding_var,
            &config,
        )
        .unwrap();

        // Verify they match
        let expected_var = FpVar::new_input(cs.clone(), || Ok(native_commitment)).unwrap();
        circuit_commitment.enforce_equal(&expected_var).unwrap();

        assert!(cs.is_satisfied().unwrap());
        println!("SMT commitment constraints: {}", cs.num_constraints());
    }

    #[test]
    fn test_inventory_state_workflow() {
        let poseidon_config = Arc::new(poseidon_config::<Fr>());

        // Create empty inventory
        let tree = SparseMerkleTree::<Fr>::new(DEFAULT_DEPTH, poseidon_config.clone());
        let empty_root = tree.root();
        let blinding = Fr::from(12345u64);

        let state = InventoryState::empty(empty_root, blinding);
        assert_eq!(state.current_volume, 0);

        let commitment1 = state.commitment(&poseidon_config);

        // Add item with volume 10, quantity 5 -> volume += 50
        let mut tree2 = tree.clone();
        tree2.update(1, 5);
        let new_root = tree2.root();
        let new_blinding = Fr::from(67890u64);

        let state2 = state.after_deposit(new_root, 10, 5, new_blinding);
        assert_eq!(state2.current_volume, 50);

        let commitment2 = state2.commitment(&poseidon_config);
        assert_ne!(commitment1, commitment2);

        // Withdraw 2 items -> volume -= 20
        let mut tree3 = tree2.clone();
        tree3.update(1, 3);
        let new_root2 = tree3.root();
        let new_blinding2 = Fr::from(11111u64);

        let state3 = state2.after_withdraw(new_root2, 10, 2, new_blinding2);
        assert_eq!(state3.current_volume, 30);
    }

    #[test]
    #[should_panic(expected = "Withdrawal would cause volume underflow")]
    fn test_withdraw_underflow() {
        let config = poseidon_config::<Fr>();
        let state = InventoryState::new(
            Fr::from(12345u64),
            100, // current volume
            Fr::from(99999u64),
        );

        // Try to withdraw more than available
        let _ = state.after_withdraw(
            Fr::from(11111u64),
            10,   // item volume
            15,   // amount -> 150 > 100
            Fr::from(22222u64),
        );
    }
}
