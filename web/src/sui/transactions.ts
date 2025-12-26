import { Transaction } from '@mysten/sui/transactions';

// Re-export Transaction type for consistency
export { Transaction };
import { INVENTORY_MODULE } from './config';

/**
 * Build transaction to create a new private inventory
 */
export function buildCreateInventoryTx(
  packageId: string,
  commitment: Uint8Array,
  recipient?: string
): Transaction {
  const tx = new Transaction();

  // Create the inventory
  const [inventory] = tx.moveCall({
    target: `${packageId}::${INVENTORY_MODULE}::create`,
    arguments: [tx.pure.vector('u8', Array.from(commitment))],
  });

  // Transfer the created inventory to the sender (or specified recipient)
  if (recipient) {
    tx.transferObjects([inventory], tx.pure.address(recipient));
  } else {
    tx.transferObjects([inventory], tx.gas.address);
  }

  return tx;
}

/**
 * Build transaction to verify item exists (read-only, no state change)
 */
export function buildVerifyItemExistsTx(
  packageId: string,
  inventoryId: string,
  verifyingKeysId: string,
  proof: Uint8Array,
  itemId: number,
  minQuantity: bigint
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::${INVENTORY_MODULE}::verify_item_exists`,
    arguments: [
      tx.object(inventoryId),
      tx.object(verifyingKeysId),
      tx.pure.vector('u8', Array.from(proof)),
      tx.pure.u32(itemId),
      tx.pure.u64(minQuantity),
    ],
  });

  return tx;
}

/**
 * Build transaction to withdraw items
 */
export function buildWithdrawTx(
  packageId: string,
  inventoryId: string,
  verifyingKeysId: string,
  proof: Uint8Array,
  newCommitment: Uint8Array,
  itemId: number,
  amount: bigint
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::${INVENTORY_MODULE}::withdraw`,
    arguments: [
      tx.object(inventoryId),
      tx.object(verifyingKeysId),
      tx.pure.vector('u8', Array.from(proof)),
      tx.pure.vector('u8', Array.from(newCommitment)),
      tx.pure.u32(itemId),
      tx.pure.u64(amount),
    ],
  });

  return tx;
}

/**
 * Build transaction to deposit items
 */
export function buildDepositTx(
  packageId: string,
  inventoryId: string,
  verifyingKeysId: string,
  proof: Uint8Array,
  newCommitment: Uint8Array,
  itemId: number,
  amount: bigint
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::${INVENTORY_MODULE}::deposit`,
    arguments: [
      tx.object(inventoryId),
      tx.object(verifyingKeysId),
      tx.pure.vector('u8', Array.from(proof)),
      tx.pure.vector('u8', Array.from(newCommitment)),
      tx.pure.u32(itemId),
      tx.pure.u64(amount),
    ],
  });

  return tx;
}

/**
 * Build transaction to transfer items between inventories
 */
export function buildTransferTx(
  packageId: string,
  srcInventoryId: string,
  dstInventoryId: string,
  verifyingKeysId: string,
  proof: Uint8Array,
  srcNewCommitment: Uint8Array,
  dstNewCommitment: Uint8Array,
  itemId: number,
  amount: bigint
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::${INVENTORY_MODULE}::transfer`,
    arguments: [
      tx.object(srcInventoryId),
      tx.object(dstInventoryId),
      tx.object(verifyingKeysId),
      tx.pure.vector('u8', Array.from(proof)),
      tx.pure.vector('u8', Array.from(srcNewCommitment)),
      tx.pure.vector('u8', Array.from(dstNewCommitment)),
      tx.pure.u32(itemId),
      tx.pure.u64(amount),
    ],
  });

  return tx;
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
