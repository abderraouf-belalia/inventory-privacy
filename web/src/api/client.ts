import type {
  InventoryItem,
  ProofResult,
  StateTransitionResult,
  ApiError,
} from '../types';

const API_BASE = '/api';

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error((data as ApiError).error || 'Request failed');
  }
  return data as T;
}

export async function generateBlinding(): Promise<string> {
  const response = await fetch(`${API_BASE}/blinding/generate`, {
    method: 'POST',
  });
  const data = await handleResponse<{ blinding: string }>(response);
  return data.blinding;
}

export interface CreateCommitmentResult {
  commitment: string;
  inventory_root: string;
}

export async function createCommitment(
  inventory: InventoryItem[],
  currentVolume: number,
  blinding: string
): Promise<CreateCommitmentResult> {
  const response = await fetch(`${API_BASE}/commitment/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inventory,
      current_volume: currentVolume,
      blinding,
    }),
  });
  return handleResponse<CreateCommitmentResult>(response);
}

// ============ State Transition (Deposit/Withdraw) ============

export interface StateTransitionRequest {
  inventory: InventoryItem[];
  current_volume: number;
  old_blinding: string;
  new_blinding: string;
  item_id: number;
  amount: number;
  item_volume: number;
  registry_root: string;
  max_capacity: number;
  /** Current nonce from on-chain inventory (for replay protection) */
  nonce: number;
  /** Inventory object ID as hex string (for cross-inventory protection) */
  inventory_id: string;
  op_type: 'deposit' | 'withdraw';
}

export async function proveStateTransition(
  request: StateTransitionRequest
): Promise<StateTransitionResult> {
  const response = await fetch(`${API_BASE}/prove/state-transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<StateTransitionResult>(response);
}

// Convenience wrapper for deposit
export async function proveDeposit(
  inventory: InventoryItem[],
  currentVolume: number,
  oldBlinding: string,
  newBlinding: string,
  itemId: number,
  amount: number,
  itemVolume: number,
  registryRoot: string,
  maxCapacity: number,
  nonce: number,
  inventoryId: string
): Promise<StateTransitionResult> {
  return proveStateTransition({
    inventory,
    current_volume: currentVolume,
    old_blinding: oldBlinding,
    new_blinding: newBlinding,
    item_id: itemId,
    amount,
    item_volume: itemVolume,
    registry_root: registryRoot,
    max_capacity: maxCapacity,
    nonce,
    inventory_id: inventoryId,
    op_type: 'deposit',
  });
}

// Convenience wrapper for withdraw
export async function proveWithdraw(
  inventory: InventoryItem[],
  currentVolume: number,
  oldBlinding: string,
  newBlinding: string,
  itemId: number,
  amount: number,
  itemVolume: number,
  registryRoot: string,
  maxCapacity: number,
  nonce: number,
  inventoryId: string
): Promise<StateTransitionResult> {
  return proveStateTransition({
    inventory,
    current_volume: currentVolume,
    old_blinding: oldBlinding,
    new_blinding: newBlinding,
    item_id: itemId,
    amount,
    item_volume: itemVolume,
    registry_root: registryRoot,
    max_capacity: maxCapacity,
    nonce,
    inventory_id: inventoryId,
    op_type: 'withdraw',
  });
}

// ============ Item Exists ============

export async function proveItemExists(
  inventory: InventoryItem[],
  currentVolume: number,
  blinding: string,
  itemId: number,
  minQuantity: number
): Promise<ProofResult> {
  const response = await fetch(`${API_BASE}/prove/item-exists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inventory,
      current_volume: currentVolume,
      blinding,
      item_id: itemId,
      min_quantity: minQuantity,
    }),
  });
  return handleResponse<ProofResult>(response);
}

// ============ Capacity ============

export async function proveCapacity(
  inventory: InventoryItem[],
  currentVolume: number,
  blinding: string,
  maxCapacity: number
): Promise<ProofResult> {
  const response = await fetch(`${API_BASE}/prove/capacity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inventory,
      current_volume: currentVolume,
      blinding,
      max_capacity: maxCapacity,
    }),
  });
  return handleResponse<ProofResult>(response);
}

// ============ Batch Operations (Parallel Proof Generation) ============

/** Single operation in a batch */
export interface BatchOperation {
  item_id: number;
  amount: number;
  item_volume: number;
  op_type: 'deposit' | 'withdraw';
}

