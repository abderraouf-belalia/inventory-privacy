import { useSuiClient, useCurrentAccount } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { hasLocalSigner, getLocalAddress, getLocalnetClient } from './localSigner';

// Type for on-chain PrivateInventory object
export interface OnChainInventory {
  id: string;
  commitment: string;
  owner: string;
  nonce: number;
  maxCapacity: number;
}

/**
 * Fetch all PrivateInventory objects owned by the current account or local signer
 */
export function useOwnedInventories(packageId: string) {
  const dappKitClient = useSuiClient();
  const account = useCurrentAccount();

  // Use local signer address if available, otherwise use connected wallet
  const localAddress = hasLocalSigner() ? getLocalAddress() : null;
  const effectiveAddress = localAddress || account?.address;

  // Use localnet client for local signer
  const client = localAddress ? getLocalnetClient() : dappKitClient;

  return useQuery({
    queryKey: ['owned-inventories', effectiveAddress, packageId],
    queryFn: async (): Promise<OnChainInventory[]> => {
      if (!effectiveAddress || !packageId) {
        return [];
      }

      const objects = await client.getOwnedObjects({
        owner: effectiveAddress,
        filter: {
          StructType: `${packageId}::inventory::PrivateInventory`,
        },
        options: {
          showContent: true,
        },
      });

      return objects.data
        .map((obj) => {
          if (obj.data?.content?.dataType !== 'moveObject') {
            return null;
          }

          const fields = obj.data.content.fields as Record<string, unknown>;

          return {
            id: obj.data.objectId,
            commitment: bytesToHex(fields.commitment as number[]),
            owner: fields.owner as string,
            nonce: Number(fields.nonce),
            maxCapacity: Number(fields.max_capacity || 0),
          };
        })
        .filter((inv): inv is OnChainInventory => inv !== null);
    },
    enabled: !!effectiveAddress && !!packageId && packageId.startsWith('0x'),
    refetchInterval: 5000, // Refetch every 5 seconds
  });
}

/**
 * Fetch a specific PrivateInventory by ID
 */
export function useInventory(inventoryId: string) {
  const client = useSuiClient();

  return useQuery({
    queryKey: ['inventory', inventoryId],
    queryFn: async (): Promise<OnChainInventory | null> => {
      if (!inventoryId) {
        return null;
      }

      const obj = await client.getObject({
        id: inventoryId,
        options: {
          showContent: true,
        },
      });

      if (obj.data?.content?.dataType !== 'moveObject') {
        return null;
      }

      const fields = obj.data.content.fields as Record<string, unknown>;

      return {
        id: obj.data.objectId,
        commitment: bytesToHex(fields.commitment as number[]),
        owner: fields.owner as string,
        nonce: Number(fields.nonce),
        maxCapacity: Number(fields.max_capacity || 0),
      };
    },
    enabled: !!inventoryId && inventoryId.startsWith('0x'),
  });
}

function bytesToHex(bytes: number[]): string {
  return '0x' + bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}
