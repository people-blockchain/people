# PHASE 1 IMPLEMENTATION: MULTI-ASSET LEDGER & FEE INFRASTRUCTURE

**Date:** 2026-09-22  
**Status:** IMPLEMENTED & TESTED  
**Author / Role:** Antigravity / Senior Blockchain Engineer & Technical Architect  
**Repository Baseline:** PEOPLE Network

**Target Platform:** People's Blockchain

> **Historical / superseded for native asset naming.** Current runtime native asset is
> **People** (`PPL`, id `ppl`). `VLS` / `vls` / `Vallis` below record this document’s
> original checkout. Do not treat them as the live asset identity.

---

## 1. Executive Summary

Phase 1 establishes the multi-asset ledger foundation and integer-safe fee distribution architecture for People's Blockchain.

Prior to Phase 1, the PEOPLE Network core was strictly a single-asset ledger (`balance: number` of native VLS), transaction fees were directly merged into epoch base issuance, and no secondary assets, community pool state, or separable fee destinations existed.

In Phase 1, the core protocol was upgraded to:
1. Support multi-asset balances (`balances: Record<string, number>`) per account while preserving 100% backward compatibility with `account.balance` for native VLS.
2. Provide an on-chain Asset Registry supporting native, user-issued, and pool-backed tokens with integer base units.
3. Introduce a mathematically conservative `FeeSplitter` engine guaranteeing zero token creation/destruction from fee rounding.
4. Add a protocol-level `CommunityPoolState` accounting registry tracking lifetime allocations, distributions, and remaining balances per asset.
5. Provide backward-compatible REST API endpoints and SDK methods for multi-asset queries.
6. Verify all state transitions, persistence, and conservation invariants with comprehensive automated test suites.

---

## 2. Source of Truth & Economic Governance Discipline

In strict accordance with `AGENTS.md` and `docs/ECONOMICS.md`:
- **Native Asset:** Native asset identifier remains `"vls"` / `VLS`. No asset rename was performed.
- **Native Supply & Issuance:** Existing 1,000,000 VLS faucet genesis balance and 50 VLS epoch base issuance (10 blocks per epoch) remain completely unchanged.
- **Economic Percentages (historical Phase 1 note):** Phase 1 introduced `PROVISIONAL_FEE_SPLIT` (40 / 25 / 20 / 10 / 5) as a simulation constant. **Current approved public split** is Model A (30 / 25 / 20 / 10 / 15 / 0) per `docs/ECONOMIC-MODEL-v0.1.md` and `docs/ECONOMICS.md` §6; live eligible-integer routing uses `APPROVED_MODEL_A_SHARES` when Growth fee split is active.
- **Consensus & Sybil:** Consensus, validator selection, block production, PoS staking requirements, and attestation finality rules were **NOT** altered.
- **No Token Factory UX / DEX:** Token creation is maintained strictly as an internal protocol registry mechanism; public creation endpoints, AMMs, liquidity bonding curves, and mobile mining algorithms remain scheduled for subsequent phases.

---

## 3. Data Model & Protocol Abstractions

### 3.1 Protocol Types (`packages/protocol/src/index.ts`)

```typescript
export type AssetType = "native" | "user" | "pool";
export type AssetStatus = "active" | "frozen";

export interface AssetMetadata {
  id: string;             // Canonical lowercase identifier (e.g. "vls", "pep")
  symbol: string;         // Uppercase display symbol (e.g. "VLS", "PEP")
  name: string;           // Human readable asset name
  decimals: number;       // Base unit decimal places (default 6)
  type: AssetType;        // Asset classification
  issuer: string;         // Creator address or "network"
  totalSupply: number;    // Current circulating supply in base units
  maxSupply?: number;     // Optional hard cap
  status: AssetStatus;    // "active" | "frozen"
  createdAt: number;      // Block height of registration
}

export interface FeeSplitConfig {
  validatorShare: number;   // Percentage or basis points (must sum to 100 or 10000)
  communityShare: number;
  treasuryShare: number;
  liquidityShare: number;
  burnShare: number;
}

export interface AssetPoolAccounting {
  assetId: string;
  totalAllocated: number;
  totalDistributed: number;
  remainingBalance: number;
}

export interface CommunityPoolState {
  pools: Record<string, AssetPoolAccounting>;
}
```

