//! Sparse Merkle Tree native implementation.
//!
//! A Sparse Merkle Tree (SMT) is a Merkle tree where most leaves are empty (default value).
//! Only non-empty leaves and their ancestors are stored, making it memory-efficient
//! for sparse data like inventory items.

use ark_ff::PrimeField;
use ark_crypto_primitives::sponge::poseidon::{PoseidonConfig, PoseidonSponge};
use ark_crypto_primitives::sponge::{Absorb, CryptographicSponge};
use std::collections::HashMap;
use std::sync::Arc;

use super::proof::MerkleProof;

/// Default tree depth (12 levels = 4,096 possible items)
pub const DEFAULT_DEPTH: usize = 12;

/// Sparse Merkle Tree for inventory storage.
///
/// Keys are item IDs (0 to 2^depth - 1).
/// Values are quantities stored as field elements.
#[derive(Clone)]
pub struct SparseMerkleTree<F: PrimeField> {
    /// Tree depth (number of levels from root to leaves)
    depth: usize,

    /// Sparse node storage: (level, index) -> hash
    /// Level 0 = leaves, level `depth` = root
    nodes: HashMap<(usize, u64), F>,

    /// Leaf values: item_id -> quantity
    leaves: HashMap<u64, u64>,

    /// Precomputed default hashes for each level
    /// defaults[0] = hash of empty leaf
    /// defaults[i] = hash(defaults[i-1], defaults[i-1])
    defaults: Vec<F>,

    /// Poseidon configuration for hashing
    poseidon_config: Arc<PoseidonConfig<F>>,
}

impl<F: PrimeField + Absorb> SparseMerkleTree<F> {
    /// Create a new empty SMT with the given depth and Poseidon config.
    pub fn new(depth: usize, poseidon_config: Arc<PoseidonConfig<F>>) -> Self {
        let defaults = Self::compute_defaults(depth, &poseidon_config);

        Self {
            depth,
            nodes: HashMap::new(),
            leaves: HashMap::new(),
            defaults,
            poseidon_config,
        }
    }

    /// Create an SMT from a list of (item_id, quantity) pairs.
    pub fn from_items(
        items: &[(u64, u64)],
        depth: usize,
        poseidon_config: Arc<PoseidonConfig<F>>,
    ) -> Self {
        let mut tree = Self::new(depth, poseidon_config);
        for &(item_id, quantity) in items {
            tree.update(item_id, quantity);
        }
        tree
    }

    /// Compute default hashes for each level of an empty tree.
    fn compute_defaults(depth: usize, config: &PoseidonConfig<F>) -> Vec<F> {
        let mut defaults = Vec::with_capacity(depth + 1);

        // Default leaf = H(0, 0) representing empty item
        let empty_leaf = Self::hash_leaf(0, 0, config);
        defaults.push(empty_leaf);

        // Build up default hashes for each level
        for _ in 0..depth {
            let prev = *defaults.last().unwrap();
            let parent = Self::hash_nodes(prev, prev, config);
            defaults.push(parent);
        }

        defaults
    }

    /// Hash a leaf: H(item_id, quantity)
    fn hash_leaf(item_id: u64, quantity: u64, config: &PoseidonConfig<F>) -> F {
        let mut sponge = PoseidonSponge::new(config);
        let inputs = vec![F::from(item_id), F::from(quantity)];
        sponge.absorb(&inputs);
        sponge.squeeze_field_elements(1)[0]
    }

    /// Hash two child nodes: H(left, right)
    fn hash_nodes(left: F, right: F, config: &PoseidonConfig<F>) -> F {
        let mut sponge = PoseidonSponge::new(config);
        let inputs = vec![left, right];
        sponge.absorb(&inputs);
        sponge.squeeze_field_elements(1)[0]
    }

    /// Get the quantity for an item, or 0 if not present.
    pub fn get(&self, item_id: u64) -> u64 {
        self.leaves.get(&item_id).copied().unwrap_or(0)
    }

