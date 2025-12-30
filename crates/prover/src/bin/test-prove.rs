//! Standalone test to verify proof generation with loaded keys

use std::time::Instant;

use ark_bn254::Fr;
use inventory_prover::{prove, setup::CircuitKeys, InventoryState};

fn main() {
    println!("Loading keys from disk...");
    let start = Instant::now();
    let keys = CircuitKeys::load_from_directory(std::path::Path::new("keys"))
        .expect("Failed to load keys");
    println!("Keys loaded in {:?}", start.elapsed());

    // Test prove_item_exists
    println!("\nTesting prove_item_exists...");
    let blinding = Fr::from(12345u64);
    let mut state = InventoryState::new(blinding);
    state.tree.update(42, 100);
    state.current_volume = 500;

    let start = Instant::now();
    println!("Starting proof generation...");
    let result = prove::prove_item_exists(&keys.item_exists.proving_key, &state, 42, 50);
    println!("Proof generation completed in {:?}", start.elapsed());

    match result {
        Ok(proof) => {
            println!("ItemExists proof generated successfully!");
            println!("Public inputs: {} element(s)", proof.public_inputs.len());
        }
        Err(e) => {
            eprintln!("ItemExists proof generation failed: {}", e);
            std::process::exit(1);
        }
    }

    // Test prove_capacity
    println!("\nTesting prove_capacity...");
    let start = Instant::now();
    let result = prove::prove_capacity(&keys.capacity.proving_key, &state, 1000);
    println!("Capacity proof completed in {:?}", start.elapsed());

    match result {
        Ok(proof) => {
            println!("Capacity proof generated successfully!");
            println!("Public inputs: {} element(s)", proof.public_inputs.len());
        }
        Err(e) => {
            eprintln!("Capacity proof generation failed: {}", e);
            std::process::exit(1);
        }
    }

    println!("\nAll SMT-based proofs generated successfully!");
}