### 3.2 Account State Compatibility

To prevent breaking any legacy PEOPLE Network code or tests:
```typescript
export interface AccountState {
  balance: number;                   // Native VLS balance (backward compatibility mirror)
  balances?: Record<string, number>; // Multi-asset ledger balances
  nonce: number;
}
```
Whenever an account is initialized via `ensureAccount(state, address)`, `balances` is initialized with `{ [NATIVE_ASSET_ID]: balance }`. Every mutation of `account.balance` automatically syncs to `account.balances["vls"]`, ensuring dual-read consistency.

---

## 4. Fee Splitting & Conservation Invariant

The `FeeSplitter` guarantees integer precision and exact token conservation:
$$\sum(\text{validator}, \text{communityPool}, \text{treasury}, \text{liquidityReserve}, \text{burned}) = \text{totalFee}$$

### Rounding Discipline
For integer base fees:
1. Shares are computed using integer division: $\lfloor \text{totalFee} \times \text{share} / \text{totalUnits} \rfloor$.
2. Any fractional remainder is systematically credited to the `validator` share:
   $$\text{validator} = \text{totalFee} - (\text{community} + \text{treasury} + \text{liquidity} + \text{burn})$$
3. This ensures no token drift, rounding leakage, or phantom supply expansion.

For legacy fractional fees (e.g., in legacy tests with 0.1 VLS fee):
- Amounts are scaled by $10^6$, computed via integer division, and unscaled to 6 decimal places, with remainder allocated to the validator.

---

## 5. Multi-Asset State Transitions (`packages/core/src/index.ts`)

### 5.1 Asset Registration
Assets are registered in `state.assets[assetId]`. Registration validates:
- Valid lowercase asset identifier regex: `^[a-z0-9_-]{2,32}$`
- Disallows re-registration or overwriting existing assets.
- Initializes initial supply into the issuer's multi-asset balance.

### 5.2 Transaction Execution (`applyTransaction`)
- **Asset ID Defaulting:** If `tx.assetId` is omitted or empty, it defaults to native `"vls"`.
- **Amount Base Unit Validation:**
  - `tx.amount` must be a safe, positive integer (`Number.isSafeInteger(amount) && amount > 0`).
  - Floating point fractions, NaN, `Infinity`, and negative values are strictly rejected.
- **Dual Fee Deduction:**
  - Transaction fee `tx.fee` is always paid in native VLS from `from.balance` (`balances["vls"]`).
  - Transferred `tx.amount` is deducted from `from.balances[assetId]`.
  - Recipient is credited `tx.amount` in `to.balances[assetId]`.
- **Replay Protection:** Nonce verification and increment apply identically across all asset transfers.

### 5.3 Deterministic State Root
`computeStateRoot(state)` deterministically incorporates:
- Canonical sorted accounts with their multi-asset `balances` mappings.
- Canonical sorted `assets` registry.
- Canonical sorted `communityPool` accounting balances.
- Validators, epoch, proposals, attestation votes, and finalized height.

---

## 6. Persistence & Storage Compatibility (`packages/core/src/storage.ts`)

- **State Deserialization:** In `ChainStore.load()` and `ChainStore.getCheckpoint()`, account balances are normalized to ensure every account has a valid `balances` map containing at least native VLS.
- **State Compaction:** In `compactChainStateForCheckpoint`, `assets`, `communityPool`, `treasury`, and `burned` maps are explicitly retained alongside the tip and window.
- **Restoration Verification:** Reloading a chain store from disk fully restores all secondary token registries, token balances, and community pool accounting with 100% fidelity.

---

