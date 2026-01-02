//! Integration tests for Poseidon hash functions.

use super::*;
use ark_bn254::Fr;
use ark_ff::One;

#[test]
fn test_native_and_gadget_consistency() {
    use ark_r1cs_std::alloc::AllocVar;
    use ark_r1cs_std::eq::EqGadget;
    use ark_r1cs_std::fields::fp::FpVar;
    use ark_relations::r1cs::ConstraintSystem;

    let cs = ConstraintSystem::<Fr>::new_ref();

    // Test single hash
    let input = Fr::from(42u64);
    let native_result = poseidon_hash(input);

    let input_var = FpVar::new_witness(cs.clone(), || Ok(input)).unwrap();
    let gadget_result = poseidon_hash_var(cs.clone(), &input_var).unwrap();
    let expected_var = FpVar::new_input(cs.clone(), || Ok(native_result)).unwrap();
    gadget_result.enforce_equal(&expected_var).unwrap();

    assert!(cs.is_satisfied().unwrap());
}

#[test]
fn test_hash_two_consistency() {
    use ark_r1cs_std::alloc::AllocVar;
    use ark_r1cs_std::eq::EqGadget;
    use ark_r1cs_std::fields::fp::FpVar;
    use ark_relations::r1cs::ConstraintSystem;

    let cs = ConstraintSystem::<Fr>::new_ref();

    let a = Fr::from(123u64);
    let b = Fr::from(456u64);
    let native_result = poseidon_hash_two(a, b);

    let a_var = FpVar::new_witness(cs.clone(), || Ok(a)).unwrap();
    let b_var = FpVar::new_witness(cs.clone(), || Ok(b)).unwrap();
    let gadget_result = poseidon_hash_two_var(cs.clone(), &a_var, &b_var).unwrap();
    let expected_var = FpVar::new_input(cs.clone(), || Ok(native_result)).unwrap();
    gadget_result.enforce_equal(&expected_var).unwrap();

    assert!(cs.is_satisfied().unwrap());
}

#[test]
fn test_hash_many_consistency() {
    use ark_r1cs_std::alloc::AllocVar;
    use ark_r1cs_std::eq::EqGadget;
    use ark_r1cs_std::fields::fp::FpVar;
    use ark_relations::r1cs::ConstraintSystem;

    let cs = ConstraintSystem::<Fr>::new_ref();

    let inputs = vec![Fr::from(1u64), Fr::from(2u64), Fr::from(3u64), Fr::from(4u64)];
    let native_result = poseidon_hash_many(&inputs);

    let input_vars: Vec<FpVar<Fr>> = inputs
        .iter()
        .map(|x| FpVar::new_witness(cs.clone(), || Ok(*x)).unwrap())
        .collect();
    let gadget_result = poseidon_hash_many_var(cs.clone(), &input_vars).unwrap();
    let expected_var = FpVar::new_input(cs.clone(), || Ok(native_result)).unwrap();
    gadget_result.enforce_equal(&expected_var).unwrap();

    assert!(cs.is_satisfied().unwrap());
}

#[test]
fn test_hash_is_deterministic() {
    let a = Fr::from(999u64);
    let b = Fr::from(888u64);

    let h1 = poseidon_hash_two(a, b);
    let h2 = poseidon_hash_two(a, b);
    assert_eq!(h1, h2);
}

#[test]
fn test_different_inputs_different_outputs() {
    let h1 = poseidon_hash_two(Fr::from(1u64), Fr::from(2u64));
    let h2 = poseidon_hash_two(Fr::from(1u64), Fr::from(3u64));
    let h3 = poseidon_hash_two(Fr::from(2u64), Fr::from(2u64));

    assert_ne!(h1, h2);
    assert_ne!(h1, h3);
    assert_ne!(h2, h3);
}

#[test]
fn test_order_matters() {
    let a = Fr::from(10u64);
    let b = Fr::from(20u64);

    let h1 = poseidon_hash_two(a, b);
    let h2 = poseidon_hash_two(b, a);
    assert_ne!(h1, h2);
}

#[test]
fn test_hash_of_zero() {
    let h = poseidon_hash(Fr::from(0u64));
    assert_ne!(h, Fr::from(0u64));
}

#[test]
fn test_hash_of_one() {
    let h = poseidon_hash(Fr::one());
    assert_ne!(h, Fr::one());
    assert_ne!(h, Fr::from(0u64));
}