/** Result of a single operation in a batch */
export interface BatchOperationResult {
  proof: string;
  public_inputs: string[];
  new_commitment: string;
  new_volume: number;
  nonce: number;
  inventory_id: string;
  registry_root: string;
  /** Inventory state after this operation (for chaining) */
  resultingInventory: InventoryItem[];
  /** New blinding factor */
  newBlinding: string;
}

/** Result of batch operations */
export interface BatchOperationsResult {
  operations: BatchOperationResult[];
  /** Final commitment after all operations */
  finalCommitment: string;
  /** Final inventory state */
  finalInventory: InventoryItem[];
  /** Final blinding factor */
  finalBlinding: string;
  /** Total proof generation time (wall-clock, parallel) */
  proofTimeMs: number;
}

/**
 * Generate proofs for multiple operations in PARALLEL.
 *
 * This pre-computes intermediate states and generates all proofs concurrently,
 * achieving O(1) wall-clock time for proof generation regardless of N operations.
 *
 * @param inventory - Current inventory items
 * @param currentVolume - Current total volume
 * @param blinding - Current blinding factor
 * @param operations - Array of operations to perform
 * @param inventoryId - On-chain inventory object ID
 * @param startNonce - Starting nonce (will increment for each operation)
 * @param registryRoot - Registry root for volume validation
 * @param maxCapacity - Maximum inventory capacity
 */
export async function proveBatchOperations(
  inventory: InventoryItem[],
  currentVolume: number,
  blinding: string,
  operations: BatchOperation[],
  inventoryId: string,
  startNonce: number,
  registryRoot: string,
  maxCapacity: number
): Promise<BatchOperationsResult> {
  if (operations.length === 0) {
    throw new Error('No operations provided');
  }

  const proofStart = performance.now();

  // Pre-generate all blinding factors in parallel
  const blindings = await Promise.all(
    operations.map(() => generateBlinding())
  );

  // Pre-compute intermediate states
  interface IntermediateState {
    inventory: InventoryItem[];
    volume: number;
    blinding: string;
    nonce: number;
  }

  const states: IntermediateState[] = [];
  let currentState: IntermediateState = {
    inventory: [...inventory],
    volume: currentVolume,
    blinding: blinding,
    nonce: startNonce,
  };

  // Compute all intermediate states sequentially (this is fast, just local computation)
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    const newBlinding = blindings[i];

    // Compute new inventory after this operation
    let newInventory: InventoryItem[];
    let newVolume: number;

    if (op.op_type === 'withdraw') {
      newInventory = currentState.inventory
        .map((item) =>
          item.item_id === op.item_id
            ? { ...item, quantity: item.quantity - op.amount }
            : item
        )
        .filter((item) => item.quantity > 0);
      newVolume = currentState.volume - op.amount * op.item_volume;
    } else {
      const existingIndex = currentState.inventory.findIndex(
        (item) => item.item_id === op.item_id
      );
      if (existingIndex >= 0) {
        newInventory = currentState.inventory.map((item) =>
          item.item_id === op.item_id
            ? { ...item, quantity: item.quantity + op.amount }
            : item
        );
      } else {
        newInventory = [
          ...currentState.inventory,
          { item_id: op.item_id, quantity: op.amount },
        ];
      }
      newVolume = currentState.volume + op.amount * op.item_volume;
    }

    // Save current state for proof generation
    states.push({ ...currentState });

    // Update current state for next iteration
    currentState = {
      inventory: newInventory,
      volume: newVolume,
      blinding: newBlinding,
      nonce: currentState.nonce + 1,
    };
  }

  // Generate all proofs IN PARALLEL
  const proofPromises = operations.map((op, i) => {
    const state = states[i];
    const newBlinding = blindings[i];

    return proveStateTransition({
      inventory: state.inventory,
      current_volume: state.volume,
      old_blinding: state.blinding,
      new_blinding: newBlinding,
      item_id: op.item_id,
      amount: op.amount,
      item_volume: op.item_volume,
      registry_root: registryRoot,
      max_capacity: maxCapacity,
      nonce: state.nonce,
      inventory_id: inventoryId,
      op_type: op.op_type,
    });
  });

  const proofResults = await Promise.all(proofPromises);
  const proofEnd = performance.now();

  // Build operation results with intermediate states
  const operationResults: BatchOperationResult[] = proofResults.map((result, i) => {
    // Compute resulting inventory for this operation
    const state = states[i];
    const op = operations[i];
    let resultingInventory: InventoryItem[];

    if (op.op_type === 'withdraw') {
      resultingInventory = state.inventory
        .map((item) =>
          item.item_id === op.item_id
            ? { ...item, quantity: item.quantity - op.amount }
            : item
        )
        .filter((item) => item.quantity > 0);
    } else {
      const existingIndex = state.inventory.findIndex(
        (item) => item.item_id === op.item_id
      );
      if (existingIndex >= 0) {
        resultingInventory = state.inventory.map((item) =>
          item.item_id === op.item_id
            ? { ...item, quantity: item.quantity + op.amount }
            : item
        );
      } else {
        resultingInventory = [
          ...state.inventory,
          { item_id: op.item_id, quantity: op.amount },
        ];
      }
    }

    return {
      proof: result.proof,
      public_inputs: result.public_inputs,
      new_commitment: result.new_commitment,
      new_volume: result.new_volume,
      nonce: result.nonce,
      inventory_id: result.inventory_id,
      registry_root: result.registry_root,
      resultingInventory,
      newBlinding: blindings[i],
    };
  });

  return {
    operations: operationResults,
    finalCommitment: proofResults[proofResults.length - 1].new_commitment,
    finalInventory: currentState.inventory,
    finalBlinding: currentState.blinding,
    proofTimeMs: Math.round(proofEnd - proofStart),
  };
}

