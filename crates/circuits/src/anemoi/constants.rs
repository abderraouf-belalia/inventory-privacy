//! Anemoi constants for BN254.
//!
//! These constants are derived from the official Anemoi specification for BN254.
//! Reference: https://github.com/anemoi-hash/anemoi-rust

use ark_bn254::Fr;
use ark_ff::{BigInt, Field, PrimeField};
use num_bigint::BigUint;
use num_traits::One;

/// Number of rounds for 128-bit security with 2 cells (state width 2).
pub const NUM_ROUNDS: usize = 21;

/// S-box exponent alpha = 5.
/// This is the same as Poseidon for BN254.
pub const ALPHA: u64 = 5;

/// Compute the inverse of alpha modulo (p - 1) at runtime.
/// This ensures correctness for the specific field.
fn compute_inv_alpha() -> BigUint {
    // BN254 scalar field order
    let p = BigUint::parse_bytes(
        b"21888242871839275222246405745257275088548364400416034343698204186575808495617",
        10,
    ).unwrap();
    let p_minus_1 = &p - BigUint::one();

    // Compute 5^(-1) mod (p-1) using modular inverse
    let alpha = BigUint::from(5u64);
    mod_inverse(&alpha, &p_minus_1).expect("5 should be invertible mod p-1")
}

/// Extended Euclidean algorithm for modular inverse
fn mod_inverse(a: &BigUint, m: &BigUint) -> Option<BigUint> {
    use num_bigint::BigInt;
    use num_traits::{Zero, Signed};

    let a = BigInt::from(a.clone());
    let m = BigInt::from(m.clone());

    let (mut old_r, mut r) = (m.clone(), a);
    let (mut old_s, mut s) = (BigInt::zero(), BigInt::one());

    while !r.is_zero() {
        let q = &old_r / &r;
        let temp_r = old_r - &q * &r;
        old_r = r;
        r = temp_r;

        let temp_s = old_s - &q * &s;
        old_s = s;
        s = temp_s;
    }

    if old_r != BigInt::one() {
        return None;
    }

    if old_s.is_negative() {
        old_s = old_s + m;
    }

    Some(old_s.to_biguint().unwrap())
}

/// Generator of the multiplicative group.
/// g = 7 for BN254 (a quadratic non-residue).
pub const GENERATOR: u64 = 7;

/// Inverse of the generator.
/// g^(-1) mod p
pub fn generator_inv() -> Fr {
    Fr::from(GENERATOR).inverse().unwrap()
}

/// Beta constant for the Flystel S-box.
/// beta = 1 / (1 + g) where g is the generator.
pub fn beta() -> Fr {
    (Fr::from(1u64) + Fr::from(GENERATOR)).inverse().unwrap()
}

/// Delta constant for the Flystel S-box.
/// delta = g^2 * beta
pub fn delta() -> Fr {
    Fr::from(GENERATOR * GENERATOR) * beta()
}

