//! Poseidon R1CS gadgets for in-circuit hashing.

use ark_bn254::Fr;
use ark_r1cs_std::fields::fp::FpVar;
use ark_relations::r1cs::{ConstraintSystemRef, SynthesisError};
use ark_crypto_primitives::sponge::poseidon::constraints::PoseidonSpongeVar;
use ark_crypto_primitives::sponge::constraints::CryptographicSpongeVar;

use super::config::poseidon_config;

/// Hash a single field element in-circuit.
pub fn poseidon_hash_var(
    cs: ConstraintSystemRef<Fr>,
    input: &FpVar<Fr>,
) -> Result<FpVar<Fr>, SynthesisError> {
    let config = poseidon_config();
    let mut sponge = PoseidonSpongeVar::new(cs, &config);
    sponge.absorb(input)?;
    let result = sponge.squeeze_field_elements(1)?;
    Ok(result[0].clone())
}

/// Hash two field elements in-circuit.
pub fn poseidon_hash_two_var(
    cs: ConstraintSystemRef<Fr>,
    a: &FpVar<Fr>,
    b: &FpVar<Fr>,
) -> Result<FpVar<Fr>, SynthesisError> {
    let config = poseidon_config();
    let mut sponge = PoseidonSpongeVar::new(cs, &config);
    sponge.absorb(a)?;
    sponge.absorb(b)?;
    let result = sponge.squeeze_field_elements(1)?;
    Ok(result[0].clone())
}

/// Hash multiple field elements in-circuit.
pub fn poseidon_hash_many_var(
    cs: ConstraintSystemRef<Fr>,
    inputs: &[FpVar<Fr>],
) -> Result<FpVar<Fr>, SynthesisError> {
    let config = poseidon_config();
    let mut sponge = PoseidonSpongeVar::new(cs, &config);
    for input in inputs {
        sponge.absorb(input)?;
    }
    let result = sponge.squeeze_field_elements(1)?;
    Ok(result[0].clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::native::{poseidon_hash_two, poseidon_hash_many};
    use ark_r1cs_std::alloc::AllocVar;
    use ark_r1cs_std::eq::EqGadget;
    use ark_relations::r1cs::ConstraintSystem;

    #[test]
    fn test_gadget_matches_native() {
        let cs = ConstraintSystem::<Fr>::new_ref();

        let a = Fr::from(42u64);
        let b = Fr::from(123u64);

        let a_var = FpVar::new_witness(cs.clone(), || Ok(a)).unwrap();
        let b_var = FpVar::new_witness(cs.clone(), || Ok(b)).unwrap();

        let result_var = poseidon_hash_two_var(cs.clone(), &a_var, &b_var).unwrap();
        let expected = poseidon_hash_two(a, b);

        let expected_var = FpVar::new_input(cs.clone(), || Ok(expected)).unwrap();
        result_var.enforce_equal(&expected_var).unwrap();

        assert!(cs.is_satisfied().unwrap());
    }

    #[test]
    fn test_gadget_many() {
        let cs = ConstraintSystem::<Fr>::new_ref();

        let inputs = vec![Fr::from(1u64), Fr::from(2u64), Fr::from(3u64)];
        let input_vars: Vec<FpVar<Fr>> = inputs
            .iter()
            .map(|x| FpVar::new_witness(cs.clone(), || Ok(*x)).unwrap())
            .collect();

        let result_var = poseidon_hash_many_var(cs.clone(), &input_vars).unwrap();
        let expected = poseidon_hash_many(&inputs);

        let expected_var = FpVar::new_input(cs.clone(), || Ok(expected)).unwrap();
        result_var.enforce_equal(&expected_var).unwrap();

        assert!(cs.is_satisfied().unwrap());
    }

    #[test]
    fn test_constraint_count() {
        let cs = ConstraintSystem::<Fr>::new_ref();

        let a_var = FpVar::new_witness(cs.clone(), || Ok(Fr::from(1u64))).unwrap();
        let b_var = FpVar::new_witness(cs.clone(), || Ok(Fr::from(2u64))).unwrap();

        let _ = poseidon_hash_two_var(cs.clone(), &a_var, &b_var).unwrap();

        let constraints = cs.num_constraints();
        println!("Poseidon hash_two constraints: {}", constraints);

        // Should be around 240-250 constraints
        assert!(constraints > 200 && constraints < 300);
    }
}
