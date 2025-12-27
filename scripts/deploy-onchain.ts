import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import * as fs from 'fs';
import * as path from 'path';

const PACKAGE_ID = '0x3ff8ca9c96fd875fcdd810da4642d2c8d033b274df1fa9a84ccfa7fea3c1f927';

// Load verifying keys from JSON
const keysPath = path.join(__dirname, '..', 'keys', 'verifying_keys.json');
const vks = JSON.parse(fs.readFileSync(keysPath, 'utf-8'));

// Volume registry data
const VOLUMES = [0, 5, 3, 1, 10, 8, 2, 4, 3, 1, 1, 1, 6, 5, 2, 1];
const REGISTRY_HASH = '0xe56eec604ad5592033b4138a4732ec87929bf11def8e957357922a02a2e1da22';

function hexToBytes(hex: string): number[] {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes: number[] = [];
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes.push(parseInt(cleanHex.substr(i, 2), 16));
  }
  return bytes;
}

async function main() {
  // Connect to localnet
  const client = new SuiClient({ url: getFullnodeUrl('localnet') });

  // Get the active address from sui cli
  const { execSync } = require('child_process');
  const activeAddress = execSync('sui client active-address').toString().trim();
  console.log('Active address:', activeAddress);

  // Get coins for gas
  const coins = await client.getCoins({ owner: activeAddress });
  console.log('Available coins:', coins.data.length);

  // Build transaction for verifying keys
  console.log('\n=== Deploying Verifying Keys ===');
  const tx1 = new Transaction();

  tx1.moveCall({
    target: `${PACKAGE_ID}::inventory::init_verifying_keys_and_share`,
    arguments: [
      tx1.pure.vector('u8', hexToBytes(vks.item_exists_vk)),
      tx1.pure.vector('u8', hexToBytes(vks.withdraw_vk)),
      tx1.pure.vector('u8', hexToBytes(vks.deposit_vk)),
      tx1.pure.vector('u8', hexToBytes(vks.transfer_vk)),
      tx1.pure.vector('u8', hexToBytes(vks.capacity_vk)),
      tx1.pure.vector('u8', hexToBytes(vks.deposit_capacity_vk)),
      tx1.pure.vector('u8', hexToBytes(vks.transfer_capacity_vk)),
    ],
  });

  console.log('Building transaction...');
  const txBytes1 = await tx1.build({ client });
  console.log('Transaction built, size:', txBytes1.length, 'bytes');

  // Sign using sui keytool
  const txBase64 = Buffer.from(txBytes1).toString('base64');
  console.log('Transaction base64 length:', txBase64.length);

  // For now, just output the transaction data
  console.log('\nTo execute, use: sui client execute-signed-tx');
  console.log('Or use a different signing method.');

  // Alternative: use sui client ptb with --json flag to load from file
  // Let's output the hex bytes for manual execution

  console.log('\n=== Verifying Keys (hex for manual deployment) ===');
  console.log('item_exists_vk length:', hexToBytes(vks.item_exists_vk).length);
  console.log('withdraw_vk length:', hexToBytes(vks.withdraw_vk).length);
  console.log('deposit_vk length:', hexToBytes(vks.deposit_vk).length);
  console.log('transfer_vk length:', hexToBytes(vks.transfer_vk).length);
  console.log('capacity_vk length:', hexToBytes(vks.capacity_vk).length);
  console.log('deposit_capacity_vk length:', hexToBytes(vks.deposit_capacity_vk).length);
  console.log('transfer_capacity_vk length:', hexToBytes(vks.transfer_capacity_vk).length);

  // Build transaction for volume registry
  console.log('\n=== Deploying Volume Registry ===');
  const tx2 = new Transaction();

  tx2.moveCall({
    target: `${PACKAGE_ID}::volume_registry::create_and_share`,
    arguments: [
      tx2.pure.vector('u64', VOLUMES),
      tx2.pure.vector('u8', hexToBytes(REGISTRY_HASH)),
    ],
  });

  const txBytes2 = await tx2.build({ client });
  console.log('Volume Registry transaction built, size:', txBytes2.length, 'bytes');
}

main().catch(console.error);