    /// Update the quantity for an item and recompute affected hashes.
    /// Returns the new root hash.
    pub fn update(&mut self, item_id: u64, quantity: u64) -> F {
        assert!(item_id < (1u64 << self.depth), "item_id exceeds tree capacity");

        // Update leaf value
        if quantity == 0 {
            self.leaves.remove(&item_id);
        } else {
            self.leaves.insert(item_id, quantity);
        }

        // Compute new leaf hash
        let leaf_hash = Self::hash_leaf(item_id, quantity, &self.poseidon_config);
        self.nodes.insert((0, item_id), leaf_hash);

        // Recompute hashes up to root
        self.recompute_path(item_id)
    }

    /// Recompute hashes from a leaf up to the root.
    fn recompute_path(&mut self, item_id: u64) -> F {
        let mut current_index = item_id;
        let mut current_hash = self.get_node(0, item_id);

        for level in 0..self.depth {
            let sibling_index = current_index ^ 1; // Flip last bit to get sibling
            let sibling_hash = self.get_node(level, sibling_index);

            let parent_index = current_index >> 1;
            let parent_hash = if current_index & 1 == 0 {
                // Current is left child
                Self::hash_nodes(current_hash, sibling_hash, &self.poseidon_config)
            } else {
                // Current is right child
                Self::hash_nodes(sibling_hash, current_hash, &self.poseidon_config)
            };

            self.nodes.insert((level + 1, parent_index), parent_hash);
            current_index = parent_index;
            current_hash = parent_hash;
        }

        current_hash
    }

    /// Get a node hash, returning default if not present.
    fn get_node(&self, level: usize, index: u64) -> F {
        self.nodes
            .get(&(level, index))
            .copied()
            .unwrap_or(self.defaults[level])
    }

    /// Get the current root hash.
    pub fn root(&self) -> F {
        self.get_node(self.depth, 0)
    }

    /// Generate a Merkle proof for the given item.
    pub fn get_proof(&self, item_id: u64) -> MerkleProof<F> {
        assert!(item_id < (1u64 << self.depth), "item_id exceeds tree capacity");

        let mut path = Vec::with_capacity(self.depth);
        let mut indices = Vec::with_capacity(self.depth);

        let mut current_index = item_id;
        for level in 0..self.depth {
            let sibling_index = current_index ^ 1;
            let sibling = self.get_node(level, sibling_index);
            path.push(sibling);
            indices.push((current_index & 1) == 1); // true if current is right child
            current_index >>= 1;
        }

        MerkleProof::new(path, indices)
    }

    /// Verify a proof for a given item and quantity.
    pub fn verify_proof(
        &self,
        item_id: u64,
        quantity: u64,
        proof: &MerkleProof<F>,
    ) -> bool {
        let computed_root = proof.compute_root(item_id, quantity, &self.poseidon_config);
        computed_root == self.root()
    }

    /// Get the tree depth.
    pub fn depth(&self) -> usize {
        self.depth
    }

    /// Get the Poseidon config.
    pub fn poseidon_config(&self) -> &Arc<PoseidonConfig<F>> {
        &self.poseidon_config
    }

    /// Get default hash for a level.
    pub fn default_at_level(&self, level: usize) -> F {
        self.defaults[level]
    }

    /// Get all non-empty items.
    pub fn items(&self) -> impl Iterator<Item = (u64, u64)> + '_ {
        self.leaves.iter().map(|(&k, &v)| (k, v))
    }

    /// Get the number of non-empty items.
    pub fn len(&self) -> usize {
        self.leaves.len()
    }

    /// Check if the tree is empty.
    pub fn is_empty(&self) -> bool {
        self.leaves.is_empty()
    }
}

#[cfg(test)]
mod tree_tests {
    use super::*;
    use crate::commitment::poseidon_config;
    use ark_bn254::Fr;

    fn setup() -> Arc<PoseidonConfig<Fr>> {
        Arc::new(poseidon_config())
    }

