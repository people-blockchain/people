# Smart contracts (EVM) — implementation report (draft PR #29)

Status: **draft** — internal testnet wiring only. Not Mainnet. Growth Model A unchanged.

## Owner-approved contract gas tariff (2026-09-29)

| Item | Value | Constant / notes |
| --- | ---: | --- |
| Gas price | **8.7e-7** PPL / gas | `APPROVED_CONTRACT_GAS_PRICE_PPL` in `@people/protocol` / `@people/core` |
| Typical ERC-20-class deploy | **~1.044** PPL | ~`1_200_000` gas at the approved price (`TYPICAL_CONTRACT_DEPLOY_FEE_PPL`) |
| Default tx gas limit (prepay cap) | 2_000_000 | `DEFAULT_TX_GAS_LIMIT`; max prepaid ≈ 1.74 PPL at approved price |

Gas price and block gas limit are **consensus constants** from `@people/protocol` (`APPROVED_CONTRACT_GAS_PRICE_PPL`, `DEFAULT_BLOCK_GAS_LIMIT`). Per-node env overrides fork the network and are **not** used in block validation. Public site mirrors defaults in `website/src/lib/factory-fees.ts` and `/fees`. `/create/contract` shows gas price and typical deploy estimate from `GET /contracts/params`.

Non-integer prepaid gas still bypasses Growth Pool / Model A integer path (unchanged). Growth L1=70 / L2=30, depth=2, pool 15%, Claim D, caps — **not modified** by this tariff.

## Execution engine

Bytecode execution uses **`@ethereumjs/evm` 10.x** with a fixed **Shanghai** hardfork (`PEOPLE_EVM_HARDFORK`). There is no custom opcode interpreter in core.

Determinism: `CHAINID`/`TIMESTAMP`/`NUMBER`/`COINBASE` come from the block execution env (not wall-clock inside the EVM). Header timestamps stored as `Date.now()` milliseconds are converted to Unix seconds for `TIMESTAMP`. Non-hex proposers (e.g. `bootstrap-validator`) hash to a 20-byte coinbase. `PREVRANDAO`/`DIFFICULTY`/`BLOCKHASH` are zeros. `SELFDESTRUCT` (`0xff`) is removed from the opcode set (same product rule as the retired interpreter).

`contractDeploy` / `contractCall` still prepay gas in PPL at `APPROVED_CONTRACT_GAS_PRICE_PPL`. The full quoted `tx.fee` (prepay for `gasLimit`) is debited up front; **unused gas is not refunded** on success or revert (protocol v1 — intentional prepaid model; refund would be a future protocol change). Successful code and storage are written into `ChainState.contracts` and hashed in `stateRoot` (`accounts` and `contracts` keys are canonicalized/sorted for order-independent roots). `POST /contracts/call` remains `eth_call`-style read-only (`isStatic`), with per-IP rate limiting and a lower max gas cap on the node (non-consensus). `buildBlock` / `tryApplyRemoteBlock` are async because `runCall` is async.

**TODO (non-blocking):** `commitState` in `packages/core/src/evm.ts` reads `SimpleStateManager` internal stacks (`accountStack` / `codeStack` / `storageStack`). Prefer an upstream commit/revert API when `@ethereumjs/statemanager` exposes one; pin regression tests on OZ ERC-20 deploy+call when upgrading `@ethereumjs/*`.

Replacing the retired interpreter **changes gas, CREATE addresses, and nested-call semantics** versus the previous TypeScript VM. Nodes on a network must upgrade together (**coordinated node upgrade** still required).

Unsupported / not activated: Cancun+ (`TSTORE`/`TLOAD`, blobs, KZG `0x0a`), Prague BLS, EOF, Ethereum typed txs / receipts, archival `BLOCKHASH` history, `SELFDESTRUCT`.
