interface OnChainInventoryData {
  objectId: string;
  commitment: string;
  nonce: number;
  maxCapacity: number;
  owner: string;
}

interface OnChainDataPanelProps {
  data: OnChainInventoryData | null;
  loading?: boolean;
}

export function OnChainDataPanel({ data, loading }: OnChainDataPanelProps) {
  if (loading) {
    return (
      <div className="onchain-panel">
        <div className="onchain-header">RAW SUI BLOCKCHAIN DATA</div>
        <div className="onchain-body">
          <span className="loading">LOADING</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="onchain-panel">
        <div className="onchain-header">RAW SUI BLOCKCHAIN DATA</div>
        <div className="onchain-body text-muted">
          No inventory selected
        </div>
      </div>
    );
  }

  return (
    <div className="onchain-panel">
      <div className="onchain-header">RAW SUI BLOCKCHAIN DATA</div>
      <div className="onchain-body">
        <div className="onchain-field">
          <div className="onchain-field-name">object_id:</div>
          <div className="onchain-field-value">{data.objectId}</div>
          <div className="onchain-field-desc">
            Unique identifier for this inventory object on Sui.
          </div>
        </div>

        <div className="onchain-field">
          <div className="onchain-field-name">commitment:</div>
          <div className="onchain-field-value">{data.commitment}</div>
          <div className="onchain-field-desc">
            Poseidon hash of inventory contents + blinding factor.
            Commits to items without revealing them.
          </div>
        </div>

        <div className="onchain-field">
          <div className="onchain-field-name">nonce:</div>
          <div className="onchain-field-value">{data.nonce}</div>
          <div className="onchain-field-desc">
            Increments with each state change.
            Prevents replay attacks on proofs.
          </div>
        </div>

        <div className="onchain-field">
          <div className="onchain-field-name">max_capacity:</div>
          <div className="onchain-field-value">{data.maxCapacity}</div>
          <div className="onchain-field-desc">
            Maximum volume units this inventory can hold.
            Enforced by ZK capacity proofs.
          </div>
        </div>

        <div className="onchain-field">
          <div className="onchain-field-name">owner:</div>
          <div className="onchain-field-value">{data.owner}</div>
          <div className="onchain-field-desc">
            Sui address that owns this object.
          </div>
        </div>
      </div>

      <div className="onchain-footer">
        <div style={{ marginBottom: '0.5rem' }}>WHY IS CONTENT HIDDEN?</div>
        <div>
          Items and quantities are NEVER stored on-chain.
          Only the cryptographic commitment is public.
          ZK proofs verify claims without revealing inventory contents.
        </div>
      </div>
    </div>
  );
}
