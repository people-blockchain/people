# Cosmos EVM migration — People's Blockchain

**Status:** Stage 1 **IMPLEMENTED** (chain scaffold + local testnet). Stages 2–6 **TBD** / founder-gated.

**Decision:** Kirill (owner / validator operator), 2026-10-02 — migrate testnet and mainnet from the custom TypeScript node (`people-node`, Fastify + embedded EVM) to **Cosmos EVM** (`cosmos/evm`), with Solidity contracts for token factory, bonding curve, Uniswap V2–style AMM, and NFTs.

The legacy `people-node` stack remains running until cutover; Stage 1 does **not** modify `people-node/`, `website/`, or production deployments.

---

## Migration stages (approved plan)

| Stage | Scope | Status |
| --- | --- | --- |
| **1** | Cosmos EVM chain scaffold: `chain/`, local 3-validator testnet, `peopled`, EVM RPC, CI build/smoke | **IMPLEMENTED** (this repo) |
| **2** | Solidity: token factory, bonding curve, AMM (Uniswap V2 fork), NFT, agent wallet, governance | **IMPLEMENTED** (`contracts/`, `docs/CONTRACTS-STAGE2.md`) |
| **3** | On-chain fee split: validators 30% / community 25% / treasury 20% / liquidity 10% / growth 15% / burn 0% | **TBD** (economics founder-gated) |
| **4** | Genesis snapshot: PPL balances, tokens, pools, NFTs at same `0x` addresses | **TBD** |
| **5** | Website → standard EVM JSON-RPC (replace custom REST paths) | **TBD** |
| **6** | Public testnet, external audit, mainnet after owner OK | **TBD** |

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

## What changes vs `people-node` (future stages)

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

- Local / server validators: `docs/KIRILL-TESTNET-NODES-STAGE1.md` (Russian).
- Chain README: `chain/README.md`.
