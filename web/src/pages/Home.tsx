import { Link } from 'react-router-dom';

export function Home() {
  return (
    <div className="col">
      {/* Hero */}
      <div className="text-center my-2">
        <h1 className="mb-1">INVENTORY PRIVACY POC</h1>
        <p className="text-muted">
          Hidden on-chain inventory state with verifiable zero-knowledge operations.
          Prove what you have without revealing how much.
        </p>
      </div>

      {/* How it works */}
      <div className="card">
        <div className="card-header">
          <div className="card-header-left"></div>
          <span className="card-title">HOW IT WORKS</span>
          <div className="card-header-right"></div>
        </div>
        <div className="card-body">
          <div className="grid grid-3">
            <div className="card-simple text-center">
              <div className="text-accent mb-1">[1]</div>
              <div className="mb-1">HIDDEN STATE</div>
              <div className="text-muted text-small">
                Your inventory is hashed into a commitment. Only you know the actual contents.
              </div>
            </div>

            <div className="card-simple text-center">
              <div className="text-accent mb-1">[2]</div>
              <div className="mb-1">VERIFIABLE PROOFS</div>
              <div className="text-muted text-small">
                Generate ZK proofs to verify statements about your inventory without revealing data.
              </div>
            </div>

            <div className="card-simple text-center">
              <div className="text-accent mb-1">[3]</div>
              <div className="mb-1">STATE TRANSITIONS</div>
              <div className="text-muted text-small">
                Deposit, withdraw, and transfer items while proving the transition is valid.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Commitment diagram */}
      <div className="card">
        <div className="card-header">
          <div className="card-header-left"></div>
          <span className="card-title">COMMITMENT SCHEME</span>
          <div className="card-header-right"></div>
        </div>
        <div className="card-body">
          <pre style={{ background: 'var(--bg-secondary)', padding: '1rem', overflow: 'auto' }}>
{`commitment = Poseidon(
    slot0_item_id, slot0_quantity,
    slot1_item_id, slot1_quantity,
    ...
    blinding_factor
)

ON-CHAIN:  Only the 32-byte commitment is stored
OFF-CHAIN: You keep the inventory data + blinding factor secret`}
          </pre>
        </div>
      </div>

      {/* Available proofs */}
      <div className="card">
        <div className="card-header">
          <div className="card-header-left"></div>
          <span className="card-title">WHAT YOU CAN PROVE</span>
          <div className="card-header-right"></div>
        </div>
        <div className="card-body">
          <div className="grid grid-2">
            <div className="card-simple">
              <div className="text-accent mb-1">ITEM EXISTENCE</div>
              <div className="text-small text-muted mb-1">
                "I have at least N of item X"
              </div>
              <code className="badge">prove(inventory, item_id, min_qty)</code>
            </div>

            <div className="card-simple">
              <div className="text-accent mb-1">VALID WITHDRAWAL</div>
              <div className="text-small text-muted mb-1">
                "I removed N of item X correctly"
              </div>
              <code className="badge">prove(old_state -&gt; new_state)</code>
            </div>

            <div className="card-simple">
              <div className="text-accent mb-1">VALID DEPOSIT</div>
              <div className="text-small text-muted mb-1">
                "I added N of item X correctly"
              </div>
              <code className="badge">prove(old_state -&gt; new_state)</code>
            </div>

            <div className="card-simple">
              <div className="text-accent mb-1">VALID TRANSFER</div>
              <div className="text-small text-muted mb-1">
                "Items moved correctly between inventories"
              </div>
              <code className="badge">prove(src_old, src_new, dst_old, dst_new)</code>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="row" style={{ justifyContent: 'center' }}>
        <Link to="/inventory" className="btn btn-primary">
          [CREATE INVENTORY]
        </Link>
        <Link to="/prove" className="btn btn-secondary">
          [TRY PROOF DEMO]
        </Link>
      </div>
    </div>
  );
}
