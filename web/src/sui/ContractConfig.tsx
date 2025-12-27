import { useState, useEffect } from 'react';
import { useSuiClientContext } from '@mysten/dapp-kit';
import { useNetworkVariables } from './config';

const STORAGE_KEY = 'inventory-privacy-contracts';

interface ContractAddresses {
  packageId: string;
  verifyingKeysId: string;
  volumeRegistryId: string;
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
  const configVars = useNetworkVariables();
  const [addresses, setAddresses] = useState<NetworkAddresses>(loadAddresses);

  useEffect(() => {
    const handleStorage = () => setAddresses(loadAddresses());
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const stored = addresses[network] || { packageId: '', verifyingKeysId: '', volumeRegistryId: '' };

  return {
    packageId: stored.packageId || configVars.packageId || '',
    verifyingKeysId: stored.verifyingKeysId || configVars.verifyingKeysId || '',
    volumeRegistryId: stored.volumeRegistryId || configVars.volumeRegistryId || '',
  };
}

export function ContractConfigPanel() {
  const { network } = useSuiClientContext();
  const configVars = useNetworkVariables();
  const [addresses, setAddresses] = useState<NetworkAddresses>(loadAddresses);
  const [packageId, setPackageId] = useState('');
  const [verifyingKeysId, setVerifyingKeysId] = useState('');
  const [volumeRegistryId, setVolumeRegistryId] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const storedAddresses = loadAddresses();
    const stored = storedAddresses[network] || { packageId: '', verifyingKeysId: '', volumeRegistryId: '' };
    setPackageId(stored.packageId || configVars.packageId || '');
    setVerifyingKeysId(stored.verifyingKeysId || configVars.verifyingKeysId || '');
    setVolumeRegistryId(stored.volumeRegistryId || configVars.volumeRegistryId || '');
    setAddresses(storedAddresses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network]);

  const handleSave = () => {
    const newAddresses = {
      ...addresses,
      [network]: { packageId, verifyingKeysId, volumeRegistryId },
    };
    setAddresses(newAddresses);
    saveAddresses(newAddresses);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    window.dispatchEvent(new Event('storage'));
  };

  const isConfigured = packageId.startsWith('0x') && verifyingKeysId.startsWith('0x');

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-left"></div>
        <span className="card-title">CONTRACT CONFIG</span>
        <div className="card-header-right"></div>
      </div>
      <div className="card-body">
        <div className="row-between mb-2">
          <span className="text-small text-muted">STATUS</span>
          <span className={`badge ${isConfigured ? 'badge-success' : 'badge-warning'}`}>
            {isConfigured ? '[CONFIGURED]' : '[NOT CONFIGURED]'}
          </span>
        </div>

        <p className="text-small text-muted mb-2">
          Enter contract addresses after deploying to {network}. Saved locally in browser.
        </p>

        <div className="col">
          <div className="input-group">
            <label className="input-label">Package ID</label>
            <input
              type="text"
              value={packageId}
              onChange={(e) => setPackageId(e.target.value)}
              placeholder="0x..."
              className="input"
            />
            <p className="text-small text-muted">Published package ID from `sui client publish`</p>
          </div>

          <div className="input-group">
            <label className="input-label">Verifying Keys Object ID</label>
            <input
              type="text"
              value={verifyingKeysId}
              onChange={(e) => setVerifyingKeysId(e.target.value)}
              placeholder="0x..."
              className="input"
            />
            <p className="text-small text-muted">VerifyingKeys shared object from init</p>
          </div>

          <div className="input-group">
            <label className="input-label">Volume Registry Object ID (optional)</label>
            <input
              type="text"
              value={volumeRegistryId}
              onChange={(e) => setVolumeRegistryId(e.target.value)}
              placeholder="0x..."
              className="input"
            />
            <p className="text-small text-muted">Required for capacity-aware operations</p>
          </div>

          <button
            onClick={handleSave}
            disabled={!packageId || !verifyingKeysId}
            className="btn btn-primary"
            style={{ width: '100%' }}
          >
            {saved ? '[SAVED]' : '[SAVE CONFIG]'}
          </button>
        </div>

        {!isConfigured && (
          <div className="alert alert-warning mt-2">
            <div className="mb-1">HOW TO DEPLOY:</div>
            <div className="text-small">
              1. Build: `cd packages/inventory && sui move build`<br/>
              2. Publish: `sui client publish --gas-budget 100000000`<br/>
              3. Copy Package ID from output<br/>
              4. Initialize verifying keys (export VKs from prover)<br/>
              5. Copy VerifyingKeys object ID
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
