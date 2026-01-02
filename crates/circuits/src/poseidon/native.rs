//! Native Poseidon hash functions (outside circuits).

use ark_bn254::Fr;
use ark_crypto_primitives::sponge::poseidon::PoseidonSponge;
use ark_crypto_primitives::sponge::CryptographicSponge;

use super::config::poseidon_config;

/// Hash a single field element.
pub fn poseidon_hash(input: Fr) -> Fr {
    let config = poseidon_config();
    let mut sponge = PoseidonSponge::new(&config);
    sponge.absorb(&input);
    sponge.squeeze_field_elements(1)[0]
}

/// Hash two field elements.
pub fn poseidon_hash_two(a: Fr, b: Fr) -> Fr {
    let config = poseidon_config();
    let mut sponge = PoseidonSponge::new(&config);
    sponge.absorb(&a);
    sponge.absorb(&b);
    sponge.squeeze_field_elements(1)[0]
}

/// Hash multiple field elements.
pub fn poseidon_hash_many(inputs: &[Fr]) -> Fr {
    let config = poseidon_config();
    let mut sponge = PoseidonSponge::new(&config);
    for input in inputs {
        sponge.absorb(input);
    }
    sponge.squeeze_field_elements(1)[0]
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_ff::One;

    #[test]
    fn test_hash_deterministic() {
        let a = Fr::from(42u64);
        let b = Fr::from(123u64);

        let h1 = poseidon_hash_two(a, b);
        let h2 = poseidon_hash_two(a, b);
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_hash_different_inputs() {
        let h1 = poseidon_hash_two(Fr::from(1u64), Fr::from(2u64));
        let h2 = poseidon_hash_two(Fr::from(1u64), Fr::from(3u64));
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_hash_single() {
        let h = poseidon_hash(Fr::one());
        assert_ne!(h, Fr::one());
    }

    #[test]
    fn test_hash_many() {
        let inputs = vec![Fr::from(1u64), Fr::from(2u64), Fr::from(3u64)];
        let h = poseidon_hash_many(&inputs);
        assert_ne!(h, Fr::from(0u64));
    }
}
