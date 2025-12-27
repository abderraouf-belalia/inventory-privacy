import { useCurrentAccount } from '@mysten/dapp-kit';
import { useOwnedInventories, type OnChainInventory } from '../sui/hooks';
import { useContractAddresses } from '../sui/ContractConfig';
import { ITEM_NAMES, type InventorySlot } from '../types';
import { hasLocalSigner, getLocalAddress } from '../sui/localSigner';

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

  const useLocalSigner = hasLocalSigner();
  const localAddress = useLocalSigner ? getLocalAddress() : null;
  const hasAddress = localAddress || account?.address;

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

  if (!hasAddress) {
    return (
      <div className="alert alert-warning">
        [!!] Connect wallet or set VITE_SUI_PRIVATE_KEY to select an on-chain inventory.
      </div>
    );
  }

  if (!packageId.startsWith('0x')) {
    return (
      <div className="alert alert-warning">
        [!!] Configure contract addresses in the On-Chain page first.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-muted">
        <span className="loading">Loading inventories</span>
      </div>
    );
  }

  if (!inventories || inventories.length === 0) {
    return (
      <div className="alert alert-warning">
        [!!] No on-chain inventories found. Create one in the On-Chain page first.
      </div>
    );
  }

  return (
    <div className="col">
      <div className="input-group">
        <label className="input-label">{label}</label>
        <select
          value={selectedInventory?.id || ''}
          onChange={(e) => handleSelect(e.target.value)}
          className="select"
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
      </div>

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
    <div className="card-simple">
      <table className="data-table text-small">
        <tbody>
          <tr>
            <td className="table-key">ID</td>
            <td className="table-value"><code>{inventory.id.slice(0, 12)}...</code></td>
          </tr>
          <tr>
            <td className="table-key">Nonce</td>
            <td className="table-value">{inventory.nonce}</td>
          </tr>
        </tbody>
      </table>

      {localData ? (
        <div className="mt-1" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
          <div className="text-small text-muted mb-1">CONTENTS (LOCAL)</div>
          <div className="row">
            {localData.slots.map((slot, i) => (
              <span key={i} className="badge">
                {ITEM_NAMES[slot.item_id] || `#${slot.item_id}`}: {slot.quantity}
              </span>
            ))}
          </div>
          <div className="text-small text-success mt-1">
            [OK] Blinding factor available
          </div>
        </div>
      ) : (
        <div className="mt-1" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
          <div className="text-small text-warning">
            [!!] No local data - cannot generate proofs for this inventory
          </div>
        </div>
      )}
    </div>
  );
}

export type { LocalInventoryData };
