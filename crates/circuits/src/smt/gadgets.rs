//! In-circuit SMT verification gadgets.
//!
//! These gadgets allow ZK circuits to verify Merkle proofs and update SMT roots.

use ark_ff::PrimeField;
use ark_r1cs_std::{
    prelude::*,
    fields::fp::FpVar,
    boolean::Boolean,
};
use ark_relations::r1cs::{ConstraintSystemRef, SynthesisError};
use ark_crypto_primitives::sponge::poseidon::{
    PoseidonConfig,
    constraints::PoseidonSpongeVar,
};
use ark_crypto_primitives::sponge::constraints::CryptographicSpongeVar;
use std::sync::Arc;

use super::proof::MerkleProof;

/// Circuit variable representation of a Merkle proof.
#[derive(Clone)]
pub struct MerkleProofVar<F: PrimeField> {
    /// Sibling hashes as circuit variables
    path: Vec<FpVar<F>>,

    /// Direction booleans as circuit variables
    indices: Vec<Boolean<F>>,
}

impl<F: PrimeField> MerkleProofVar<F> {
    /// Allocate a Merkle proof as witness variables.
    pub fn new_witness(
        cs: ConstraintSystemRef<F>,
        proof: &MerkleProof<F>,
    ) -> Result<Self, SynthesisError> {
        let path = proof
            .path()
            .iter()
            .map(|h| FpVar::new_witness(cs.clone(), || Ok(*h)))
            .collect::<Result<Vec<_>, _>>()?;

        let indices = proof
            .indices()
            .iter()
            .map(|&b| Boolean::new_witness(cs.clone(), || Ok(b)))
            .collect::<Result<Vec<_>, _>>()?;

        Ok(Self { path, indices })
    }

    /// Get the path variables.
    pub fn path(&self) -> &[FpVar<F>] {
        &self.path
    }

    /// Get the indices variables.
    pub fn indices(&self) -> &[Boolean<F>] {
        &self.indices
    }

    /// Get the proof depth.
    pub fn depth(&self) -> usize {
        self.path.len()
    }
}

/// Hash two field elements using Poseidon in-circuit.
pub fn hash_two<F: PrimeField>(
    cs: ConstraintSystemRef<F>,
    left: &FpVar<F>,
    right: &FpVar<F>,
    config: &PoseidonConfig<F>,
) -> Result<FpVar<F>, SynthesisError> {
    let mut sponge = PoseidonSpongeVar::new(cs, config);
    let inputs = vec![left.clone(), right.clone()];
    sponge.absorb(&inputs)?;
    let result = sponge.squeeze_field_elements(1)?;
    Ok(result[0].clone())
}

/// Hash a leaf (item_id, quantity) using Poseidon in-circuit.
pub fn hash_leaf<F: PrimeField>(
    cs: ConstraintSystemRef<F>,
    item_id: &FpVar<F>,
    quantity: &FpVar<F>,
    config: &PoseidonConfig<F>,
) -> Result<FpVar<F>, SynthesisError> {
    hash_two(cs, item_id, quantity, config)
}

/// Compute the root hash from a leaf and Merkle path in-circuit.
///
/// This is the core membership verification gadget.
pub fn compute_root_from_path<F: PrimeField>(
    cs: ConstraintSystemRef<F>,
    leaf_hash: &FpVar<F>,
    proof: &MerkleProofVar<F>,
    config: &PoseidonConfig<F>,
) -> Result<FpVar<F>, SynthesisError> {
    let mut current = leaf_hash.clone();

    for (sibling, is_right) in proof.path.iter().zip(proof.indices.iter()) {
        // If is_right: H(sibling, current), else H(current, sibling)
        let left = is_right.select(sibling, &current)?;
        let right = is_right.select(&current, sibling)?;

        current = hash_two(cs.clone(), &left, &right, config)?;
    }

    Ok(current)
}

