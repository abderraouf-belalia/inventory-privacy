import { useState } from 'react';
import {
  useCurrentAccount,
  useSuiClient,
} from '@mysten/dapp-kit';
import { useInventory } from '../hooks/useInventory';
import { InventoryCard } from '../components/InventoryCard';
import { ProofResult, ProofLoading, ProofError } from '../components/ProofResult';
import {
  OnChainInventorySelector,
  type LocalInventoryData,
} from '../components/OnChainInventorySelector';
import { useContractAddresses } from '../sui/ContractConfig';
import { buildVerifyItemExistsTx, hexToBytes } from '../sui/transactions';
import { ITEM_NAMES } from '../types';
import * as api from '../api/client';
import type { ProofResult as ProofResultType } from '../types';
import type { OnChainInventory } from '../sui/hooks';

type Mode = 'demo' | 'onchain';

export function ProveOwnership() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { packageId, verifyingKeysId } = useContractAddresses();

  // Demo mode state
  const { inventory, generateBlinding, setSlots } = useInventory([
    { item_id: 1, quantity: 100 },
    { item_id: 2, quantity: 50 },
  ]);

  // On-chain mode state
  const [mode, setMode] = useState<Mode>('demo');
  const [selectedOnChainInventory, setSelectedOnChainInventory] =
    useState<OnChainInventory | null>(null);
  const [localData, setLocalData] = useState<LocalInventoryData | null>(null);

  // Shared state
  const [selectedItemId, setSelectedItemId] = useState(1);
  const [minQuantity, setMinQuantity] = useState(50);
  const [proofResult, setProofResult] = useState<ProofResultType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onChainVerified, setOnChainVerified] = useState<boolean | null>(null);

  // Get current slots based on mode
  const currentSlots = mode === 'demo' ? inventory.slots : localData?.slots || [];
  const currentBlinding = mode === 'demo' ? inventory.blinding : localData?.blinding;

  const selectedItem = currentSlots.find((s) => s.item_id === selectedItemId);
  const canProve = selectedItem && selectedItem.quantity >= minQuantity && currentBlinding;

  const handleInventorySelect = (
    inv: OnChainInventory | null,
    data: LocalInventoryData | null
  ) => {
    setSelectedOnChainInventory(inv);
    setLocalData(data);
    setProofResult(null);
    setOnChainVerified(null);
    if (data?.slots.length) {
      setSelectedItemId(data.slots[0].item_id);
    }
  };

  const handleProve = async () => {
    if (!currentBlinding) {
      setError('No blinding factor available');
      return;
    }

    setLoading(true);
    setError(null);
    setProofResult(null);
    setOnChainVerified(null);

    try {
      // Generate proof via proof server
      const result = await api.proveItemExists(
        currentSlots,
        currentBlinding,
        selectedItemId,
        minQuantity
      );
      setProofResult(result);

      // If on-chain mode, verify on-chain
      if (mode === 'onchain' && selectedOnChainInventory && account) {
        await verifyOnChain(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate proof');
    } finally {
      setLoading(false);
    }
  };

  const verifyOnChain = async (result: ProofResultType) => {
    if (!selectedOnChainInventory || !account) return;

    try {
      const proofBytes = hexToBytes(result.proof);
      const tx = buildVerifyItemExistsTx(
        packageId,
        selectedOnChainInventory.id,
        verifyingKeysId,
        proofBytes,
        selectedItemId,
        BigInt(minQuantity)
      );

      // Use dev-inspect to verify without executing (read-only check)
      // No wallet signature needed - dev-inspect simulates the transaction
      const devInspectResult = await client.devInspectTransactionBlock({
        transactionBlock: tx as unknown as Parameters<typeof client.devInspectTransactionBlock>[0]['transactionBlock'],
        sender: account.address,
      });

      // Check if verification returned true
      const returnValues = devInspectResult.results?.[0]?.returnValues;
      if (returnValues && returnValues.length > 0) {
        // The bool is returned as the last value
        const boolResult = returnValues[returnValues.length - 1];
        // boolResult[0] is the bytes, [1] is true for bool type
        const verified = boolResult[0][0] === 1;
        setOnChainVerified(verified);
      }
    } catch (err) {
      console.error('On-chain verification error:', err);
      setError(
        `Proof generated but on-chain verification failed: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`
      );
    }
  };

  const loadSampleInventory = async () => {
    setSlots([
      { item_id: 1, quantity: 100 },
      { item_id: 2, quantity: 50 },
      { item_id: 3, quantity: 10 },
    ]);
    await generateBlinding();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Prove Ownership</h1>
        <p className="text-gray-600 mt-1">
          Prove you have at least N items without revealing your actual quantity.
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="flex rounded-lg bg-gray-100 p-1 w-fit">
        <button
          onClick={() => {
            setMode('demo');
            setProofResult(null);
            setOnChainVerified(null);
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
            setOnChainVerified(null);
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

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Configuration */}
        <div className="space-y-4">
          {mode === 'demo' ? (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Demo Inventory</h2>
                <button
                  onClick={loadSampleInventory}
                  className="text-sm text-primary-600 hover:text-primary-800"
                >
                  Load Sample
                </button>
              </div>

              <InventoryCard
                title=""
                slots={inventory.slots}
                commitment={null}
                onSlotClick={(_, slot) => setSelectedItemId(slot.item_id)}
                selectedSlot={inventory.slots.findIndex(
                  (s) => s.item_id === selectedItemId
                )}
              />

              {!inventory.blinding && (
                <button
                  onClick={generateBlinding}
                  className="btn-primary w-full mt-4"
                >
                  Generate Blinding Factor
                </button>
              )}
            </div>
          ) : (
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">
                On-Chain Inventory
              </h2>
              <OnChainInventorySelector
                selectedInventory={selectedOnChainInventory}
                onSelect={handleInventorySelect}
              />
            </div>
          )}

          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Proof Parameters</h2>

            <div className="space-y-4">
              <div>
                <label className="label">Item to Prove</label>
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(Number(e.target.value))}
                  className="input"
                  disabled={currentSlots.length === 0}
                >
                  {currentSlots.length === 0 ? (
                    <option>No items available</option>
                  ) : (
                    currentSlots.map((slot) => (
                      <option key={slot.item_id} value={slot.item_id}>
                        {ITEM_NAMES[slot.item_id] || `Item #${slot.item_id}`} (you
                        have {slot.quantity})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="label">Minimum Quantity to Prove</label>
                <input
                  type="number"
                  value={minQuantity}
                  onChange={(e) => setMinQuantity(Number(e.target.value))}
                  min={1}
                  className="input"
                />
                {selectedItem && (
                  <p
                    className={`text-xs mt-1 ${
                      selectedItem.quantity >= minQuantity
                        ? 'text-emerald-600'
                        : 'text-red-600'
                    }`}
                  >
                    {selectedItem.quantity >= minQuantity
                      ? `You have ${selectedItem.quantity}, proof will succeed`
                      : `You only have ${selectedItem.quantity}, proof will fail`}
                  </p>
                )}
              </div>

              <button
                onClick={handleProve}
                disabled={loading || !canProve}
                className="btn-primary w-full"
              >
                {loading
                  ? 'Generating Proof...'
                  : mode === 'onchain'
                  ? 'Generate & Verify On-Chain'
                  : 'Generate Proof'}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Results */}
        <div className="space-y-4">
          {/* What will be proven */}
          <div className="card bg-primary-50 border-primary-200">
            <h3 className="font-semibold text-primary-800 mb-2">
              What This Proves
            </h3>
            <p className="text-sm text-primary-700">
              "I have at least{' '}
              <strong className="text-primary-900">{minQuantity}</strong> of{' '}
              <strong className="text-primary-900">
                {ITEM_NAMES[selectedItemId] || `Item #${selectedItemId}`}
              </strong>
              "
            </p>
            <div className="mt-3 pt-3 border-t border-primary-200">
              <div className="text-xs text-primary-600">
                <strong>Revealed:</strong> commitment, item_id, min_quantity
              </div>
              <div className="text-xs text-primary-600">
                <strong>Hidden:</strong> actual quantity ({selectedItem?.quantity}
                ), other items, blinding factor
              </div>
            </div>
          </div>

          {/* On-chain verification result */}
          {onChainVerified !== null && (
            <div
              className={`card ${
                onChainVerified
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {onChainVerified ? (
                  <>
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
                      On-Chain Verification Passed
                    </span>
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5 text-red-600"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="font-semibold text-red-800">
                      On-Chain Verification Failed
                    </span>
                  </>
                )}
              </div>
              <p className="text-sm mt-2 text-gray-600">
                {onChainVerified
                  ? 'The ZK proof was verified on Sui blockchain using Groth16 verification.'
                  : 'The proof did not pass on-chain verification.'}
              </p>
            </div>
          )}

          {/* Results */}
          {loading && <ProofLoading message="Generating item existence proof..." />}

          {error && <ProofError error={error} onRetry={handleProve} />}

          {proofResult && (
            <ProofResult
              result={proofResult}
              title="Ownership Proof Generated"
              extra={
                <div className="text-sm text-emerald-700">
                  Successfully proved ownership of{' '}
                  <strong>
                    {ITEM_NAMES[selectedItemId] || `Item #${selectedItemId}`}
                  </strong>{' '}
                  without revealing you have{' '}
                  <strong>{selectedItem?.quantity}</strong> (only proved{' '}
                  <strong>{minQuantity}</strong>).
                </div>
              }
            />
          )}

          {/* How it works */}
          {!loading && !proofResult && !error && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-3">How It Works</h3>
              <ol className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="bg-gray-200 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">
                    1
                  </span>
                  <span>
                    The circuit computes your inventory commitment and verifies
                    it matches
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-gray-200 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">
                    2
                  </span>
                  <span>
                    It checks that the specified item exists with quantity{' '}
                    {'>'}{' '}= minimum
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-gray-200 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">
                    3
                  </span>
                  <span>
                    A Groth16 proof is generated proving both constraints
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-gray-200 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">
                    4
                  </span>
                  <span>
                    {mode === 'onchain'
                      ? 'The proof is verified on Sui blockchain'
                      : 'Anyone can verify the proof without learning actual quantities'}
                  </span>
                </li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
