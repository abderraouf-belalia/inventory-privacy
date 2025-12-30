//! Export verifying keys for Sui deployment.
//!
//! This tool generates or loads verifying keys and exports them as hex strings
//! suitable for use in Sui Move contracts.

use std::path::Path;

use inventory_prover::setup::{setup_all_circuits, CircuitKeys};

fn main() {
    let keys_dir = Path::new("keys");

    println!("Loading or generating circuit keys...");

    let keys = if keys_dir.exists() {
        println!("Loading existing keys from {:?}", keys_dir);
        CircuitKeys::load_from_directory(keys_dir).expect("Failed to load keys")
    } else {
        println!("Running trusted setup (this may take a while)...");
        let keys = setup_all_circuits().expect("Failed to setup circuits");
        keys.save_to_directory(keys_dir)
            .expect("Failed to save keys");
        println!("Keys saved to {:?}", keys_dir);
        keys
    };

    println!("\n=== Verifying Keys for Sui Deployment ===\n");

    let state_transition_vk = keys.state_transition.serialize_vk().unwrap();
    let item_exists_vk = keys.item_exists.serialize_vk().unwrap();
    let capacity_vk = keys.capacity.serialize_vk().unwrap();

    println!("StateTransition VK ({} bytes):", state_transition_vk.len());
    println!("0x{}\n", hex::encode(&state_transition_vk));

    println!("ItemExists VK ({} bytes):", item_exists_vk.len());
    println!("0x{}\n", hex::encode(&item_exists_vk));

    println!("Capacity VK ({} bytes):", capacity_vk.len());
    println!("0x{}\n", hex::encode(&capacity_vk));

    // Also export as JSON for scripting
    let json = serde_json::json!({
        "state_transition_vk": format!("0x{}", hex::encode(&state_transition_vk)),
        "item_exists_vk": format!("0x{}", hex::encode(&item_exists_vk)),
        "capacity_vk": format!("0x{}", hex::encode(&capacity_vk)),
    });

    let json_path = keys_dir.join("verifying_keys.json");
    std::fs::write(&json_path, serde_json::to_string_pretty(&json).unwrap())
        .expect("Failed to write JSON");
    println!("JSON exported to {:?}", json_path);

    // Export as Move vector literals for easy copy-paste
    println!("\n=== Move Vector Literals ===\n");
    println!("// Copy these into your deployment script");
    println!(
        "let state_transition_vk = {};",
        format_as_move_vector(&state_transition_vk)
    );
    println!(
        "let item_exists_vk = {};",
        format_as_move_vector(&item_exists_vk)
    );
    println!(
        "let capacity_vk = {};",
        format_as_move_vector(&capacity_vk)
    );
}

fn format_as_move_vector(bytes: &[u8]) -> String {
    let hex_bytes: Vec<String> = bytes.iter().map(|b| format!("0x{:02x}", b)).collect();
    format!("vector[{}]", hex_bytes.join(", "))
}
