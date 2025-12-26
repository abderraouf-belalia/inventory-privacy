export interface InventorySlot {
  item_id: number;
  quantity: number;
}

export interface Inventory {
  slots: InventorySlot[];
  blinding: string;
  commitment: string | null;
}

export interface ProofResult {
  proof: string;
  public_inputs: string[];
}

export interface WithdrawResult extends ProofResult {
  new_commitment: string;
}

export interface DepositResult extends ProofResult {
  new_commitment: string;
}

export interface TransferResult extends ProofResult {
  src_new_commitment: string;
  dst_new_commitment: string;
}

export interface ApiError {
  error: string;
}

export const MAX_ITEM_SLOTS = 16;

export const ITEM_NAMES: Record<number, string> = {
  1: 'Gold Ore',
  2: 'Iron Ingot',
  3: 'Diamond',
  4: 'Wood',
  5: 'Stone',
  6: 'Coal',
  7: 'Copper',
  8: 'Silver',
  9: 'Emerald',
  10: 'Ruby',
  11: 'Sapphire',
  12: 'Steel',
  13: 'Titanium',
  14: 'Platinum',
  15: 'Crystal',
  16: 'Obsidian',
};

export const ITEM_COLORS: Record<number, string> = {
  1: 'bg-yellow-400',
  2: 'bg-gray-400',
  3: 'bg-cyan-300',
  4: 'bg-amber-600',
  5: 'bg-stone-400',
  6: 'bg-gray-800',
  7: 'bg-orange-400',
  8: 'bg-slate-300',
  9: 'bg-emerald-400',
  10: 'bg-red-400',
  11: 'bg-blue-400',
  12: 'bg-zinc-500',
  13: 'bg-slate-400',
  14: 'bg-amber-200',
  15: 'bg-purple-300',
  16: 'bg-violet-900',
};
