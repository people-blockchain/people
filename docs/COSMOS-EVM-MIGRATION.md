> **Status 2026-10-14:** Public cutover is **complete**. Users and the site use Cosmos EVM testnet **97401** with live Solidity factories/AMM/NFT. This file remains as the migration design/history; do not treat remaining checklist items as blocking the public testnet.

# Cosmos EVM migration — PEOPLE Blockchain

**Status (2026-10-14):** Public Cosmos EVM testnet **97401** is live; Stage 1–2 and website JSON-RPC cutover are **done**. Stages 3–4 (fee-split module / full PEOPLE Network genesis replay) remain TBD / founder-gated. Stage 6 mainnet still TBD.

**Decision:** validator operator / core team, 2026-10-02 — migrate testnet and mainnet from the custom TypeScript node (`people-node`, Fastify + embedded EVM) to **Cosmos EVM** (`cosmos/evm`), with Solidity contracts for token factory, bonding curve, Uniswap V2–style AMM, and NFTs.

Legacy `people-node` is archive-only for the public network. Production site and RPC already target Cosmos EVM 97401.

---

## Migration stages (approved plan)

| Stage | Scope | Status |
| --- | --- | --- |
| **1** | Cosmos EVM chain scaffold: `chain/`, local 3-validator testnet, `peopled`, EVM RPC, CI build/smoke | **IMPLEMENTED** (this repo) |
| **2** | Solidity: token factory, bonding curve, AMM (Uniswap V2 fork), NFT, agent wallet, governance | **IMPLEMENTED** (`contracts/`, `docs/CONTRACTS-STAGE2.md`) |
| **3** | On-chain fee split: validators 30% / community 25% / treasury 20% / liquidity 10% / growth 15% / burn 0% | **TBD** (economics founder-gated) |
| **4** | Genesis snapshot: PPL balances, tokens, pools, NFTs at same `0x` addresses | **TBD** |
| **5** | Website → standard EVM JSON-RPC (replace custom REST paths) | **IMPLEMENTED** (site uses `/api/evm/rpc` → node JSON-RPC) |
| **6** | Public testnet, external audit, mainnet after owner OK | **Public testnet LIVE**; mainnet `people_97400-1` / EVM **97400** tooling ready and rehearsed, launch pending owner inputs (see `docs/MAINNET-LAUNCH.md`) |

---

## What Stage 1 delivers

- Top-level `chain/` built from pinned **cosmos/evm** `v0.4.0` example (`evmd` → **`peopled`**).
- Network identity:
  - Cosmos: `people_97401-1`
  - EVM: `97401` (`0x17c79`)
  - Denom: `appl` (display PPL)
  - Bech32: `people`
- `Dockerfile`, `docker-compose.yml` (3 validators), `scripts/init-testnet.sh`, health checks, GitHub Actions `chain-build` job.
- Verified locally: build, multi-validator blocks, `eth_chainId`, MetaMask-style `eth_sendRawTransaction`.

---

## What changed vs `people-node` (migration target; public testnet already on Cosmos EVM)

| Area | Current (`people-node`) | Target (Cosmos EVM) |
| --- | --- | --- |
| Consensus / blocks | Custom PoS + attestations, LevelDB | CometBFT + Cosmos SDK app |
| Execution | `@ethereumjs/evm` in core | Native EVM module (go-ethereum) |
| RPC | Fastify REST + partial JSON-RPC | Standard Ethereum JSON-RPC (+ Cosmos REST/gRPC) |
| Token factory / curve / AMM / NFT | Protocol txs + TS engines | Solidity contracts + precompiles as needed |
| Fee routing (Model A) | `growth-pool.ts` etc. | Stage 3: contract or module policy (**TBD**) |
| Mobile participation | Participant protocol (not validators) | Unchanged product rule; not consensus validators |
| Explorer / website | Custom `/network` proxy | Stage 5: EVM RPC + indexers |

---

## What does **not** change in Stage 1

- `people-node` code, Docker images, internal testnet (`CHAIN_ID=people-internal-testnet`).
- `website/` RPC defaults and explorer.
- Economic constants (Model A percentages are documented for Stage 3 only).

---

## Repository layout

```text
chain/
  ...
contracts/
  src/           # Stage 2 Solidity (Foundry)
  script/Deploy.s.sol
docs/
  CONTRACTS-STAGE2.md
  COSMOS-EVM-MIGRATION.md
```

---

## Operator references

- Chain README: `chain/README.md`.
