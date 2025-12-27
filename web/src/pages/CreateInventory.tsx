import { useState } from 'react';
import { useInventory } from '../hooks/useInventory';
import { InventoryCard } from '../components/InventoryCard';
import { CapacityBar } from '../components/CapacityBar';
import { ITEM_NAMES, MAX_ITEM_SLOTS, ITEM_VOLUMES, canDeposit } from '../types';

export function CreateInventory() {
  const {
    inventory,
    loading,
    error,
    generateBlinding,
    createCommitment,
    addSlot,
    removeSlot,
  } = useInventory();

  const [newItemId, setNewItemId] = useState(1);
  const [newQuantity, setNewQuantity] = useState(100);
  const [showAddForm, setShowAddForm] = useState(false);
  const [maxCapacity, setMaxCapacity] = useState(1000);

  const handleAddItem = () => {
    if (inventory.slots.length >= MAX_ITEM_SLOTS) {
      return;
    }
    if (maxCapacity > 0 && !canDeposit(inventory.slots, newItemId, newQuantity, maxCapacity)) {
      return; // Would exceed capacity
    }
    addSlot(newItemId, newQuantity);
    setShowAddForm(false);
  };

  const wouldExceedCapacity = maxCapacity > 0 && !canDeposit(inventory.slots, newItemId, newQuantity, maxCapacity);

  const handleGenerateAndCommit = async () => {
    await generateBlinding();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create Inventory</h1>
        <p className="text-gray-600 mt-1">
          Build your private inventory and generate a commitment.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Inventory builder */}
        <div className="space-y-4">
          {/* Capacity Configuration */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Capacity Settings</h2>
            <div>
              <label className="label">Max Capacity (0 = unlimited)</label>
              <input
                type="number"
                value={maxCapacity}
                onChange={(e) => setMaxCapacity(Number(e.target.value))}
                min={0}
                className="input"
                placeholder="Enter max volume capacity"
              />
              <p className="text-xs text-gray-500 mt-1">
                Each item has a volume. Total volume must not exceed capacity.
              </p>
            </div>
            <CapacityBar
              slots={inventory.slots}
              maxCapacity={maxCapacity}
              className="mt-4"
            />
          </div>

          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Add Items</h2>

            {showAddForm ? (
              <div className="space-y-4">
                <div>
                  <label className="label">Item Type</label>
                  <select
                    value={newItemId}
                    onChange={(e) => setNewItemId(Number(e.target.value))}
                    className="input"
                  >
                    {Object.entries(ITEM_NAMES).map(([id, name]) => (
                      <option key={id} value={id}>
                        {name} (#{id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">Quantity</label>
                  <input
                    type="number"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(Number(e.target.value))}
                    min={1}
                    className="input"
                  />
                </div>

                {/* Volume preview */}
                <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                  Volume: {ITEM_VOLUMES[newItemId] ?? 0} x {newQuantity} = {(ITEM_VOLUMES[newItemId] ?? 0) * newQuantity}
                </div>

                {wouldExceedCapacity && (
                  <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                    Adding this item would exceed capacity!
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleAddItem}
                    disabled={wouldExceedCapacity}
                    className={`flex-1 ${wouldExceedCapacity ? 'btn-secondary opacity-50 cursor-not-allowed' : 'btn-primary'}`}
                  >
                    Add Item
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddForm(true)}
                disabled={inventory.slots.length >= MAX_ITEM_SLOTS}
                className="btn-secondary w-full"
              >
                + Add Item ({inventory.slots.length}/{MAX_ITEM_SLOTS})
              </button>
            )}

            {inventory.slots.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-sm text-gray-600 mb-2">Current Items</div>
                <div className="space-y-2">
                  {inventory.slots.map((slot, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded"
                    >
                      <span className="text-sm">
                        {ITEM_NAMES[slot.item_id] || `Item #${slot.item_id}`}:{' '}
                        <strong>{slot.quantity}</strong>
                        <span className="text-gray-400 ml-2">
                          ({(ITEM_VOLUMES[slot.item_id] ?? 0) * slot.quantity} vol)
                        </span>
                      </span>
                      <button
                        onClick={() => removeSlot(i)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">
              Generate Commitment
            </h2>

            <div className="space-y-4">
              <button
                onClick={handleGenerateAndCommit}
                disabled={loading || inventory.slots.length === 0}
                className="btn-primary w-full"
              >
                {loading ? 'Generating...' : '1. Generate Blinding Factor'}
              </button>

              {inventory.blinding && (
                <button
                  onClick={createCommitment}
                  disabled={loading}
                  className="btn-success w-full"
                >
                  {loading ? 'Creating...' : '2. Create Commitment'}
                </button>
              )}
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Right: Preview */}
        <div className="space-y-4">
          <InventoryCard
            title="Your Private Inventory"
            slots={inventory.slots}
            commitment={inventory.commitment}
            blinding={inventory.blinding}
            showBlinding={true}
            onEmptyClick={
              inventory.slots.length < MAX_ITEM_SLOTS
                ? () => setShowAddForm(true)
                : undefined
            }
          />

          {inventory.commitment && (
            <div className="card bg-emerald-50 border-emerald-200">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-5 h-5 text-white"
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
                    Commitment Created!
                  </h3>
                  <p className="text-sm text-emerald-700 mt-1">
                    Your inventory is now private. Only the commitment hash would
                    be stored on-chain. Keep your blinding factor secret!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* What's public vs private */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3">
              Privacy Breakdown
            </h3>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <div className="w-5 h-5 bg-emerald-100 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg
                    className="w-3 h-3 text-emerald-600"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    On-chain (Public)
                  </div>
                  <div className="text-xs text-gray-600">
                    Only the 32-byte commitment hash
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <div className="w-5 h-5 bg-red-100 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg
                    className="w-3 h-3 text-red-600"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    Off-chain (Secret)
                  </div>
                  <div className="text-xs text-gray-600">
                    Inventory contents, quantities, blinding factor
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