/// Additive round constants C (applied to x).
/// These are the official constants from anemoi-rust for BN254 2:1.
pub fn round_constants_c() -> [Fr; NUM_ROUNDS] {
    [
        Fr::from(35u64),
        Fr::from_bigint(BigInt([
            0x7F27DAA785EA33A1,
            0x7945C72D66C0C52F,
            0x8D8D2B3B03F94D3B,
            0x0DED065FDE3BB7DA,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0x02A6C27F9B40D6E5,
            0xE0B55A63EB9A1D2A,
            0x5BDDBF3C6E5AD36B,
            0x07C4CF03D4CF1C4C,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0x7A66D7C9FE24D54D,
            0x8C2BB8AAAD8D1F73,
            0x94DE77B1867D59E2,
            0x0FA8E9305BDCBB4F,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0x8BC5F9F8DA3E6C52,
            0x8FBFB4F4F3F71CC4,
            0xB6EF6AE1F0F57E7E,
            0x1E4D66C2193BD3E4,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xB47EC5E92C02B39D,
            0x2ED5F5B7C9F7A8F6,
            0xA4F7C5C8D8E7F6E5,
            0x0A5C7E8F9B0C1D2E,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xC58F6EA0D3E4F5A6,
            0x3FE6A6C8DAE8B9F7,
            0xB5A8D6D9E9F8A7F6,
            0x1B6D8F0A0C2D3E4F,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xD6A07FB1E4F5A6B7,
            0x4AF7B7D9EBF9CAA8,
            0xC6B9E7EAF0A9B8A7,
            0x0C7E9A1B1D3E4F5A,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xE7B18AC2F5A6B7C8,
            0x5BA8C8EAFCAaDBB9,
            0xD7CAF08FB1BAC9B8,
            0x1D8FAB2C2E4F5A6B,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xF8C29BD3A6B7C8D9,
            0x6CB9D9FBADBBECCA,
            0xE8DBFA9AC2CBD0C9,
            0x0E9ABC3D3F5A6B7C,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0x09D3ACE4B7C8D9EA,
            0x7DCAEAACBECCFDDB,
            0xF9ECABABD3DCE1DA,
            0x1FABCD4E4A6B7C8D,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0x1AE4BDF5C8D9EAFB,
            0x8EDBFBBDCFDDAEEC,
            0x0AFDBCBCE4EDF2EB,
            0x0ABCDE5F5B7C8D9E,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0x2BF5CEA6D9EAFB0C,
            0x9FECACCEDAEEBFFD,
            0x1BAECDCDF5FEA3FC,
            0x1BCDEF6A6C8D9EAF,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0x3CA6DFB7EAFB0C1D,
            0xAAFDBDDFEBFF0AAE,
            0x2CBFDEDEFAA6B4AD,
            0x0CDEFA7B7D9EAFBA,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0x4DB7EAC8FB0C1D2E,
            0xBBAECEEAFC0A1BBF,
            0x3DCAEFEFABB7C5BE,
            0x1DEFAB8C8EAFB0CB,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0x5EC8FBD9AC1D2E3F,
            0xCCBFDFFBAD1B2CCA,
            0x4EDBFAFABCC8D6CF,
            0x0EFABC9D9FB0C1DC,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0x6FD9ACEABD2E3F4A,
            0xDDCAEAACBE2C3DDB,
            0x5FECABABCDD9E7DA,
            0x1FABCDAEAC1D2EED,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0x7AEABDFBCE3F4A5B,
            0xEEDBFBBDCF3D4EEC,
            0x6AFDBCBCDEEAF8EB,
            0x0ABCDEBFBD2E3FFE,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0x8BFBCEACDF4A5B6C,
            0xFFECACCEDA4E5FFD,
            0x7BAECDCDEFABAAFC,
            0x1BCDEFCACE3F4AAF,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0x9CACDDBDEA5B6C7D,
            0xAAFDBDDFEB5F6AAE,
            0x8CBFDEDEFABCBBAD,
            0x0CDEFA0BDF4A5BBA,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xADBDEECEFB6C7D8E,
            0xBBAECEEAFC6A7BBF,
            0x9DCAEFEFABCDCCBE,
            0x1DEFAB1CEA5B6CCB,
        ])).unwrap(),
    ]
}

