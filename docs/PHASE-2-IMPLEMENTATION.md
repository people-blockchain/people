# PHASE 2 IMPLEMENTATION: TOKEN FACTORY + BONDING CURVE

**Date:** 2026-09-22  
**Status:** IMPLEMENTED & TESTED  
**Author / Role:** Antigravity / Senior Blockchain Engineer & Technical Architect  
**Repository Baseline:** PEOPLE Network

**Target Platform:** PEOPLE Blockchain
**Working reference:** `docs/TOKEN-ECONOMY.md` (not an Approved Public Specification)  

> **Historical / superseded for native asset naming.** Current runtime native asset is
> **PEOPLE** (`PPL`, id `ppl`). This report describes Phase 2 as built against the then-legacy
> on-chain id `vls`. Do not treat `vls`/`VLS` below as the live asset identity.

---

## 1. Executive Summary

Phase 2 introduces the **Token Factory** and **Virtual Constant-Product Bonding Curve** to PEOPLE Blockchain.

Building directly upon the multi-asset ledger and fee-routing foundation delivered in Phase 1, Phase 2 implements:
1. Protocol-level `tokenCreate` transaction with deterministic 5-way token allocation (60% Curve, 10% Community Pool, 15% Creator, 10% Liquidity Reserve, 5% Ecosystem Reserve).
2. Mandatory minimum launch fee in PPL (`TOKEN_CREATE_MIN_FEE`, owner-approved default **1.045005 PPL**; historically hardcoded **1 PPL**) routed to the protocol fee pool.
3. Virtual constant-product bonding curve ($K = X \times Y$) with $Y_0 = 60 \text{ PPL}$, zero floating-point math, 64-bit integer floor division, and exact conservation.
4. Protocol transactions `curveBuy` and `curveSell` with a **1.00% trading fee** seamlessly routed through the Phase 1 `FeeSplitter` engine (Community Pool, Treasury, Burn, Validators).
5. Creator vesting engine: 10% upfront unlocked at creation, 90% vesting linearly over 180 days (5,184,000 blocks at 3s/block), claimable via `creatorClaim` transaction.
6. Automatic migration trigger: when curve inventory falls to $\le \frac{1}{3}$ of initial allocation (~40% of supply sold net), the curve migrates to an initial locked AMM `LiquidityPoolState` maintaining price continuity ($P_{\text{AMM}} \approx P_{\text{final}}$).
7. Full client SDK support, Node REST endpoints, and state persistence across `ChainStore`.
8. 100% test coverage including Reference Scenario verification (implemented testnet baseline: $S = 1\text{B}$, 120 PPL raised, 9x spot price), property-based supply conservation, and round-trip arbitrage immunity.

---

## 2. Source of Truth & Economic Governance Discipline

In strict compliance with `AGENTS.md` and `docs/TOKEN-ECONOMY.md`:
- **Testnet Working Spec:** Economic parameters are implemented as clearly marked **provisional testnet baselines**. Parameters explicitly fixed by `docs/TOKEN-ECONOMY.md` are implemented as specified; parameters listed as open in `TOKEN-ECONOMY.md` §21 are implemented as testnet working values and remain `TBD` for mainnet (see the provisional testnet baselines documented below).
- **Fixed Allocations:** Standard launch allocation is 60% bonding curve, 10% community pool, 15% creator, 10% liquidity reserve, and 5% ecosystem reserve. The 10% Community Pool allocation is **mandatory**, not optional.
- **Provisional Testnet Baselines (not final protocol constants):** the migrated-pool AMM fee is 30 bps (0.30%, `AMM_FEE_BPS` in `packages/core/src/curve.ts`) and creator vesting is 10% of the creator allocation unlocked upfront with the remaining 90% vesting linearly over 180 days (§5). Both are provisional testnet parameters: the final AMM fee and the final creator vesting schedule remain `TBD` per `TOKEN-ECONOMY.md` §21.
- **Integer Supply Conservation:** Token supplies and reserves are integer-bounded. Any division remainder in token allocation is allocated to the curve to ensure $\sum \text{allocations} \equiv \text{totalSupply}$.
- **Consensus & PoS Security:** Consensus mechanisms, validator roles, block times (3 seconds), and PoS attestation remain untouched. Participants trading curve tokens or creating assets do not become blockchain validators.
- **Out of Scope of Phase 2 (historical):** Mobile Mining, Proof of Humanity / Sybil scoring algorithms, AMM swap execution, DEX trading UI, NFT factory, and creator dashboards were intentionally excluded from this phase. AMM v0.1 (constant-product swaps, LP shares, website `/swap`) is a later implementation; see `docs/PROTOCOL-DECISIONS.md`.

