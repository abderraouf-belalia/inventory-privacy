//! Poseidon hash configuration for ZK circuits.

use ark_crypto_primitives::sponge::poseidon::PoseidonConfig;
use ark_crypto_primitives::sponge::Absorb;
use ark_ff::PrimeField;

/// Generate Poseidon configuration for BN254.
/// Uses standard parameters suitable for ZK circuits.
pub fn poseidon_config<F: PrimeField + Absorb>() -> PoseidonConfig<F> {
    // Standard Poseidon parameters for BN254
    // Rate: 2, Capacity: 1, Full rounds: 8, Partial rounds: 57
    let full_rounds = 8;
    let partial_rounds = 57;
    let alpha = 5;
    let rate = 2;

    // Generate round constants and MDS matrix
    // In production, these should come from a trusted source
    let (ark, mds) = generate_poseidon_parameters::<F>(rate, full_rounds, partial_rounds);

    PoseidonConfig::new(
        full_rounds,
        partial_rounds,
        alpha,
        mds,
        ark,
        rate,
        1, // capacity
    )
}

/// Generate Poseidon parameters (simplified for PoC).
/// In production, use parameters from a trusted ceremony.
fn generate_poseidon_parameters<F: PrimeField>(
    rate: usize,
    full_rounds: usize,
    partial_rounds: usize,
) -> (Vec<Vec<F>>, Vec<Vec<F>>) {
    let width = rate + 1;
    let total_rounds = full_rounds + partial_rounds;

    // Generate deterministic round constants
    let mut ark = Vec::with_capacity(total_rounds);
    for round in 0..total_rounds {
        let mut round_constants = Vec::with_capacity(width);
        for i in 0..width {
            // Simple deterministic generation (NOT cryptographically secure)
            // In production, use proper parameter generation
            let seed = ((round * width + i + 1) as u64).wrapping_mul(0x9e3779b97f4a7c15);
            round_constants.push(F::from(seed));
        }
        ark.push(round_constants);
    }

    // Generate MDS matrix (circulant construction)
    let mut mds = Vec::with_capacity(width);
    for i in 0..width {
        let mut row = Vec::with_capacity(width);
        for j in 0..width {
            // Simple MDS construction
            let val = if i == j {
                F::from(2u64)
            } else {
                F::from(1u64)
            };
            row.push(val);
        }
        mds.push(row);
    }

    (ark, mds)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_bn254::Fr;

    #[test]
    fn test_poseidon_config_deterministic() {
        let config1 = poseidon_config::<Fr>();
        let config2 = poseidon_config::<Fr>();

        // Verify configs produce same round constants
        assert_eq!(config1.ark, config2.ark);
        assert_eq!(config1.mds, config2.mds);
    }
}
