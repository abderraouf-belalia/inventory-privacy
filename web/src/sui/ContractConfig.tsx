import { useState, useEffect } from 'react';
import { useSuiClientContext } from '@mysten/dapp-kit';

// Store contract addresses in localStorage per network
const STORAGE_KEY = 'inventory-privacy-contracts';

interface ContractAddresses {
  packageId: string;
  verifyingKeysId: string;
}

type NetworkAddresses = Record<string, ContractAddresses>;

function loadAddresses(): NetworkAddresses {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveAddresses(addresses: NetworkAddresses) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses));
}

export function useContractAddresses(): ContractAddresses {
  const { network } = useSuiClientContext();
  const [addresses, setAddresses] = useState<NetworkAddresses>(loadAddresses);

  useEffect(() => {
    const handleStorage = () => setAddresses(loadAddresses());
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return addresses[network] || { packageId: '', verifyingKeysId: '' };
}

export function ContractConfigPanel() {
  const { network } = useSuiClientContext();
  const [addresses, setAddresses] = useState<NetworkAddresses>(loadAddresses);
  const [packageId, setPackageId] = useState('');
  const [verifyingKeysId, setVerifyingKeysId] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const current = addresses[network] || { packageId: '', verifyingKeysId: '' };
    setPackageId(current.packageId);
    setVerifyingKeysId(current.verifyingKeysId);
  }, [network, addresses]);

  const handleSave = () => {
    const newAddresses = {
      ...addresses,
      [network]: { packageId, verifyingKeysId },
    };
    setAddresses(newAddresses);
    saveAddresses(newAddresses);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    // Trigger storage event for other components
    window.dispatchEvent(new Event('storage'));
  };

  const isConfigured = packageId.startsWith('0x') && verifyingKeysId.startsWith('0x');

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Contract Configuration</h2>
        <span
          className={`text-xs px-2 py-1 rounded-full ${
            isConfigured
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-amber-100 text-amber-700'
          }`}
        >
          {isConfigured ? 'Configured' : 'Not Configured'}
        </span>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Enter the contract addresses after deploying to {network}. These are saved
        locally in your browser.
      </p>

      <div className="space-y-4">
        <div>
          <label className="label">Package ID</label>
          <input
            type="text"
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            placeholder="0x..."
            className="input font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            The published package ID from `sui client publish`
          </p>
        </div>

        <div>
          <label className="label">Verifying Keys Object ID</label>
          <input
            type="text"
            value={verifyingKeysId}
            onChange={(e) => setVerifyingKeysId(e.target.value)}
            placeholder="0x..."
            className="input font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            The VerifyingKeys shared object created during initialization
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={!packageId || !verifyingKeysId}
          className="btn-primary w-full"
        >
          {saved ? 'Saved!' : 'Save Configuration'}
        </button>
      </div>

      {!isConfigured && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <h4 className="text-sm font-medium text-amber-800 mb-2">
            How to Deploy
          </h4>
          <ol className="text-xs text-amber-700 space-y-1 list-decimal list-inside">
            <li>
              Build the package: <code>cd packages/inventory && sui move build</code>
            </li>
            <li>
              Publish: <code>sui client publish --gas-budget 100000000</code>
            </li>
            <li>Copy the Package ID from the output</li>
            <li>Initialize verifying keys (requires exporting VKs from prover)</li>
            <li>Copy the VerifyingKeys object ID</li>
          </ol>
        </div>
      )}
    </div>
  );
}
