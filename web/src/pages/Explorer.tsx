import { useState, useCallback } from 'react';
import { useContractAddresses } from '../sui/ContractConfig';
import { useAllInventories, useInventoryEventSubscription, type OnChainInventory } from '../sui/hooks';

export function Explorer() {
  const { packageId } = useContractAddresses();
  const { data: inventories, isLoading, refetch, dataUpdatedAt } = useAllInventories(packageId);
  const [liveInventories, setLiveInventories] = useState<OnChainInventory[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Handle new inventory from WebSocket
  const handleNewInventory = useCallback((inventory: OnChainInventory) => {
    setLiveInventories((prev) => {
      // Avoid duplicates
      if (prev.some((inv) => inv.id === inventory.id)) {
        return prev;
      }
      return [inventory, ...prev];
    });
  }, []);

  // Subscribe to real-time events
  useInventoryEventSubscription(
    isSubscribed ? packageId : '',
    handleNewInventory
  );

  const isConfigured = packageId.startsWith('0x');
  const allInventories = [...liveInventories, ...(inventories || [])];

  // Deduplicate by id
  const uniqueInventories = allInventories.filter(
    (inv, index, self) => index === self.findIndex((i) => i.id === inv.id)
  );

  const lastUpdated = dataUpdatedAt
    ? Math.round((Date.now() - dataUpdatedAt) / 1000)
    : null;

  return (
    <div className="col">
      <div className="mb-2">
        <h1>ON-CHAIN EXPLORER</h1>
        <p className="text-muted">
          View all inventory commitments on the Sui blockchain in real-time.
        </p>
      </div>

      {!isConfigured ? (
        <div className="card">
          <div className="card-header">
            <div className="card-header-left"></div>
            <span className="card-title">NOT CONFIGURED</span>
            <div className="card-header-right"></div>
          </div>
          <div className="card-body text-center">
            <p className="text-muted mb-2">
              Configure contract addresses on the On-Chain page to view commitments.
            </p>
            <a href="/on-chain" className="btn btn-primary">
              [CONFIGURE CONTRACTS]
            </a>
          </div>
        </div>
      ) : (
        <>
          {/* Controls */}
          <div className="card">
            <div className="card-header">
              <div className="card-header-left"></div>
              <span className="card-title">EXPLORER CONTROLS</span>
              <div className="card-header-right"></div>
            </div>
            <div className="card-body">
              <div className="row-between">
                <div className="row">
                  <span className="badge badge-info">
                    {uniqueInventories.length} INVENTORIES
                  </span>
                  {lastUpdated !== null && (
                    <span className="text-muted text-small">
                      Last updated: {lastUpdated}s ago
                    </span>
                  )}
                  {liveInventories.length > 0 && (
                    <span className="badge badge-success">
                      +{liveInventories.length} LIVE
                    </span>
                  )}
                </div>
                <div className="row">
                  <button
                    onClick={() => {
                      setLiveInventories([]);
                      refetch();
                    }}
                    className="btn btn-secondary btn-small"
                    disabled={isLoading}
                  >
                    {isLoading ? '[LOADING...]' : '[REFRESH]'}
                  </button>
                  <button
                    onClick={() => setIsSubscribed(!isSubscribed)}
                    className={`btn btn-small ${isSubscribed ? 'btn-success' : 'btn-secondary'}`}
                  >
                    {isSubscribed ? '[LIVE: ON]' : '[LIVE: OFF]'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Info Panel */}
          <div className="card">
            <div className="card-header">
              <div className="card-header-left"></div>
              <span className="card-title">WHAT YOU SEE</span>
              <div className="card-header-right"></div>
            </div>
            <div className="card-body">
              <div className="grid grid-2">
                <div>
                  <div className="text-small text-muted mb-1">PUBLIC DATA</div>
                  <div className="text-small">
                    - Object ID (unique identifier)<br />
                    - Commitment (32-byte Poseidon hash)<br />
                    - Owner address<br />
                    - Nonce (state counter)<br />
                    - Max capacity
                  </div>
                </div>
                <div>
                  <div className="text-small text-muted mb-1">HIDDEN DATA</div>
                  <div className="text-small">
                    - Actual item types<br />
                    - Item quantities<br />
                    - Blinding factor<br />
                    - Total inventory value
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Commitment List */}
          <div className="card">
            <div className="card-header">
              <div className="card-header-left"></div>
              <span className="card-title">ALL COMMITMENTS</span>
              <div className="card-header-right"></div>
            </div>
            <div className="card-body">
              {isLoading && uniqueInventories.length === 0 ? (
                <div className="text-center text-muted">
                  Loading inventories...
                </div>
              ) : uniqueInventories.length === 0 ? (
                <div className="text-center text-muted">
                  No inventories found. Create one on the On-Chain page.
                </div>
              ) : (
                <div className="col">
                  {uniqueInventories.map((inv, index) => (
                    <CommitmentCard
                      key={inv.id}
                      inventory={inv}
                      index={uniqueInventories.length - index}
                      isNew={liveInventories.some((live) => live.id === inv.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CommitmentCard({
  inventory,
  index,
  isNew,
}: {
  inventory: OnChainInventory;
  index: number;
  isNew: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="card-simple"
      style={{
        padding: '0.5rem 1ch',
        borderColor: isNew ? 'var(--success)' : undefined,
        background: isNew ? 'rgba(0, 207, 0, 0.05)' : undefined,
      }}
    >
      <div
        className="row-between"
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer' }}
      >
        <div className="row">
          <span className="badge badge-info">#{index}</span>
          {isNew && <span className="badge badge-success">NEW</span>}
          <div>
            <div className="text-small">
              {inventory.id.slice(0, 10)}...{inventory.id.slice(-8)}
            </div>
            <div className="text-small text-muted">
              Owner: {inventory.owner.slice(0, 8)}...
            </div>
          </div>
        </div>
        <div className="row">
          <span className="badge">Nonce: {inventory.nonce}</span>
          <span className="text-muted">{expanded ? '[-]' : '[+]'}</span>
        </div>
      </div>

      {expanded && (
        <div
          className="mt-2"
          style={{ borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}
        >
          <div className="onchain-panel">
            <div className="onchain-header">RAW BLOCKCHAIN DATA</div>
            <div className="onchain-body">
              <div className="onchain-field">
                <div className="onchain-field-name">object_id:</div>
                <div className="onchain-field-value">{inventory.id}</div>
                <div className="onchain-field-desc">Unique identifier on Sui</div>
              </div>

              <div className="onchain-field">
                <div className="onchain-field-name">commitment:</div>
                <div className="onchain-field-value" style={{ wordBreak: 'break-all' }}>
                  {inventory.commitment}
                </div>
                <div className="onchain-field-desc">
                  Poseidon hash binding inventory contents + blinding factor
                </div>
              </div>

              <div className="onchain-field">
                <div className="onchain-field-name">owner:</div>
                <div className="onchain-field-value">{inventory.owner}</div>
                <div className="onchain-field-desc">Sui address that controls this inventory</div>
              </div>

              <div className="onchain-field">
                <div className="onchain-field-name">nonce:</div>
                <div className="onchain-field-value">{inventory.nonce}</div>
                <div className="onchain-field-desc">
                  Increments on each state change (replay protection)
                </div>
              </div>

              <div className="onchain-field">
                <div className="onchain-field-name">max_capacity:</div>
                <div className="onchain-field-value">
                  {inventory.maxCapacity || 'Unlimited'}
                </div>
                <div className="onchain-field-desc">Maximum volume this inventory can hold</div>
              </div>
            </div>
            <div className="onchain-footer">
              Items and quantities are NEVER on-chain. Only the commitment is public.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
