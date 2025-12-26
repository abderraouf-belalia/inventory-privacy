import { useCurrentAccount } from '@mysten/dapp-kit';
import { useOwnedInventories, type OnChainInventory } from '../sui/hooks';
import { useContractAddresses } from '../sui/ContractConfig';
import { ITEM_NAMES, type InventorySlot } from '../types';

interface LocalInventoryData {
  blinding: string;
  slots: InventorySlot[];
}

interface OnChainInventorySelectorProps {
  selectedInventory: OnChainInventory | null;
  onSelect: (inventory: OnChainInventory | null, localData: LocalInventoryData | null) => void;
  label?: string;
}

export function OnChainInventorySelector({
  selectedInventory,
  onSelect,
  label = 'Select Inventory',
}: OnChainInventorySelectorProps) {
  const account = useCurrentAccount();
  const { packageId } = useContractAddresses();
  const { data: inventories, isLoading } = useOwnedInventories(packageId);

  // Get local data for an inventory
  const getLocalData = (inventoryId: string): LocalInventoryData | null => {
    const stored = JSON.parse(localStorage.getItem('inventory-blindings') || '{}');
    return stored[inventoryId] || null;
  };

  const handleSelect = (inventoryId: string) => {
    if (!inventoryId) {
      onSelect(null, null);
      return;
    }
    const inventory = inventories?.find((inv) => inv.id === inventoryId) || null;
    const localData = inventory ? getLocalData(inventory.id) : null;
    onSelect(inventory, localData);
  };

  if (!account) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
        Connect your wallet to select an on-chain inventory.
      </div>
    );
  }

  if (!packageId.startsWith('0x')) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
        Configure contract addresses in the On-Chain page first.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
        Loading inventories...
      </div>
    );
  }

  if (!inventories || inventories.length === 0) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
        No on-chain inventories found. Create one in the On-Chain page first.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="label">{label}</label>
      <select
        value={selectedInventory?.id || ''}
        onChange={(e) => handleSelect(e.target.value)}
        className="input"
      >
        <option value="">-- Select an inventory --</option>
        {inventories.map((inv) => {
          const localData = getLocalData(inv.id);
          return (
            <option key={inv.id} value={inv.id}>
              {inv.id.slice(0, 8)}...{inv.id.slice(-6)}
              {localData ? ` (${localData.slots.length} items)` : ' (no local data)'}
            </option>
          );
        })}
      </select>

      {selectedInventory && (
        <SelectedInventoryDetails
          inventory={selectedInventory}
          localData={getLocalData(selectedInventory.id)}
        />
      )}
    </div>
  );
}

function SelectedInventoryDetails({
  inventory,
  localData,
}: {
  inventory: OnChainInventory;
  localData: LocalInventoryData | null;
}) {
  return (
    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">On-Chain ID</span>
        <code className="text-xs">{inventory.id.slice(0, 12)}...</code>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">Nonce</span>
        <span className="text-xs">{inventory.nonce}</span>
      </div>

      {localData ? (
        <>
          <div className="pt-2 border-t border-gray-200">
            <span className="text-xs text-gray-500">Contents (local)</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {localData.slots.map((slot, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-200 rounded text-xs"
                >
                  {ITEM_NAMES[slot.item_id] || `#${slot.item_id}`}: {slot.quantity}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-emerald-600">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            Blinding factor available
          </div>
        </>
      ) : (
        <div className="pt-2 border-t border-gray-200">
          <div className="flex items-center gap-1 text-xs text-amber-600">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            No local data - cannot generate proofs for this inventory
          </div>
        </div>
      )}
    </div>
  );
}

export type { LocalInventoryData };
