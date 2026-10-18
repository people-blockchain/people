# Terminology

This document defines **current** names for the People's Blockchain monorepo. Older
browser storage keys and environment variable names are migrated automatically on read; no
manual action is required for existing installs.

## Product and network

| Term | Usage |
|------|--------|
| **PEOPLE** / **PEOPLE Network** | User-visible product and network name (PEOPLE in caps in UI and docs) |
| **People (PPL)** | Native asset on the live Cosmos EVM testnet/mainnet |
| **people-node** | Legacy TypeScript node + web stack (`people-node/`, npm scope `@people/*`) |
| **people-devnet** | Default chain id string for local legacy devnet only |

## Code identifiers

| Area | Convention |
|------|----------------|
| npm packages | `@people/protocol`, `@people/core`, `@people/node`, `@people/sdk`, `@people/web`, `@people/p2p`, `@people/mobile-lite` |
| Website chain backend env | `NEXT_PUBLIC_CHAIN=people-node` (legacy env aliases `ovn-node` and `legacy` map to the same backend) |
| Browser preferences | `people_lang`, `people_theme`, `people_web3auth_pending` |
| people-node web storage | `people-wallets`, `people-devices`, `people-tx-queue`, … |
| Prometheus (legacy node) | `people_height`, `people_validators`, … |
| Docker dev volumes | `people-data`, `people-data-2` |

## Environment variables (primary names)

| Primary | Purpose |
|---------|---------|
| `PEOPLE_RPC_URL` | Legacy node HTTP RPC (server) |
| `NEXT_PUBLIC_PEOPLE_RPC_URL` | Legacy node HTTP RPC (browser build) |
| `PEOPLE_WS_URL` | Legacy node WebSocket |
| `PEOPLE_NODE_URL` | Node HTTP origin when distinct from RPC |

Legacy env names with the old prefix are still read as fallbacks in website code when the
primary variable is unset.

## Legacy storage / env names

Legacy browser storage keys and environment variable names are **migrated once** on the
client (or read with a server-side fallback for cookies). Do not document the old strings
in product copy; they exist only inside migration helpers and compatibility reads.

## Historical economic labels

Some archived reports still mention **Vallis (VLS)** as the identifier used in the legacy
ledger implementation. The live network asset is **People (PPL)**. When editing runtime
code or user-facing text, use PPL/People only.

## What not to rename

- Live hostnames (`peopleblockchain.network`, `node.peopleblockchain.network`)
- Chain ids of deployed networks (`97401`, `people_97401-1`)
- Deployed contract addresses and Solidity contract names
- JSON-RPC method names (`eth_*`, etc.)
