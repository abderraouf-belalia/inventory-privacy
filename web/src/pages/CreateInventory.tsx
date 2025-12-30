import { useState } from 'react';
import { useInventory } from '../hooks/useInventory';
import { InventoryCard } from '../components/InventoryCard';
import { CapacityBar } from '../components/CapacityBar';
import { ITEM_NAMES, MAX_DISPLAY_ITEMS, ITEM_VOLUMES, canDeposit } from '../types';

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
    if (inventory.slots.length >= MAX_DISPLAY_ITEMS) {
      return;
    }
    if (maxCapacity > 0 && !canDeposit(inventory.slots, newItemId, newQuantity, maxCapacity)) {
      return;
    }
    addSlot(newItemId, newQuantity);
    setShowAddForm(false);
  };

  const wouldExceedCapacity = maxCapacity > 0 && !canDeposit(inventory.slots, newItemId, newQuantity, maxCapacity);

  const handleGenerateAndCommit = async () => {
    await generateBlinding();
  };

  return (
    <div className="col">
      <div className="mb-2">
        <h1>CREATE INVENTORY</h1>
        <p className="text-muted">
          Build your private inventory and generate a commitment.
        </p>
      </div>

      <div className="grid grid-2">
        {/* Left: Inventory builder */}
        <div className="col">
          {/* Capacity Configuration */}
          <div className="card">
            <div className="card-header">
              <div className="card-header-left"></div>
              <span className="card-title">CAPACITY</span>
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
                  placeholder="Enter max volume capacity"
                />
                <p className="text-small text-muted mt-1">
                  Each item has a volume. Total volume must not exceed capacity.
                </p>
              </div>
              <CapacityBar slots={inventory.slots} maxCapacity={maxCapacity} />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-header-left"></div>
              <span className="card-title">ADD ITEMS</span>
              <div className="card-header-right"></div>
            </div>
            <div className="card-body">
              {showAddForm ? (
                <div className="col">
                  <div className="input-group">
                    <label className="input-label">Item Type</label>
                    <select
                      value={newItemId}
                      onChange={(e) => setNewItemId(Number(e.target.value))}
                      className="select"
                    >
                      {Object.entries(ITEM_NAMES).map(([id, name]) => (
                        <option key={id} value={id}>
                          {name} (#{id})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="input-group">
                    <label className="input-label">Quantity</label>
                    <input
                      type="number"
                      value={newQuantity}
                      onChange={(e) => setNewQuantity(Number(e.target.value))}
                      min={1}
                      className="input"
                    />
                  </div>

                  <div className="badge">
                    Volume: {ITEM_VOLUMES[newItemId] ?? 0} x {newQuantity} = {(ITEM_VOLUMES[newItemId] ?? 0) * newQuantity}
                  </div>

                  {wouldExceedCapacity && (
                    <div className="alert alert-error">
                      [!!] Adding this item would exceed capacity!
                    </div>
                  )}

                  <div className="row">
                    <button
                      onClick={handleAddItem}
                      disabled={wouldExceedCapacity}
                      className="btn btn-primary"
                    >
                      [ADD]
                    </button>
                    <button
                      onClick={() => setShowAddForm(false)}
                      className="btn btn-secondary"
                    >
                      [CANCEL]
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddForm(true)}
                  disabled={inventory.slots.length >= MAX_DISPLAY_ITEMS}
                  className="btn btn-secondary"
                  style={{ width: '100%' }}
                >
                  [+] ADD ITEM ({inventory.slots.length})
                </button>
              )}

              {inventory.slots.length > 0 && (
                <div className="mt-2" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                  <div className="text-small text-muted mb-1">CURRENT ITEMS</div>
                  <div className="col">
                    {inventory.slots.map((slot, i) => (
                      <div key={i} className="row-between" style={{ background: 'var(--bg-secondary)', padding: '0.5rem 1ch' }}>
                        <span className="text-small">
                          {ITEM_NAMES[slot.item_id] || `Item #${slot.item_id}`}:{' '}
                          <span className="text-accent">{slot.quantity}</span>
                          <span className="text-muted"> ({(ITEM_VOLUMES[slot.item_id] ?? 0) * slot.quantity} vol)</span>
                        </span>
                        <button
                          onClick={() => removeSlot(i)}
                          className="btn btn-danger btn-small"
                        >
                          [X]
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-header-left"></div>
              <span className="card-title">COMMITMENT</span>
              <div className="card-header-right"></div>
            </div>
            <div className="card-body">
              <div className="col">
                <button
                  onClick={handleGenerateAndCommit}
                  disabled={loading || inventory.slots.length === 0}
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                >
                  {loading ? 'GENERATING...' : '[1] GENERATE BLINDING FACTOR'}
                </button>

                {inventory.blinding && (
                  <button
                    onClick={createCommitment}
                    disabled={loading}
                    className="btn btn-success"
                    style={{ width: '100%' }}
                  >
                    {loading ? 'CREATING...' : '[2] CREATE COMMITMENT'}
                  </button>
                )}
              </div>

              {error && (
                <div className="alert alert-error mt-2">
                  [ERR] {error}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="col">
          <InventoryCard
            title="Your Private Inventory"
            slots={inventory.slots}
            commitment={inventory.commitment}
            blinding={inventory.blinding}
            showBlinding={true}
            onEmptyClick={
              inventory.slots.length < MAX_DISPLAY_ITEMS
                ? () => setShowAddForm(true)
                : undefined
            }
          />

          {inventory.commitment && (
            <div className="alert alert-success">
              <div className="mb-1">[OK] COMMITMENT CREATED!</div>
              <div className="text-small">
                Your inventory is now private. Only the commitment hash would
                be stored on-chain. Keep your blinding factor secret!
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <div className="card-header-left"></div>
              <span className="card-title">PRIVACY BREAKDOWN</span>
              <div className="card-header-right"></div>
            </div>
            <div className="card-body">
              <table className="data-table">
                <tbody>
                  <tr>
                    <td className="table-key text-success">[PUBLIC]</td>
                    <td className="table-value">32-byte commitment hash only</td>
                  </tr>
                  <tr>
                    <td className="table-key text-error">[SECRET]</td>
                    <td className="table-value">Inventory contents, quantities, blinding factor</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
