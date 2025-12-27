import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64 } from '@mysten/sui/utils';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const PACKAGE_ID = '0xa24d2ddd5bd492d6e9348770e919fa636c8c2fd9b0186b306f53c76a28e61e7b';

const vks = JSON.parse(fs.readFileSync('../keys/verifying_keys.json', 'utf-8'));

function hexToBytes(hex) {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = [];
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes.push(parseInt(cleanHex.substr(i, 2), 16));
  }
  return bytes;
}

async function main() {
  const client = new SuiClient({ url: getFullnodeUrl('localnet') });
  const activeAddress = execSync('sui client active-address').toString().trim();
  console.log('Active address:', activeAddress);

  const homeDir = process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME;
  const keystorePath = path.join(homeDir, '.sui', 'sui_config', 'sui.keystore');
  const keystore = JSON.parse(fs.readFileSync(keystorePath, 'utf-8'));

  let keypair;
  for (const keyBase64 of keystore) {
    const keyBytes = fromBase64(keyBase64);
    if (keyBytes[0] === 0) {
      const kp = Ed25519Keypair.fromSecretKey(keyBytes.slice(1));
      if (kp.getPublicKey().toSuiAddress() === activeAddress) {
        keypair = kp;
        break;
      }
    }
  }

  console.log('\n=== Deploying Verifying Keys ===');
  const tx = new Transaction();

  tx.moveCall({
    target: PACKAGE_ID + '::inventory::init_verifying_keys_and_share',
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

  tx.setGasBudget(500000000);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });

  console.log('Transaction digest:', result.digest);
  console.log('Status:', result.effects?.status?.status);

  if (result.objectChanges) {
    for (const change of result.objectChanges) {
      if (change.type === 'created' && change.objectType.includes('VerifyingKeys')) {
        console.log('New Verifying Keys ID:', change.objectId);
      }
    }
  }
}

main().catch(console.error);