## 7. Node API & SDK Extensions

### 7.1 New REST Endpoints (`apps/node`)
- `GET /assets` — Lists all registered assets with metadata and supply.
- `GET /assets/:assetId` — Returns metadata for a specific asset (404 if not found).
- `GET /address/:address/balances` — Returns all asset balances for an address.
- `GET /address/:address/balances/:assetId` — Returns specific asset balance for an address.
- `GET /community-pool` — Returns current Community Pool accounting state across all assets.
- `GET /community-pool/:assetId` — Returns accounting for a specific asset pool.
- `GET /address/:address` & `GET /accounts` — Extended to include multi-asset `balances`.

### 7.2 SDK Methods (`packages/sdk`)
- `client.getAsset(assetId)`
- `client.getAssets()`
- `client.getBalance(address, assetId?)`
- `client.getAllBalances(address)`
- `client.getCommunityPool(assetId?)`
- `client.sendTransfer(options)` extended with optional `assetId`.

---

## 8. Automated Verification & Invariant Proofs

All automated test suites across all packages passed successfully:

| Package / App | Test Count | Status | Description |
|:---|:---|:---|:---|
| `@people/core` | 41 / 41 passed | **GREEN** | Core blockchain, fork choice, multi-asset ledger, fee splitter, community pool, persistence, invariants |
| `@people/sdk` | 10 / 10 passed | **GREEN** | Transaction signing, memo validation, multi-asset client queries |
| `@people/p2p` | 6 / 6 passed | **GREEN** | Gossip, message serialization, peer discovery |
| `@people/node` | 3 / 3 passed | **GREEN** | API integration, lag fields, rejected tx metrics |
| **All Workspaces** | **60 / 60 passed** | **GREEN** | Turborepo full workspace build, typecheck, lint, and test pass |

### Specific Invariants Formally Tested in `packages/core/src/index.test.ts`:
1. **Token Balance Conservation Invariant:**
   For any multi-asset transfer between Alice and Bob, $\Delta \text{Alice} + \Delta \text{Bob} = 0$. Total token supply remains strictly invariant.
2. **Fee Split Conservation Invariant:**
   Across a randomized spectrum of fees ($1 \dots 10^8$), $\text{validator} + \text{community} + \text{treasury} + \text{liquidity} + \text{burn} \equiv \text{totalFee}$ with exactly zero rounding loss.
3. **Deterministic State Root Invariant:**
   Applying the same sequence of multi-asset transactions on independent nodes yields bit-identical `computeStateRoot` outputs.
4. **Replay Protection Invariant:**
   Replaying an identical secondary token transfer transaction fails with strict account nonce validation error.
5. **Fee Payment Invariant:**
   Attempting secondary token transfer without sufficient native VLS balance to pay `tx.fee` is strictly rejected.

---

## 9. Unresolved Economic Parameters (Marked as TBD)

The following parameters remain configurable protocol defaults, awaiting final leadership approval:

| Parameter | Current Default Value | Status |
|:---|:---|:---|
| `FeeSplitConfig.validatorShare` | 40% (provisional) | **TBD** |
| `FeeSplitConfig.communityShare` | 25% (provisional) | **TBD** |
| `FeeSplitConfig.treasuryShare` | 20% (provisional) | **TBD** |
| `FeeSplitConfig.liquidityShare` | 10% (provisional) | **TBD** |
| `FeeSplitConfig.burnShare` | 5% (provisional) | **TBD** |
| Asset Creation Burn Fee | 0 VLS (internal registry) | **TBD** |
| Community Pool Governance Payout Thresholds | TBD | **TBD** |

---

## 10. Next Protocol Phases

Phase 1 scope is complete. Future phases will build upon this foundation:
- **Phase 2:** Token Creation Infrastructure & Bonding Curve AMM.
- **Phase 3:** Identity, Proof of Humanity, and Anti-Sybil Validation.
- **Phase 4:** Participation / Mobile Mining Infrastructure.
