import type {
  InventorySlot,
  ProofResult,
  WithdrawResult,
  DepositResult,
  TransferResult,
  ApiError,
} from '../types';

const API_BASE = '/api';

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error((data as ApiError).error || 'Request failed');
  }
  return data as T;
}

export async function generateBlinding(): Promise<string> {
  const response = await fetch(`${API_BASE}/blinding/generate`, {
    method: 'POST',
  });
  const data = await handleResponse<{ blinding: string }>(response);
  return data.blinding;
}

export async function createCommitment(
  inventory: InventorySlot[],
  blinding: string
): Promise<string> {
  const response = await fetch(`${API_BASE}/commitment/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inventory, blinding }),
  });
  const data = await handleResponse<{ commitment: string }>(response);
  return data.commitment;
}

export async function proveItemExists(
  inventory: InventorySlot[],
  blinding: string,
  item_id: number,
  min_quantity: number
): Promise<ProofResult> {
  const response = await fetch(`${API_BASE}/prove/item-exists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inventory, blinding, item_id, min_quantity }),
  });
  return handleResponse<ProofResult>(response);
}

export async function proveWithdraw(
  old_inventory: InventorySlot[],
  old_blinding: string,
  new_blinding: string,
  item_id: number,
  amount: number
): Promise<WithdrawResult> {
  const response = await fetch(`${API_BASE}/prove/withdraw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      old_inventory,
      old_blinding,
      new_blinding,
      item_id,
      amount,
    }),
  });
  return handleResponse<WithdrawResult>(response);
}

export async function proveDeposit(
  old_inventory: InventorySlot[],
  old_blinding: string,
  new_blinding: string,
  item_id: number,
  amount: number
): Promise<DepositResult> {
  const response = await fetch(`${API_BASE}/prove/deposit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      old_inventory,
      old_blinding,
      new_blinding,
      item_id,
      amount,
    }),
  });
  return handleResponse<DepositResult>(response);
}

export async function proveTransfer(
  src_old_inventory: InventorySlot[],
  src_old_blinding: string,
  src_new_blinding: string,
  dst_old_inventory: InventorySlot[],
  dst_old_blinding: string,
  dst_new_blinding: string,
  item_id: number,
  amount: number
): Promise<TransferResult> {
  const response = await fetch(`${API_BASE}/prove/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      src_old_inventory,
      src_old_blinding,
      src_new_blinding,
      dst_old_inventory,
      dst_old_blinding,
      dst_new_blinding,
      item_id,
      amount,
    }),
  });
  return handleResponse<TransferResult>(response);
}
