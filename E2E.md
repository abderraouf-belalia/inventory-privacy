# E2E Test Setup Guide

This guide walks through setting up a complete local environment for testing the inventory-privacy system end-to-end.

## Prerequisites

- Rust toolchain (stable)
- Node.js 18+
- Sui CLI installed (`cargo install --locked --git https://github.com/MystenLabs/sui.git --branch mainnet sui`)

## Services Overview

| Service | Port | Description |
|---------|------|-------------|
| Sui Local Network | 9000 | Local blockchain |
| Sui Faucet | 9123 | Test SUI tokens |
| Proof Server | 3000 | ZK proof generation API |
| Web Frontend | 5173 | React UI |

## Step-by-Step Setup

### 1. Build and Export Verifying Keys

Generate the verifying keys needed for on-chain proof verification:

```bash
cargo build --release -p inventory-prover --bin export-vks
cargo run --release -p inventory-prover --bin export-vks
```

This creates `keys/verifying_keys.json` containing VKs for all 4 circuits (deposit, withdraw, transfer, item_exists).

### 2. Build Move Contracts

```bash
cd packages/inventory
sui move build
```

### 3. Start Local Sui Network

```bash
sui start --with-faucet --force-regenesis
```

This starts:
- Sui fullnode on `http://127.0.0.1:9000`
- Faucet service on `http://127.0.0.1:9123`

> **Note:** Use `--force-regenesis` to start fresh. The process runs in the foreground, so use a separate terminal.

### 4. Configure Sui Client for Localnet

In a new terminal:

```bash
sui client new-env --alias localnet --rpc http://127.0.0.1:9000
sui client switch --env localnet
```

### 5. Get Gas from Faucet

```bash
sui client faucet
```

Wait a few seconds for the transaction to complete. Verify with:

```bash
sui client gas
```

### 6. Deploy Contracts

```bash
cd packages/inventory
sui client publish --gas-budget 100000000
```

Save the output values:
- **Package ID** - The published package address
- **Registry ID** - The shared Registry object (look for `0x2::dynamic_field::Field` or the Registry type)
- **AdminCap ID** - The admin capability object

Example output:
```
Package ID: 0xf100a27caab6acc234353a11c58af157dc31753c0b70c3ca494b0b41331131a4
Registry:   0xafb4e1d88cbe0231c553e93481458736f4fc34e1584a51d07e59875e0e37cec1
AdminCap:   0x7868e0bb98d64aaeeeed495dca45999929f261f1d2c143a7d861ab357bb171d5
```

### 7. Start Proof Server

```bash
cargo run --release -p inventory-proof-server
```

The server loads circuit keys on startup and listens on `http://localhost:3000`.

Endpoints:
- `POST /prove/item-exists` - Generate item existence proof
- `POST /prove/deposit` - Generate deposit proof
- `POST /prove/withdraw` - Generate withdraw proof
- `POST /prove/transfer` - Generate transfer proof

### 8. Start Web Frontend

```bash
cd web
npm install  # First time only
npm run dev
```

Open `http://localhost:5173` in your browser.

## Using the Web UI

1. **Configure Contracts**: Go to the "On-Chain" page and enter:
   - Package ID from step 6
   - Verifying Keys Object ID (created after calling `init_verifying_keys`)

2. **Connect Wallet**: Use a Sui wallet extension or the built-in functionality

3. **Test Features**:
   - **Create Inventory**: Initialize a new private inventory
   - **Prove Ownership**: Generate ZK proof that you own specific items
   - **Deposit/Withdraw**: Add or remove items with ZK proofs
   - **Transfer**: Move items between inventories privately

## Troubleshooting

### Lock file errors when starting Sui
```
Cannot open DB... The process cannot access the file because it is being used by another process
```

Solution: Kill any existing Sui processes and delete lock files:
```bash
# Windows
taskkill /F /IM sui.exe
Remove-Item -Recurse -Force ~/.sui/sui_config/authorities_db

# Linux/Mac
pkill sui
rm -rf ~/.sui/sui_config/authorities_db
```

### Wallet has no coins
```
Wallet Error: No address found with sufficient coins
```

Solution: Request more from faucet:
```bash
sui client faucet
```

### Proof server can't find keys
Ensure you've run the `export-vks` binary first and the `keys/` directory contains the `.bin` files.

## Quick Start Script

For convenience, you can use the provided scripts:

```bash
# Start local Sui (Unix)
./scripts/start-local-sui.sh

# Deploy contracts (Unix)
./scripts/deploy-local.sh

# Run E2E test (Windows PowerShell)
./scripts/run-e2e-test.ps1
```
