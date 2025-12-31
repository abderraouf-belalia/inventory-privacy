//! Range check gadgets for preventing field arithmetic wrap-around.
//!
//! In ZK circuits, all arithmetic happens in a finite field. Without range checks,
//! subtracting more than we have (e.g., 5 - 10) wraps around to a huge positive number.
//! These gadgets ensure values stay within expected bounds.
//!
//! We use 32-bit range checks which support values up to ~4.29 billion - sufficient for
//! game inventories where quantities rarely exceed millions. This saves ~130 constraints
//! per range check compared to 64-bit (32 fewer bit decomposition constraints).

use ark_ff::PrimeField;
use ark_r1cs_std::prelude::*;
use ark_r1cs_std::fields::fp::FpVar;
use ark_relations::r1cs::{ConstraintSystemRef, SynthesisError};

/// Number of bits for range checks (32-bit values)
/// Supports quantities up to 4,294,967,295 (~4.29 billion)
pub const RANGE_BITS: usize = 32;

/// Enforce that a field element fits in `num_bits` bits.
///
/// This decomposes the value into bits and verifies each bit is 0 or 1.
/// If the value is >= 2^num_bits, this constraint cannot be satisfied.
pub fn enforce_range<F: PrimeField>(
    _cs: ConstraintSystemRef<F>,
    value: &FpVar<F>,
    num_bits: usize,
) -> Result<(), SynthesisError> {
    // Get the actual value to decompose
    let value_bits = value.to_bits_le()?;

    // For a value to fit in num_bits, all higher bits must be zero
    // The to_bits_le() returns F::MODULUS_BIT_SIZE bits
    // We need to ensure bits beyond num_bits are all zero

    for (i, bit) in value_bits.iter().enumerate() {
        if i >= num_bits {
            // All bits beyond num_bits must be zero
            bit.enforce_equal(&Boolean::FALSE)?;
        }
    }

    Ok(())
}

/// Enforce that a value is non-negative and fits in 32 bits.
///
/// This prevents underflow attacks where (small - large) wraps to a huge number.
/// 32 bits supports values up to ~4.29 billion, sufficient for game inventories.
pub fn enforce_u32_range<F: PrimeField>(
    cs: ConstraintSystemRef<F>,
    value: &FpVar<F>,
) -> Result<(), SynthesisError> {
    enforce_range(cs, value, RANGE_BITS)
}

/// Alias for backward compatibility - now uses 32-bit range
#[inline]
pub fn enforce_u64_range<F: PrimeField>(
    cs: ConstraintSystemRef<F>,
    value: &FpVar<F>,
) -> Result<(), SynthesisError> {
    enforce_u32_range(cs, value)
}

/// Enforce that a >= b (non-negative difference).
///
/// This is done by checking that (a - b) fits in 32 bits.
/// If b > a, then (a - b) would wrap around to a huge number that doesn't fit.
pub fn enforce_geq<F: PrimeField>(
    cs: ConstraintSystemRef<F>,
    a: &FpVar<F>,
    b: &FpVar<F>,
) -> Result<(), SynthesisError> {
    let diff = a - b;
    enforce_u32_range(cs, &diff)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_bn254::Fr;
    use ark_relations::r1cs::ConstraintSystem;
    use std::ops::Neg;

    #[test]
    fn test_range_check_valid() {
        let cs = ConstraintSystem::<Fr>::new_ref();

        // A value that fits in 64 bits
        let value = FpVar::new_witness(cs.clone(), || Ok(Fr::from(1000u64))).unwrap();

        enforce_u64_range(cs.clone(), &value).unwrap();

        assert!(cs.is_satisfied().unwrap());
    }

    #[test]
    fn test_range_check_max_u32() {
        let cs = ConstraintSystem::<Fr>::new_ref();

        // Maximum u32 value
        let value = FpVar::new_witness(cs.clone(), || Ok(Fr::from(u32::MAX as u64))).unwrap();

        enforce_u32_range(cs.clone(), &value).unwrap();

        assert!(cs.is_satisfied().unwrap());
    }

    #[test]
    fn test_range_check_exceeds_u32() {
        let cs = ConstraintSystem::<Fr>::new_ref();

        // Value that exceeds 32 bits (2^32)
        let value = FpVar::new_witness(cs.clone(), || Ok(Fr::from(1u64 << 32))).unwrap();

        enforce_u32_range(cs.clone(), &value).unwrap();

        // Should fail because 2^32 doesn't fit in 32 bits
        assert!(!cs.is_satisfied().unwrap());
    }

    #[test]
    fn test_range_check_overflow() {
        let cs = ConstraintSystem::<Fr>::new_ref();

        // A value that exceeds 64 bits (simulating wrap-around)
        // This is p - 5 where p is the field modulus
        let wrapped_value = Fr::from(5u64).neg();  // -5 in the field = p - 5
        let value = FpVar::new_witness(cs.clone(), || Ok(wrapped_value)).unwrap();

        enforce_u64_range(cs.clone(), &value).unwrap();

        // This should fail because p - 5 doesn't fit in 64 bits
        assert!(!cs.is_satisfied().unwrap());
    }

    #[test]
    fn test_geq_valid() {
        let cs = ConstraintSystem::<Fr>::new_ref();

        let a = FpVar::new_witness(cs.clone(), || Ok(Fr::from(100u64))).unwrap();
        let b = FpVar::new_witness(cs.clone(), || Ok(Fr::from(50u64))).unwrap();

        enforce_geq(cs.clone(), &a, &b).unwrap();

        assert!(cs.is_satisfied().unwrap());
    }

    #[test]
    fn test_geq_equal() {
        let cs = ConstraintSystem::<Fr>::new_ref();

        let a = FpVar::new_witness(cs.clone(), || Ok(Fr::from(100u64))).unwrap();
        let b = FpVar::new_witness(cs.clone(), || Ok(Fr::from(100u64))).unwrap();

        enforce_geq(cs.clone(), &a, &b).unwrap();

        assert!(cs.is_satisfied().unwrap());
    }

    #[test]
    fn test_geq_invalid() {
        let cs = ConstraintSystem::<Fr>::new_ref();

        // a < b, so a - b wraps around
        let a = FpVar::new_witness(cs.clone(), || Ok(Fr::from(50u64))).unwrap();
        let b = FpVar::new_witness(cs.clone(), || Ok(Fr::from(100u64))).unwrap();

        enforce_geq(cs.clone(), &a, &b).unwrap();

        // This should fail because 50 - 100 wraps to a huge number
        assert!(!cs.is_satisfied().unwrap());
    }
}
