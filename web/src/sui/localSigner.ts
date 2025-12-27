import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

// Load private key from environment variable
const PRIVATE_KEY = import.meta.env.VITE_SUI_PRIVATE_KEY as string | undefined;

let localKeypair: Ed25519Keypair | null = null;

/**
 * Check if local signer is available (private key is set in env)
 */
export function hasLocalSigner(): boolean {
  return !!PRIVATE_KEY;
}

/**
 * Get the local keypair from environment variable
 */
export function getLocalKeypair(): Ed25519Keypair | null {
  if (!PRIVATE_KEY) {
    return null;
  }

  if (!localKeypair) {
    try {
      const { secretKey } = decodeSuiPrivateKey(PRIVATE_KEY);
      localKeypair = Ed25519Keypair.fromSecretKey(secretKey);
    } catch (e) {
      console.error('Failed to load local keypair:', e);
      return null;
    }
  }

  return localKeypair;
}

/**
 * Get the address of the local signer
 */
export function getLocalAddress(): string | null {
  const keypair = getLocalKeypair();
  return keypair ? keypair.getPublicKey().toSuiAddress() : null;
}

/**
 * Sign and execute a transaction using the local signer
 */
export async function signAndExecuteWithLocalSigner(
  tx: Transaction,
  client: SuiClient
): Promise<{ digest: string; effects: unknown }> {
  const keypair = getLocalKeypair();
  if (!keypair) {
    throw new Error('Local signer not available');
  }

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  return result;
}

/**
 * Create a SuiClient for localnet
 */
export function getLocalnetClient(): SuiClient {
  return new SuiClient({ url: getFullnodeUrl('localnet') });
}