/// Verify that a leaf with given item_id and quantity exists in the tree with given root.
///
/// This constrains: compute_root(H(item_id, quantity), proof) == expected_root
pub fn verify_membership<F: PrimeField>(
    cs: ConstraintSystemRef<F>,
    expected_root: &FpVar<F>,
    item_id: &FpVar<F>,
    quantity: &FpVar<F>,
    proof: &MerkleProofVar<F>,
    config: &PoseidonConfig<F>,
) -> Result<(), SynthesisError> {
    // Compute leaf hash
    let leaf_hash = hash_leaf(cs.clone(), item_id, quantity, config)?;

    // Compute root from proof
    let computed_root = compute_root_from_path(cs, &leaf_hash, proof, config)?;

    // Enforce equality
    computed_root.enforce_equal(expected_root)?;

    Ok(())
}

/// Verify membership and compute the new root after updating the leaf.
///
/// This is used for state transitions (deposit/withdraw).
///
/// Handles insertions specially: when old_quantity == 0, verifies against
/// the default leaf hash H(0, 0) instead of H(item_id, 0). This allows
/// adding new items to empty slots.
///
/// Returns the new root after setting the leaf to new_quantity.
pub fn verify_and_update<F: PrimeField>(
    cs: ConstraintSystemRef<F>,
    old_root: &FpVar<F>,
    item_id: &FpVar<F>,
    old_quantity: &FpVar<F>,
    new_quantity: &FpVar<F>,
    proof: &MerkleProofVar<F>,
    config: &PoseidonConfig<F>,
) -> Result<FpVar<F>, SynthesisError> {
    // For insertions (old_quantity == 0), use default leaf hash H(0, 0)
    // For updates (old_quantity > 0), use regular hash H(item_id, old_quantity)
    let zero = FpVar::zero();
    let is_insertion = old_quantity.is_eq(&zero)?;

    let default_leaf_hash = hash_leaf(cs.clone(), &zero, &zero, config)?;
    let regular_old_hash = hash_leaf(cs.clone(), item_id, old_quantity, config)?;

    let old_leaf_hash = is_insertion.select(&default_leaf_hash, &regular_old_hash)?;

    // Verify old state
    let computed_old_root = compute_root_from_path(cs.clone(), &old_leaf_hash, proof, config)?;
    computed_old_root.enforce_equal(old_root)?;

    // Compute new leaf hash (always uses item_id)
    let new_leaf_hash = hash_leaf(cs.clone(), item_id, new_quantity, config)?;

    // Compute new root using the same path (siblings unchanged)
    let new_root = compute_root_from_path(cs, &new_leaf_hash, proof, config)?;

    Ok(new_root)
}

/// Verify that an item is NOT in the tree (quantity = 0).
///
/// This proves non-membership by showing the leaf at item_id is empty.
pub fn verify_non_membership<F: PrimeField>(
    cs: ConstraintSystemRef<F>,
    expected_root: &FpVar<F>,
    item_id: &FpVar<F>,
    proof: &MerkleProofVar<F>,
    config: &PoseidonConfig<F>,
) -> Result<(), SynthesisError> {
    let zero = FpVar::zero();
    verify_membership(cs, expected_root, item_id, &zero, proof, config)
}

#[cfg(test)]
mod gadget_tests {
    use super::*;
    use crate::commitment::poseidon_config;
    use crate::smt::{SparseMerkleTree, DEFAULT_DEPTH};
    use ark_bn254::Fr;
    use ark_relations::r1cs::ConstraintSystem;

    fn setup() -> Arc<PoseidonConfig<Fr>> {
        Arc::new(poseidon_config())
    }

    #[test]
    fn test_verify_membership_valid() {
        let config = setup();
        let mut tree = SparseMerkleTree::<Fr>::new(DEFAULT_DEPTH, config.clone());

        tree.update(1, 100);
        tree.update(42, 50);

        let root = tree.root();
        let proof = tree.get_proof(1);

        // Create constraint system
        let cs = ConstraintSystem::<Fr>::new_ref();

        // Allocate variables
        let root_var = FpVar::new_input(cs.clone(), || Ok(root)).unwrap();
        let item_id_var = FpVar::new_witness(cs.clone(), || Ok(Fr::from(1u64))).unwrap();
        let quantity_var = FpVar::new_witness(cs.clone(), || Ok(Fr::from(100u64))).unwrap();
        let proof_var = MerkleProofVar::new_witness(cs.clone(), &proof).unwrap();

        // Verify membership
        verify_membership(
            cs.clone(),
            &root_var,
            &item_id_var,
            &quantity_var,
            &proof_var,
            &config,
        )
        .unwrap();

        assert!(cs.is_satisfied().unwrap());
    }

