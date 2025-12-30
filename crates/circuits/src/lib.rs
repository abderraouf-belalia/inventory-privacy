//! ZK circuits for private inventory operations.
//!
//! This crate provides circuits for:
//! - `ItemExistsCircuit`: Prove inventory contains >= N of item X
//! - `WithdrawCircuit`: Prove valid withdrawal with state transition
//! - `DepositCircuit`: Prove valid deposit with state transition
//! - `TransferCircuit`: Prove valid transfer between two inventories

pub mod capacity;
pub mod capacity_smt;
pub mod commitment;
pub mod deposit;
pub mod deposit_capacity;
pub mod inventory;
pub mod item_exists;
pub mod item_exists_smt;
pub mod signal;
pub mod smt;
pub mod smt_commitment;
pub mod state_transition;
pub mod transfer;
pub mod transfer_capacity;
pub mod volume_lookup;
pub mod withdraw;

#[cfg(test)]
mod tests;

pub use capacity::{compute_registry_hash, CapacityProofCircuit};
pub use commitment::{create_inventory_commitment, poseidon_config};
pub use deposit::DepositCircuit;
pub use deposit_capacity::DepositWithCapacityCircuit;
pub use inventory::{Inventory, MAX_ITEM_SLOTS};
pub use item_exists::ItemExistsCircuit;
pub use transfer::TransferCircuit;
pub use transfer_capacity::TransferWithCapacityCircuit;
pub use volume_lookup::{
    compute_used_volume, lookup_volume, VolumeRegistry, VolumeRegistryVar, MAX_ITEM_TYPES,
};
pub use withdraw::WithdrawCircuit;

// SMT v2 exports
pub use smt::{
    compute_root_from_path, verify_and_update, verify_membership, MerkleProof, MerkleProofVar,
    SparseMerkleTree, DEFAULT_DEPTH,
};

// Signal hash exports
pub use signal::{
    compute_signal_hash, compute_signal_hash_var, OpType, SignalInputs, SignalInputsVar,
};

// SMT commitment exports
pub use smt_commitment::{
    create_smt_commitment, create_smt_commitment_var, InventoryState, InventoryStateVar,
};

// New SMT-based circuit exports (v2)
pub use state_transition::StateTransitionCircuit;
pub use item_exists_smt::{compute_item_exists_hash, ItemExistsSMTCircuit};
pub use capacity_smt::{compute_capacity_hash, CapacitySMTCircuit};

use ark_bn254::Fr;

/// Common type aliases
pub type ConstraintF = Fr;
