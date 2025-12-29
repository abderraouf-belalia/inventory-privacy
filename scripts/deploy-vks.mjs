import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64 } from '@mysten/sui/utils';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Get package ID from CLI argument
const PACKAGE_ID = process.argv[2];
if (!PACKAGE_ID || !PACKAGE_ID.startsWith('0x')) {
  console.error('Usage: node deploy-vks.mjs <PACKAGE_ID>');
  console.error('Example: node deploy-vks.mjs 0x1234...');
  process.exit(1);
}

// Load verifying keys from JSON
const keysPath = path.join(__dirname, '..', 'keys', 'verifying_keys.json');
const vks = JSON.parse(fs.readFileSync(keysPath, 'utf-8'));

function hexToBytes(hex) {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = [];
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes.push(parseInt(cleanHex.substr(i, 2), 16));
  }
  return bytes;
}

async function main() {
  // Connect to localnet
  const client = new SuiClient({ url: getFullnodeUrl('localnet') });

  // Get the active address from sui cli
  const activeAddress = execSync('sui client active-address').toString().trim();
  console.log('Active address:', activeAddress);

  // Export the private key using sui keytool
  // We need to use the keystore directly
  let homeDir;
  if (process.platform === 'win32') {
    homeDir = process.env.USERPROFILE;
  } else {
    homeDir = process.env.HOME;
  }

  const keystorePath = path.join(homeDir, '.sui', 'sui_config', 'sui.keystore');
  const clientPath = path.join(homeDir, '.sui', 'sui_config', 'client.yaml');

  // Read keystore
  const keystore = JSON.parse(fs.readFileSync(keystorePath, 'utf-8'));

  // Find the key for active address
  // The keystore contains base64 encoded keys, first byte is scheme
  let keypair;
  for (const keyBase64 of keystore) {
    const keyBytes = fromBase64(keyBase64);
    // First byte is scheme (0 = ed25519)
    if (keyBytes[0] === 0) {
      const privateKey = keyBytes.slice(1);
      const kp = Ed25519Keypair.fromSecretKey(privateKey);
      if (kp.getPublicKey().toSuiAddress() === activeAddress) {
        keypair = kp;
        break;
      }
    }
  }

  if (!keypair) {
    console.error('Could not find keypair for active address');
    process.exit(1);
  }

  console.log('Found keypair for address:', keypair.getPublicKey().toSuiAddress());

  // Volume registry data
  const volumes = [0, 5, 3, 8, 2, 10, 4, 15, 1, 6, 7, 12, 9, 20, 11, 25];
  const registryHash = '0xb08a402d53183775208f9f8772791a51f6af5f7b648203b9bef158feb89b1815';

  // Deploy VolumeRegistry first
  console.log('\n=== Deploying Volume Registry ===');
  const volTx = new Transaction();

  volTx.moveCall({
    target: `${PACKAGE_ID}::volume_registry::create_and_share`,
    arguments: [
      volTx.pure.vector('u64', volumes),
      volTx.pure.vector('u8', hexToBytes(registryHash)),
    ],
  });

  volTx.setGasBudget(100000000);

  const volResult = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: volTx,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  console.log('Transaction digest:', volResult.digest);
  console.log('Status:', volResult.effects?.status?.status);

  let volumeRegistryId = null;
  if (volResult.objectChanges) {
    console.log('Created objects:');
    for (const change of volResult.objectChanges) {
      if (change.type === 'created') {
        console.log(`  ${change.objectType}: ${change.objectId}`);
        if (change.objectType.includes('VolumeRegistry')) {
          volumeRegistryId = change.objectId;
        }
      }
    }
  }

  // Build transaction for verifying keys
  console.log('\n=== Deploying Verifying Keys ===');
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::inventory::init_verifying_keys_and_share`,
    arguments: [
      tx.pure.vector('u8', hexToBytes(vks.item_exists_vk)),
      tx.pure.vector('u8', hexToBytes(vks.withdraw_vk)),
      tx.pure.vector('u8', hexToBytes(vks.deposit_vk)),
      tx.pure.vector('u8', hexToBytes(vks.transfer_vk)),
      tx.pure.vector('u8', hexToBytes(vks.capacity_vk)),
      tx.pure.vector('u8', hexToBytes(vks.deposit_capacity_vk)),
      tx.pure.vector('u8', hexToBytes(vks.transfer_capacity_vk)),
    ],
  });

  tx.setGasBudget(200000000);

  console.log('Signing and executing transaction...');

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  console.log('\nTransaction digest:', result.digest);
  console.log('Status:', result.effects?.status?.status);

  let verifyingKeysId = null;
  if (result.objectChanges) {
    console.log('\nCreated objects:');
    for (const change of result.objectChanges) {
      if (change.type === 'created') {
        console.log(`  ${change.objectType}: ${change.objectId}`);
        if (change.objectType.includes('VerifyingKeys')) {
          verifyingKeysId = change.objectId;
        }
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log('Package ID:', PACKAGE_ID);
  console.log('Volume Registry ID:', volumeRegistryId);
  console.log('Verifying Keys ID:', verifyingKeysId);
}

main().catch(console.error);
