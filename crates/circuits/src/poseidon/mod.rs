//! Poseidon hash function for BN254.
//!
//! This module provides Poseidon hash functions optimized for ZK circuits.
//! We use arkworks' built-in Poseidon sponge with standard parameters.

mod config;
mod native;
mod gadgets;

#[cfg(test)]
mod tests;

pub use native::{poseidon_hash, poseidon_hash_two, poseidon_hash_many};
pub use gadgets::{poseidon_hash_var, poseidon_hash_two_var, poseidon_hash_many_var};
pub use config::poseidon_config;
