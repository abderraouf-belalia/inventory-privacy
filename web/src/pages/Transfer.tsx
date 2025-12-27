import { useState } from 'react';
import {
  useCurrentAccount,
  useSignTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import { InventoryCard } from '../components/InventoryCard';
import { CapacityBar, CapacityPreview } from '../components/CapacityBar';
import { ProofResult, ProofLoading, ProofError } from '../components/ProofResult';
import {
  OnChainInventorySelector,
  type LocalInventoryData,
} from '../components/OnChainInventorySelector';
import { useContractAddresses } from '../sui/ContractConfig';
import { buildTransferTx, buildTransferWithCapacityTx, hexToBytes } from '../sui/transactions';
import { ITEM_NAMES, ITEM_VOLUMES, getVolumeRegistryArray, canDeposit, type InventorySlot, type TransferResult } from '../types';
import * as api from '../api/client';
import type { OnChainInventory } from '../sui/hooks';
import { hasLocalSigner, getLocalAddress, signAndExecuteWithLocalSigner, getLocalnetClient } from '../sui/localSigner';

interface InventoryState {
  slots: InventorySlot[];
  blinding: string;
  commitment: string | null;
}

type Mode = 'demo' | 'onchain';

export function Transfer() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { packageId, verifyingKeysId, volumeRegistryId } = useContractAddresses();
  const { mutateAsync: signTransaction } = useSignTransaction();

  const useLocalSigner = hasLocalSigner();
  const localAddress = useLocalSigner ? getLocalAddress() : null;
  const effectiveAddress = localAddress || account?.address;

  const [mode, setMode] = useState<Mode>('demo');

  const [source, setSource] = useState<InventoryState>({
    slots: [
      { item_id: 1, quantity: 100 },
      { item_id: 2, quantity: 50 },
    ],
    blinding: '',
    commitment: null,
  });

  const [destination, setDestination] = useState<InventoryState>({
    slots: [{ item_id: 3, quantity: 25 }],
    blinding: '',
    commitment: null,
  });

  const [srcOnChain, setSrcOnChain] = useState<OnChainInventory | null>(null);
  const [srcLocalData, setSrcLocalData] = useState<LocalInventoryData | null>(null);
  const [dstOnChain, setDstOnChain] = useState<OnChainInventory | null>(null);
  const [dstLocalData, setDstLocalData] = useState<LocalInventoryData | null>(null);

  const [itemId, setItemId] = useState(1);
  const [amount, setAmount] = useState(30);
  const [proofResult, setProofResult] = useState<TransferResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferComplete, setTransferComplete] = useState(false);
  const [txDigest, setTxDigest] = useState<string | null>(null);

  const currentSrcSlots = mode === 'demo' ? source.slots : srcLocalData?.slots || [];
  const currentDstSlots = mode === 'demo' ? destination.slots : dstLocalData?.slots || [];
  const currentSrcBlinding = mode === 'demo' ? source.blinding : srcLocalData?.blinding;
  const currentDstBlinding = mode === 'demo' ? destination.blinding : dstLocalData?.blinding;

  const sourceItem = currentSrcSlots.find((s) => s.item_id === itemId);
  const canTransfer = sourceItem && sourceItem.quantity >= amount;

  const dstMaxCapacity = mode === 'demo' ? 0 : dstOnChain?.maxCapacity || 0;
  const hasDstCapacityLimit = dstMaxCapacity > 0 && volumeRegistryId?.startsWith('0x');
  const canTransferWithCapacity = !hasDstCapacityLimit || canDeposit(currentDstSlots, itemId, amount, dstMaxCapacity);

  const initializeBlindings = async () => {
    const [srcBlinding, dstBlinding] = await Promise.all([
      api.generateBlinding(),
      api.generateBlinding(),
    ]);

    const [srcCommitment, dstCommitment] = await Promise.all([
      api.createCommitment(source.slots, srcBlinding),
      api.createCommitment(destination.slots, dstBlinding),
    ]);

    setSource((prev) => ({
      ...prev,
      blinding: srcBlinding,
      commitment: srcCommitment,
    }));
    setDestination((prev) => ({
      ...prev,
      blinding: dstBlinding,
      commitment: dstCommitment,
    }));
  };

  const handleTransfer = async () => {
    if (!currentSrcBlinding || !currentDstBlinding) {
      setError('Both inventories must have blinding factors');
      return;
    }

    setLoading(true);
    setError(null);
    setProofResult(null);
    setTransferComplete(false);
    setTxDigest(null);

    try {
      const [srcNewBlinding, dstNewBlinding] = await Promise.all([
        api.generateBlinding(),
        api.generateBlinding(),
      ]);

      let result: TransferResult;
      if (hasDstCapacityLimit) {
        result = await api.proveTransferWithCapacity(
          currentSrcSlots,
          currentSrcBlinding,
          srcNewBlinding,
          currentDstSlots,
          currentDstBlinding,
          dstNewBlinding,
          itemId,
          amount,
          dstMaxCapacity,
          getVolumeRegistryArray()
        );
      } else {
        result = await api.proveTransfer(
          currentSrcSlots,
          currentSrcBlinding,
          srcNewBlinding,
          currentDstSlots,
          currentDstBlinding,
          dstNewBlinding,
          itemId,
          amount
        );
      }

      setProofResult(result);

      const newSourceSlots = currentSrcSlots
        .map((s) =>
          s.item_id === itemId ? { ...s, quantity: s.quantity - amount } : s
        )
        .filter((s) => s.quantity > 0);

      const existingDstIndex = currentDstSlots.findIndex((s) => s.item_id === itemId);
      let newDstSlots: InventorySlot[];
      if (existingDstIndex >= 0) {
        newDstSlots = currentDstSlots.map((s) =>
          s.item_id === itemId ? { ...s, quantity: s.quantity + amount } : s
        );
      } else {
        newDstSlots = [...currentDstSlots, { item_id: itemId, quantity: amount }];
      }

      if (mode === 'demo') {
        setSource({
          slots: newSourceSlots,
          blinding: srcNewBlinding,
          commitment: result.src_new_commitment,
        });

        setDestination({
          slots: newDstSlots,
          blinding: dstNewBlinding,
          commitment: result.dst_new_commitment,
        });

        setTransferComplete(true);
      } else if (srcOnChain && dstOnChain && effectiveAddress) {
        await executeOnChain(
          result,
          srcNewBlinding,
          dstNewBlinding,
          newSourceSlots,
          newDstSlots
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate proof');
    } finally {
      setLoading(false);
    }
  };

  const executeOnChain = async (
    result: TransferResult,
    srcNewBlinding: string,
    dstNewBlinding: string,
    newSourceSlots: InventorySlot[],
    newDstSlots: InventorySlot[]
  ) => {
    if (!srcOnChain || !dstOnChain || !effectiveAddress) return;

    try {
      const proofBytes = hexToBytes(result.proof);
      const srcNewCommitmentBytes = hexToBytes(result.src_new_commitment);
      const dstNewCommitmentBytes = hexToBytes(result.dst_new_commitment);

      let tx;
      if (hasDstCapacityLimit) {
        tx = buildTransferWithCapacityTx(
          packageId,
          srcOnChain.id,
          dstOnChain.id,
          volumeRegistryId,
          verifyingKeysId,
          proofBytes,
          srcNewCommitmentBytes,
          dstNewCommitmentBytes,
          itemId,
          BigInt(amount)
        );
      } else {
        tx = buildTransferTx(
          packageId,
          srcOnChain.id,
          dstOnChain.id,
          verifyingKeysId,
          proofBytes,
          srcNewCommitmentBytes,
          dstNewCommitmentBytes,
          itemId,
          BigInt(amount)
        );
      }

      let txResult;

      if (useLocalSigner && localAddress) {
        console.log('Using local signer for transfer:', localAddress);
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

      const effects = txResult.effects as { status?: { status: string; error?: string } } | undefined;
      if (effects?.status?.status === 'success') {
        setTxDigest(txResult.digest);
        setTransferComplete(true);

        const stored = JSON.parse(localStorage.getItem('inventory-blindings') || '{}');
        stored[srcOnChain.id] = {
          blinding: srcNewBlinding,
          slots: newSourceSlots,
        };
        stored[dstOnChain.id] = {
          blinding: dstNewBlinding,
          slots: newDstSlots,
        };
        localStorage.setItem('inventory-blindings', JSON.stringify(stored));

        setSrcLocalData({
          blinding: srcNewBlinding,
          slots: newSourceSlots,
        });
        setDstLocalData({
          blinding: dstNewBlinding,
          slots: newDstSlots,
        });
      } else {
        throw new Error('Transaction failed: ' + effects?.status?.error);
      }
    } catch (err) {
      console.error('On-chain transfer error:', err);
      setError(
        `Proof generated but on-chain transfer failed: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`
      );
    }
  };

  const resetDemo = async () => {
    setSource({
      slots: [
        { item_id: 1, quantity: 100 },
        { item_id: 2, quantity: 50 },
      ],
      blinding: '',
      commitment: null,
    });
    setDestination({
      slots: [{ item_id: 3, quantity: 25 }],
      blinding: '',
      commitment: null,
    });
    setProofResult(null);
    setError(null);
    setTransferComplete(false);
    setTxDigest(null);
  };

  const initialized = mode === 'demo'
    ? source.blinding && destination.blinding
    : srcLocalData?.blinding && dstLocalData?.blinding && srcOnChain && dstOnChain;

  return (
    <div className="col">
      <div className="mb-2">
        <h1>TRANSFER</h1>
        <p className="text-muted">
          Transfer items between two private inventories with ZK proofs.
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="btn-group mb-2">
        <button
          onClick={() => {
            setMode('demo');
            setProofResult(null);
            setTransferComplete(false);
            setTxDigest(null);
          }}
          className={`btn btn-secondary ${mode === 'demo' ? 'active' : ''}`}
        >
          [DEMO]
        </button>
        <button
          onClick={() => {
            setMode('onchain');
            setProofResult(null);
            setTransferComplete(false);
            setTxDigest(null);
          }}
          className={`btn btn-secondary ${mode === 'onchain' ? 'active' : ''}`}
        >
          [ON-CHAIN]
        </button>
      </div>

      {/* Two inventory panels */}
      <div className="grid grid-2">
        <div className="col">
          <div className="row-between mb-1">
            <span className="text-uppercase">SOURCE INVENTORY</span>
            <span className="badge">YOUR INVENTORY</span>
          </div>
          {mode === 'demo' ? (
            <InventoryCard
              title="Source"
              slots={source.slots}
              commitment={source.commitment}
              onSlotClick={(_, slot) => setItemId(slot.item_id)}
              selectedSlot={source.slots.findIndex((s) => s.item_id === itemId)}
            />
          ) : (
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
                    if (data?.slots.length) {
                      setItemId(data.slots[0].item_id);
                    }
                  }}
                  label="Source Inventory"
                />
              </div>
            </div>
          )}
        </div>

        <div className="col">
          <div className="row-between mb-1">
            <span className="text-uppercase">DESTINATION INVENTORY</span>
            <span className="badge">RECIPIENT</span>
          </div>
          {mode === 'demo' ? (
            <InventoryCard
              title="Destination"
              slots={destination.slots}
              commitment={destination.commitment}
            />
          ) : (
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
          )}
        </div>
      </div>

      {/* Transfer controls */}
      <div className="card">
        <div className="card-header">
          <div className="card-header-left"></div>
          <span className="card-title">TRANSFER ITEMS</span>
          <div className="card-header-right"></div>
        </div>
        <div className="card-body">
          {mode === 'demo' && (
            <div className="row-between mb-2">
              <span className="text-muted text-small">DEMO MODE</span>
              <button onClick={resetDemo} className="btn btn-secondary btn-small">
                [RESET]
              </button>
            </div>
          )}

          {mode === 'demo' && !initialized ? (
            <div className="text-center">
              <p className="text-muted mb-2">
                Initialize both inventories with blinding factors and commitments.
              </p>
              <button onClick={initializeBlindings} className="btn btn-primary">
                [INITIALIZE INVENTORIES]
              </button>
            </div>
          ) : mode === 'onchain' && !initialized ? (
            <div className="text-center text-muted">
              Select both source and destination inventories to transfer.
            </div>
          ) : (
            <div className="col">
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
                onClick={handleTransfer}
                disabled={
                  loading ||
                  !canTransfer ||
                  !canTransferWithCapacity ||
                  (mode === 'onchain' && srcOnChain?.id === dstOnChain?.id)
                }
                className="btn btn-primary"
                style={{ width: '100%' }}
              >
                {loading ? 'PROCESSING...' : `[${mode === 'onchain' ? 'TRANSFER ON-CHAIN' : 'TRANSFER'} ->]`}
              </button>
            </div>
          )}

          {!canTransfer && initialized && sourceItem && (
            <div className="alert alert-error mt-2">
              [!!] Insufficient balance: only have {sourceItem.quantity}
            </div>
          )}

          {!canTransferWithCapacity && initialized && canTransfer && (
            <div className="alert alert-error mt-2">
              [!!] Transfer would exceed destination inventory capacity!
            </div>
          )}

          {mode === 'onchain' && dstOnChain && dstMaxCapacity > 0 && (
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

      {/* Results */}
      {loading && <ProofLoading message="Generating transfer proof..." />}
      {error && <ProofError error={error} onRetry={handleTransfer} />}

      {proofResult && (
        <div className="col">
          {txDigest && (
            <div className="alert alert-success">
              <div>[OK] ON-CHAIN TRANSFER SUCCESSFUL</div>
              <div className="text-small mt-1">Transfer executed on Sui blockchain with ZK proof verification.</div>
              <code className="text-break text-small">{txDigest}</code>
            </div>
          )}

          {transferComplete && !txDigest && (
            <div className="alert alert-success">
              <div>[OK] TRANSFER COMPLETE!</div>
              <div className="text-small">
                {amount} {ITEM_NAMES[itemId] || `Item #${itemId}`} transferred from source to destination.
              </div>
            </div>
          )}

          <div className="grid grid-2">
            <div className="card-simple">
              <div className="text-small text-muted mb-1">SRC NEW COMMITMENT</div>
              <code className="text-break text-small">{proofResult.src_new_commitment}</code>
            </div>
            <div className="card-simple">
              <div className="text-small text-muted mb-1">DST NEW COMMITMENT</div>
              <code className="text-break text-small">{proofResult.dst_new_commitment}</code>
            </div>
          </div>

          <ProofResult
            result={proofResult}
            title="Transfer Proof"
            extra={
              <div className="text-small text-success">
                [OK] Proved valid transfer of <strong>{amount}</strong>{' '}
                <strong>{ITEM_NAMES[itemId] || `Item #${itemId}`}</strong> between inventories.
              </div>
            }
          />
        </div>
      )}

      {!loading && !proofResult && !error && initialized && (
        <div className="card">
          <div className="card-header">
            <div className="card-header-left"></div>
            <span className="card-title">WHAT GETS PROVEN</span>
            <div className="card-header-right"></div>
          </div>
          <div className="card-body">
            <div className="grid grid-2">
              <div>
                <div className="text-small text-muted mb-1">SOURCE</div>
                <div className="col text-small">
                  <div>[OK] Old commitment is valid</div>
                  <div>[OK] Has sufficient balance</div>
                  <div>[OK] New commitment = old - amount</div>
                </div>
              </div>
              <div>
                <div className="text-small text-muted mb-1">DESTINATION</div>
                <div className="col text-small">
                  <div>[OK] Old commitment is valid</div>
                  <div>[OK] New commitment = old + amount</div>
                  <div>[OK] Same item_id and amount</div>
                </div>
              </div>
            </div>
            {mode === 'onchain' && (
              <div className="mt-2 text-small text-muted" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                Both inventories' commitments will be updated on-chain after ZK proof verification.
                {hasDstCapacityLimit && (
                  <span className="text-accent"> Capacity-aware proof verifies destination doesn't exceed volume limit.</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
