//! Proof generation library for private inventories using SMT.
//!
//! This crate provides utilities for:
//! - Trusted setup (generating proving and verifying keys)
//! - Proof generation for SMT-based circuits
//! - Local proof verification (for testing)

pub mod prove;
pub mod setup;
pub mod verify;

pub use inventory_circuits::signal::OpType;
pub use prove::{
    prove_capacity, prove_item_exists, prove_state_transition, InventoryState, ProofWithInputs,
    StateTransitionResult,
};
pub use setup::{setup_all_circuits, CircuitKeys, CircuitKeyPair, SetupError};
pub use verify::{verify_capacity, verify_item_exists, verify_state_transition};

use ark_bn254::Fr;

/// Common field type for all operations
pub type ConstraintF = Fr;
