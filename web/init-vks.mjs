// Script to initialize verifying keys on-chain
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Get active address private key from sui keystore
function getKeypair() {
  // Get active address
  const activeAddress = execSync('sui client active-address', { encoding: 'utf8' }).trim();
  console.log('Active address:', activeAddress);

  // Get keystore path
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  const keystorePath = path.join(homeDir, '.sui', 'sui_config', 'sui.keystore');

  const keystore = JSON.parse(fs.readFileSync(keystorePath, 'utf8'));

  // The first key should be the active one
  for (const key of keystore) {
    const keypair = Ed25519Keypair.fromSecretKey(fromBase64(key).slice(1));
    if (keypair.toSuiAddress() === activeAddress) {
      return keypair;
    }
  }
  throw new Error('Could not find keypair for active address');
}

async function main() {
  const packageId = process.argv[2];
  if (!packageId) {
    console.error('Usage: node init-vks.mjs <PACKAGE_ID>');
    process.exit(1);
  }

  // Load VKs
  const vksPath = path.join(__dirname, '..', 'keys', 'verifying_keys.json');
  const vks = JSON.parse(fs.readFileSync(vksPath, 'utf8'));

  // Convert hex to Uint8Array
  const hexToBytes = (hex) => {
    const h = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(h.length / 2);
    for (let i = 0; i < h.length; i += 2) {
      bytes[i / 2] = parseInt(h.slice(i, i + 2), 16);
    }
    return bytes;
  };

  const client = new SuiClient({ url: 'http://127.0.0.1:9000' });
  const keypair = getKeypair();

  console.log('Initializing verifying keys...');
  console.log('Package ID:', packageId);

  const tx = new Transaction();

  // Call init_verifying_keys
  const [vksObj] = tx.moveCall({
    target: `${packageId}::inventory::init_verifying_keys`,
    arguments: [
      tx.pure.vector('u8', Array.from(hexToBytes(vks.item_exists_vk))),
      tx.pure.vector('u8', Array.from(hexToBytes(vks.withdraw_vk))),
      tx.pure.vector('u8', Array.from(hexToBytes(vks.deposit_vk))),
      tx.pure.vector('u8', Array.from(hexToBytes(vks.transfer_vk))),
    ],
  });

  // Share the VKs object
  tx.moveCall({
    target: '0x2::transfer::public_share_object',
    typeArguments: [`${packageId}::inventory::VerifyingKeys`],
    arguments: [vksObj],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  console.log('Transaction digest:', result.digest);

  // Find the VKs object
  const vksObject = result.objectChanges?.find(
    (change) => change.type === 'created' && change.objectType?.includes('VerifyingKeys')
  );

  if (vksObject && 'objectId' in vksObject) {
    console.log('VerifyingKeys Object ID:', vksObject.objectId);
    console.log('\nCopy this ID to the web UI configuration!');
  } else {
    console.log('Object changes:', JSON.stringify(result.objectChanges, null, 2));
  }
}

main().catch(console.error);
