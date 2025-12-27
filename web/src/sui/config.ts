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
        packageId: '0xa24d2ddd5bd492d6e9348770e919fa636c8c2fd9b0186b306f53c76a28e61e7b',
        verifyingKeysId: '0x5d86082720db0bd8e8d738ec1ec191669957dbb4896c5e59472bbce6cf2f863d',
        volumeRegistryId: '0xd8a00282b9fbfc2250d649e6544a3f1465cc2d75200e13a122dc23da643692de',
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
