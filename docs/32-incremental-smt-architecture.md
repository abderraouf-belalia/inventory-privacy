# Incremental SMT Architecture: Slot-less Volume-Based Inventory

## Executive Summary

This document describes the next-generation architecture for the inventory privacy system, replacing the fixed 16-slot array with a **Sparse Merkle Tree (SMT)** and **incremental volume tracking**. This enables:

- **Unlimited item types** (2^16 to 2^20 possible item IDs)
- **Purely volume-based constraints** (no artificial slot limits)
- **~100-120ms proving time** (within performance budget)
- **Full privacy** (quantities, volumes, and optionally item IDs hidden)

---

## Table of Contents

1. [Motivation](#1-motivation)
2. [Architecture Overview](#2-architecture-overview)
3. [Core Concepts](#3-core-concepts)
4. [Data Structures](#4-data-structures)
5. [Commitment Scheme](#5-commitment-scheme)
6. [Circuit Specifications](#6-circuit-specifications)
7. [Signal Hash Pattern](#7-signal-hash-pattern)
8. [Privacy Analysis](#8-privacy-analysis)
9. [Performance Analysis](#9-performance-analysis)
10. [On-Chain Contract Design](#10-on-chain-contract-design)
11. [Migration Path](#11-migration-path)
12. [Implementation Roadmap](#12-implementation-roadmap)

---

## 1. Motivation

### Problems with Fixed-Slot Design

The current architecture uses a fixed 16-slot array:

```
Inventory = [(item_id, quantity); 16]
Commitment = Poseidon(id_0, qty_0, id_1, qty_1, ..., id_15, qty_15, blinding)
```

**Limitations:**

| Issue | Impact |
|-------|--------|
| Hard cap of 16 item types | Players can't hold diverse inventories |
| Circuit iterates all slots | O(N) complexity even for single-item operations |
| Volume recomputed from scratch | Expensive: `sum(qty_i * vol_i)` for all items |
| Scaling requires circuit rewrite | Moving to 64 slots = 4x constraints |

### The Solution: Incremental State Model

Instead of storing and iterating all items, we:

1. **Store items in a Sparse Merkle Tree** - Only non-empty items exist
2. **Track volume as first-class state** - Update incrementally, never recompute
3. **Query items via Merkle proofs** - O(log N) per operation, not O(N)

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INCREMENTAL SMT ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     DOUBLE-COMMITMENT MODEL                          │   │
│   │                                                                      │   │
│   │   Inventory State:                                                   │   │
│   │   ┌──────────────────────────────────────────────────────────────┐  │   │
│   │   │  Commitment = Hash(inventory_root, current_volume, blinding) │  │   │
│   │   └──────────────────────────────────────────────────────────────┘  │   │
│   │                           │                                         │   │
│   │              ┌────────────┼────────────┐                           │   │
│   │              ▼            ▼            ▼                           │   │
│   │   ┌──────────────┐ ┌───────────┐ ┌──────────┐                     │   │
│   │   │inventory_root│ │  volume   │ │ blinding │                     │   │
│   │   │  (SMT root)  │ │  (u64)    │ │   (Fr)   │                     │   │
│   │   └──────────────┘ └───────────┘ └──────────┘                     │   │
│   │          │                                                         │   │
│   │          ▼                                                         │   │
│   │   ┌──────────────────────────────────────────┐                    │   │
│   │   │          SPARSE MERKLE TREE              │                    │   │
│   │   │         (depth 16 or 20)                 │                    │   │
│   │   │                                          │                    │   │
│   │   │              root                        │                    │   │
│   │   │             /    \                       │                    │   │
│   │   │           ...    ...                     │                    │   │
│   │   │          /          \                    │                    │   │
│   │   │   [item_1: 100]  [item_42: 50]          │                    │   │
│   │   │                                          │                    │   │
│   │   │   Key: item_id (0 to 2^depth - 1)       │                    │   │
│   │   │   Value: quantity (u64)                  │                    │   │
│   │   │   Empty: default hash (quantity = 0)     │                    │   │
│   │   └──────────────────────────────────────────┘                    │   │
│   │                                                                    │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      REGISTRY COMMITMENT                             │   │
│   │                                                                      │   │
│   │   Registry Root = SMT root of (item_id → volume_per_unit)           │   │
│   │                                                                      │   │
│   │   • Static or rarely updated                                        │   │
│   │   • Public constant on-chain                                        │   │
│   │   • Enables private volume lookups                                  │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Concepts

### 3.1 Sparse Merkle Tree (SMT)

A binary Merkle tree where:

- **Depth** is fixed (16 or 20 levels)
- **Keys** are item IDs (0 to 2^depth - 1)
- **Values** are quantities (field elements)
- **Empty leaves** have a known default hash
- **Only populated paths** are stored off-chain

```
Tree with depth 4 (16 possible items):

                    root
                   /    \
                 h01     h23
                /  \    /   \
              h0   h1  h2   h3
             /\   /\  /\   /\
            0  1 2  3 4 5 6  7 ...

Leaf[i] = Hash(i, quantity_i) if quantity > 0
        = DEFAULT_EMPTY      if quantity = 0
```

### 3.2 Incremental Volume Tracking

**Key insight:** Volume is stored, not computed.

```
OLD DESIGN (O(N)):
  total_volume = sum(inventory[i].qty * volumes[i].vol for all i)

NEW DESIGN (O(1)):
  // Volume stored in commitment
  deposit:  new_volume = old_volume + (amount * item_volume)
  withdraw: new_volume = old_volume - (amount * item_volume)
```

The circuit proves the delta is correct; it never iterates all items.

### 3.3 Double-Commitment Model

Two SMT roots are used:

| Tree | Keys | Values | Update Frequency |
|------|------|--------|------------------|
| **Inventory SMT** | item_id | quantity | Every operation |
| **Registry SMT** | item_id | volume_per_unit | Rarely (admin only) |

The registry root is a **public constant**. The circuit proves volume lookups against it, keeping the actual volume value private.

### 3.4 Signal Hash Pattern

To stay under Sui's 8 public input limit, all inputs are collapsed:

```
signal_hash = Poseidon(
    old_commitment,
    new_commitment,
    registry_root,
    max_capacity,
    item_id,        // optional: move to witness for full privacy
    amount,
    operation_type
)

// Circuit's single public input = signal_hash
// Move contract computes same hash and verifies match
```

---

## 4. Data Structures

### 4.1 On-Chain State (Move)

```move
/// A private inventory with SMT-based item storage
struct PrivateInventory has key, store {
    id: UID,

    /// Commitment = Hash(inventory_root, current_volume, blinding)
    commitment: vector<u8>,     // 32 bytes

    /// Current volume (can be public for UX, or hidden in commitment only)
    current_volume: u64,

    /// Maximum volume capacity
    max_capacity: u64,

    /// Owner address
    owner: address,

    /// Replay protection
    nonce: u64,
}

/// Volume registry - maps item types to their volume costs
struct VolumeRegistry has key {
    id: UID,

    /// SMT root committing to all (item_id → volume_per_unit) mappings
    registry_root: vector<u8>,  // 32 bytes

    /// Admin who can update registry
    admin: address,
}

/// Verifying keys for all circuits
struct VerifyingKeys has key {
    id: UID,

    state_transition_vk: vector<u8>,
    item_exists_vk: vector<u8>,
    capacity_proof_vk: vector<u8>,

    curve: Curve,  // BN254
}
```

### 4.2 Off-Chain State (Client)

```rust
/// Client-side inventory state
pub struct InventoryState {
    /// Sparse storage: only non-zero items
    items: HashMap<u32, u64>,  // item_id → quantity

    /// Full SMT for proof generation
    inventory_tree: SparseMerkleTree,

    /// Tracked volume (must match on-chain)
    current_volume: u64,

    /// Secret blinding factor
    blinding: Fr,

    /// Cached commitment
    commitment: Fr,
}

/// Client-side registry cache
pub struct RegistryCache {
    /// Volume lookups
    volumes: HashMap<u32, u64>,  // item_id → volume_per_unit

    /// Full SMT for proof generation
    registry_tree: SparseMerkleTree,

    /// Public root (must match on-chain)
    registry_root: Fr,
}
```

### 4.3 Sparse Merkle Tree Implementation

```rust
pub struct SparseMerkleTree {
    /// Tree depth (16 or 20)
    depth: usize,

    /// Stored nodes: path → hash
    /// Only non-default nodes are stored
    nodes: HashMap<(usize, u64), Fr>,  // (level, index) → hash

    /// Leaf values: index → value
    leaves: HashMap<u64, Fr>,

    /// Precomputed default hashes for each level
    defaults: Vec<Fr>,
}

impl SparseMerkleTree {
    /// Get Merkle proof for a key
    pub fn get_proof(&self, key: u64) -> MerkleProof {
        let mut path = Vec::with_capacity(self.depth);
        let mut indices = Vec::with_capacity(self.depth);

        let mut current_index = key;
        for level in 0..self.depth {
            let sibling_index = current_index ^ 1;  // Flip last bit
            let sibling = self.get_node(level, sibling_index);
            path.push(sibling);
            indices.push((current_index & 1) == 1);  // Is right child?
            current_index >>= 1;
        }

        MerkleProof { path, indices }
    }

    /// Update a leaf and recompute root
    pub fn update(&mut self, key: u64, value: Fr) -> Fr {
        self.leaves.insert(key, value);
        self.recompute_path(key)
    }
}

pub struct MerkleProof {
    /// Sibling hashes from leaf to root
    path: Vec<Fr>,

    /// Direction at each level (true = current node is right child)
    indices: Vec<bool>,
}
```

---

## 5. Commitment Scheme

### 5.1 Inventory Commitment

```
Commitment = Poseidon(inventory_root, current_volume, blinding)

Where:
- inventory_root: Fr    = Root of item SMT
- current_volume: u64   = Total volume used (as field element)
- blinding: Fr          = Random secret for hiding
```

### 5.2 Leaf Hash (Item Entry)

```
Leaf[item_id] = Poseidon(item_id, quantity)

For empty slots:
Leaf[item_id] = Poseidon(item_id, 0) = DEFAULT_HASH[item_id]

Note: We hash item_id into the leaf to bind the position.
Alternative: Leaf = Poseidon(quantity) with position implicit.
```

### 5.3 Registry Commitment

```
Registry_Root = SMT_Root of all (item_id → volume_per_unit)

Leaf[item_id] = Poseidon(item_id, volume_per_unit)
```

---

## 6. Circuit Specifications

### 6.1 StateTransition Circuit (The Workhorse)

Handles **both** deposit and withdraw via signed delta.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    STATE TRANSITION CIRCUIT                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  PUBLIC INPUT:                                                      │
│    signal_hash = Poseidon(                                         │
│        old_commitment,                                              │
│        new_commitment,                                              │
│        registry_root,                                               │
│        max_capacity,                                                │
│        item_id,           // Move to witness for full privacy      │
│        amount,            // Positive = deposit, negative = withdraw│
│        blinding_delta_commitment  // For replay protection         │
│    )                                                                │
│                                                                     │
│  PRIVATE WITNESSES:                                                 │
│    // Inventory state                                               │
│    old_inventory_root: Fr                                          │
│    old_volume: u64                                                  │
│    old_blinding: Fr                                                 │
│    new_blinding: Fr                                                 │
│                                                                     │
│    // Item Merkle proof (inventory)                                 │
│    old_quantity: u64                                                │
│    inventory_merkle_path: [Fr; DEPTH]                              │
│    inventory_merkle_indices: [bool; DEPTH]                         │
│                                                                     │
│    // Volume Merkle proof (registry)                                │
│    volume_per_unit: u64                                            │
│    registry_merkle_path: [Fr; DEPTH]                               │
│    registry_merkle_indices: [bool; DEPTH]                          │
│                                                                     │
│  CONSTRAINTS:                                                       │
│                                                                     │
│    // 1. Verify old commitment                                      │
│    old_commitment == Poseidon(old_inventory_root, old_volume,      │
│                               old_blinding)                         │
│                                                                     │
│    // 2. Verify old quantity via inventory SMT                      │
│    VerifyMerkle(old_inventory_root, item_id, old_quantity,         │
│                 inventory_merkle_path, inventory_merkle_indices)    │
│                                                                     │
│    // 3. Verify volume_per_unit via registry SMT                    │
│    VerifyMerkle(registry_root, item_id, volume_per_unit,           │
│                 registry_merkle_path, registry_merkle_indices)      │
│                                                                     │
│    // 4. Compute new quantity                                       │
│    new_quantity = old_quantity + amount                            │
│    new_quantity >= 0  // Range check: can't go negative            │
│                                                                     │
│    // 5. Compute new inventory root                                 │
│    new_inventory_root = UpdateMerkle(old_inventory_root, item_id,  │
│                                       new_quantity,                 │
│                                       inventory_merkle_path,        │
│                                       inventory_merkle_indices)     │
│                                                                     │
│    // 6. Compute new volume                                         │
│    volume_delta = amount * volume_per_unit                         │
│    new_volume = old_volume + volume_delta                          │
│    new_volume >= 0           // Can't go negative                  │
│    new_volume <= max_capacity // Capacity check                    │
│                                                                     │
│    // 7. Verify new commitment                                      │
│    new_commitment == Poseidon(new_inventory_root, new_volume,      │
│                               new_blinding)                         │
│                                                                     │
│    // 8. Verify signal hash (links public inputs)                  │
│    signal_hash == Poseidon(old_commitment, new_commitment,         │
│                            registry_root, max_capacity,             │
│                            item_id, amount, ...)                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

CONSTRAINT COUNT (Depth 16):
  - Inventory Merkle verify: ~4,800 (16 * 300 per hash)
  - Registry Merkle verify:  ~4,800
  - Commitment hashes:       ~1,000 (3 Poseidon calls)
  - Arithmetic & range:      ~300
  - Signal hash:             ~300
  ─────────────────────────────────
  TOTAL:                     ~11,200 constraints

ESTIMATED PROVING TIME: ~110ms
```

### 6.2 ItemExists Circuit (Lightweight Query)

For proving ownership without state change.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ITEM EXISTS CIRCUIT                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  PUBLIC INPUT:                                                      │
│    signal_hash = Poseidon(                                         │
│        commitment,                                                  │
│        item_id,           // Optional: witness for full privacy    │
│        min_quantity                                                 │
│    )                                                                │
│                                                                     │
│  PRIVATE WITNESSES:                                                 │
│    inventory_root: Fr                                              │
│    current_volume: u64                                              │
│    blinding: Fr                                                     │
│    actual_quantity: u64                                            │
│    merkle_path: [Fr; DEPTH]                                        │
│    merkle_indices: [bool; DEPTH]                                   │
│                                                                     │
│  CONSTRAINTS:                                                       │
│                                                                     │
│    // 1. Verify commitment                                          │
│    commitment == Poseidon(inventory_root, current_volume, blinding)│
│                                                                     │
│    // 2. Verify quantity via SMT                                    │
│    VerifyMerkle(inventory_root, item_id, actual_quantity,          │
│                 merkle_path, merkle_indices)                        │
│                                                                     │
│    // 3. Quantity check                                             │
│    actual_quantity >= min_quantity                                  │
│                                                                     │
│    // 4. Signal hash verification                                   │
│    signal_hash == Poseidon(commitment, item_id, min_quantity)       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

CONSTRAINT COUNT (Depth 16):
  - Merkle verify:      ~4,800
  - Commitment hash:    ~300
  - Comparison:         ~100
  - Signal hash:        ~300
  ─────────────────────────
  TOTAL:                ~5,500 constraints

ESTIMATED PROVING TIME: ~55ms
```

### 6.3 CapacityProof Circuit (Volume Compliance)

For proving volume is under capacity without revealing contents.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CAPACITY PROOF CIRCUIT                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  PUBLIC INPUT:                                                      │
│    signal_hash = Poseidon(commitment, max_capacity)                │
│                                                                     │
│  PRIVATE WITNESSES:                                                 │
│    inventory_root: Fr                                              │
│    current_volume: u64                                              │
│    blinding: Fr                                                     │
│                                                                     │
│  CONSTRAINTS:                                                       │
│                                                                     │
│    // 1. Verify commitment                                          │
│    commitment == Poseidon(inventory_root, current_volume, blinding)│
│                                                                     │
│    // 2. Capacity check                                             │
│    current_volume <= max_capacity                                   │
│                                                                     │
│    // 3. Signal hash verification                                   │
│    signal_hash == Poseidon(commitment, max_capacity)                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

CONSTRAINT COUNT:
  - Commitment hash:  ~300
  - Range check:      ~256
  - Signal hash:      ~300
  ─────────────────────────
  TOTAL:              ~900 constraints

ESTIMATED PROVING TIME: ~10ms
```

### 6.4 Transfer as Composed Proofs

Transfer is **not** a separate circuit. Instead:

```
Transfer(src, dst, item_id, amount):

  // Generate two independent proofs
  proof_src = StateTransition(src, item_id, -amount)  // Withdraw
  proof_dst = StateTransition(dst, item_id, +amount)  // Deposit

  // On-chain: Execute atomically
  verify(proof_src)
  verify(proof_dst)
  update_both_commitments()
```

**Benefits:**
- No separate transfer circuit to maintain
- Proofs can be generated in parallel (~110ms wall-clock)
- Same circuits work for all operations
- Composable for multi-party transactions

---

## 7. Signal Hash Pattern

### 7.1 Why Signal Hashing?

Sui limits Groth16 public inputs to 8. Our circuits have more:

| Circuit | Raw Public Inputs |
|---------|-------------------|
| StateTransition | 7+ (commitments, registry, capacity, item, amount, ...) |
| ItemExists | 3 (commitment, item, min_qty) |
| CapacityProof | 2 (commitment, max_capacity) |

**Solution:** Hash all inputs into one value.

### 7.2 Signal Hash Construction

```rust
// Circuit computes:
signal_hash = Poseidon([
    old_commitment,
    new_commitment,
    registry_root,
    max_capacity,
    item_id,
    amount,
    operation_flags,  // Encode operation type
]);

// Move contract computes same hash:
let signal_hash = poseidon::hash(vector[
    old_commitment,
    new_commitment,
    registry_root,
    max_capacity,
    item_id_bytes,
    amount_bytes,
    operation_flags,
]);

// Verify: circuit's public input == computed signal_hash
```

### 7.3 Operation Flags

```rust
const OP_DEPOSIT: u8 = 0x01;
const OP_WITHDRAW: u8 = 0x02;
const OP_ITEM_EXISTS: u8 = 0x03;
const OP_CAPACITY_PROOF: u8 = 0x04;

// Flags prevent proof reuse across different operations
```

---

## 8. Privacy Analysis

### 8.1 What's Hidden

| Data | Hidden? | Notes |
|------|---------|-------|
| Item quantities | **Yes** | In SMT, not revealed |
| Which items exist | **Yes** | SMT structure hidden |
| Total volume used | **Yes** | In commitment |
| Blinding factor | **Yes** | Random per-commitment |
| Volume per unit (in circuit) | **Yes** | Registry lookup is private |
| Inventory structure | **Yes** | Only commitment visible |

### 8.2 What's Revealed (Semi-Private Mode)

| Data | Revealed? | Notes |
|------|-----------|-------|
| item_id being operated on | **Yes** | Public input |
| amount being moved | **Yes** | Public input |
| max_capacity | **Yes** | Public input |
| Old/new commitments | **Yes** | State transitions visible |
| Registry root | **Yes** | Public constant |

### 8.3 Full Privacy Mode

To hide `item_id`:

1. Move `item_id` from public input to private witness
2. Remove from signal hash
3. Observer sees: "Someone changed their inventory"

**Tradeoff:** Harder to audit, can't verify specific item movements.

### 8.4 Privacy Guarantees

```
Semi-Private (Default):
  Observer learns: "Alice deposited 50 of item #7"
  Observer doesn't learn: "Alice now has 200 of item #7" or "Alice has 10 other items"

Full Privacy:
  Observer learns: "Alice's inventory changed"
  Observer doesn't learn: What item, how much, or any quantities
```

---

## 9. Performance Analysis

### 9.1 Constraint Breakdown

| Component | Constraints | Notes |
|-----------|-------------|-------|
| Poseidon hash | ~300 | Per invocation |
| Merkle verify (depth 16) | ~4,800 | 16 hashes |
| Merkle verify (depth 20) | ~6,000 | 20 hashes |
| Range check (64-bit) | ~256 | For volume bounds |
| Field comparison | ~50 | >= or <= |
| Signal hash | ~300 | Final aggregation |

### 9.2 Circuit Sizes

| Circuit | Depth 16 | Depth 20 |
|---------|----------|----------|
| StateTransition | ~11,200 | ~14,000 |
| ItemExists | ~5,500 | ~6,800 |
| CapacityProof | ~900 | ~900 |

### 9.3 Proving Times (Estimated)

Assuming ~100,000 constraints/second on modern hardware:

| Circuit | Depth 16 | Depth 20 |
|---------|----------|----------|
| StateTransition | ~110ms | ~140ms |
| ItemExists | ~55ms | ~70ms |
| CapacityProof | ~10ms | ~10ms |
| Transfer (2x ST) | ~110ms parallel | ~140ms parallel |

### 9.4 Comparison with Old Design

| Metric | Fixed 16 Slots | SMT (Depth 16) |
|--------|----------------|----------------|
| Max items | 16 | 65,536 |
| StateTransition | ~60ms | ~110ms |
| ItemExists | ~40ms | ~55ms |
| Flexibility | Low | High |
| Volume tracking | O(N) | O(1) |

---

## 10. On-Chain Contract Design

### 10.1 Core Module

```move
module inventory::inventory_v2 {
    use sui::groth16::{Self, Curve, PreparedVerifyingKey};
    use sui::poseidon;
    use sui::event;

    // ═══════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════

    /// A private inventory using SMT-based storage
    struct PrivateInventory has key, store {
        id: UID,
        commitment: vector<u8>,     // 32 bytes
        current_volume: u64,        // Public for UX (optional)
        max_capacity: u64,
        owner: address,
        nonce: u64,
    }

    /// Volume registry with SMT root
    struct VolumeRegistry has key {
        id: UID,
        registry_root: vector<u8>,  // 32 bytes
        admin: address,
    }

    /// Verifying keys
    struct VerifyingKeys has key {
        id: UID,
        state_transition_vk: vector<u8>,
        item_exists_vk: vector<u8>,
        capacity_proof_vk: vector<u8>,
        curve: Curve,
    }

    // ═══════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════

    const OP_DEPOSIT: u8 = 0x01;
    const OP_WITHDRAW: u8 = 0x02;

    // Errors
    const ENotOwner: u64 = 1;
    const EInvalidProof: u64 = 2;
    const ECapacityExceeded: u64 = 3;
    const EInvalidSignalHash: u64 = 4;

    // ═══════════════════════════════════════════════════════════════
    // STATE TRANSITION (Deposit/Withdraw)
    // ═══════════════════════════════════════════════════════════════

    /// Execute a deposit or withdraw operation
    public fun state_transition(
        inventory: &mut PrivateInventory,
        registry: &VolumeRegistry,
        vks: &VerifyingKeys,
        proof: vector<u8>,
        new_commitment: vector<u8>,
        new_volume: u64,
        item_id: u64,
        amount: i64,  // Positive = deposit, negative = withdraw
        ctx: &TxContext,
    ) {
        // Only owner can modify
        assert!(inventory.owner == tx_context::sender(ctx), ENotOwner);

        // Capacity check (defense in depth)
        assert!(new_volume <= inventory.max_capacity, ECapacityExceeded);

        // Determine operation type
        let op_type = if (amount >= 0) { OP_DEPOSIT } else { OP_WITHDRAW };

        // Compute signal hash
        let signal_hash = compute_state_transition_signal_hash(
            &inventory.commitment,
            &new_commitment,
            &registry.registry_root,
            inventory.max_capacity,
            item_id,
            amount,
            op_type,
        );

        // Verify proof
        let pvk = groth16::prepare_verifying_key(
            &vks.curve,
            &vks.state_transition_vk
        );
        let public_inputs = vector[signal_hash];

        assert!(
            groth16::verify_groth16_proof(&vks.curve, &pvk, &public_inputs, &proof),
            EInvalidProof
        );

        // Update state
        inventory.commitment = new_commitment;
        inventory.current_volume = new_volume;
        inventory.nonce = inventory.nonce + 1;

        // Emit event
        event::emit(StateTransitionEvent {
            inventory_id: object::id(inventory),
            item_id,
            amount,
            new_volume,
            nonce: inventory.nonce,
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // ITEM EXISTS (Read-only verification)
    // ═══════════════════════════════════════════════════════════════

    /// Verify an item exists with minimum quantity
    public fun verify_item_exists(
        inventory: &PrivateInventory,
        vks: &VerifyingKeys,
        proof: vector<u8>,
        item_id: u64,
        min_quantity: u64,
    ): bool {
        let signal_hash = compute_item_exists_signal_hash(
            &inventory.commitment,
            item_id,
            min_quantity,
        );

        let pvk = groth16::prepare_verifying_key(
            &vks.curve,
            &vks.item_exists_vk
        );
        let public_inputs = vector[signal_hash];

        groth16::verify_groth16_proof(&vks.curve, &pvk, &public_inputs, &proof)
    }

    // ═══════════════════════════════════════════════════════════════
    // CAPACITY PROOF (Volume compliance)
    // ═══════════════════════════════════════════════════════════════

    /// Verify inventory is under capacity
    public fun verify_capacity(
        inventory: &PrivateInventory,
        vks: &VerifyingKeys,
        proof: vector<u8>,
    ): bool {
        let signal_hash = compute_capacity_signal_hash(
            &inventory.commitment,
            inventory.max_capacity,
        );

        let pvk = groth16::prepare_verifying_key(
            &vks.curve,
            &vks.capacity_proof_vk
        );
        let public_inputs = vector[signal_hash];

        groth16::verify_groth16_proof(&vks.curve, &pvk, &public_inputs, &proof)
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSFER (Composed from two state transitions)
    // ═══════════════════════════════════════════════════════════════

    /// Atomic transfer between two inventories
    public fun transfer(
        src: &mut PrivateInventory,
        dst: &mut PrivateInventory,
        registry: &VolumeRegistry,
        vks: &VerifyingKeys,
        src_proof: vector<u8>,
        dst_proof: vector<u8>,
        src_new_commitment: vector<u8>,
        dst_new_commitment: vector<u8>,
        src_new_volume: u64,
        dst_new_volume: u64,
        item_id: u64,
        amount: u64,
        ctx: &TxContext,
    ) {
        // Source must be owner
        assert!(src.owner == tx_context::sender(ctx), ENotOwner);

        // Verify source withdraw
        state_transition(
            src, registry, vks, src_proof,
            src_new_commitment, src_new_volume,
            item_id, -(amount as i64), ctx
        );

        // Verify destination deposit
        // Note: We call internal version that doesn't check owner
        state_transition_internal(
            dst, registry, vks, dst_proof,
            dst_new_commitment, dst_new_volume,
            item_id, (amount as i64)
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // SIGNAL HASH HELPERS
    // ═══════════════════════════════════════════════════════════════

    fun compute_state_transition_signal_hash(
        old_commitment: &vector<u8>,
        new_commitment: &vector<u8>,
        registry_root: &vector<u8>,
        max_capacity: u64,
        item_id: u64,
        amount: i64,
        op_type: u8,
    ): vector<u8> {
        poseidon::poseidon_bn254(&vector[
            *old_commitment,
            *new_commitment,
            *registry_root,
            bcs::to_bytes(&max_capacity),
            bcs::to_bytes(&item_id),
            bcs::to_bytes(&amount),
            bcs::to_bytes(&op_type),
        ])
    }

    fun compute_item_exists_signal_hash(
        commitment: &vector<u8>,
        item_id: u64,
        min_quantity: u64,
    ): vector<u8> {
        poseidon::poseidon_bn254(&vector[
            *commitment,
            bcs::to_bytes(&item_id),
            bcs::to_bytes(&min_quantity),
        ])
    }

    fun compute_capacity_signal_hash(
        commitment: &vector<u8>,
        max_capacity: u64,
    ): vector<u8> {
        poseidon::poseidon_bn254(&vector[
            *commitment,
            bcs::to_bytes(&max_capacity),
        ])
    }

    // ═══════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════

    struct StateTransitionEvent has copy, drop {
        inventory_id: ID,
        item_id: u64,
        amount: i64,
        new_volume: u64,
        nonce: u64,
    }

    struct TransferEvent has copy, drop {
        src_inventory_id: ID,
        dst_inventory_id: ID,
        item_id: u64,
        amount: u64,
    }
}
```

---

## 11. Migration Path

### 11.1 Strategy: Parallel Systems

```
Phase 1: Deploy New System
  └── Deploy SMT-based contracts alongside existing
  └── New inventories use new system
  └── Old inventories continue working

Phase 2: Migration Tools
  └── Provide migration function
  └── User generates proof of old inventory state
  └── Creates new SMT-based inventory with same contents
  └── Old inventory marked as migrated

Phase 3: Deprecation
  └── Stop creating old-style inventories
  └── Old inventories read-only
  └── Eventually remove old contracts
```

### 11.2 Migration Circuit

```rust
/// Proves: old_inventory contents == new_smt_inventory contents
struct MigrationCircuit {
    // Old system witnesses
    old_inventory: [ItemSlot; 16],
    old_blinding: Fr,

    // New system witnesses
    new_smt_root: Fr,
    new_volume: u64,
    new_blinding: Fr,

    // Public inputs
    old_commitment: Fr,
    new_commitment: Fr,
}
```

---

## 12. Implementation Roadmap

### Phase 1: Core Infrastructure (Week 1-2)

```
├── Sparse Merkle Tree
│   ├── smt/mod.rs           # Core SMT implementation
│   ├── smt/proof.rs         # Merkle proof generation
│   ├── smt/gadgets.rs       # In-circuit SMT verification
│   └── smt/tests.rs
│
├── Commitment Scheme
│   └── commitment.rs        # Hash(root, volume, blinding)
│
└── Signal Hash
    └── signal.rs            # Signal hash computation
```

### Phase 2: Circuits (Week 2-3)

```
├── circuits/
│   ├── state_transition.rs  # Deposit/Withdraw
│   ├── item_exists.rs       # Ownership proofs
│   ├── capacity_proof.rs    # Volume compliance
│   └── gadgets/
│       ├── merkle.rs        # Merkle proof constraints
│       ├── range.rs         # Range checks
│       └── comparison.rs    # >= and <= constraints
```

### Phase 3: Prover & Server (Week 3-4)

```
├── prover/
│   ├── setup.rs             # Generate proving/verifying keys
│   ├── prove.rs             # Proof generation
│   └── witness.rs           # Witness computation
│
├── proof-server/
│   ├── routes.rs            # API endpoints
│   └── handlers/
│       ├── state_transition.rs
│       ├── item_exists.rs
│       └── capacity.rs
```

### Phase 4: Contracts & Integration (Week 4-5)

```
├── packages/inventory_v2/
│   ├── sources/
│   │   ├── inventory.move   # Core struct & functions
│   │   ├── registry.move    # Volume registry
│   │   └── verifying_keys.move
│   └── tests/
│
├── web/
│   └── Update UI for new system
```

### Phase 5: Testing & Optimization (Week 5-6)

```
├── Benchmarking
│   ├── Measure actual proving times
│   ├── Optimize hot paths
│   └── Consider GPU proving for production
│
├── Security Audit Prep
│   ├── Document security assumptions
│   ├── Fuzz testing
│   └── Edge case analysis
```

---

## Appendix A: SMT Depth Selection

| Depth | Max Items | Merkle Constraints | Total (StateTransition) | Proving Time |
|-------|-----------|-------------------|------------------------|--------------|
| 10 | 1,024 | 3,000 | ~8,000 | ~80ms |
| 12 | 4,096 | 3,600 | ~9,200 | ~92ms |
| 14 | 16,384 | 4,200 | ~10,400 | ~104ms |
| 16 | 65,536 | 4,800 | ~11,200 | ~112ms |
| 18 | 262,144 | 5,400 | ~12,800 | ~128ms |
| 20 | 1,048,576 | 6,000 | ~14,000 | ~140ms |

**Recommendation:** Start with depth 16 (65K items). Increase if needed.

---

## Appendix B: Security Considerations

### B.1 Merkle Tree Security

- Tree depth determines collision resistance for item IDs
- Depth 16 with Poseidon: ~128-bit security
- Empty leaf handling must be consistent

### B.2 Volume Overflow

- All volume arithmetic uses field elements
- Range checks prevent overflow/underflow
- Capacity enforced in circuit AND on-chain (defense in depth)

### B.3 Replay Protection

- Nonce incremented on every state change
- Commitments include blinding (can't reuse proofs)
- Signal hash binds all operation parameters

### B.4 Registry Trust

- Registry root is a trusted public parameter
- Admin can update (for new items)
- Changes should be governance-controlled in production

---

## Appendix C: API Endpoints

```
POST /api/v2/prove/state-transition
  Body: {
    old_inventory_state,
    item_id,
    amount,
    registry_cache,
  }
  Returns: {
    proof,
    new_commitment,
    new_volume,
    signal_hash,
  }

POST /api/v2/prove/item-exists
  Body: {
    inventory_state,
    item_id,
    min_quantity,
  }
  Returns: {
    proof,
    signal_hash,
  }

POST /api/v2/prove/capacity
  Body: {
    inventory_state,
  }
  Returns: {
    proof,
    signal_hash,
  }

POST /api/v2/inventory/create
  Body: {
    initial_items: [(item_id, quantity)],
    max_capacity,
  }
  Returns: {
    commitment,
    inventory_state,  // For client storage
  }
```

---

*Document Version: 1.0*
*Architecture: Incremental SMT with Double-Commitment*
*Target Performance: <120ms per operation*
*Max Items: 65,536 (depth 16) to 1M+ (depth 20)*
