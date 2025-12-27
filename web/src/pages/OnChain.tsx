import { useState, useEffect } from 'react';
import {
  useCurrentAccount,
  useSignTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import { ContractConfigPanel, useContractAddresses } from '../sui/ContractConfig';
import { useOwnedInventories, type OnChainInventory } from '../sui/hooks';
import { buildCreateInventoryWithCapacityTx, hexToBytes } from '../sui/transactions';
import * as api from '../api/client';
import { ITEM_NAMES, ITEM_VOLUMES, calculateUsedVolume, type InventorySlot } from '../types';
import { CapacityBar } from '../components/CapacityBar';
import { hasLocalSigner, getLocalAddress, signAndExecuteWithLocalSigner, getLocalnetClient } from '../sui/localSigner';

export function OnChain() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { packageId, verifyingKeysId } = useContractAddresses();
  const { data: inventories, refetch } = useOwnedInventories(packageId);
  const { mutateAsync: signTransaction } = useSignTransaction();

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newInventory, setNewInventory] = useState<InventorySlot[]>([
    { item_id: 1, quantity: 100 },
  ]);
  const [maxCapacity, setMaxCapacity] = useState(1000);

  // Check if local signer is available
  const useLocalSigner = hasLocalSigner();
  const localAddress = useLocalSigner ? getLocalAddress() : null;
  const effectiveAddress = localAddress || account?.address;

  const isConfigured = packageId.startsWith('0x') && verifyingKeysId.startsWith('0x');

  const handleCreateOnChain = async () => {
    if (!effectiveAddress) {
      setError('Please connect your wallet or configure local signer');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      // Generate blinding and commitment via proof server
      const blinding = await api.generateBlinding();
      const commitment = await api.createCommitment(newInventory, blinding);

      // Convert commitment to bytes
      const commitmentBytes = hexToBytes(commitment);

      // Build transaction with capacity
      const tx = buildCreateInventoryWithCapacityTx(packageId, commitmentBytes, BigInt(maxCapacity), effectiveAddress);

      let result;

      if (useLocalSigner && localAddress) {
        // Use local signer - no wallet interaction needed!
        console.log('Using local signer for address:', localAddress);
        tx.setSender(localAddress);
        const localClient = getLocalnetClient();
        result = await signAndExecuteWithLocalSigner(tx, localClient);
      } else if (account) {
        // Use wallet for signing
        tx.setSender(account.address);
        const signedTx = await signTransaction({
          transaction: tx as unknown as Parameters<typeof signTransaction>[0]['transaction'],
        });
        result = await client.executeTransactionBlock({
          transactionBlock: signedTx.bytes,
          signature: signedTx.signature,
          options: { showObjectChanges: true },
        });
      } else {
        throw new Error('No signer available');
      }

      // Refetch inventories
      await refetch();

      // Store the blinding factor locally (in production, use secure storage)
      const stored = JSON.parse(localStorage.getItem('inventory-blindings') || '{}');
      // Find the created inventory ID from object changes
      const objectChanges = (result as { objectChanges?: Array<{ type: string; objectId?: string }> }).objectChanges;
      const createdObjects = objectChanges?.filter(
        (change) => change.type === 'created'
      ) || [];
      if (createdObjects.length > 0 && 'objectId' in createdObjects[0]) {
        const inventoryId = createdObjects[0].objectId;
        stored[inventoryId] = {
          blinding,
          slots: newInventory,
          maxCapacity,
        };
        localStorage.setItem('inventory-blindings', JSON.stringify(stored));
      }

      setNewInventory([{ item_id: 1, quantity: 100 }]);
      setMaxCapacity(1000);
    } catch (err) {
      console.error('Create inventory error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create inventory');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">On-Chain Inventories</h1>
        <p className="text-gray-600 mt-1">
          View and manage your on-chain private inventories on Sui.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Configuration & Create */}
        <div className="space-y-6">
          <ContractConfigPanel />

          {isConfigured && (effectiveAddress || account) && (
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">
                Create On-Chain Inventory
              </h2>

              <div className="space-y-4">
                {/* Capacity Configuration */}
                <div>
                  <label className="label">Max Capacity (0 = unlimited)</label>
                  <input
                    type="number"
                    value={maxCapacity}
                    onChange={(e) => setMaxCapacity(Number(e.target.value))}
                    min={0}
                    className="input"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Total volume limit for this inventory
                  </p>
                </div>

                <CapacityBar slots={newInventory} maxCapacity={maxCapacity} />

                <div>
                  <label className="label">Initial Items</label>
                  {newInventory.map((slot, i) => (
                    <div key={i} className="flex gap-2 mb-2 items-center">
                      <select
                        value={slot.item_id}
                        onChange={(e) => {
                          const updated = [...newInventory];
                          updated[i].item_id = Number(e.target.value);
                          setNewInventory(updated);
                        }}
                        className="input flex-1"
                      >
                        {Object.entries(ITEM_NAMES).map(([id, name]) => (
                          <option key={id} value={id}>
                            {name} (vol: {ITEM_VOLUMES[Number(id)] ?? 0})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={slot.quantity}
                        onChange={(e) => {
                          const updated = [...newInventory];
                          updated[i].quantity = Number(e.target.value);
                          setNewInventory(updated);
                        }}
                        className="input w-24"
                        min={1}
                      />
                      <span className="text-xs text-gray-500 w-16">
                        {(ITEM_VOLUMES[slot.item_id] ?? 0) * slot.quantity} vol
                      </span>
                      <button
                        onClick={() =>
                          setNewInventory(newInventory.filter((_, j) => j !== i))
                        }
                        className="text-red-600 hover:text-red-800 px-2"
                        disabled={newInventory.length === 1}
                      >
                        x
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      setNewInventory([
                        ...newInventory,
                        { item_id: 1, quantity: 100 },
                      ])
                    }
                    className="text-sm text-primary-600 hover:text-primary-800"
                    disabled={maxCapacity > 0 && calculateUsedVolume(newInventory) >= maxCapacity}
                  >
                    + Add Item
                  </button>
                </div>

                {maxCapacity > 0 && calculateUsedVolume(newInventory) > maxCapacity && (
                  <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    Total volume ({calculateUsedVolume(newInventory)}) exceeds capacity ({maxCapacity})!
                  </div>
                )}

                <button
                  onClick={handleCreateOnChain}
                  disabled={creating || newInventory.length === 0 || (maxCapacity > 0 && calculateUsedVolume(newInventory) > maxCapacity)}
                  className="btn-primary w-full"
                >
                  {creating ? 'Creating...' : 'Create Inventory on Sui'}
                </button>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Owned Inventories */}
        <div className="space-y-4">
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">
              Your On-Chain Inventories
            </h2>

            {useLocalSigner && localAddress && (
              <div className="mb-4 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
                🔑 Using local signer: {localAddress.slice(0, 8)}...{localAddress.slice(-6)}
              </div>
            )}

            {!effectiveAddress ? (
              <div className="text-center py-8 text-gray-500">
                <svg
                  className="w-12 h-12 mx-auto mb-3 text-gray-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                Connect your wallet or set VITE_SUI_PRIVATE_KEY in .env.local
              </div>
            ) : !isConfigured ? (
              <div className="text-center py-8 text-gray-500">
                Configure contract addresses to view inventories
              </div>
            ) : inventories?.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No inventories found. Create one to get started!
              </div>
            ) : (
              <div className="space-y-3">
                {inventories?.map((inv) => (
                  <InventoryItem key={inv.id} inventory={inv} />
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="card bg-gray-50">
            <h3 className="font-medium text-gray-900 mb-2">How It Works</h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-primary-600">1.</span>
                <span>
                  Generate commitment off-chain via proof server
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-600">2.</span>
                <span>
                  Create inventory on Sui with just the commitment
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-600">3.</span>
                <span>
                  Keep blinding factor secret (stored locally for demo)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-600">4.</span>
                <span>
                  Submit proofs for operations (verify, withdraw, deposit, transfer)
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function InventoryItem({ inventory }: { inventory: OnChainInventory }) {
  const [expanded, setExpanded] = useState(false);

  // Try to load local data for this inventory
  const stored = JSON.parse(localStorage.getItem('inventory-blindings') || '{}');
  const localData = stored[inventory.id];

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
            <svg
              className="w-4 h-4 text-primary-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
              />
            </svg>
          </div>
          <div>
            <div className="font-medium text-sm">
              {inventory.id.slice(0, 8)}...{inventory.id.slice(-6)}
            </div>
            <div className="text-xs text-gray-500">
              Nonce: {inventory.nonce} | Capacity: {inventory.maxCapacity || 'Unlimited'}
            </div>
          </div>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg
            className={`w-5 h-5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
          <div>
            <div className="text-xs text-gray-500 mb-1">Commitment (on-chain)</div>
            <code className="block text-xs bg-gray-100 rounded p-2 break-all">
              {inventory.commitment}
            </code>
          </div>

          {localData ? (
            <>
              <div>
                <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Blinding (local only)
                </div>
                <code className="block text-xs bg-red-50 rounded p-2 break-all text-red-700">
                  {localData.blinding}
                </code>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Contents (local only)</div>
                <div className="flex flex-wrap gap-2">
                  {localData.slots.map((slot: InventorySlot, i: number) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs"
                    >
                      {ITEM_NAMES[slot.item_id] || `#${slot.item_id}`}: {slot.quantity}
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="text-xs text-amber-600 bg-amber-50 rounded p-2">
              Local data not found. You may have created this inventory from another
              device or cleared browser storage.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
