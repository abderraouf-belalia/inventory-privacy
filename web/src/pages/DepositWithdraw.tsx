import { useState } from 'react';
import {
  useCurrentAccount,
  useSignTransaction,
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
import { buildWithdrawTx, buildDepositTx, hexToBytes } from '../sui/transactions';
import { ITEM_NAMES } from '../types';
import * as api from '../api/client';
import type { DepositResult, WithdrawResult } from '../types';
import type { OnChainInventory } from '../sui/hooks';

type Operation = 'deposit' | 'withdraw';
type Mode = 'demo' | 'onchain';

export function DepositWithdraw() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { packageId, verifyingKeysId } = useContractAddresses();
  const { mutateAsync: signTransaction } = useSignTransaction();

  // Demo mode state
  const { inventory, generateBlinding, setSlots, setBlinding } = useInventory([
    { item_id: 1, quantity: 100 },
    { item_id: 2, quantity: 50 },
  ]);

  // On-chain mode state
  const [mode, setMode] = useState<Mode>('demo');
  const [selectedOnChainInventory, setSelectedOnChainInventory] =
    useState<OnChainInventory | null>(null);
  const [localData, setLocalData] = useState<LocalInventoryData | null>(null);

  // Shared state
  const [operation, setOperation] = useState<Operation>('withdraw');
  const [itemId, setItemId] = useState(1);
  const [amount, setAmount] = useState(30);
  const [proofResult, setProofResult] = useState<DepositResult | WithdrawResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newInventory, setNewInventory] = useState<typeof inventory.slots | null>(null);
  const [txDigest, setTxDigest] = useState<string | null>(null);

  // Get current slots based on mode
  const currentSlots = mode === 'demo' ? inventory.slots : localData?.slots || [];
  const currentBlinding = mode === 'demo' ? inventory.blinding : localData?.blinding;

  const selectedItem = currentSlots.find((s) => s.item_id === itemId);
  const canWithdraw = selectedItem && selectedItem.quantity >= amount;

  const handleInventorySelect = (
    inv: OnChainInventory | null,
    data: LocalInventoryData | null
  ) => {
    setSelectedOnChainInventory(inv);
    setLocalData(data);
    setProofResult(null);
    setNewInventory(null);
    setTxDigest(null);
    if (data?.slots.length) {
      setItemId(data.slots[0].item_id);
    }
  };

  const handleOperation = async () => {
    if (!currentBlinding) {
      setError('No blinding factor available');
      return;
    }

    setLoading(true);
    setError(null);
    setProofResult(null);
    setNewInventory(null);
    setTxDigest(null);

    try {
      const newBlinding = await api.generateBlinding();

      let result: DepositResult | WithdrawResult;
      let updatedSlots: typeof currentSlots;

      if (operation === 'withdraw') {
        result = await api.proveWithdraw(
          currentSlots,
          currentBlinding,
          newBlinding,
          itemId,
          amount
        );

        // Calculate new inventory
        updatedSlots = currentSlots
          .map((s) =>
            s.item_id === itemId ? { ...s, quantity: s.quantity - amount } : s
          )
          .filter((s) => s.quantity > 0);
      } else {
        result = await api.proveDeposit(
          currentSlots,
          currentBlinding,
          newBlinding,
          itemId,
          amount
        );

        // Calculate new inventory
        const existingIndex = currentSlots.findIndex((s) => s.item_id === itemId);
        if (existingIndex >= 0) {
          updatedSlots = currentSlots.map((s) =>
            s.item_id === itemId ? { ...s, quantity: s.quantity + amount } : s
          );
        } else {
          updatedSlots = [...currentSlots, { item_id: itemId, quantity: amount }];
        }
      }

      setProofResult(result);
      setNewInventory(updatedSlots);

      // If on-chain mode, execute on-chain
      if (mode === 'onchain' && selectedOnChainInventory && account) {
        await executeOnChain(result, newBlinding, updatedSlots);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate proof');
    } finally {
      setLoading(false);
    }
  };

  const executeOnChain = async (
    result: DepositResult | WithdrawResult,
    newBlinding: string,
    updatedSlots: typeof currentSlots
  ) => {
    if (!selectedOnChainInventory || !account) return;

    try {
      const proofBytes = hexToBytes(result.proof);
      const newCommitmentBytes = hexToBytes(result.new_commitment);

      const tx =
        operation === 'withdraw'
          ? buildWithdrawTx(
              packageId,
              selectedOnChainInventory.id,
              verifyingKeysId,
              proofBytes,
              newCommitmentBytes,
              itemId,
              BigInt(amount)
            )
          : buildDepositTx(
              packageId,
              selectedOnChainInventory.id,
              verifyingKeysId,
              proofBytes,
              newCommitmentBytes,
              itemId,
              BigInt(amount)
            );

      tx.setSender(account.address);

      const signedTx = await signTransaction({
        transaction: tx as Parameters<typeof signTransaction>[0]['transaction'],
      });

      // Execute using the app's SuiClient
      const txResult = await client.executeTransactionBlock({
        transactionBlock: signedTx.bytes,
        signature: signedTx.signature,
        options: { showEffects: true },
      });

      if (txResult.effects?.status?.status === 'success') {
        setTxDigest(txResult.digest);

        // Update local storage with new inventory state
        const stored = JSON.parse(localStorage.getItem('inventory-blindings') || '{}');
        stored[selectedOnChainInventory.id] = {
          blinding: newBlinding,
          slots: updatedSlots,
        };
        localStorage.setItem('inventory-blindings', JSON.stringify(stored));

        // Update local state
        setLocalData({
          blinding: newBlinding,
          slots: updatedSlots,
        });
      } else {
        throw new Error('Transaction failed: ' + txResult.effects?.status?.error);
      }
    } catch (err) {
      console.error('On-chain execution error:', err);
      setError(
        `Proof generated but on-chain execution failed: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`
      );
    }
  };

  const loadSampleInventory = async () => {
    setSlots([
      { item_id: 1, quantity: 100 },
      { item_id: 2, quantity: 50 },
    ]);
    await generateBlinding();
    setProofResult(null);
    setNewInventory(null);
    setTxDigest(null);
  };

  const applyChanges = async () => {
    if (newInventory && proofResult) {
      setSlots(newInventory);
      const newBlinding = await api.generateBlinding();
      setBlinding(newBlinding);
      setProofResult(null);
      setNewInventory(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Deposit / Withdraw</h1>
        <p className="text-gray-600 mt-1">
          Prove valid state transitions when adding or removing items.
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="flex rounded-lg bg-gray-100 p-1 w-fit">
        <button
          onClick={() => {
            setMode('demo');
            setProofResult(null);
            setNewInventory(null);
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
            setNewInventory(null);
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
                  Reset Sample
                </button>
              </div>

              <InventoryCard
                title=""
                slots={inventory.slots}
                commitment={inventory.commitment}
                blinding={inventory.blinding}
                showBlinding={false}
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
            <h2 className="font-semibold text-gray-900 mb-4">Operation</h2>

            <div className="space-y-4">
              {/* Operation toggle */}
              <div className="flex rounded-lg bg-gray-100 p-1">
                <button
                  onClick={() => setOperation('withdraw')}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    operation === 'withdraw'
                      ? 'bg-white shadow text-gray-900'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Withdraw
                </button>
                <button
                  onClick={() => setOperation('deposit')}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    operation === 'deposit'
                      ? 'bg-white shadow text-gray-900'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Deposit
                </button>
              </div>

              <div>
                <label className="label">Item</label>
                <select
                  value={itemId}
                  onChange={(e) => setItemId(Number(e.target.value))}
                  className="input"
                >
                  {operation === 'withdraw' ? (
                    currentSlots.length === 0 ? (
                      <option>No items available</option>
                    ) : (
                      currentSlots.map((slot) => (
                        <option key={slot.item_id} value={slot.item_id}>
                          {ITEM_NAMES[slot.item_id] || `Item #${slot.item_id}`}{' '}
                          (have {slot.quantity})
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

              <div>
                <label className="label">Amount</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  min={1}
                  className="input"
                />
                {operation === 'withdraw' && selectedItem && (
                  <p
                    className={`text-xs mt-1 ${
                      canWithdraw ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {canWithdraw
                      ? `Withdrawing ${amount} of ${selectedItem.quantity}`
                      : `Insufficient balance (have ${selectedItem.quantity})`}
                  </p>
                )}
              </div>

              <button
                onClick={handleOperation}
                disabled={
                  loading ||
                  !currentBlinding ||
                  (operation === 'withdraw' && !canWithdraw)
                }
                className={operation === 'withdraw' ? 'btn-danger w-full' : 'btn-success w-full'}
              >
                {loading
                  ? 'Processing...'
                  : mode === 'onchain'
                  ? `${operation === 'withdraw' ? 'Withdraw' : 'Deposit'} On-Chain`
                  : operation === 'withdraw'
                  ? `Withdraw ${amount}`
                  : `Deposit ${amount}`}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Results */}
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
                  On-Chain {operation === 'withdraw' ? 'Withdrawal' : 'Deposit'} Successful
                </span>
              </div>
              <p className="text-sm mt-2 text-gray-600">
                Transaction executed on Sui blockchain.
              </p>
              <code className="block text-xs bg-emerald-100 rounded p-2 mt-2 break-all">
                {txDigest}
              </code>
            </div>
          )}

          {/* State transition preview */}
          {(newInventory || proofResult) && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-4">
                State Transition
              </h3>

              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-xs text-gray-500 mb-1">Before</div>
                  <div className="p-2 bg-gray-50 rounded text-sm">
                    {currentSlots
                      .map(
                        (s) =>
                          `${ITEM_NAMES[s.item_id] || `#${s.item_id}`}: ${s.quantity}`
                      )
                      .join(', ') || 'Empty'}
                  </div>
                </div>

                <svg
                  className="w-6 h-6 text-gray-400 flex-shrink-0"
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

                <div className="flex-1">
                  <div className="text-xs text-gray-500 mb-1">After</div>
                  <div className="p-2 bg-emerald-50 rounded text-sm">
                    {newInventory
                      ?.map(
                        (s) =>
                          `${ITEM_NAMES[s.item_id] || `#${s.item_id}`}: ${s.quantity}`
                      )
                      .join(', ') || 'Empty'}
                  </div>
                </div>
              </div>

              {proofResult && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="text-xs text-gray-500 mb-1">
                    New Commitment
                  </div>
                  <code className="block text-xs bg-gray-100 rounded p-2 break-all">
                    {proofResult.new_commitment}
                  </code>
                </div>
              )}

              {mode === 'demo' && proofResult && (
                <button
                  onClick={applyChanges}
                  className="btn-primary w-full mt-4"
                >
                  Apply Changes & Continue
                </button>
              )}
            </div>
          )}

          {/* Results */}
          {loading && (
            <ProofLoading
              message={`${mode === 'onchain' ? 'Executing' : 'Generating'} ${operation} ${
                mode === 'onchain' ? 'on-chain' : 'proof'
              }...`}
            />
          )}

          {error && <ProofError error={error} onRetry={handleOperation} />}

          {proofResult && (
            <ProofResult
              result={proofResult}
              title={`${operation === 'withdraw' ? 'Withdrawal' : 'Deposit'} Proof`}
              extra={
                <div className="text-sm text-emerald-700">
                  Proved valid {operation} of{' '}
                  <strong>{amount}</strong>{' '}
                  <strong>
                    {ITEM_NAMES[itemId] || `Item #${itemId}`}
                  </strong>
                  . Old and new commitments are publicly linked.
                </div>
              }
            />
          )}

          {/* Info */}
          {!loading && !proofResult && !error && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-3">
                What Gets Proven
              </h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <svg
                    className="w-4 h-4 text-emerald-500 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Old commitment matches your claimed inventory</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg
                    className="w-4 h-4 text-emerald-500 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>
                    {operation === 'withdraw'
                      ? 'Sufficient balance exists for withdrawal'
                      : 'New item was added correctly'}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <svg
                    className="w-4 h-4 text-emerald-500 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>New commitment is correctly computed</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg
                    className="w-4 h-4 text-emerald-500 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>No other items were modified</span>
                </li>
                {mode === 'onchain' && (
                  <li className="flex items-start gap-2">
                    <svg
                      className="w-4 h-4 text-emerald-500 mt-0.5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>Commitment is updated on-chain via ZK proof verification</span>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
