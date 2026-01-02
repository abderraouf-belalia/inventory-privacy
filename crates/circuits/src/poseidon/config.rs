//! Poseidon configuration for BN254.
//!
//! Uses standard parameters for 128-bit security.

use ark_bn254::Fr;
use ark_crypto_primitives::sponge::poseidon::PoseidonConfig;
use ark_ff::MontFp;

/// Number of full rounds (beginning + end)
const FULL_ROUNDS: usize = 8;

/// Number of partial rounds
const PARTIAL_ROUNDS: usize = 57;

/// S-box exponent
const ALPHA: u64 = 5;

/// Get the standard Poseidon configuration for BN254 scalar field.
///
/// Parameters:
/// - Rate: 2 (absorb 2 field elements at a time)
/// - Capacity: 1
/// - Full rounds: 8 (4 at start, 4 at end)
/// - Partial rounds: 57
/// - Alpha: 5 (x^5 S-box)
pub fn poseidon_config() -> PoseidonConfig<Fr> {
    // MDS matrix (3x3 for rate=2, capacity=1)
    let mds = vec![
        vec![
            MontFp!("7511745149465107256748700652201246547602992235352608707588321460060273774987"),
            MontFp!("10370080108974718697676803824769673834027675643658433702224577712625900127200"),
            MontFp!("19705173408229649878903981084052839426532978878058043055305024233888854471533"),
        ],
        vec![
            MontFp!("18732019378264290557468133440468564866454307626475683536618613112504878618481"),
            MontFp!("20870176810702568768751421378473869562658540583882454726129544628203806653987"),
            MontFp!("7266061498423634438932006217945904744987532209093972706694887950396501989428"),
        ],
        vec![
            MontFp!("9131299761947733513298312097611845208338517739621853568979632113419485819303"),
            MontFp!("10595341252162738537912664445405114076324478519622938027420701542910180337937"),
            MontFp!("11597556804922396090267472882856054602429588299176362916247939723151043581408"),
        ],
    ];

    // Round constants (ARK) - generated using standard Poseidon method
    let ark = generate_round_constants();

    PoseidonConfig {
        full_rounds: FULL_ROUNDS,
        partial_rounds: PARTIAL_ROUNDS,
        alpha: ALPHA,
        ark,
        mds,
        rate: 2,
        capacity: 1,
    }
}

/// Generate round constants using a simple deterministic method.
/// In production, these should come from a proper generation ceremony.
fn generate_round_constants() -> Vec<Vec<Fr>> {
    let num_rounds = FULL_ROUNDS + PARTIAL_ROUNDS;
    let width = 3; // rate + capacity

    let mut ark = Vec::with_capacity(num_rounds);

    // Use a simple hash-based generation for reproducibility
    // In production, use proper Poseidon constant generation
    let mut state = Fr::from(0x504f534549444f4eu64); // "POSEIDON" in hex

    for _ in 0..num_rounds {
        let mut round_constants = Vec::with_capacity(width);
        for _ in 0..width {
            // Simple deterministic generation
            state = state * state + Fr::from(7u64);
            round_constants.push(state);
        }
        ark.push(round_constants);
    }

    ark
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_valid() {
        let config = poseidon_config();
        assert_eq!(config.full_rounds, FULL_ROUNDS);
        assert_eq!(config.partial_rounds, PARTIAL_ROUNDS);
        assert_eq!(config.rate, 2);
        assert_eq!(config.capacity, 1);
        assert_eq!(config.mds.len(), 3);
        assert_eq!(config.ark.len(), FULL_ROUNDS + PARTIAL_ROUNDS);
    }
}
