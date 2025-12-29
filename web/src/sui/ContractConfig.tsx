import { useState, useEffect, useCallback } from 'react';
import { useSuiClientContext } from '@mysten/dapp-kit';
import { useNetworkVariables } from './config';

const STORAGE_KEY = 'inventory-privacy-contracts';

interface ContractAddresses {
  packageId: string;
  verifyingKeysId: string;
  volumeRegistryId: string;
}

interface DeploymentJson {
  network: string;
  packageId: string;
  verifyingKeysId: string;
  volumeRegistryId: string;
  timestamp: string;
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

// Fetch deployment.json from public folder (auto-updated by deploy script)
async function fetchDeployment(): Promise<DeploymentJson | null> {
  try {
    const res = await fetch('/deployment.json?t=' + Date.now()); // cache bust
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function useContractAddresses(): ContractAddresses {
  const { network } = useSuiClientContext();
  const configVars = useNetworkVariables();
  const [addresses, setAddresses] = useState<NetworkAddresses>(loadAddresses);
  const [deployment, setDeployment] = useState<DeploymentJson | null>(null);

  // Fetch deployment.json on mount and periodically
  useEffect(() => {
    const load = async () => {
      const dep = await fetchDeployment();
      if (dep) setDeployment(dep);
    };
    load();

    // Re-fetch every 5 seconds to pick up new deployments
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleStorage = () => setAddresses(loadAddresses());
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const stored = addresses[network] || { packageId: '', verifyingKeysId: '', volumeRegistryId: '' };

  // For localnet, prefer deployment.json over everything else
  if (network === 'localnet' && deployment?.network === 'localnet') {
    return {
      packageId: deployment.packageId || stored.packageId || configVars.packageId || '',
      verifyingKeysId: deployment.verifyingKeysId || stored.verifyingKeysId || configVars.verifyingKeysId || '',
      volumeRegistryId: deployment.volumeRegistryId || stored.volumeRegistryId || configVars.volumeRegistryId || '',
    };
  }

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
  const [deployment, setDeployment] = useState<DeploymentJson | null>(null);
  const [packageId, setPackageId] = useState('');
  const [verifyingKeysId, setVerifyingKeysId] = useState('');
  const [volumeRegistryId, setVolumeRegistryId] = useState('');
  const [saved, setSaved] = useState(false);
  const [autoLoaded, setAutoLoaded] = useState(false);

  // Fetch deployment.json
  const loadDeployment = useCallback(async () => {
    const dep = await fetchDeployment();
    if (dep) {
      setDeployment(dep);
      // Auto-apply for localnet
      if (network === 'localnet' && dep.network === 'localnet') {
        setPackageId(dep.packageId || '');
        setVerifyingKeysId(dep.verifyingKeysId || '');
        setVolumeRegistryId(dep.volumeRegistryId || '');
        setAutoLoaded(true);
        setTimeout(() => setAutoLoaded(false), 2000);
      }
    }
  }, [network]);

  useEffect(() => {
    loadDeployment();
  }, [loadDeployment]);

  useEffect(() => {
    const storedAddresses = loadAddresses();
    const stored = storedAddresses[network] || { packageId: '', verifyingKeysId: '', volumeRegistryId: '' };

    // For non-localnet or if no deployment.json, use stored/config values
    if (network !== 'localnet' || !deployment) {
      setPackageId(stored.packageId || configVars.packageId || '');
      setVerifyingKeysId(stored.verifyingKeysId || configVars.verifyingKeysId || '');
      setVolumeRegistryId(stored.volumeRegistryId || configVars.volumeRegistryId || '');
    }
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
  const isLocalnet = network === 'localnet';

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

        {isLocalnet && deployment && (
          <div className="alert alert-success mb-2">
            <div className="text-small">
              [AUTO] Loaded from deployment.json ({deployment.timestamp})
            </div>
          </div>
        )}

        {autoLoaded && (
          <div className="alert alert-success mb-2">
            <div className="text-small">[OK] Config auto-updated from new deployment!</div>
          </div>
        )}

        <p className="text-small text-muted mb-2">
          {isLocalnet
            ? 'Auto-loaded from deployment.json. Run `npm run deploy` to update.'
            : `Enter contract addresses after deploying to ${network}. Saved locally in browser.`}
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
              readOnly={isLocalnet && !!deployment}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Verifying Keys Object ID</label>
            <input
              type="text"
              value={verifyingKeysId}
              onChange={(e) => setVerifyingKeysId(e.target.value)}
              placeholder="0x..."
              className="input"
              readOnly={isLocalnet && !!deployment}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Volume Registry Object ID</label>
            <input
              type="text"
              value={volumeRegistryId}
              onChange={(e) => setVolumeRegistryId(e.target.value)}
              placeholder="0x..."
              className="input"
              readOnly={isLocalnet && !!deployment}
            />
          </div>

          {isLocalnet ? (
            <button
              onClick={loadDeployment}
              className="btn btn-secondary"
              style={{ width: '100%' }}
            >
              [REFRESH FROM DEPLOYMENT.JSON]
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={!packageId || !verifyingKeysId}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              {saved ? '[SAVED]' : '[SAVE CONFIG]'}
            </button>
          )}
        </div>

        {!isConfigured && !isLocalnet && (
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

        {!isConfigured && isLocalnet && (
          <div className="alert alert-warning mt-2">
            <div className="text-small">
              Run `npm run deploy` (or deploy in mprocs) to deploy contracts.
              Config will auto-update.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
