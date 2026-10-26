# ECONOMIC BASELINE VERIFICATION: VLS MONETARY PARAMETERS

**Date:** 2026-09-22  
**Target Commit:** `90e4330d7468a406090cd0770b5bedeb5a72f067` (`feat: add multi-asset and fee infrastructure`)  
**Baseline Commit:** `89619f4c11f722e1a84e638c511439b464a864f3` (`chore: establish peoples blockchain baseline`)  
**Status:** VERIFIED & DOCUMENTED  

> **Historical / superseded for native asset naming.** Current runtime native asset is
> **PEOPLE** (`PPL`, id `ppl`). This verification quotes exact legacy `VLS` values at named
> commits. Do not treat `VLS` below as the live ticker.

---

## 1. Executive Findings

A focused code audit was performed to resolve the apparent discrepancy between:
1. `docs/BASELINE-AUDIT.md` (which reported **50 VLS** base issuance per epoch);
2. `docs/PHASE-1-IMPLEMENTATION.md` (which stated in Section 2 that **10 VLS** per epoch remained unchanged).

### Key Conclusions:
- **Actual Code Value:** The code at commit `90e4330d7468a406090cd0770b5bedeb5a72f067` has **50 VLS** per epoch (`DEFAULT_CONFIG.epochBaseIssuance = 50`).
- **Originating Commit:** The value `50` was defined in the original baseline commit `89619f4c11f722e1a84e638c511439b464a864f3` and was **never modified**.
- **Cause of Discrepancy:** The mention of "10 VLS per epoch" in `docs/PHASE-1-IMPLEMENTATION.md` and the Phase 1 report was an unintentional typographical error by the reporting agent, caused by conflating the **epoch block period** (`10` blocks per epoch, i.e., `block.header.height % 10 === 0`) with the **epoch issuance amount** (`50` VLS).
- **Difference from Original PEOPLE Network Baseline:** **Zero difference**. The running code has remained strictly at 50 VLS per epoch since inception.

---

## 2. Detailed Technical Audit

### 2.1 Current VLS Epoch Issuance in Code

At commit `90e4330d7468a406090cd0770b5bedeb5a72f067`:

File: `packages/core/src/index.ts` (lines 267–276)
```typescript
export const DEFAULT_CONFIG: NetworkConfig = {
  chainId: process.env.CHAIN_ID ?? "people-devnet",
  minStake: 100,
  warmupEpochs: 2,
  unbondingEpochs: 2,
  lightValidatorWeightMultiplier: 0.5,
  epochBaseIssuance: 50,  // <--- Exact value: 50 VLS per epoch
  attestationFinalityThreshold: 0.67,
  referralShare: 0.05
};
```

File: `packages/core/src/index.ts` (line 1359)
```typescript
export function distributeEpochRewards(
  state: ChainState,
  config: NetworkConfig,
  feePool: number
): RewardDistribution {
  ...
  const protocolIssuance = config.epochBaseIssuance; // Evaluates to 50
  ...
```

### 2.2 Git History & Provenance

A git diff analysis between baseline `89619f4` and Phase 1 commit `90e4330` on the search string `epochBaseIssuance`:
- Line 53 in baseline `packages/core/src/index.ts`: `epochBaseIssuance: 50`
- Line 273 in Phase 1 `packages/core/src/index.ts`: `epochBaseIssuance: 50`
- Git commit diff shows **0 lines changed** for `epochBaseIssuance` in `DEFAULT_CONFIG`.

The only occurrences added in `90e4330` were unit test assertions in `packages/core/src/index.test.ts` verifying that `distributeEpochRewards` honors `config.epochBaseIssuance: 50`.

### 2.3 Clarification of the Discrepancy

| Metric | Code Reality | Erroneous Report Text | Note |
|:---|:---:|:---:|:---|
| **Epoch Duration** | **10 blocks** (~30s) | N/A | Hardcoded rule: `height % 10 === 0` |
| **Base Issuance** | **50 VLS** | "10 VLS" | Conflated in Phase 1 report text |
| **Code Modification** | **None** | Claimed "10 VLS unchanged" | No code diff occurred; code has always been 50 |

---

## 3. Fee Split Configuration Verification

In commit `90e4330d7468a406090cd0770b5bedeb5a72f067`, two configurations are defined:

### 3.1 Active Protocol Runtime Default (`DEFAULT_CONFIG`)

In `DEFAULT_CONFIG` (`packages/core/src/index.ts`), `feeSplit` is left `undefined`. When `feeSplit` is not explicitly supplied to `distributeEpochRewards`, it falls back to `LEGACY_FEE_SPLIT` to guarantee 100% backward compatibility for all baseline tests:

```typescript
export const LEGACY_FEE_SPLIT: FeeSplitConfig = {
  validatorShare: 100,  // 100% to active validators
  communityShare: 0,
  treasuryShare: 0,
  liquidityShare: 0,
  burnShare: 0
};
```

### 3.2 Legacy Phase 1 constant (`PROVISIONAL_FEE_SPLIT`) vs approved Model A

**Approved public / runtime eligible-integer split (current):** Validators 30%, Community Pool 25%, Treasury 20%, Liquidity & Ecosystem 10%, Growth Pool 15%, Burn 0% — see `docs/ECONOMIC-MODEL-v0.1.md` and `APPROVED_MODEL_A_SHARES` in `packages/core/src/growth-pool.ts`.

The block below documents the **legacy** `PROVISIONAL_FEE_SPLIT` constant still present in `packages/core/src/index.ts` for tests and non-eligible paths. It is **not** the current approved public fee split.

In `packages/core/src/index.ts`, historical Phase 1 baseline:

```typescript
export const PROVISIONAL_FEE_SPLIT: FeeSplitConfig = {
  validatorShare: 40,   // 40%
  communityShare: 25,   // 25% (Community / PEOPLE Pool)
  treasuryShare: 20,    // 20% (Treasury Reserve)
  liquidityShare: 10,   // 10% (Liquidity & Ecosystem Reserve)
  burnShare: 5          // 5%  (Protocol Burn)
};
```

### 3.3 Explicit Provisional / TBD Status Confirmation

Per Rule 3 (`Never Invent Economic Rules`) of `AGENTS.md`:

| Fee Destination | Provisional Value | Implementation Constant | Formal Status |
|:---|:---:|:---:|:---:|
| **Validator Share** | 40% | `PROVISIONAL_FEE_SPLIT.validatorShare` | **PROVISIONAL / TBD** |
| **Community Pool Share** | 25% | `PROVISIONAL_FEE_SPLIT.communityShare` | **PROVISIONAL / TBD** |
| **Treasury Share** | 20% | `PROVISIONAL_FEE_SPLIT.treasuryShare` | **PROVISIONAL / TBD** |
| **Liquidity & Ecosystem Share** | 10% | `PROVISIONAL_FEE_SPLIT.liquidityShare` | **PROVISIONAL / TBD** |
| **Burn Share** | 5% | `PROVISIONAL_FEE_SPLIT.burnShare` | **PROVISIONAL / TBD** |

These values are working parameters for simulation and testbed execution only. They are not final protocol constants and require explicit leadership / governance approval before mainnet deployment.
