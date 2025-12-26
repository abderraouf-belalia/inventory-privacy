import { useState, useCallback } from 'react';
import type { Inventory, InventorySlot } from '../types';
import * as api from '../api/client';

export function useInventory(initialSlots: InventorySlot[] = []) {
  const [inventory, setInventory] = useState<Inventory>({
    slots: initialSlots,
    blinding: '',
    commitment: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateBlinding = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const blinding = await api.generateBlinding();
      setInventory((prev) => ({ ...prev, blinding, commitment: null }));
      return blinding;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate blinding');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createCommitment = useCallback(async () => {
    if (!inventory.blinding) {
      setError('Blinding factor required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const commitment = await api.createCommitment(inventory.slots, inventory.blinding);
      setInventory((prev) => ({ ...prev, commitment }));
      return commitment;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create commitment');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [inventory.slots, inventory.blinding]);

  const addSlot = useCallback((item_id: number, quantity: number) => {
    setInventory((prev) => {
      const existingIndex = prev.slots.findIndex((s) => s.item_id === item_id);
      if (existingIndex >= 0) {
        const newSlots = [...prev.slots];
        newSlots[existingIndex] = {
          ...newSlots[existingIndex],
          quantity: newSlots[existingIndex].quantity + quantity,
        };
        return { ...prev, slots: newSlots, commitment: null };
      }
      return {
        ...prev,
        slots: [...prev.slots, { item_id, quantity }],
        commitment: null,
      };
    });
  }, []);

  const updateSlot = useCallback((index: number, slot: InventorySlot) => {
    setInventory((prev) => {
      const newSlots = [...prev.slots];
      newSlots[index] = slot;
      return { ...prev, slots: newSlots, commitment: null };
    });
  }, []);

  const removeSlot = useCallback((index: number) => {
    setInventory((prev) => ({
      ...prev,
      slots: prev.slots.filter((_, i) => i !== index),
      commitment: null,
    }));
  }, []);

  const setSlots = useCallback((slots: InventorySlot[]) => {
    setInventory((prev) => ({ ...prev, slots, commitment: null }));
  }, []);

  const setBlinding = useCallback((blinding: string) => {
    setInventory((prev) => ({ ...prev, blinding, commitment: null }));
  }, []);

  const reset = useCallback(() => {
    setInventory({ slots: [], blinding: '', commitment: null });
    setError(null);
  }, []);

  return {
    inventory,
    loading,
    error,
    generateBlinding,
    createCommitment,
    addSlot,
    updateSlot,
    removeSlot,
    setSlots,
    setBlinding,
    reset,
  };
}
