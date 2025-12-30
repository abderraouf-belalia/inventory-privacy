//! Merkle proof structure for SMT membership verification.

use ark_ff::PrimeField;
use ark_crypto_primitives::sponge::poseidon::{PoseidonConfig, PoseidonSponge};
use ark_crypto_primitives::sponge::{Absorb, CryptographicSponge};

/// A Merkle proof for an SMT leaf.
///
/// Contains the sibling hashes from leaf to root and direction indices.
#[derive(Clone, Debug)]
pub struct MerkleProof<F: PrimeField> {
    /// Sibling hashes from leaf level (0) to root level (depth-1)
    path: Vec<F>,

    /// Direction at each level: true = current node is right child
    indices: Vec<bool>,
}

// Accessors that don't require Absorb
impl<F: PrimeField> MerkleProof<F> {
    /// Create a new Merkle proof.
    pub fn new(path: Vec<F>, indices: Vec<bool>) -> Self {
        assert_eq!(path.len(), indices.len(), "Path and indices must have same length");
        Self { path, indices }
    }

    /// Get the proof path (sibling hashes).
    pub fn path(&self) -> &[F] {
        &self.path
    }

    /// Get the direction indices.
    pub fn indices(&self) -> &[bool] {
        &self.indices
    }

    /// Get the proof depth (number of levels).
    pub fn depth(&self) -> usize {
        self.path.len()
    }

    /// Create an empty proof for testing.
    #[cfg(test)]
    pub fn empty(depth: usize) -> Self {
        Self {
            path: vec![F::zero(); depth],
            indices: vec![false; depth],
        }
    }
}

// Hashing methods that require Absorb
impl<F: PrimeField + Absorb> MerkleProof<F> {
    /// Compute the root hash from this proof and the leaf value.
    pub fn compute_root(
        &self,
        item_id: u64,
        quantity: u64,
        config: &PoseidonConfig<F>,
    ) -> F {
        // Start with leaf hash
        let mut current = Self::hash_leaf(item_id, quantity, config);

        // Work up the tree
        for (sibling, &is_right) in self.path.iter().zip(self.indices.iter()) {
            current = if is_right {
                // Current is right child: H(sibling, current)
                Self::hash_nodes(*sibling, current, config)
            } else {
                // Current is left child: H(current, sibling)
                Self::hash_nodes(current, *sibling, config)
            };
        }

        current
    }

    /// Compute the root hash from a pre-computed leaf hash.
    pub fn compute_root_from_leaf(
        &self,
        leaf_hash: F,
        config: &PoseidonConfig<F>,
    ) -> F {
        let mut current = leaf_hash;

        for (sibling, &is_right) in self.path.iter().zip(self.indices.iter()) {
            current = if is_right {
                Self::hash_nodes(*sibling, current, config)
            } else {
                Self::hash_nodes(current, *sibling, config)
            };
        }

        current
    }

    /// Hash a leaf: H(item_id, quantity)
    fn hash_leaf(item_id: u64, quantity: u64, config: &PoseidonConfig<F>) -> F {
        let mut sponge = PoseidonSponge::new(config);
        let inputs = vec![F::from(item_id), F::from(quantity)];
        sponge.absorb(&inputs);
        sponge.squeeze_field_elements(1)[0]
    }

    /// Hash two nodes: H(left, right)
    fn hash_nodes(left: F, right: F, config: &PoseidonConfig<F>) -> F {
        let mut sponge = PoseidonSponge::new(config);
        let inputs = vec![left, right];
        sponge.absorb(&inputs);
        sponge.squeeze_field_elements(1)[0]
    }
}

#[cfg(test)]
mod proof_tests {
    use super::*;
    use crate::commitment::poseidon_config;
    use ark_bn254::Fr;

    #[test]
    fn test_proof_structure() {
        let path = vec![Fr::from(1u64), Fr::from(2u64), Fr::from(3u64)];
        let indices = vec![false, true, false];

        let proof = MerkleProof::new(path.clone(), indices.clone());

        assert_eq!(proof.depth(), 3);
        assert_eq!(proof.path(), &path);
        assert_eq!(proof.indices(), &indices);
    }

    #[test]
    fn test_compute_root_deterministic() {
        let config = poseidon_config::<Fr>();
        let path = vec![Fr::from(1u64), Fr::from(2u64)];
        let indices = vec![false, false];

        let proof = MerkleProof::new(path, indices);

        let root1 = proof.compute_root(1, 100, &config);
        let root2 = proof.compute_root(1, 100, &config);

        assert_eq!(root1, root2);
    }

    #[test]
    fn test_different_quantities_different_roots() {
        let config = poseidon_config::<Fr>();
        let path = vec![Fr::from(1u64), Fr::from(2u64)];
        let indices = vec![false, false];

        let proof = MerkleProof::new(path, indices);

        let root1 = proof.compute_root(1, 100, &config);
        let root2 = proof.compute_root(1, 101, &config);

        assert_ne!(root1, root2);
    }
}
