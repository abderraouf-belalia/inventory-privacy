//! ZK circuits for private inventory operations.
//!
//! This crate provides circuits for:
//! - `ItemExistsCircuit`: Prove inventory contains >= N of item X
//! - `WithdrawCircuit`: Prove valid withdrawal with state transition
//! - `DepositCircuit`: Prove valid deposit with state transition
//! - `TransferCircuit`: Prove valid transfer between two inventories

pub mod capacity;
pub mod commitment;
pub mod deposit;
pub mod deposit_capacity;
pub mod inventory;
pub mod item_exists;
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

use ark_bn254::Fr;

/// Common type aliases
pub type ConstraintF = Fr;
