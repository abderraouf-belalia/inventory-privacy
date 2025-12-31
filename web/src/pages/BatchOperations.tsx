import { useState } from 'react';
import {
  useCurrentAccount,
  useSignTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import {
  OnChainInventorySelector,
  type LocalInventoryData,
} from '../components/OnChainInventorySelector';
import { useContractAddresses } from '../sui/ContractConfig';
import { buildBatchOperationsTx, hexToBytes, type BatchTxOperation } from '../sui/transactions';
import { ITEM_NAMES, ITEM_VOLUMES, calculateUsedVolume, getRegistryRoot } from '../types';
import * as api from '../api/client';
import type { BatchOperation, BatchOperationsResult } from '../api/client';
import type { OnChainInventory } from '../sui/hooks';
import { hasLocalSigner, getLocalAddress, signAndExecuteWithLocalSigner, getLocalnetClient } from '../sui/localSigner';

// Helper to fetch fresh inventory state from chain before proof generation
async function fetchFreshInventory(
  inventoryId: string,
  useLocal: boolean
): Promise<OnChainInventory | null> {
  try {
    const client = useLocal ? getLocalnetClient() : null;
    if (!client) return null;

    const obj = await client.getObject({
      id: inventoryId,
      options: { showContent: true },
    });

    if (obj.data?.content?.dataType !== 'moveObject') {
      return null;
    }

    const fields = obj.data.content.fields as Record<string, unknown>;
    const commitmentBytes = fields.commitment as number[];
    const commitment = '0x' + commitmentBytes.map((b) => b.toString(16).padStart(2, '0')).join('');

    return {
      id: obj.data.objectId,
      commitment,
      owner: fields.owner as string,
      nonce: Number(fields.nonce),
      maxCapacity: Number(fields.max_capacity || 0),
    };
  } catch (error) {
    console.error('Failed to fetch fresh inventory:', error);
    return null;
  }
}

// Format gas cost in MIST to a readable string
function formatGasCost(mist: bigint): string {
  const sui = Number(mist) / 1_000_000_000;
  if (sui < 0.001) {
    return `${mist.toLocaleString()} MIST`;
  }
  return `${sui.toFixed(4)} SUI`;
}

/** Pending operation to be included in batch */
interface PendingOperation {
  id: string;
  item_id: number;
  amount: number;
  op_type: 'deposit' | 'withdraw';
}

export function BatchOperations() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { packageId, verifyingKeysId, volumeRegistryId } = useContractAddresses();
  const { mutateAsync: signTransaction } = useSignTransaction();

  const useLocalSigner = hasLocalSigner();
  const localAddress = useLocalSigner ? getLocalAddress() : null;
  const effectiveAddress = localAddress || account?.address;

  const [selectedOnChainInventory, setSelectedOnChainInventory] = useState<OnChainInventory | null>(null);
  const [localData, setLocalData] = useState<LocalInventoryData | null>(null);

  // Pending operations queue
  const [pendingOps, setPendingOps] = useState<PendingOperation[]>([]);

  // Form state for adding new operation
  const [newOpType, setNewOpType] = useState<'withdraw' | 'deposit'>('withdraw');
  const [newItemId, setNewItemId] = useState<number>(1);
  const [newAmount, setNewAmount] = useState<number>(10);

  // Execution state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BatchOperationsResult | null>(null);
  const [txDigest, setTxDigest] = useState<string | null>(null);
  const [txTimeMs, setTxTimeMs] = useState<number | null>(null);
  const [gasCostMist, setGasCostMist] = useState<bigint | null>(null);

  const currentSlots = localData?.slots || [];
  const currentBlinding = localData?.blinding;

  const handleInventorySelect = (
    inv: OnChainInventory | null,
    data: LocalInventoryData | null
  ) => {
    setSelectedOnChainInventory(inv);
    setLocalData(data);
    setPendingOps([]);
    setResult(null);
    setTxDigest(null);
    setError(null);
    if (data?.slots.length) {
      setNewItemId(data.slots[0].item_id);
    }
  };

  const addOperation = () => {
    const op: PendingOperation = {
      id: crypto.randomUUID(),
      item_id: newItemId,
      amount: newAmount,
      op_type: newOpType,
    };
    setPendingOps([...pendingOps, op]);
  };

  const removeOperation = (id: string) => {
    setPendingOps(pendingOps.filter(op => op.id !== id));
  };

  const clearOperations = () => {
    setPendingOps([]);
    setResult(null);
    setTxDigest(null);
    setError(null);
  };

  // Calculate preview of inventory after all operations
  const previewInventory = () => {
    let preview = [...currentSlots];
    for (const op of pendingOps) {
      if (op.op_type === 'withdraw') {
        preview = preview
          .map(s => s.item_id === op.item_id ? { ...s, quantity: s.quantity - op.amount } : s)
          .filter(s => s.quantity > 0);
      } else {
        const idx = preview.findIndex(s => s.item_id === op.item_id);
        if (idx >= 0) {
          preview = preview.map(s => s.item_id === op.item_id ? { ...s, quantity: s.quantity + op.amount } : s);
        } else {
          preview = [...preview, { item_id: op.item_id, quantity: op.amount }];
        }
      }
    }
    return preview;
  };

  const executeBatch = async () => {
    if (!currentBlinding || !selectedOnChainInventory || !effectiveAddress || pendingOps.length === 0) {
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setTxDigest(null);
    setTxTimeMs(null);
    setGasCostMist(null);

    try {
      // Fetch fresh inventory state
      const freshInventory = await fetchFreshInventory(selectedOnChainInventory.id, useLocalSigner);
      if (freshInventory) {
        setSelectedOnChainInventory(freshInventory);
      }
      const startNonce = freshInventory?.nonce ?? selectedOnChainInventory.nonce;

      const currentVolume = calculateUsedVolume(currentSlots);
      const registryRoot = getRegistryRoot();
      const maxCapacity = selectedOnChainInventory.maxCapacity;

      // Convert pending ops to batch operations
      const operations: BatchOperation[] = pendingOps.map(op => ({
        item_id: op.item_id,
        amount: op.amount,
        item_volume: ITEM_VOLUMES[op.item_id] ?? 0,
        op_type: op.op_type,
      }));

      // Generate all proofs in parallel
      const batchResult = await api.proveBatchOperations(
        currentSlots,
        currentVolume,
        currentBlinding,
        operations,
        selectedOnChainInventory.id,
        startNonce,
        registryRoot,
        maxCapacity
      );

      setResult(batchResult);

      // Build PTB with all operations
      const txOperations: BatchTxOperation[] = batchResult.operations.map((opResult, i) => ({
        proof: hexToBytes(opResult.proof),
        signalHash: hexToBytes(opResult.public_inputs[0]),
        proofNonce: BigInt(opResult.nonce),
        proofInventoryId: hexToBytes(opResult.inventory_id),
        proofRegistryRoot: hexToBytes(opResult.registry_root),
        newCommitment: hexToBytes(opResult.new_commitment),
        itemId: pendingOps[i].item_id,
        amount: BigInt(pendingOps[i].amount),
        opType: pendingOps[i].op_type,
      }));

      const tx = buildBatchOperationsTx(
        packageId,
        selectedOnChainInventory.id,
        volumeRegistryId,
        verifyingKeysId,
        txOperations
      );

      // Execute transaction
      const txStart = performance.now();
      let txResult;

      if (useLocalSigner && localAddress) {
        console.log('Using local signer for batch operations:', localAddress);
        tx.setSender(localAddress);
        const localClient = getLocalnetClient();
        txResult = await signAndExecuteWithLocalSigner(tx, localClient);
      } else if (account) {
        tx.setSender(account.address);
        const signedTx = await signTransaction({
          transaction: tx as unknown as Parameters<typeof signTransaction>[0]['transaction'],
        });
        txResult = await client.executeTransactionBlock({
          transactionBlock: signedTx.bytes,
          signature: signedTx.signature,
          options: { showEffects: true },
        });
      } else {
        throw new Error('No signer available');
      }

      const txEnd = performance.now();
      setTxTimeMs(Math.round(txEnd - txStart));

      const effects = txResult.effects as {
        status?: { status: string; error?: string };
        gasUsed?: {
          computationCost: string;
          storageCost: string;
          storageRebate: string;
        };
      } | undefined;

      if (effects?.gasUsed) {
        const computation = BigInt(effects.gasUsed.computationCost);
        const storage = BigInt(effects.gasUsed.storageCost);
        const rebate = BigInt(effects.gasUsed.storageRebate);
        setGasCostMist(computation + storage - rebate);
      }

      if (effects?.status?.status === 'success') {
        setTxDigest(txResult.digest);

        // Update local storage with final state
        const stored = JSON.parse(localStorage.getItem('inventory-blindings') || '{}');
        stored[selectedOnChainInventory.id] = {
          blinding: batchResult.finalBlinding,
          slots: batchResult.finalInventory,
        };
        localStorage.setItem('inventory-blindings', JSON.stringify(stored));

        setLocalData({
          blinding: batchResult.finalBlinding,
          slots: batchResult.finalInventory,
        });

        // Clear pending operations
        setPendingOps([]);
      } else {
        throw new Error('Transaction failed: ' + effects?.status?.error);
      }
    } catch (err) {
      console.error('Batch operation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to execute batch');
    } finally {
      setLoading(false);
    }
  };

  const preview = previewInventory();
  const isValid = pendingOps.length > 0 && currentBlinding && selectedOnChainInventory;

  return (
    <div className="col">
      <div className="mb-2">
        <h1>BATCH OPERATIONS</h1>
        <p className="text-muted">
          Execute multiple deposit/withdraw operations with parallel proof generation.
        </p>
      </div>

      <div className="grid grid-2">
        {/* Left: Configuration */}
        <div className="col">
          <div className="card">
            <div className="card-header">
              <div className="card-header-left"></div>
              <span className="card-title">SELECT INVENTORY</span>
              <div className="card-header-right"></div>
            </div>
            <div className="card-body">
              <OnChainInventorySelector
                selectedInventory={selectedOnChainInventory}
                onSelect={handleInventorySelect}
              />
            </div>
          </div>

          {selectedOnChainInventory && localData && (
            <>
              <div className="card">
                <div className="card-header">
                  <div className="card-header-left"></div>
                  <span className="card-title">ADD OPERATION</span>
                  <div className="card-header-right"></div>
                </div>
                <div className="card-body">
                  <div className="btn-group mb-2" style={{ width: '100%' }}>
                    <button
                      onClick={() => setNewOpType('withdraw')}
                      className={`btn btn-secondary ${newOpType === 'withdraw' ? 'active' : ''}`}
                      style={{ flex: 1 }}
                    >
                      [WITHDRAW]
                    </button>
                    <button
                      onClick={() => setNewOpType('deposit')}
                      className={`btn btn-secondary ${newOpType === 'deposit' ? 'active' : ''}`}
                      style={{ flex: 1 }}
                    >
                      [DEPOSIT]
                    </button>
                  </div>

                  <div className="input-group">
                    <label className="input-label">Item</label>
                    <select
                      value={newItemId}
                      onChange={(e) => setNewItemId(Number(e.target.value))}
                      className="select"
                    >
                      {newOpType === 'withdraw' ? (
                        currentSlots.length === 0 ? (
                          <option>No items available</option>
                        ) : (
                          currentSlots.map((slot) => (
                            <option key={slot.item_id} value={slot.item_id}>
                              {ITEM_NAMES[slot.item_id] || `Item #${slot.item_id}`} (have {slot.quantity})
                            </option>
                          ))
                        )
                      ) : (
                        Object.entries(ITEM_NAMES).map(([id, name]) => (
                          <option key={id} value={id}>
                            {name} (#{id})
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="input-group">
                    <label className="input-label">Amount</label>
                    <input
                      type="number"
                      value={newAmount}
                      onChange={(e) => setNewAmount(Number(e.target.value))}
                      min={1}
                      className="input"
                    />
                  </div>

                  <button
                    onClick={addOperation}
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    disabled={!currentSlots.length && newOpType === 'withdraw'}
                  >
                    [+ ADD TO BATCH]
                  </button>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div className="card-header-left"></div>
                  <span className="card-title">PENDING OPERATIONS ({pendingOps.length})</span>
                  <div className="card-header-right">
                    {pendingOps.length > 0 && (
                      <button onClick={clearOperations} className="btn btn-secondary btn-small">
                        [CLEAR]
                      </button>
                    )}
                  </div>
                </div>
                <div className="card-body">
                  {pendingOps.length === 0 ? (
                    <div className="text-muted text-center">No operations queued</div>
                  ) : (
                    <div className="col">
                      {pendingOps.map((op) => (
                        <div key={op.id} className="row-between" style={{ padding: '0.5rem', background: 'var(--bg-secondary)', marginBottom: '0.5rem' }}>
                          <span>
                            <span className={op.op_type === 'withdraw' ? 'text-error' : 'text-success'}>
                              {op.op_type === 'withdraw' ? '[-]' : '[+]'}
                            </span>{' '}
                            {op.amount} {ITEM_NAMES[op.item_id] || `#${op.item_id}`}
                          </span>
                          <button
                            onClick={() => removeOperation(op.id)}
                            className="btn btn-secondary btn-small"
                          >
                            [X]
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right: Preview & Results */}
        <div className="col">
          {selectedOnChainInventory && localData && (
            <div className="card">
              <div className="card-header">
                <div className="card-header-left"></div>
                <span className="card-title">PREVIEW</span>
                <div className="card-header-right"></div>
              </div>
              <div className="card-body">
                <div className="grid grid-2">
                  <div>
                    <div className="text-small text-muted mb-1">CURRENT</div>
                    <div className="col text-small">
                      {currentSlots.map(s => (
                        <div key={s.item_id}>
                          {ITEM_NAMES[s.item_id] || `#${s.item_id}`}: {s.quantity}
                        </div>
                      ))}
                      {currentSlots.length === 0 && <div className="text-muted">Empty</div>}
                    </div>
                  </div>
                  <div>
                    <div className="text-small text-muted mb-1">AFTER BATCH</div>
                    <div className="col text-small">
                      {preview.map(s => (
                        <div key={s.item_id}>
                          {ITEM_NAMES[s.item_id] || `#${s.item_id}`}: {s.quantity}
                        </div>
                      ))}
                      {preview.length === 0 && <div className="text-muted">Empty</div>}
                    </div>
                  </div>
                </div>

                <button
                  onClick={executeBatch}
                  disabled={loading || !isValid}
                  className="btn btn-primary mt-2"
                  style={{ width: '100%' }}
                >
                  {loading
                    ? 'PROCESSING...'
                    : `[EXECUTE ${pendingOps.length} OPERATION${pendingOps.length !== 1 ? 'S' : ''}]`}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="alert alert-error">
              <div>[!!] {error}</div>
            </div>
          )}

          {txDigest && result && (
            <div className="alert alert-success">
              <div className="row-between">
                <span>[OK] BATCH OPERATION SUCCESSFUL</span>
                <span className="text-small">
                  <span className="badge">{result.proofTimeMs}ms proofs</span>
                  {txTimeMs !== null && <span className="badge" style={{ marginLeft: '0.5ch' }}>{txTimeMs}ms tx</span>}
                  {gasCostMist !== null && <span className="badge" style={{ marginLeft: '0.5ch' }}>{formatGasCost(gasCostMist)}</span>}
                </span>
              </div>
              <div className="text-small mt-1">
                {result.operations.length} operations executed atomically on Sui blockchain.
              </div>
              <code className="text-break text-small">{txDigest}</code>
            </div>
          )}

          {result && (
            <div className="card">
              <div className="card-header">
                <div className="card-header-left"></div>
                <span className="card-title">PROOF DETAILS</span>
                <div className="card-header-right"></div>
              </div>
              <div className="card-body">
                <div className="text-small text-success mb-2">
                  [OK] Generated {result.operations.length} proofs in parallel ({result.proofTimeMs}ms wall-clock)
                </div>
                <div className="col">
                  {result.operations.map((op, i) => (
                    <div key={i} className="card-simple mb-1">
                      <div className="row-between">
                        <span className="text-small">
                          Proof #{i + 1} (nonce {op.nonce})
                        </span>
                        <code className="text-small">{op.proof.slice(0, 20)}...</code>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <div className="text-small text-muted">FINAL COMMITMENT</div>
                  <code className="text-break text-small">{result.finalCommitment}</code>
                </div>
              </div>
            </div>
          )}

          {!result && !error && selectedOnChainInventory && (
            <div className="card">
              <div className="card-header">
                <div className="card-header-left"></div>
                <span className="card-title">HOW IT WORKS</span>
                <div className="card-header-right"></div>
              </div>
              <div className="card-body">
                <div className="col text-small">
                  <div>[1] Queue multiple operations (deposits/withdraws)</div>
                  <div>[2] Pre-compute intermediate states locally</div>
                  <div>[3] Generate all proofs IN PARALLEL (~450ms total)</div>
                  <div>[4] Submit single atomic transaction (PTB)</div>
                  <div>[5] All operations verified and applied atomically</div>
                </div>
                <div className="text-small text-muted mt-2">
                  Parallel proof generation means wall-clock time is O(1) regardless of N operations!
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
