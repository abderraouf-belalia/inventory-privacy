import { Link } from 'react-router-dom';

export function Home() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Inventory Privacy PoC
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Hidden on-chain inventory state with verifiable zero-knowledge operations.
          Prove what you have without revealing how much.
        </p>
      </div>

      {/* How it works */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">How It Works</h2>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="font-medium text-gray-900 mb-2">Hidden State</h3>
            <p className="text-sm text-gray-600">
              Your inventory is hashed into a commitment. Only you know the actual contents.
            </p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-medium text-gray-900 mb-2">Verifiable Proofs</h3>
            <p className="text-sm text-gray-600">
              Generate ZK proofs to verify statements about your inventory without revealing data.
            </p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <h3 className="font-medium text-gray-900 mb-2">State Transitions</h3>
            <p className="text-sm text-gray-600">
              Deposit, withdraw, and transfer items while proving the transition is valid.
            </p>
          </div>
        </div>
      </div>

      {/* Commitment diagram */}
      <div className="card bg-gray-900 text-gray-100">
        <h2 className="text-lg font-semibold mb-4">Commitment Scheme</h2>
        <pre className="text-sm overflow-x-auto">
{`commitment = Poseidon(
    slot0_item_id, slot0_quantity,
    slot1_item_id, slot1_quantity,
    ...
    blinding_factor
)

On-chain:  Only the 32-byte commitment is stored
Off-chain: You keep the inventory data + blinding factor secret`}
        </pre>
      </div>

      {/* Available proofs */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">What You Can Prove</h2>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-2">Item Existence</h3>
            <p className="text-sm text-gray-600 mb-2">
              "I have at least N of item X"
            </p>
            <code className="text-xs bg-gray-200 px-2 py-1 rounded">
              prove(inventory, item_id, min_qty)
            </code>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-2">Valid Withdrawal</h3>
            <p className="text-sm text-gray-600 mb-2">
              "I removed N of item X correctly"
            </p>
            <code className="text-xs bg-gray-200 px-2 py-1 rounded">
              prove(old_state → new_state)
            </code>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-2">Valid Deposit</h3>
            <p className="text-sm text-gray-600 mb-2">
              "I added N of item X correctly"
            </p>
            <code className="text-xs bg-gray-200 px-2 py-1 rounded">
              prove(old_state → new_state)
            </code>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-2">Valid Transfer</h3>
            <p className="text-sm text-gray-600 mb-2">
              "Items moved correctly between inventories"
            </p>
            <code className="text-xs bg-gray-200 px-2 py-1 rounded">
              prove(src_old, src_new, dst_old, dst_new)
            </code>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="flex justify-center gap-4">
        <Link to="/inventory" className="btn-primary">
          Create Inventory
        </Link>
        <Link to="/prove" className="btn-secondary">
          Try Proof Demo
        </Link>
      </div>
    </div>
  );
}
