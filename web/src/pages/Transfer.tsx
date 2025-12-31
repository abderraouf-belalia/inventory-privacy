import { useState } from 'react';
import {
  useCurrentAccount,
  useSignTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import { CapacityBar, CapacityPreview } from '../components/CapacityBar';
import { ProofLoading, ProofError } from '../components/ProofResult';
import {
  OnChainInventorySelector,
  type LocalInventoryData,
} from '../components/OnChainInventorySelector';
import { useContractAddresses } from '../sui/ContractConfig';
import { buildBatchTransfersTx, hexToBytes, type BatchTransferTxOperation } from '../sui/transactions';
import { ITEM_NAMES, ITEM_VOLUMES, canDeposit, calculateUsedVolume, getRegistryRoot } from '../types';
import * as api from '../api/client';
import type { TransferProofs } from '../api/client';
import type { OnChainInventory } from '../sui/hooks';
import { hasLocalSigner, getLocalAddress, signAndExecuteWithLocalSigner, getLocalnetClient } from '../sui/localSigner';

/** Pending transfer in queue */
interface PendingTransfer {
  id: string;
  item_id: number;
  amount: number;
}

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

export function Transfer() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { packageId, verifyingKeysId, volumeRegistryId } = useContractAddresses();
  const { mutateAsync: signTransaction } = useSignTransaction();

  const useLocalSigner = hasLocalSigner();
  const localAddress = useLocalSigner ? getLocalAddress() : null;
  const effectiveAddress = localAddress || account?.address;

  // Inventory selection
  const [srcOnChain, setSrcOnChain] = useState<OnChainInventory | null>(null);
  const [srcLocalData, setSrcLocalData] = useState<LocalInventoryData | null>(null);
  const [dstOnChain, setDstOnChain] = useState<OnChainInventory | null>(null);
  const [dstLocalData, setDstLocalData] = useState<LocalInventoryData | null>(null);

  // Transfer parameters
  const [itemId, setItemId] = useState(1);
  const [amount, setAmount] = useState(30);

  // Queue state
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([]);

  // Execution state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txDigest, setTxDigest] = useState<string | null>(null);
  const [proofTimeMs, setProofTimeMs] = useState<number | null>(null);
  const [txTimeMs, setTxTimeMs] = useState<number | null>(null);
  const [gasCostMist, setGasCostMist] = useState<bigint | null>(null);

  const currentSrcSlots = srcLocalData?.slots || [];
  const currentDstSlots = dstLocalData?.slots || [];
  const currentSrcBlinding = srcLocalData?.blinding;
  const currentDstBlinding = dstLocalData?.blinding;

  const sourceItem = currentSrcSlots.find((s) => s.item_id === itemId);
  const canTransfer = sourceItem && sourceItem.quantity >= amount;

  const dstMaxCapacity = dstOnChain?.maxCapacity || 0;
  const hasDstCapacityLimit = dstMaxCapacity > 0 && volumeRegistryId?.startsWith('0x');
  const canTransferWithCapacity = !hasDstCapacityLimit || canDeposit(currentDstSlots, itemId, amount, dstMaxCapacity);

  const initialized = srcLocalData?.blinding && dstLocalData?.blinding && srcOnChain && dstOnChain;

  // Queue handlers
  const addToQueue = () => {
    const transfer: PendingTransfer = {
      id: crypto.randomUUID(),
      item_id: itemId,
      amount: amount,
    };
    setPendingTransfers([...pendingTransfers, transfer]);
  };

  const removeFromQueue = (id: string) => {
    setPendingTransfers(pendingTransfers.filter(t => t.id !== id));
  };

  const clearQueue = () => {
    setPendingTransfers([]);
    setError(null);
    setTxDigest(null);
  };

  // Preview inventory states after pending transfers
  const previewInventories = () => {
    let srcPreview = [...currentSrcSlots];
    let dstPreview = [...currentDstSlots];

    for (const t of pendingTransfers) {
      srcPreview = srcPreview
        .map(s => s.item_id === t.item_id ? { ...s, quantity: s.quantity - t.amount } : s)
        .filter(s => s.quantity > 0);

      const dstIdx = dstPreview.findIndex(s => s.item_id === t.item_id);
      if (dstIdx >= 0) {
        dstPreview = dstPreview.map(s => s.item_id === t.item_id ? { ...s, quantity: s.quantity + t.amount } : s);
      } else {
        dstPreview = [...dstPreview, { item_id: t.item_id, quantity: t.amount }];
      }
    }

    return { srcPreview, dstPreview };
  };

  // Execute all transfers
  const execute = async () => {
    if (!currentSrcBlinding || !currentDstBlinding || !srcOnChain || !dstOnChain ||
        !effectiveAddress || pendingTransfers.length === 0 || !volumeRegistryId) {
      return;
    }

    setLoading(true);
    setError(null);
    setTxDigest(null);
    setProofTimeMs(null);
    setTxTimeMs(null);
    setGasCostMist(null);

    try {
      // Fetch fresh inventory states
      const [fetchedSrc, fetchedDst] = await Promise.all([
        fetchFreshInventory(srcOnChain.id, useLocalSigner),
        fetchFreshInventory(dstOnChain.id, useLocalSigner),
      ]);

      const freshSrcOnChain = fetchedSrc || srcOnChain;
      const freshDstOnChain = fetchedDst || dstOnChain;

      const registryRoot = getRegistryRoot();
      const srcMaxCapacity = srcOnChain.maxCapacity;

      // Generate proofs sequentially (each depends on previous state)
      let srcSlots = [...currentSrcSlots];
      let dstSlots = [...currentDstSlots];
      let srcBlinding = currentSrcBlinding;
      let dstBlinding = currentDstBlinding;
      let srcNonce = freshSrcOnChain.nonce;
      let dstNonce = freshDstOnChain.nonce;

      const proofStart = performance.now();
      const transfers: TransferProofs[] = [];

      for (const t of pendingTransfers) {
        const [srcNewBlinding, dstNewBlinding] = await Promise.all([
          api.generateBlinding(),
          api.generateBlinding(),
        ]);

        const srcVolume = calculateUsedVolume(srcSlots);
        const dstVolume = calculateUsedVolume(dstSlots);
        const itemVolume = ITEM_VOLUMES[t.item_id] ?? 0;

        const result = await api.proveTransfer(
          srcSlots, srcVolume, srcBlinding, srcNewBlinding, srcNonce, srcOnChain.id,
          dstSlots, dstVolume, dstBlinding, dstNewBlinding, dstNonce, dstOnChain.id,
          t.item_id, t.amount, itemVolume, registryRoot, srcMaxCapacity, dstMaxCapacity
        );

        transfers.push(result);

        // Update states for next iteration
        srcSlots = srcSlots
          .map(s => s.item_id === t.item_id ? { ...s, quantity: s.quantity - t.amount } : s)
          .filter(s => s.quantity > 0);

        const dstIdx = dstSlots.findIndex(s => s.item_id === t.item_id);
        if (dstIdx >= 0) {
          dstSlots = dstSlots.map(s => s.item_id === t.item_id ? { ...s, quantity: s.quantity + t.amount } : s);
        } else {
          dstSlots = [...dstSlots, { item_id: t.item_id, quantity: t.amount }];
        }

        srcBlinding = srcNewBlinding;
        dstBlinding = dstNewBlinding;
        srcNonce++;
        dstNonce++;
      }

      const proofEnd = performance.now();
      setProofTimeMs(Math.round(proofEnd - proofStart));

      // Build PTB with all transfers
      const txOperations: BatchTransferTxOperation[] = transfers.map((r, i) => ({
        srcProof: hexToBytes(r.srcProof.proof),
        srcSignalHash: hexToBytes(r.srcProof.public_inputs[0]),
        srcNonce: BigInt(r.srcNonce),
        srcInventoryId: hexToBytes(r.srcInventoryId),
        srcRegistryRoot: hexToBytes(r.srcRegistryRoot),
        srcNewCommitment: hexToBytes(r.srcNewCommitment),
        dstProof: hexToBytes(r.dstProof.proof),
        dstSignalHash: hexToBytes(r.dstProof.public_inputs[0]),
        dstNonce: BigInt(r.dstNonce),
        dstInventoryId: hexToBytes(r.dstInventoryId),
        dstRegistryRoot: hexToBytes(r.dstRegistryRoot),
        dstNewCommitment: hexToBytes(r.dstNewCommitment),
        itemId: pendingTransfers[i].item_id,
        amount: BigInt(pendingTransfers[i].amount),
      }));

      const tx = buildBatchTransfersTx(
        packageId, srcOnChain.id, dstOnChain.id, volumeRegistryId, verifyingKeysId, txOperations
      );

      // Execute transaction
      const txStart = performance.now();
      let txResult;

      if (useLocalSigner && localAddress) {
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
        gasUsed?: { computationCost: string; storageCost: string; storageRebate: string };
      } | undefined;

      if (effects?.gasUsed) {
        const computation = BigInt(effects.gasUsed.computationCost);
        const storage = BigInt(effects.gasUsed.storageCost);
        const rebate = BigInt(effects.gasUsed.storageRebate);
        setGasCostMist(computation + storage - rebate);
      }

      if (effects?.status?.status === 'success') {
        setTxDigest(txResult.digest);

        // Update local storage
        const stored = JSON.parse(localStorage.getItem('inventory-blindings') || '{}');
        stored[srcOnChain.id] = { blinding: srcBlinding, slots: srcSlots };
        stored[dstOnChain.id] = { blinding: dstBlinding, slots: dstSlots };
        localStorage.setItem('inventory-blindings', JSON.stringify(stored));

        setSrcLocalData({ blinding: srcBlinding, slots: srcSlots });
        setDstLocalData({ blinding: dstBlinding, slots: dstSlots });
        setPendingTransfers([]);
      } else {
        throw new Error('Transaction failed: ' + effects?.status?.error);
      }
    } catch (err) {
      console.error('Transfer error:', err);
      setError(err instanceof Error ? err.message : 'Failed to execute transfers');
    } finally {
      setLoading(false);
    }
  };

  const { srcPreview, dstPreview } = previewInventories();

  return (
    <div className="col">
      <div className="mb-2">
        <h1>TRANSFER</h1>
        <p className="text-muted">
          Transfer items between two private inventories with ZK proofs.
        </p>
      </div>

      {/* Two inventory panels */}
      <div className="grid grid-2">
        <div className="col">
          <div className="row-between mb-1">
            <span className="text-uppercase">SOURCE INVENTORY</span>
            <span className="badge">YOUR INVENTORY</span>
          </div>
          <div className="card">
            <div className="card-header">
              <div className="card-header-left"></div>
              <span className="card-title">SELECT SOURCE</span>
              <div className="card-header-right"></div>
            </div>
            <div className="card-body">
              <OnChainInventorySelector
                selectedInventory={srcOnChain}
                onSelect={(inv, data) => {
                  setSrcOnChain(inv);
                  setSrcLocalData(data);
                  setPendingTransfers([]);
                  setTxDigest(null);
                  if (data?.slots.length) {
                    setItemId(data.slots[0].item_id);
                  }
                }}
                label="Source Inventory"
              />
            </div>
          </div>
        </div>

        <div className="col">
          <div className="row-between mb-1">
            <span className="text-uppercase">DESTINATION INVENTORY</span>
            <span className="badge">RECIPIENT</span>
          </div>
          <div className="card">
            <div className="card-header">
              <div className="card-header-left"></div>
              <span className="card-title">SELECT DESTINATION</span>
              <div className="card-header-right"></div>
            </div>
            <div className="card-body">
              <OnChainInventorySelector
                selectedInventory={dstOnChain}
                onSelect={(inv, data) => {
                  setDstOnChain(inv);
                  setDstLocalData(data);
                  setPendingTransfers([]);
                  setTxDigest(null);
                }}
                label="Destination Inventory"
              />
              {srcOnChain && dstOnChain && srcOnChain.id === dstOnChain.id && (
                <p className="text-small text-warning mt-1">
                  [!!] Source and destination cannot be the same inventory.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Transfer controls */}
      {initialized && (
        <div className="card">
          <div className="card-header">
            <div className="card-header-left"></div>
            <span className="card-title">QUEUE TRANSFER</span>
            <div className="card-header-right"></div>
          </div>
          <div className="card-body">
            <div className="grid grid-2">
              <div className="input-group">
                <label className="input-label">Item to Transfer</label>
                <select
                  value={itemId}
                  onChange={(e) => setItemId(Number(e.target.value))}
                  className="select"
                  disabled={currentSrcSlots.length === 0}
                >
                  {currentSrcSlots.length === 0 ? (
                    <option>No items available</option>
                  ) : (
                    currentSrcSlots.map((slot) => (
                      <option key={slot.item_id} value={slot.item_id}>
                        {ITEM_NAMES[slot.item_id] || `Item #${slot.item_id}`} ({slot.quantity} available)
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="input-group">
                <label className="input-label">Amount</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  min={1}
                  max={sourceItem?.quantity || 1}
                  className="input"
                />
                {hasDstCapacityLimit && (
                  <p className="text-small text-muted mt-1">
                    Volume: {ITEM_VOLUMES[itemId] ?? 0} x {amount} = {(ITEM_VOLUMES[itemId] ?? 0) * amount}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={addToQueue}
              disabled={
                !canTransfer ||
                !canTransferWithCapacity ||
                srcOnChain?.id === dstOnChain?.id
              }
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              [+ ADD TO QUEUE]
            </button>

            {!canTransfer && sourceItem && (
              <div className="alert alert-error mt-2">
                [!!] Insufficient balance: only have {sourceItem.quantity}
              </div>
            )}

            {!canTransferWithCapacity && canTransfer && (
              <div className="alert alert-error mt-2">
                [!!] Transfer would exceed destination inventory capacity!
              </div>
            )}

            {dstOnChain && dstMaxCapacity > 0 && (
              <div className="mt-2">
                <div className="text-small text-muted mb-1">DESTINATION CAPACITY</div>
                <CapacityBar slots={currentDstSlots} maxCapacity={dstMaxCapacity} />
                <CapacityPreview
                  currentSlots={currentDstSlots}
                  maxCapacity={dstMaxCapacity}
                  itemId={itemId}
                  amount={amount}
                  isDeposit={true}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Queue and Preview */}
      {initialized && (
        <div className="grid grid-2">
          <div className="card">
            <div className="card-header">
              <div className="card-header-left"></div>
              <span className="card-title">TRANSFER QUEUE ({pendingTransfers.length})</span>
              <div className="card-header-right">
                {pendingTransfers.length > 0 && (
                  <button onClick={clearQueue} className="btn btn-secondary btn-small">
                    [CLEAR]
                  </button>
                )}
              </div>
            </div>
            <div className="card-body">
              {pendingTransfers.length === 0 ? (
                <div className="text-muted text-center">No transfers queued</div>
              ) : (
                <div className="col">
                  {pendingTransfers.map((t) => (
                    <div key={t.id} className="row-between" style={{ padding: '0.5rem', background: 'var(--bg-secondary)', marginBottom: '0.5rem' }}>
                      <span>
                        {t.amount} {ITEM_NAMES[t.item_id] || `#${t.item_id}`}
                      </span>
                      <button
                        onClick={() => removeFromQueue(t.id)}
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

          <div className="card">
            <div className="card-header">
              <div className="card-header-left"></div>
              <span className="card-title">PREVIEW</span>
              <div className="card-header-right"></div>
            </div>
            <div className="card-body">
              <div className="grid grid-2">
                <div>
                  <div className="text-small text-muted mb-1">SOURCE AFTER</div>
                  <div className="col text-small">
                    {srcPreview.map(s => (
                      <div key={s.item_id}>{ITEM_NAMES[s.item_id] || `#${s.item_id}`}: {s.quantity}</div>
                    ))}
                    {srcPreview.length === 0 && <span className="text-muted">Empty</span>}
                  </div>
                </div>
                <div>
                  <div className="text-small text-muted mb-1">DEST AFTER</div>
                  <div className="col text-small">
                    {dstPreview.map(s => (
                      <div key={s.item_id}>{ITEM_NAMES[s.item_id] || `#${s.item_id}`}: {s.quantity}</div>
                    ))}
                    {dstPreview.length === 0 && <span className="text-muted">Empty</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Execute */}
      {initialized && (
        <div className="card">
          <div className="card-header">
            <div className="card-header-left"></div>
            <span className="card-title">EXECUTE</span>
            <div className="card-header-right"></div>
          </div>
          <div className="card-body">
            <div className="text-small text-muted mb-2">
              {pendingTransfers.length === 0
                ? 'Add transfers to the queue to execute them atomically.'
                : `${pendingTransfers.length} transfer${pendingTransfers.length !== 1 ? 's' : ''} queued for atomic execution on-chain.`}
            </div>
            <button
              onClick={execute}
              disabled={loading || pendingTransfers.length === 0 || !effectiveAddress}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              {loading
                ? 'PROCESSING...'
                : `[TRANSFER ${pendingTransfers.length} ITEM${pendingTransfers.length !== 1 ? 'S' : ''}]`}
            </button>
            {!effectiveAddress && (
              <p className="text-small text-error mt-1">[!!] Connect wallet or configure local signer</p>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {loading && (
        <ProofLoading message={`Executing ${pendingTransfers.length} transfer${pendingTransfers.length !== 1 ? 's' : ''}...`} />
      )}

      {error && <ProofError error={error} onRetry={execute} />}

      {txDigest && (
        <div className="alert alert-success">
          <div className="row-between">
            <span>[OK] TRANSFER SUCCESSFUL</span>
            <span className="text-small">
              {proofTimeMs !== null && <span className="badge">{proofTimeMs}ms proof</span>}
              {txTimeMs !== null && <span className="badge" style={{ marginLeft: '0.5ch' }}>{txTimeMs}ms tx</span>}
              {gasCostMist !== null && <span className="badge" style={{ marginLeft: '0.5ch' }}>{formatGasCost(gasCostMist)}</span>}
            </span>
          </div>
          <div className="text-small mt-1">
            Transfers executed atomically on Sui blockchain with ZK proof verification.
          </div>
          <code className="text-break text-small">{txDigest}</code>
        </div>
      )}

      {/* How it works */}
      {!loading && !error && !txDigest && (
        <div className="card">
          <div className="card-header">
            <div className="card-header-left"></div>
            <span className="card-title">HOW IT WORKS</span>
            <div className="card-header-right"></div>
          </div>
          <div className="card-body">
            {!initialized ? (
              <div className="col text-small">
                <div>[1] Select source inventory (your items)</div>
                <div>[2] Select destination inventory (recipient)</div>
                <div>[3] Queue transfer operations</div>
                <div>[4] Execute atomically with ZK proofs</div>
              </div>
            ) : (
              <div className="grid grid-2">
                <div>
                  <div className="text-small text-muted mb-1">SOURCE PROOF</div>
                  <div className="col text-small">
                    <div>[OK] Old commitment is valid</div>
                    <div>[OK] Has sufficient balance</div>
                    <div>[OK] New commitment = old - amount</div>
                  </div>
                </div>
                <div>
                  <div className="text-small text-muted mb-1">DESTINATION PROOF</div>
                  <div className="col text-small">
                    <div>[OK] Old commitment is valid</div>
                    <div>[OK] New commitment = old + amount</div>
                    <div>[OK] Same item_id and amount</div>
                  </div>
                </div>
              </div>
            )}
            {initialized && hasDstCapacityLimit && (
              <div className="mt-2 text-small text-muted" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                <span className="text-accent">Capacity-aware proof verifies destination doesn't exceed volume limit.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