// ============ Transfer (Two State Transitions) ============

export interface TransferProofs {
  srcProof: ProofResult;
  srcNewCommitment: string;
  srcNewVolume: number;
  /** Source nonce used in proof */
  srcNonce: number;
  /** Source inventory_id used in proof */
  srcInventoryId: string;
  /** Source registry_root used in proof */
  srcRegistryRoot: string;
  dstProof: ProofResult;
  dstNewCommitment: string;
  dstNewVolume: number;
  /** Destination nonce used in proof */
  dstNonce: number;
  /** Destination inventory_id used in proof */
  dstInventoryId: string;
  /** Destination registry_root used in proof */
  dstRegistryRoot: string;
}

export async function proveTransfer(
  srcInventory: InventoryItem[],
  srcCurrentVolume: number,
  srcOldBlinding: string,
  srcNewBlinding: string,
  srcNonce: number,
  srcInventoryId: string,
  dstInventory: InventoryItem[],
  dstCurrentVolume: number,
  dstOldBlinding: string,
  dstNewBlinding: string,
  dstNonce: number,
  dstInventoryId: string,
  itemId: number,
  amount: number,
  itemVolume: number,
  registryRoot: string,
  srcMaxCapacity: number,
  dstMaxCapacity: number
): Promise<TransferProofs> {
  // Generate withdrawal proof from source
  const srcResult = await proveWithdraw(
    srcInventory,
    srcCurrentVolume,
    srcOldBlinding,
    srcNewBlinding,
    itemId,
    amount,
    itemVolume,
    registryRoot,
    srcMaxCapacity,
    srcNonce,
    srcInventoryId
  );

  // Generate deposit proof to destination
  const dstResult = await proveDeposit(
    dstInventory,
    dstCurrentVolume,
    dstOldBlinding,
    dstNewBlinding,
    itemId,
    amount,
    itemVolume,
    registryRoot,
    dstMaxCapacity,
    dstNonce,
    dstInventoryId
  );

  return {
    srcProof: {
      proof: srcResult.proof,
      public_inputs: srcResult.public_inputs,
    },
    srcNewCommitment: srcResult.new_commitment,
    srcNewVolume: srcResult.new_volume,
    srcNonce: srcResult.nonce,
    srcInventoryId: srcResult.inventory_id,
    srcRegistryRoot: srcResult.registry_root,
    dstProof: {
      proof: dstResult.proof,
      public_inputs: dstResult.public_inputs,
    },
    dstNewCommitment: dstResult.new_commitment,
    dstNewVolume: dstResult.new_volume,
    dstNonce: dstResult.nonce,
    dstInventoryId: dstResult.inventory_id,
    dstRegistryRoot: dstResult.registry_root,
  };
}