---

## 3. Data Architecture & Protocol Abstractions

### 3.1 Protocol Types (`packages/protocol/src/index.ts`)

```typescript
export interface TokenAllocation {
  bondingCurve: number;     // 60% standard
  communityPool: number;    // 10% standard
  creator: number;          // 15% standard (10% upfront, 90% linear 180-day vesting)
  liquidityReserve: number; // 10% standard
  ecosystemReserve: number; // 5% standard
}

export interface CreatorVestingState {
  assetId: string;
  creator: string;
  totalAllocation: number;
  upfrontUnlocked: number;
  vestedAmount: number;
  claimedAmount: number;
  startBlock: number;
  durationBlocks: number;   // 5,184,000 blocks (180 days)
}

export type CurveStatus = "active" | "migrated";

export interface CurveState {
  assetId: string;
  initialCurveAllocation: number;
  currentTokenReserve: number;
  virtualTokenReserve: number;
  virtualNativeReserve: number;
  actualNativeReserve: number;
  invariantK: string;
  initialPriceReference: number;
  status: CurveStatus;
  migrationThreshold: number;
  migratedAt?: number;
  liquidityPoolId?: string;
}

export type PoolStatus = "active" | "locked";

export interface LiquidityPoolState {
  poolId: string;
  tokenAssetId: string;
  nativeAssetId: string;
  tokenReserve: number;
  nativeReserve: number;
  feeBps: number;           // 30 bps (0.30%)
  status: PoolStatus;
  locked: boolean;
  createdAt: number;
}
```

### 3.2 ChainState Extensions (`packages/core/src/index.ts`)

```typescript
export interface ChainState {
  // Existing state collections...
  assets: Record<string, AssetMetadata>;
  communityPool: CommunityPoolState;
  
  // Phase 2 collections:
  curves: Record<string, CurveState>;
  vesting: Record<string, CreatorVestingState>;
  liquidityReserves: Record<string, number>;
  ecosystemReserves: Record<string, number>;
  launchReserves: Record<string, number>;
  liquidityPools: Record<string, LiquidityPoolState>;
}
```

All Phase 2 collections are incorporated into `createInitialState()`, `computeStateRoot()`, `compactChainStateForCheckpoint()`, `tryApplyRemoteBlock()`, and `ChainStore` persistence.

---

## 4. Bonding Curve Mathematical Engine (`packages/core/src/curve.ts`)

The `BondingCurveEngine` operates on strict constant-product mechanics:

$$K = X \times Y$$

where:
- $X$: Virtual token reserve (initially equal to the 60% curve allocation).
- $Y$: Virtual native reserve (initialized to $Y_0 = 60 \text{ PPL}$).
- $K$: Invariant stored as a stringified integer to prevent 53-bit JavaScript precision loss.

### 4.1 Buy Mechanics
Given gross input native amount $\Delta Y_{\text{gross}}$:
1. Trading fee: $\text{fee} = \lfloor \Delta Y_{\text{gross}} \times \frac{100}{10000} \rfloor = \lfloor 0.01 \times \Delta Y_{\text{gross}} \rfloor$.
2. Net native added: $\Delta Y = \Delta Y_{\text{gross}} - \text{fee}$.
3. New native reserve: $Y_1 = Y_0 + \Delta Y$.
4. New token reserve: $X_1 = \lfloor \frac{K}{Y_1} \rfloor$ (floor rounding ensures $X_1 \times Y_1 \le K$).
5. Tokens received: $\Delta X = X_0 - X_1$.
6. Slippage assertion: $\Delta X \ge \text{minTokensOut}$.
7. Actual native collected: $\text{actualNativeReserve} = \text{actualNativeReserve} + \Delta Y$.

