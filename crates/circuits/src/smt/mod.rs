//! Sparse Merkle Tree implementation for inventory privacy circuits.
//!
//! This module provides:
//! - Native SMT operations (insert, update, proof generation)
//! - In-circuit SMT verification gadgets
//! - Merkle proof structures

mod tree;
mod proof;
mod gadgets;

#[cfg(test)]
mod tests;

pub use tree::{SparseMerkleTree, DEFAULT_DEPTH};
pub use proof::MerkleProof;
pub use gadgets::{
    MerkleProofVar, verify_membership, verify_and_update, compute_root_from_path,
};