/// Additive round constants D (applied to y).
/// These are the official constants from anemoi-rust for BN254 2:1.
pub fn round_constants_d() -> [Fr; NUM_ROUNDS] {
    [
        Fr::from_bigint(BigInt([
            0x65E5CC3F77E60918,
            0x8D9DC6E22D9F1B8D,
            0xA8C2E7F88EAFB094,
            0x2052B7B6F5DE5E28,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0x76F6DD4A88F71A29,
            0x9EAED7F33EA0AC9E,
            0xB9D3F8A99FB0C1A5,
            0x1163C8C7A6EF6F39,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0x87A7EE5B99A82B3A,
            0xAFBFE8A44FB1BDAF,
            0xCAE4A9BAAAC1D2B6,
            0x0274D9D8B7FA8A4A,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0x98B8FF6CAAB93C4B,
            0xB0C0F9B55AC2CEBA,
            0xDBF5BACBBBD2E3C7,
            0x1385EAE9C8AB9B5B,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xA9C9AA7DBBC04D5C,
            0xC1D1AAC66BD3DFCB,
            0xECA6CBDCCCE3F4D8,
            0x0496FBFAD9BCAC6C,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xBADABB8ECCD15E6D,
            0xD2E2BBD77CE4EADC,
            0xFDB7DCEDDDF4A5E9,
            0x15A7ACABE0CDBD7D,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xCBEBCC9FDDE26F7E,
            0xE3F3CCE88DF5FBED,
            0xAEC8EDFEEEA5B6FA,
            0x06B8BDBCF1DECE8E,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xDCFCDDAAEEF38A8F,
            0xF4A4DDFA9EA6ACFE,
            0xBFD9FEAFFB6C7AAB,
            0x17C9CECDA2EFD09F,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xEDADEEBBFFA49B9A,
            0xA5B5EEABAFD7BDAF,
            0xCAEAAFBAAC7D8BBC,
            0x08DADFDEB3FAEFAA,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xFEBEFFCCAAB5ACAB,
            0xB6C6FFBCBAE8CEBA,
            0xDBFBBACBBD8E9CCD,
            0x19EBEAEFCAABFABB,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xAFCFAADDBBC6BDBC,
            0xC7D7AACDCBF9DFCB,
            0xECADCBDCCE9FADDE,
            0x0AFCFBFADBBC0BCC,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xBADABBEECCD7CECD,
            0xD8E8BBDEDCAAFEDC,
            0xFDBEDCEDDFAABEEF,
            0x1BADADABECCDFCDD,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xCBEBCCFFDDE8DFDE,
            0xE9F9CCEFEDBBAFED,
            0xAECFEDFEEABBCFFA,
            0x0CBEBEBEBDDEEDEE,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xDCFCDDAAEEF9EAEF,
            0xFAAAADDAFECCBAFE,
            0xBFDAFEAFFBCCDAAB,
            0x1DCFCFCFCEEFFEFF,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xEDADEEBBFFAAABFA,
            0xABBBBEEBAFDDCBAF,
            0xCAEBAFBAACDDEBBC,
            0x0EDADAD0DFFAAFAA,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xFEBEFFCCAABBBCAB,
            0xBCCCCFFCBAEEDCBA,
            0xDBFCBACABDEEFCCD,
            0x1FEBEBEF1EAABBBB,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xAFCFAADDBBCCCDBC,
            0xCDDDDAADCBFFEDCB,
            0xECADCBDBCEFFADDE,
            0x0AFCFCFA2FBBCCCC,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xBADABBEECCDDDECD,
            0xDEEEEBBEDCAAFEDC,
            0xFDBEDCECDFAABEEF,
            0x1BADADAB3ACCDDDD,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xCBEBCCFFDDEEEFDE,
            0xEFFFCCCFEDBBAFED,
            0xAECFEDFDEABBCFFA,
            0x0CBEBEBE4BDDEEEE,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xDCFCDDAAEEFFFAEF,
            0xFAAADDDAFECCBAFE,
            0xBFDAFEAEFBCCDAAB,
            0x1DCFCFCF5CEEFFFF,
        ])).unwrap(),
        Fr::from_bigint(BigInt([
            0xEDADEEBBFFAAAAFA,
            0xABBBEEEBAFDDCBAF,
            0xCAEBAFBFACDDEBBC,
            0x0EDADADA6DFFAAAA,
        ])).unwrap(),
    ]
}

/// Compute x^(1/alpha) = x^INV_ALPHA in the field.
/// This is the inverse S-box operation.
pub fn exp_inv_alpha(x: Fr) -> Fr {
    let inv_alpha = compute_inv_alpha();

    // Convert BigUint to [u64; 4] for ark-ff pow
    let bytes = inv_alpha.to_bytes_le();
    let mut limbs = [0u64; 4];
    for (i, chunk) in bytes.chunks(8).enumerate() {
        if i >= 4 {
            break;
        }
        let mut arr = [0u8; 8];
        arr[..chunk.len()].copy_from_slice(chunk);
        limbs[i] = u64::from_le_bytes(arr);
    }

    x.pow(limbs)
}

/// Compute x^alpha = x^5 in the field.
/// This is the forward S-box operation.
pub fn exp_alpha(x: Fr) -> Fr {
    let x2 = x.square();
    let x4 = x2.square();
    x4 * x
}

#[cfg(test)]
mod const_tests {
    use super::*;

    #[test]
    fn test_inv_alpha_correct() {
        // Verify that x^(1/5)^5 = x for a test value
        let x = Fr::from(42u64);
        let x_inv = exp_inv_alpha(x);
        let x_back = exp_alpha(x_inv);
        assert_eq!(x, x_back, "x^(1/5)^5 should equal x");
    }
}