    #[test]
    fn test_verify_membership_wrong_quantity() {
        let config = setup();
        let mut tree = SparseMerkleTree::<Fr>::new(DEFAULT_DEPTH, config.clone());

        tree.update(1, 100);
        let root = tree.root();
        let proof = tree.get_proof(1);

        let cs = ConstraintSystem::<Fr>::new_ref();

        let root_var = FpVar::new_input(cs.clone(), || Ok(root)).unwrap();
        let item_id_var = FpVar::new_witness(cs.clone(), || Ok(Fr::from(1u64))).unwrap();
        // Wrong quantity!
        let quantity_var = FpVar::new_witness(cs.clone(), || Ok(Fr::from(99u64))).unwrap();
        let proof_var = MerkleProofVar::new_witness(cs.clone(), &proof).unwrap();

        verify_membership(
            cs.clone(),
            &root_var,
            &item_id_var,
            &quantity_var,
            &proof_var,
            &config,
        )
        .unwrap();

        // Should NOT be satisfied - wrong quantity
        assert!(!cs.is_satisfied().unwrap());
    }

    #[test]
    fn test_verify_and_update() {
        let config = setup();
        let mut tree = SparseMerkleTree::<Fr>::new(DEFAULT_DEPTH, config.clone());

        tree.update(1, 100);
        let old_root = tree.root();
        let proof = tree.get_proof(1);

        // Compute expected new root natively
        tree.update(1, 150);
        let expected_new_root = tree.root();

        let cs = ConstraintSystem::<Fr>::new_ref();

        let old_root_var = FpVar::new_input(cs.clone(), || Ok(old_root)).unwrap();
        let item_id_var = FpVar::new_witness(cs.clone(), || Ok(Fr::from(1u64))).unwrap();
        let old_qty_var = FpVar::new_witness(cs.clone(), || Ok(Fr::from(100u64))).unwrap();
        let new_qty_var = FpVar::new_witness(cs.clone(), || Ok(Fr::from(150u64))).unwrap();
        let proof_var = MerkleProofVar::new_witness(cs.clone(), &proof).unwrap();

        let computed_new_root = verify_and_update(
            cs.clone(),
            &old_root_var,
            &item_id_var,
            &old_qty_var,
            &new_qty_var,
            &proof_var,
            &config,
        )
        .unwrap();

        // Verify computed root matches expected
        let expected_var = FpVar::new_input(cs.clone(), || Ok(expected_new_root)).unwrap();
        computed_new_root.enforce_equal(&expected_var).unwrap();

        assert!(cs.is_satisfied().unwrap());
    }

    #[test]
    fn test_constraint_count() {
        let config = setup();
        let mut tree = SparseMerkleTree::<Fr>::new(DEFAULT_DEPTH, config.clone());

        tree.update(1, 100);
        let root = tree.root();
        let proof = tree.get_proof(1);

        let cs = ConstraintSystem::<Fr>::new_ref();

        let root_var = FpVar::new_input(cs.clone(), || Ok(root)).unwrap();
        let item_id_var = FpVar::new_witness(cs.clone(), || Ok(Fr::from(1u64))).unwrap();
        let quantity_var = FpVar::new_witness(cs.clone(), || Ok(Fr::from(100u64))).unwrap();
        let proof_var = MerkleProofVar::new_witness(cs.clone(), &proof).unwrap();

        verify_membership(
            cs.clone(),
            &root_var,
            &item_id_var,
            &quantity_var,
            &proof_var,
            &config,
        )
        .unwrap();

        let num_constraints = cs.num_constraints();
        println!("SMT membership verification constraints (depth {}): {}", DEFAULT_DEPTH, num_constraints);

        // With depth 12, expect roughly:
        // - 1 leaf hash: ~300 constraints
        // - 12 node hashes: 12 * 300 = 3600 constraints
        // Total: ~3900 constraints
        assert!(
            num_constraints < 5000,
            "Too many constraints: {}. Expected < 5000 for depth {}",
            num_constraints,
            DEFAULT_DEPTH
        );
    }
}
