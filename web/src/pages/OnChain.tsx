import { useState } from 'react';
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
import { OnChainDataPanel } from '../components/OnChainDataPanel';
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
      const blinding = await api.generateBlinding();
      const currentVolume = calculateUsedVolume(newInventory);
      const commitmentResult = await api.createCommitment(newInventory, currentVolume, blinding);
      const commitmentBytes = hexToBytes(commitmentResult.commitment);
      const tx = buildCreateInventoryWithCapacityTx(packageId, commitmentBytes, BigInt(maxCapacity), effectiveAddress);

      let result;

      if (useLocalSigner && localAddress) {
        console.log('Using local signer for address:', localAddress);
        tx.setSender(localAddress);
        const localClient = getLocalnetClient();
        result = await signAndExecuteWithLocalSigner(tx, localClient);
      } else if (account) {
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

      await refetch();

      const stored = JSON.parse(localStorage.getItem('inventory-blindings') || '{}');
      const objectChanges = (result as { objectChanges?: Array<{ type: string; objectId?: string }> }).objectChanges;
      const createdObjects = objectChanges?.filter(
        (change) => change.type === 'created'
      ) || [];
      if (createdObjects.length > 0 && 'objectId' in createdObjects[0]) {
        const inventoryId = createdObjects[0].objectId as string | undefined;
        if (inventoryId) {
          stored[inventoryId] = {
            blinding,
            slots: newInventory,
            maxCapacity,
          };
          localStorage.setItem('inventory-blindings', JSON.stringify(stored));
        }
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
    <div className="col">
      <div className="mb-2">
        <h1>ON-CHAIN INVENTORIES</h1>
        <p className="text-muted">
          View and manage your on-chain private inventories on Sui.
        </p>
      </div>

      <div className="grid grid-2">
        {/* Left: Configuration & Create */}
        <div className="col">
          <ContractConfigPanel />

          {isConfigured && effectiveAddress && (
            <div className="card">
              <div className="card-header">
                <div className="card-header-left"></div>
                <span className="card-title">CREATE INVENTORY</span>
                <div className="card-header-right"></div>
              </div>
              <div className="card-body">
                <div className="input-group">
                  <label className="input-label">Max Capacity (0 = unlimited)</label>
                  <input
                    type="number"
                    value={maxCapacity}
                    onChange={(e) => setMaxCapacity(Number(e.target.value))}
                    min={0}
                    className="input"
                  />
                  <p className="text-small text-muted mt-1">Total volume limit for this inventory</p>
                </div>

                <CapacityBar slots={newInventory} maxCapacity={maxCapacity} />

                <div className="input-group mt-2">
                  <label className="input-label">Initial Items</label>
                  {newInventory.map((slot, i) => (
                    <div key={i} className="row mb-1">
                      <select
                        value={slot.item_id}
                        onChange={(e) => {
                          const updated = [...newInventory];
                          updated[i].item_id = Number(e.target.value);
                          setNewInventory(updated);
                        }}
                        className="select"
                        style={{ flex: 1 }}
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
                        className="input"
                        style={{ width: '8ch' }}
                        min={1}
                      />
                      <span className="badge">{(ITEM_VOLUMES[slot.item_id] ?? 0) * slot.quantity} vol</span>
                      <button
                        onClick={() => setNewInventory(newInventory.filter((_, j) => j !== i))}
                        className="btn btn-danger btn-small"
                        disabled={newInventory.length === 1}
                      >
                        [X]
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setNewInventory([...newInventory, { item_id: 1, quantity: 100 }])}
                    className="btn btn-secondary btn-small"
                    disabled={maxCapacity > 0 && calculateUsedVolume(newInventory) >= maxCapacity}
                  >
                    [+] ADD ITEM
                  </button>
                </div>

                {maxCapacity > 0 && calculateUsedVolume(newInventory) > maxCapacity && (
                  <div className="alert alert-error mt-2">
                    [!!] Total volume ({calculateUsedVolume(newInventory)}) exceeds capacity ({maxCapacity})!
                  </div>
                )}

                <button
                  onClick={handleCreateOnChain}
                  disabled={creating || newInventory.length === 0 || (maxCapacity > 0 && calculateUsedVolume(newInventory) > maxCapacity)}
                  className="btn btn-primary mt-2"
                  style={{ width: '100%' }}
                >
                  {creating ? 'CREATING...' : '[CREATE INVENTORY ON SUI]'}
                </button>

                {error && (
                  <div className="alert alert-error mt-2">
                    [ERR] {error}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Owned Inventories */}
        <div className="col">
          <div className="card">
            <div className="card-header">
              <div className="card-header-left"></div>
              <span className="card-title">YOUR INVENTORIES</span>
              <div className="card-header-right"></div>
            </div>
            <div className="card-body">
              {useLocalSigner && localAddress && (
                <div className="alert alert-success mb-2">
                  [OK] LOCAL SIGNER: {localAddress.slice(0, 8)}...{localAddress.slice(-6)}
                </div>
              )}

              {!effectiveAddress ? (
                <div className="text-center text-muted">
                  Connect wallet or set VITE_SUI_PRIVATE_KEY in .env.local
                </div>
              ) : !isConfigured ? (
                <div className="text-center text-muted">
                  Configure contract addresses to view inventories
                </div>
              ) : inventories?.length === 0 ? (
                <div className="text-center text-muted">
                  No inventories found. Create one to get started!
                </div>
              ) : (
                <div className="col">
                  {inventories?.map((inv) => (
                    <InventoryItem key={inv.id} inventory={inv} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-header-left"></div>
              <span className="card-title">HOW IT WORKS</span>
              <div className="card-header-right"></div>
            </div>
            <div className="card-body">
              <div className="col text-small">
                <div>[1] Generate commitment off-chain via proof server</div>
                <div>[2] Create inventory on Sui with just the commitment</div>
                <div>[3] Keep blinding factor secret (stored locally for demo)</div>
                <div>[4] Submit proofs for operations (verify, withdraw, deposit, transfer)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InventoryItem({ inventory }: { inventory: OnChainInventory }) {
  const [expanded, setExpanded] = useState(false);

  const stored = JSON.parse(localStorage.getItem('inventory-blindings') || '{}');
  const localData = stored[inventory.id];

  return (
    <div className="card-simple" style={{ padding: '0.5rem 1ch' }}>
      <div className="row-between" onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
        <div className="row">
          <span className="badge badge-info">[INV]</span>
          <div>
            <div className="text-small">
              {inventory.id.slice(0, 8)}...{inventory.id.slice(-6)}
            </div>
            <div className="text-small text-muted">
              Nonce: {inventory.nonce} | Capacity: {inventory.maxCapacity || 'Unlimited'}
            </div>
          </div>
        </div>
        <span className="text-muted">{expanded ? '[-]' : '[+]'}</span>
      </div>

      {expanded && (
        <div className="mt-2" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
          {/* On-Chain Data Panel - Shows raw blockchain data */}
          <OnChainDataPanel
            data={{
              objectId: inventory.id,
              commitment: inventory.commitment,
              nonce: inventory.nonce,
              maxCapacity: inventory.maxCapacity || 0,
              owner: inventory.owner || 'Unknown',
            }}
          />

          {localData ? (
            <div className="mt-2">
              <div className="text-small text-error mb-1">[SECRET] LOCAL DATA</div>
              <div className="card-simple" style={{ background: 'rgba(218, 30, 40, 0.1)' }}>
                <div className="text-small text-muted mb-1">Blinding Factor</div>
                <code className="text-break text-small">{localData.blinding}</code>
                <div className="text-small text-muted mt-2 mb-1">Contents</div>
                <div className="row">
                  {localData.slots.map((slot: InventorySlot, i: number) => (
                    <span key={i} className="badge">
                      {ITEM_NAMES[slot.item_id] || `#${slot.item_id}`}: {slot.quantity}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="alert alert-warning mt-2">
              [!!] Local data not found. Created from another device or cleared browser storage.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
