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

  // Check if local signer is available
  const useLocalSigner = hasLocalSigner();
  const localAddress = useLocalSigner ? getLocalAddress() : null;
  const effectiveAddress = localAddress || account?.address;

  // Mode
  const [mode, setMode] = useState<Mode>('demo');

  // Demo mode state
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

  // On-chain mode state
  const [srcOnChain, setSrcOnChain] = useState<OnChainInventory | null>(null);
  const [srcLocalData, setSrcLocalData] = useState<LocalInventoryData | null>(null);
  const [dstOnChain, setDstOnChain] = useState<OnChainInventory | null>(null);
  const [dstLocalData, setDstLocalData] = useState<LocalInventoryData | null>(null);

  // Shared state
  const [itemId, setItemId] = useState(1);
  const [amount, setAmount] = useState(30);
  const [proofResult, setProofResult] = useState<TransferResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferComplete, setTransferComplete] = useState(false);
  const [txDigest, setTxDigest] = useState<string | null>(null);

  // Get current slots based on mode
  const currentSrcSlots = mode === 'demo' ? source.slots : srcLocalData?.slots || [];
  const currentDstSlots = mode === 'demo' ? destination.slots : dstLocalData?.slots || [];
  const currentSrcBlinding = mode === 'demo' ? source.blinding : srcLocalData?.blinding;
  const currentDstBlinding = mode === 'demo' ? destination.blinding : dstLocalData?.blinding;

  const sourceItem = currentSrcSlots.find((s) => s.item_id === itemId);
  const canTransfer = sourceItem && sourceItem.quantity >= amount;

  // Destination capacity tracking
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

      // Calculate new inventories
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
        // Use local signer - no wallet interaction needed!
        console.log('Using local signer for transfer:', localAddress);
        tx.setSender(localAddress);
        const localClient = getLocalnetClient();
        txResult = await signAndExecuteWithLocalSigner(tx, localClient);
      } else if (account) {
        // Use wallet for signing
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

        // Update local storage for both inventories
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

        // Update local state
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Transfer</h1>
        <p className="text-gray-600 mt-1">
          Transfer items between two private inventories with ZK proofs.
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="flex rounded-lg bg-gray-100 p-1 w-fit">
        <button
          onClick={() => {
            setMode('demo');
            setProofResult(null);
            setTransferComplete(false);
            setTxDigest(null);
          }}
          className={`py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            mode === 'demo'
              ? 'bg-white shadow text-gray-900'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Demo Mode
        </button>
        <button
          onClick={() => {
            setMode('onchain');
            setProofResult(null);
            setTransferComplete(false);
            setTxDigest(null);
          }}
          className={`py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            mode === 'onchain'
              ? 'bg-white shadow text-gray-900'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          On-Chain
        </button>
      </div>

      {/* Two inventory panels */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-gray-900">Source Inventory</h2>
            <span className="text-xs text-gray-500">Your inventory</span>
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
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-gray-900">Destination Inventory</h2>
            <span className="text-xs text-gray-500">Recipient</span>
          </div>
          {mode === 'demo' ? (
            <InventoryCard
              title="Destination"
              slots={destination.slots}
              commitment={destination.commitment}
            />
          ) : (
            <div className="card">
              <OnChainInventorySelector
                selectedInventory={dstOnChain}
                onSelect={(inv, data) => {
                  setDstOnChain(inv);
                  setDstLocalData(data);
                }}
                label="Destination Inventory"
              />
              {srcOnChain && dstOnChain && srcOnChain.id === dstOnChain.id && (
                <p className="text-sm text-amber-600 mt-2">
                  Source and destination cannot be the same inventory.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Transfer controls */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Transfer Items</h2>
          {mode === 'demo' && (
            <button
              onClick={resetDemo}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Reset Demo
            </button>
          )}
        </div>

        {mode === 'demo' && !initialized ? (
          <div className="text-center py-6">
            <p className="text-gray-600 mb-4">
              Initialize both inventories with blinding factors and commitments.
            </p>
            <button onClick={initializeBlindings} className="btn-primary">
              Initialize Inventories
            </button>
          </div>
        ) : mode === 'onchain' && !initialized ? (
          <div className="text-center py-6 text-gray-600">
            Select both source and destination inventories to transfer.
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[150px]">
              <label className="label">Item to Transfer</label>
              <select
                value={itemId}
                onChange={(e) => setItemId(Number(e.target.value))}
                className="input"
                disabled={currentSrcSlots.length === 0}
              >
                {currentSrcSlots.length === 0 ? (
                  <option>No items available</option>
                ) : (
                  currentSrcSlots.map((slot) => (
                    <option key={slot.item_id} value={slot.item_id}>
                      {ITEM_NAMES[slot.item_id] || `Item #${slot.item_id}`} ({slot.quantity}{' '}
                      available)
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="w-32">
              <label className="label">Amount</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                min={1}
                max={sourceItem?.quantity || 1}
                className="input"
              />
              {hasDstCapacityLimit && (
                <p className="text-xs mt-1 text-gray-500">
                  Volume: {ITEM_VOLUMES[itemId] ?? 0} × {amount} = {(ITEM_VOLUMES[itemId] ?? 0) * amount}
                </p>
              )}
            </div>

            <button
              onClick={handleTransfer}
              disabled={
                loading ||
                !canTransfer ||
                !canTransferWithCapacity ||
                (mode === 'onchain' && srcOnChain?.id === dstOnChain?.id)
              }
              className="btn-primary"
            >
              {loading ? (
                'Processing...'
              ) : (
                <>
                  {mode === 'onchain' ? 'Transfer On-Chain' : 'Transfer'}{' '}
                  <svg
                    className="w-4 h-4 inline ml-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </>
              )}
            </button>
          </div>
        )}

        {!canTransfer && initialized && sourceItem && (
          <p className="text-sm text-red-600 mt-2">
            Insufficient balance: only have {sourceItem.quantity}
          </p>
        )}

        {!canTransferWithCapacity && initialized && canTransfer && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            Transfer would exceed destination inventory capacity!
          </div>
        )}

        {/* Destination capacity info for on-chain mode */}
        {mode === 'onchain' && dstOnChain && dstMaxCapacity > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs text-gray-500 font-medium">Destination Capacity</div>
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

      {/* Results */}
      {loading && <ProofLoading message="Generating transfer proof..." />}

      {error && <ProofError error={error} onRetry={handleTransfer} />}

      {proofResult && (
        <div className="space-y-4">
          {/* On-chain success */}
          {txDigest && (
            <div className="card bg-emerald-50 border-emerald-200">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-emerald-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="font-semibold text-emerald-800">
                  On-Chain Transfer Successful
                </span>
              </div>
              <p className="text-sm mt-2 text-gray-600">
                Transfer executed on Sui blockchain with ZK proof verification.
              </p>
              <code className="block text-xs bg-emerald-100 rounded p-2 mt-2 break-all">
                {txDigest}
              </code>
            </div>
          )}

          {transferComplete && !txDigest && (
            <div className="card bg-emerald-50 border-emerald-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-emerald-800">
                    Transfer Complete!
                  </h3>
                  <p className="text-sm text-emerald-700">
                    {amount} {ITEM_NAMES[itemId] || `Item #${itemId}`} transferred
                    from source to destination.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="card">
              <h3 className="font-medium text-gray-900 mb-2">
                Source New Commitment
              </h3>
              <code className="block text-xs bg-gray-100 rounded p-2 break-all">
                {proofResult.src_new_commitment}
              </code>
            </div>
            <div className="card">
              <h3 className="font-medium text-gray-900 mb-2">
                Destination New Commitment
              </h3>
              <code className="block text-xs bg-gray-100 rounded p-2 break-all">
                {proofResult.dst_new_commitment}
              </code>
            </div>
          </div>

          <ProofResult
            result={proofResult}
            title="Transfer Proof"
            extra={
              <div className="text-sm text-emerald-700">
                Proved valid transfer of <strong>{amount}</strong>{' '}
                <strong>{ITEM_NAMES[itemId] || `Item #${itemId}`}</strong> between
                inventories. Both old and new states are verified.
              </div>
            }
          />
        </div>
      )}

      {/* Info when not started */}
      {!loading && !proofResult && !error && initialized && (
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-3">
            Transfer Proof Verifies
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Source</h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>Old commitment is valid</li>
                <li>Has sufficient balance</li>
                <li>New commitment = old - amount</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Destination
              </h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>Old commitment is valid</li>
                <li>New commitment = old + amount</li>
                <li>Same item_id and amount</li>
              </ul>
            </div>
          </div>
          {mode === 'onchain' && (
            <div className="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-600">
              Both inventories&apos; commitments will be updated on-chain after ZK proof verification.
              {hasDstCapacityLimit && (
                <span className="block mt-1 text-primary-600">
                  Capacity-aware proof will verify destination doesn&apos;t exceed its volume limit.
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