    #[test]
    fn test_empty_tree() {
        let config = setup();
        let tree = SparseMerkleTree::<Fr>::new(DEFAULT_DEPTH, config);

        assert!(tree.is_empty());
        assert_eq!(tree.len(), 0);
        assert_eq!(tree.get(0), 0);
        assert_eq!(tree.get(100), 0);
    }

    #[test]
    fn test_single_insert() {
        let config = setup();
        let mut tree = SparseMerkleTree::<Fr>::new(DEFAULT_DEPTH, config);

        let root1 = tree.root();
        tree.update(1, 100);
        let root2 = tree.root();

        assert_ne!(root1, root2, "Root should change after insert");
        assert_eq!(tree.get(1), 100);
        assert_eq!(tree.len(), 1);
    }

    #[test]
    fn test_multiple_inserts() {
        let config = setup();
        let mut tree = SparseMerkleTree::<Fr>::new(DEFAULT_DEPTH, config);

        tree.update(1, 100);
        tree.update(42, 50);
        tree.update(1000, 200);

        assert_eq!(tree.get(1), 100);
        assert_eq!(tree.get(42), 50);
        assert_eq!(tree.get(1000), 200);
        assert_eq!(tree.len(), 3);
    }

    #[test]
    fn test_update_existing() {
        let config = setup();
        let mut tree = SparseMerkleTree::<Fr>::new(DEFAULT_DEPTH, config);

        tree.update(1, 100);
        let root1 = tree.root();

        tree.update(1, 150);
        let root2 = tree.root();

        assert_ne!(root1, root2, "Root should change after update");
        assert_eq!(tree.get(1), 150);
    }

    #[test]
    fn test_delete_item() {
        let config = setup();
        let mut tree = SparseMerkleTree::<Fr>::new(DEFAULT_DEPTH, config);

        tree.update(1, 100);
        tree.update(2, 50);
        assert_eq!(tree.len(), 2);

        tree.update(1, 0); // Delete by setting to 0
        assert_eq!(tree.get(1), 0);
        assert_eq!(tree.len(), 1);
    }

    #[test]
    fn test_from_items() {
        let config = setup();
        let items = vec![(1, 100), (42, 50), (1000, 200)];
        let tree = SparseMerkleTree::<Fr>::from_items(&items, DEFAULT_DEPTH, config);

        assert_eq!(tree.get(1), 100);
        assert_eq!(tree.get(42), 50);
        assert_eq!(tree.get(1000), 200);
        assert_eq!(tree.len(), 3);
    }

    #[test]
    fn test_proof_generation_and_verification() {
        let config = setup();
        let mut tree = SparseMerkleTree::<Fr>::new(DEFAULT_DEPTH, config);

        tree.update(1, 100);
        tree.update(42, 50);

        let proof = tree.get_proof(1);
        assert!(tree.verify_proof(1, 100, &proof));

        // Wrong quantity should fail
        assert!(!tree.verify_proof(1, 99, &proof));
    }

    #[test]
    fn test_deterministic_root() {
        let config = setup();

        // Same items in same order
        let tree1 = SparseMerkleTree::<Fr>::from_items(
            &[(1, 100), (42, 50)],
            DEFAULT_DEPTH,
            config.clone(),
        );

        let tree2 = SparseMerkleTree::<Fr>::from_items(
            &[(1, 100), (42, 50)],
            DEFAULT_DEPTH,
            config,
        );

        assert_eq!(tree1.root(), tree2.root());
    }

    #[test]
    fn test_order_independence() {
        let config = setup();

        // Different order, same final state
        let tree1 = SparseMerkleTree::<Fr>::from_items(
            &[(1, 100), (42, 50)],
            DEFAULT_DEPTH,
            config.clone(),
        );

        let tree2 = SparseMerkleTree::<Fr>::from_items(
            &[(42, 50), (1, 100)],
            DEFAULT_DEPTH,
            config,
        );

        assert_eq!(tree1.root(), tree2.root());
    }
}
