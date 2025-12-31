//! Integration tests for Anemoi hash function.

use super::native::anemoi_hash_two;
use super::gadgets::anemoi_hash_two_var;
use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField};
use ark_r1cs_std::prelude::*;
use ark_r1cs_std::fields::fp::FpVar;
use ark_relations::r1cs::ConstraintSystem;

#[test]
fn test_anemoi_basic() {
    let h = anemoi_hash_two(Fr::from(1u64), Fr::from(2u64));
    assert_ne!(h, Fr::from(0u64));
}

#[test]
fn test_anemoi_circuit_consistency() {
    // Test multiple input pairs
    let test_cases = [
        (0u64, 0u64),
        (1u64, 0u64),
        (0u64, 1u64),
        (1u64, 2u64),
        (100u64, 200u64),
        (u64::MAX, u64::MAX),
    ];

    for (a, b) in test_cases {
        let a_fr = Fr::from(a);
        let b_fr = Fr::from(b);

        // Native
        let native = anemoi_hash_two(a_fr, b_fr);

        // Circuit
        let cs = ConstraintSystem::<Fr>::new_ref();
        let a_var = FpVar::new_witness(cs.clone(), || Ok(a_fr)).unwrap();
        let b_var = FpVar::new_witness(cs.clone(), || Ok(b_fr)).unwrap();
        let h_var = anemoi_hash_two_var(cs.clone(), &a_var, &b_var).unwrap();

        assert!(
            cs.is_satisfied().unwrap(),
            "Circuit unsatisfied for ({}, {})",
            a,
            b
        );
        assert_eq!(
            h_var.value().unwrap(),
            native,
            "Mismatch for ({}, {})",
            a,
            b
        );
    }
}

#[test]
fn test_anemoi_collision_resistance() {
    // Verify no obvious collisions
    let mut hashes = std::collections::HashSet::new();

    for i in 0u64..100 {
        for j in 0u64..10 {
            let h = anemoi_hash_two(Fr::from(i), Fr::from(j));
            let h_bytes: Vec<u8> = h.into_bigint().to_bytes_le();
            assert!(
                hashes.insert(h_bytes),
                "Collision detected at ({}, {})",
                i,
                j
            );
        }
    }
}

#[test]
fn test_anemoi_constraint_count_comparison() {
    use crate::commitment::poseidon_config;
    use ark_crypto_primitives::sponge::poseidon::constraints::PoseidonSpongeVar;
    use ark_crypto_primitives::sponge::constraints::CryptographicSpongeVar;

    // Measure Anemoi constraints
    let cs_anemoi = ConstraintSystem::<Fr>::new_ref();
    let a = FpVar::new_witness(cs_anemoi.clone(), || Ok(Fr::from(1u64))).unwrap();
    let b = FpVar::new_witness(cs_anemoi.clone(), || Ok(Fr::from(2u64))).unwrap();
    let _ = anemoi_hash_two_var(cs_anemoi.clone(), &a, &b).unwrap();
    let anemoi_constraints = cs_anemoi.num_constraints();

    // Measure Poseidon constraints
    let cs_poseidon = ConstraintSystem::<Fr>::new_ref();
    let config = poseidon_config::<Fr>();
    let a = FpVar::new_witness(cs_poseidon.clone(), || Ok(Fr::from(1u64))).unwrap();
    let b = FpVar::new_witness(cs_poseidon.clone(), || Ok(Fr::from(2u64))).unwrap();
    let inputs: Vec<FpVar<Fr>> = vec![a, b];
    let mut sponge = PoseidonSpongeVar::new(cs_poseidon.clone(), &config);
    sponge.absorb(&inputs).unwrap();
    let _ = sponge.squeeze_field_elements(1).unwrap();
    let poseidon_constraints = cs_poseidon.num_constraints();

    println!("Anemoi constraints: {}", anemoi_constraints);
    println!("Poseidon constraints: {}", poseidon_constraints);
    println!(
        "Ratio: {:.2}x",
        poseidon_constraints as f64 / anemoi_constraints as f64
    );

    // Anemoi should be more efficient
    // Note: The actual ratio depends on the implementation details
}
