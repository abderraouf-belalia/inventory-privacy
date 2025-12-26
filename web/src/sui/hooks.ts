import { useSuiClient, useCurrentAccount } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';

// Type for on-chain PrivateInventory object
export interface OnChainInventory {
  id: string;
  commitment: string;
  owner: string;
  nonce: number;
}

/**
 * Fetch all PrivateInventory objects owned by the current account
 */
export function useOwnedInventories(packageId: string) {
  const client = useSuiClient();
  const account = useCurrentAccount();

  return useQuery({
    queryKey: ['owned-inventories', account?.address, packageId],
    queryFn: async (): Promise<OnChainInventory[]> => {
      if (!account?.address || !packageId) {
        return [];
      }

      const objects = await client.getOwnedObjects({
        owner: account.address,
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
          };
        })
        .filter((inv): inv is OnChainInventory => inv !== null);
    },
    enabled: !!account?.address && !!packageId && packageId.startsWith('0x'),
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
      };
    },
    enabled: !!inventoryId && inventoryId.startsWith('0x'),
  });
}

function bytesToHex(bytes: number[]): string {
  return '0x' + bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}
