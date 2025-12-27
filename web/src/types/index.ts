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

// Volume per unit for each item type (index 0 = empty slot = 0 volume)
// MUST match the VolumeRegistry deployed on-chain!
export const ITEM_VOLUMES: number[] = [
  0,  // 0: empty slot
  5,  // 1: Gold Ore
  3,  // 2: Iron Ingot
  8,  // 3: Diamond
  2,  // 4: Wood
  10, // 5: Stone
  4,  // 6: Coal
  15, // 7: Copper
  1,  // 8: Silver
  6,  // 9: Emerald
  7,  // 10: Ruby
  12, // 11: Sapphire
  9,  // 12: Steel
  20, // 13: Titanium
  11, // 14: Platinum
  25, // 15: Crystal
];

export const MAX_ITEM_TYPES = 16;

export interface CapacityInfo {
  usedVolume: number;
  maxCapacity: number;
  availableSpace: number;
}

export interface VolumeRegistry {
  volumes: number[];
  registryHash: string;
}

// Calculate used volume from inventory slots
export function calculateUsedVolume(slots: InventorySlot[]): number {
  return slots.reduce((total, slot) => {
    const volumePerUnit = ITEM_VOLUMES[slot.item_id] ?? 0;
    return total + (slot.quantity * volumePerUnit);
  }, 0);
}

// Check if deposit would exceed capacity
export function canDeposit(
  currentSlots: InventorySlot[],
  itemId: number,
  amount: number,
  maxCapacity: number
): boolean {
  if (maxCapacity === 0) return true; // No capacity limit
  const currentVolume = calculateUsedVolume(currentSlots);
  const additionalVolume = (ITEM_VOLUMES[itemId] ?? 0) * amount;
  return (currentVolume + additionalVolume) <= maxCapacity;
}

// Get volume registry as array for API calls
export function getVolumeRegistryArray(): number[] {
  const volumes = new Array(MAX_ITEM_TYPES).fill(0);
  for (let i = 0; i < ITEM_VOLUMES.length && i < MAX_ITEM_TYPES; i++) {
    volumes[i] = ITEM_VOLUMES[i];
  }
  return volumes;
}