### 4.2 Sell Mechanics
Given input tokens $\Delta X$:
1. New token reserve: $X_1 = X_0 + \Delta X$.
2. New native reserve: $Y_1 = \lfloor \frac{K}{X_1} \rfloor$.
3. Gross native out: $\Delta Y_{\text{gross}} = Y_0 - Y_1$.
4. Reserve solvency assertion: $\Delta Y_{\text{gross}} \le \text{actualNativeReserve}$ (virtual reserve cannot be extracted).
5. Trading fee: $\text{fee} = \lfloor \Delta Y_{\text{gross}} \times \frac{100}{10000} \rfloor$.
6. Net native paid to seller: $\Delta Y_{\text{net}} = \Delta Y_{\text{gross}} - \text{fee}$.
7. Slippage assertion: $\Delta Y_{\text{net}} \ge \text{minNativeOut}$.

### 4.3 Integer Safety & Overflow Prevention
All internal calculations are computed using JavaScript native `BigInt` arithmetic. Safe conversion back to JavaScript safe numbers is guarded by `toSafeInteger()`, which throws if values exceed `Number.MAX_SAFE_INTEGER` ($2^{53} - 1$).

---

## 5. Creator Vesting Schedule

- **Total Creator Share:** 15% of total supply.
- **Upfront Unlocked:** $10\% \times 15\% = 1.5\%$ of total supply, credited directly to creator account at `tokenCreate`.
- **Linear Vesting:** $90\% \times 15\% = 13.5\%$ of total supply, vested linearly over $5{,}184{,}000$ blocks:

$$\text{vested}(h) = \text{upfront} + \left\lfloor \frac{\text{unvested} \times \min(h - h_{\text{start}}, \text{duration})}{\text{duration}} \right\rfloor$$

- **Claims:** Claimed via `creatorClaim` transaction. Only the verified creator can claim. Tokens are transferred from vesting state to creator wallet balance deterministically.

---

## 6. Migration Trigger & AMM Liquidity Seeding

### 6.1 Trigger Condition
Migration occurs when the remaining token inventory on the curve drops to or below $\frac{1}{3}$ of the initial allocation:

$$\text{currentTokenReserve} \le \left\lfloor \frac{\text{initialCurveAllocation}}{3} \right\rfloor$$

### 6.2 Price Continuity & Pool Seeding
To eliminate price arbitrage during migration, the AMM pool spot price matches the final bonding curve spot price:

$$\frac{Y_{\text{pool}}}{X_{\text{pool}}} = P_{\text{final}} = \frac{Y_{\text{final}}}{X_{\text{final}}}$$

$$X_{\text{pool}} = \left\lfloor \frac{Y_{\text{pool}} \times X_{\text{final}}}{Y_{\text{final}}} \right\rfloor$$

- $Y_{\text{pool}} = \text{actualNativeReserve}$ (100% of non-virtual native raised on the curve).
- $X_{\text{pool}}$ is sourced **first** from `liquidityReserve` (10% of total supply).
- Shortfall (if any) is drawn from remaining curve token inventory.
- Remaining unsold curve tokens are routed to `launchReserves[assetId]`.
- The liquidity pool is created with status `"locked"` (protocol-owned liquidity, rug-proof).

---

## 7. Reference Scenario Verification (Implemented Testnet Baseline)

The reference scenario below is the **implemented testnet baseline**, defined by the bonding-curve constants and allocation logic in `packages/core/src/curve.ts` and asserted by the automated tests in `packages/core/src/curve.test.ts`. It is **not** defined in `docs/TOKEN-ECONOMY.md`; §22 of that document is the protocol safety rule for AI agents, not a numeric reference scenario.
- Total supply: $S = 1{,}000{,}000{,}000$.
- Initial curve tokens: $X_0 = 600{,}000{,}000$ (60%).
- Initial virtual native: $Y_0 = 60 \text{ PPL}$.
- Invariant: $K = 600{,}000{,}000 \times 60 = 36{,}000{,}000{,}000$.
- Initial spot price: $P_0 = \frac{60}{600{,}000{,}000} = 10^{-7} \text{ PPL/token}$.

