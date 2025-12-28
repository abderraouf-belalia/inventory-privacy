import { useSuiClient, useCurrentAccount } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useCallback } from 'react';
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

/**
 * Fetch ALL PrivateInventory objects on-chain by querying InventoryCreated events
 */
export function useAllInventories(packageId: string) {
  const dappKitClient = useSuiClient();
  const localAddress = hasLocalSigner() ? getLocalAddress() : null;
  const client = localAddress ? getLocalnetClient() : dappKitClient;

  return useQuery({
    queryKey: ['all-inventories', packageId],
    queryFn: async (): Promise<OnChainInventory[]> => {
      if (!packageId || !packageId.startsWith('0x')) {
        return [];
      }

      // Query InventoryCreated events to discover all inventory IDs
      const events = await client.queryEvents({
        query: {
          MoveEventType: `${packageId}::inventory::InventoryCreated`,
        },
        limit: 100,
        order: 'descending',
      });

      if (events.data.length === 0) {
        return [];
      }

      // Extract inventory IDs from events
      const inventoryIds = events.data.map((event) => {
        const parsedJson = event.parsedJson as { inventory_id: string };
        return parsedJson.inventory_id;
      });

      // Batch fetch all inventory objects
      const objects = await client.multiGetObjects({
        ids: inventoryIds,
        options: {
          showContent: true,
        },
      });

      return objects
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
    enabled: !!packageId && packageId.startsWith('0x'),
    refetchInterval: 10000, // Refetch every 10 seconds as fallback
  });
}

/**
 * Subscribe to real-time InventoryCreated events via WebSocket
 */
export function useInventoryEventSubscription(
  packageId: string,
  onNewInventory: (inventory: OnChainInventory) => void
) {
  const dappKitClient = useSuiClient();
  const localAddress = hasLocalSigner() ? getLocalAddress() : null;
  const client = localAddress ? getLocalnetClient() : dappKitClient;
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const onNewInventoryRef = useRef(onNewInventory);

  // Keep callback ref updated
  useEffect(() => {
    onNewInventoryRef.current = onNewInventory;
  }, [onNewInventory]);

  const fetchInventory = useCallback(async (inventoryId: string): Promise<OnChainInventory | null> => {
    try {
      const obj = await client.getObject({
        id: inventoryId,
        options: { showContent: true },
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
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
      return null;
    }
  }, [client]);

  useEffect(() => {
    if (!packageId || !packageId.startsWith('0x')) {
      return;
    }

    const subscribe = async () => {
      try {
        const unsubscribe = await client.subscribeEvent({
          filter: {
            MoveEventType: `${packageId}::inventory::InventoryCreated`,
          },
          onMessage: async (event) => {
            const parsedJson = event.parsedJson as { inventory_id: string };
            const inventoryId = parsedJson.inventory_id;

            // Fetch the full inventory object
            const inventory = await fetchInventory(inventoryId);
            if (inventory) {
              onNewInventoryRef.current(inventory);
            }
          },
        });

        unsubscribeRef.current = unsubscribe;
      } catch (error) {
        console.error('Failed to subscribe to events:', error);
      }
    };

    subscribe();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [packageId, client, fetchInventory]);
}

function bytesToHex(bytes: number[]): string {
  return '0x' + bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}
