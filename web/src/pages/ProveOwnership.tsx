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
import { ITEM_NAMES, calculateUsedVolume } from '../types';
import * as api from '../api/client';
import type { ProofResult as ProofResultType } from '../types';
import type { OnChainInventory } from '../sui/hooks';

type Mode = 'demo' | 'onchain';

export function ProveOwnership() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { packageId, verifyingKeysId } = useContractAddresses();

  const { inventory, generateBlinding, setSlots } = useInventory([
    { item_id: 1, quantity: 100 },
    { item_id: 2, quantity: 50 },
  ]);

  const [mode, setMode] = useState<Mode>('demo');
  const [selectedOnChainInventory, setSelectedOnChainInventory] =
    useState<OnChainInventory | null>(null);
  const [localData, setLocalData] = useState<LocalInventoryData | null>(null);

  const [selectedItemId, setSelectedItemId] = useState(1);
  const [minQuantity, setMinQuantity] = useState(50);
  const [proofResult, setProofResult] = useState<ProofResultType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onChainVerified, setOnChainVerified] = useState<boolean | null>(null);
  const [proofTimeMs, setProofTimeMs] = useState<number | null>(null);
  const [verifyTimeMs, setVerifyTimeMs] = useState<number | null>(null);

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
    setProofTimeMs(null);
    setVerifyTimeMs(null);

    try {
      const currentVolume = calculateUsedVolume(currentSlots);
      const proofStart = performance.now();
      const result = await api.proveItemExists(
        currentSlots,
        currentVolume,
        currentBlinding!,
        selectedItemId,
        minQuantity
      );
      const proofEnd = performance.now();
      setProofTimeMs(Math.round(proofEnd - proofStart));
      setProofResult(result);

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

    const verifyStart = performance.now();
    try {
      const proofBytes = hexToBytes(result.proof);
      const signalHashBytes = hexToBytes(result.public_inputs[0]);
      const tx = buildVerifyItemExistsTx(
        packageId,
        selectedOnChainInventory.id,
        verifyingKeysId,
        proofBytes,
        signalHashBytes
      );

      const devInspectResult = await client.devInspectTransactionBlock({
        transactionBlock: tx as unknown as Parameters<typeof client.devInspectTransactionBlock>[0]['transactionBlock'],
        sender: account.address,
      });

      const verifyEnd = performance.now();
      setVerifyTimeMs(Math.round(verifyEnd - verifyStart));

      const returnValues = devInspectResult.results?.[0]?.returnValues;
      if (returnValues && returnValues.length > 0) {
        const boolResult = returnValues[returnValues.length - 1];
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
    <div className="col">
      <div className="mb-2">
        <h1>PROVE OWNERSHIP</h1>
        <p className="text-muted">
          Prove you have at least N items without revealing your actual quantity.
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="btn-group mb-2">
        <button
          onClick={() => {
            setMode('demo');
            setProofResult(null);
            setOnChainVerified(null);
          }}
          className={`btn btn-secondary ${mode === 'demo' ? 'active' : ''}`}
        >
          [DEMO]
        </button>
        <button
          onClick={() => {
            setMode('onchain');
            setProofResult(null);
            setOnChainVerified(null);
          }}
          className={`btn btn-secondary ${mode === 'onchain' ? 'active' : ''}`}
        >
          [ON-CHAIN]
        </button>
      </div>

      <div className="grid grid-2">
        {/* Left: Configuration */}
        <div className="col">
          {mode === 'demo' ? (
            <div className="card">
              <div className="card-header">
                <div className="card-header-left"></div>
                <span className="card-title">DEMO INVENTORY</span>
                <div className="card-header-right"></div>
              </div>
              <div className="card-body">
                <div className="row-between mb-2">
                  <span className="text-small text-muted">SAMPLE DATA</span>
                  <button onClick={loadSampleInventory} className="btn btn-secondary btn-small">
                    [LOAD]
                  </button>
                </div>

                <InventoryCard
                  title=""
                  slots={inventory.slots}
                  commitment={null}
                  onSlotClick={(_, slot) => setSelectedItemId(slot.item_id)}
                  selectedSlot={inventory.slots.findIndex((s) => s.item_id === selectedItemId)}
                />

                {!inventory.blinding && (
                  <button onClick={generateBlinding} className="btn btn-primary mt-2" style={{ width: '100%' }}>
                    [GENERATE BLINDING]
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-header">
                <div className="card-header-left"></div>
                <span className="card-title">ON-CHAIN INVENTORY</span>
                <div className="card-header-right"></div>
              </div>
              <div className="card-body">
                <OnChainInventorySelector
                  selectedInventory={selectedOnChainInventory}
                  onSelect={handleInventorySelect}
                />
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <div className="card-header-left"></div>
              <span className="card-title">PROOF PARAMETERS</span>
              <div className="card-header-right"></div>
            </div>
            <div className="card-body">
              <div className="input-group">
                <label className="input-label">Item to Prove</label>
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(Number(e.target.value))}
                  className="select"
                  disabled={currentSlots.length === 0}
                >
                  {currentSlots.length === 0 ? (
                    <option>No items available</option>
                  ) : (
                    currentSlots.map((slot) => (
                      <option key={slot.item_id} value={slot.item_id}>
                        {ITEM_NAMES[slot.item_id] || `Item #${slot.item_id}`} (you have {slot.quantity})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="input-group">
                <label className="input-label">Minimum Quantity to Prove</label>
                <input
                  type="number"
                  value={minQuantity}
                  onChange={(e) => setMinQuantity(Number(e.target.value))}
                  min={1}
                  className="input"
                />
                {selectedItem && (
                  <p className={`text-small mt-1 ${selectedItem.quantity >= minQuantity ? 'text-success' : 'text-error'}`}>
                    {selectedItem.quantity >= minQuantity
                      ? `[OK] You have ${selectedItem.quantity}, proof will succeed`
                      : `[!!] You only have ${selectedItem.quantity}, proof will fail`}
                  </p>
                )}
              </div>

              <button
                onClick={handleProve}
                disabled={loading || !canProve}
                className="btn btn-primary"
                style={{ width: '100%' }}
              >
                {loading
                  ? 'GENERATING...'
                  : mode === 'onchain'
                  ? '[PROVE & VERIFY ON-CHAIN]'
                  : '[GENERATE PROOF]'}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Results */}
        <div className="col">
          {/* What will be proven */}
          <div className="card-simple" style={{ background: 'var(--accent-subdued)' }}>
            <div className="text-accent mb-1">WHAT THIS PROVES</div>
            <p className="text-small">
              "I have at least <strong>{minQuantity}</strong> of{' '}
              <strong>{ITEM_NAMES[selectedItemId] || `Item #${selectedItemId}`}</strong>"
            </p>
            <div className="divider"></div>
            <div className="text-small text-muted">
              <div>REVEALED: commitment, item_id, min_quantity</div>
              <div>HIDDEN: actual qty ({selectedItem?.quantity}), other items, blinding</div>
            </div>
          </div>

          {/* On-chain verification result */}
          {onChainVerified !== null && (
            <div className={`alert ${onChainVerified ? 'alert-success' : 'alert-error'}`}>
              {onChainVerified ? (
                <>
                  <div className="row-between">
                    <span>[OK] ON-CHAIN VERIFICATION PASSED</span>
                    {(proofTimeMs !== null || verifyTimeMs !== null) && (
                      <span className="text-small">
                        {proofTimeMs !== null && <span className="badge">{proofTimeMs}ms proof</span>}
                        {verifyTimeMs !== null && <span className="badge" style={{ marginLeft: '0.5ch' }}>{verifyTimeMs}ms verify</span>}
                      </span>
                    )}
                  </div>
                  <div className="text-small">The ZK proof was verified on Sui blockchain using Groth16 verification.</div>
                </>
              ) : (
                <>
                  <div>[!!] ON-CHAIN VERIFICATION FAILED</div>
                  <div className="text-small">The proof did not pass on-chain verification.</div>
                </>
              )}
            </div>
          )}

          {loading && <ProofLoading message="Generating item existence proof..." />}
          {error && <ProofError error={error} onRetry={handleProve} />}

          {proofResult && (
            <ProofResult
              result={proofResult}
              title="Ownership Proof Generated"
              extra={
                <div className="row-between">
                  <span className="text-small text-success">
                    [OK] Proved ownership of{' '}
                    <strong>{ITEM_NAMES[selectedItemId] || `Item #${selectedItemId}`}</strong>{' '}
                    without revealing you have <strong>{selectedItem?.quantity}</strong>.
                  </span>
                  {proofTimeMs !== null && <span className="badge">{proofTimeMs}ms</span>}
                </div>
              }
            />
          )}

          {!loading && !proofResult && !error && (
            <div className="card">
              <div className="card-header">
                <div className="card-header-left"></div>
                <span className="card-title">HOW IT WORKS</span>
                <div className="card-header-right"></div>
              </div>
              <div className="card-body">
                <div className="col">
                  <div className="text-small">[1] Circuit computes inventory commitment and verifies it matches</div>
                  <div className="text-small">[2] Checks that specified item exists with qty {'>'}{' '}= minimum</div>
                  <div className="text-small">[3] Groth16 proof is generated proving both constraints</div>
                  <div className="text-small">[4] {mode === 'onchain' ? 'Proof is verified on Sui blockchain' : 'Anyone can verify without learning actual quantities'}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
