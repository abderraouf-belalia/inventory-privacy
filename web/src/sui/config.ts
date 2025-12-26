import { getFullnodeUrl } from '@mysten/sui/client';
import { createNetworkConfig } from '@mysten/dapp-kit';

// Network configuration
const { networkConfig, useNetworkVariable, useNetworkVariables } =
  createNetworkConfig({
    devnet: {
      url: getFullnodeUrl('devnet'),
      variables: {
        // These will be set after contract deployment
        packageId: '',
        verifyingKeysId: '',
      },
    },
    testnet: {
      url: getFullnodeUrl('testnet'),
      variables: {
        packageId: '',
        verifyingKeysId: '',
      },
    },
    localnet: {
      url: 'http://127.0.0.1:9000',
      variables: {
        packageId: '',
        verifyingKeysId: '',
      },
    },
  });

export { networkConfig, useNetworkVariable, useNetworkVariables };

// Contract module name
export const INVENTORY_MODULE = 'inventory';

// Helper to check if contracts are deployed
export function isContractDeployed(packageId: string): boolean {
  return packageId !== '' && packageId.startsWith('0x');
}