### Target Results Verified by Automated Tests:
1. **Tokens Sold:** $400{,}000{,}000$ tokens ($40\%$ of total supply), leaving $200{,}000{,}000$ tokens in reserve ($=\frac{1}{3}$ threshold).
2. **Native Reserve:** $Y_1 = \frac{36{,}000{,}000{,}000}{200{,}000{,}000} = 180 \text{ PPL}$.
3. **Net PPL Raised:** $180 - 60 = 120 \text{ PPL}$.
4. **Final Spot Price:** $P_{\text{final}} = \frac{180}{200{,}000{,}000} = 9 \times 10^{-7} \text{ PPL/token}$.
5. **Spot Price Ratio:** $\frac{P_{\text{final}}}{P_0} = \frac{9 \times 10^{-7}}{10^{-7}} = \mathbf{9\times}$ price increase across curve lifecycle.
6. **Pool Seeding:**
   - $Y_{\text{pool}} = 120 \text{ PPL}$.
   - $X_{\text{pool}} = \lfloor \frac{120 \times 200{,}000{,}000}{180} \rfloor = 133{,}333{,}333 \text{ tokens}$.
   - Sourced from 100M Liquidity Reserve + 33,333,333 from curve inventory.
   - Residual curve inventory to Launch Reserve: $200{,}000{,}000 - 33{,}333{,}333 = 166{,}666{,}667 \text{ tokens}$.
   - Conservation: $133{,}333{,}333 + 166{,}666{,}667 = 300{,}000{,}000 \equiv 100\text{M} (\text{Liq}) + 200\text{M} (\text{Curve})$.

---

## 8. Client SDK & Node REST API

### 8.1 SDK Methods (`@people/sdk`)
- `client.createToken(privateKey, options)`: Signs and submits `tokenCreate`.
- `client.buyCurveTokens(privateKey, options)`: Signs and submits `curveBuy`.
- `client.sellCurveTokens(privateKey, options)`: Signs and submits `curveSell`.
- `client.claimVestedTokens(privateKey, options)`: Signs and submits `creatorClaim`.
- `client.getCurve(assetId)`: Fetches curve state.
- `client.getCreatorVesting(assetId)`: Fetches vesting status and claimable tokens.
- `client.getLiquidityPool(poolId)`: Fetches AMM pool state.
- `client.getTokenAllocation(assetId)`: Fetches allocation breakdown.

### 8.2 Node REST Endpoints (`@people/node`)
- `GET /assets/:assetId/curve`
- `GET /assets/:assetId/vesting`
- `GET /assets/:assetId/liquidity`
- `GET /liquidity-pools/:poolId`

---

## 9. Verification & Test Summary

| Package | Test Suites | Tests Run | Result |
|---|---|---|---|
| `@people/core` | `src/index.test.ts`, `src/curve.test.ts` | 63 passed | **100% PASS** |
| `@people/sdk` | `src/index.test.ts`, `dist/index.test.js` | 14 passed | **100% PASS** |
| `@people/node` | `src/api.integration.test.ts`, `src/node-service.test.ts` | 4 passed | **100% PASS** |
| `@people/p2p` | `src/index.test.ts`, `dist/index.test.js` | 6 passed | **100% PASS** |
| **Total** | **8 Test Files** | **87 Tests** | **ALL PASSED** |

Typecheck and linter ran with 0 errors across all 7 workspace packages.

---

## 10. Status Discipline & Next Steps

- **Phase 2 Status:** `IMPLEMENTED` & `TESTED`.
- **Scope Discipline:** In accordance with `AGENTS.md` Rule 16 ("Do Not Continue Beyond the Requested Scope"), execution stops here.
- **Subsequent Phases:**
  - Phase 3: Mobile Participation & Proof of Humanity / Sybil Resistance mechanisms.
  - Phase 4 remainder: richer DEX routing / UI beyond AMM v0.1. Constant-product token/PPL swaps, LP shares, and `/swap` are implemented (see `docs/PROTOCOL-DECISIONS.md`).
