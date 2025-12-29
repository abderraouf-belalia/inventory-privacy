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
        volumeRegistryId: '',
      },
    },
    testnet: {
      url: getFullnodeUrl('testnet'),
      variables: {
        packageId: '',
        verifyingKeysId: '',
        volumeRegistryId: '',
      },
    },
    localnet: {
      url: 'http://127.0.0.1:9000',
      variables: {
        packageId: '0x5d879e929226c4acb289a2c7feff5860b6ea065f557e351290fd335e0574c70a',
        verifyingKeysId: '0xa567f8548f05f39a9558438c58078082eb4023710a7728adc469dbcb7f4a09e4',
        volumeRegistryId: '0x0bd08c2fa6946520c6adf610e501251232fdd54864ba516a553bcc344f6daa3b',
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


