# Token Market Model v0.1

## 1. Status

**Status:** `DESIGN DRAFT / PROPOSED` — not approved as protocol, mainnet, or production economics.

**Purpose.** This document defines a conceptual Token Market Model for user-created assets on PEOPLE Blockchain: how issuance connects to algorithmic price discovery (bonding curve), buy/sell mechanics, liquidity, launch bootstrap, possible later AMM maturity, trading-fee *destinations* (without inventing percentages), transparency, and a future implementation roadmap.

**What this is.**

- A design draft synthesizing the owner outline with existing repository documentation and code references.
- A layer that sits *beside* Token Factory issuance and Network Fee Model A — it does not replace them.

**What this is not / what is not approved.**

- Not an approved mainnet economic parameter set.
- Not a change to Token Factory allocation, Model A fee split, Growth Pool, Claim D, consensus, bonding-curve code, or protocol transactions.
- Not a fair-value, return, or liquidity guarantee.
- Not an NFT, Issuer Bonus, or AMM-implementation specification.

**Attached Bonding Curve source material was not present in this session workspace; draft synthesizes owner outline + existing repo references.** Candidate attachment path and Desktop/Downloads were searched for bonding/curve market-model source material; none matching a dedicated Bonding Curve brief was found. Concept and language therefore follow the owner section outline plus `docs/TOKEN-ECONOMY.md`, `docs/TOKEN-FACTORY.md`, `docs/ECONOMICS.md`, `docs/ECONOMIC-MODEL-v0.1.md` (Model A headers), `docs/PHASE-2-IMPLEMENTATION.md`, and `packages/core/src/curve.ts` (reference only).

**Date:** 2026-09-26  
**Terminology:** brand **PEOPLE**, network **PEOPLE Blockchain**, native token **PEOPLE**, ticker **PPL** (`docs/TERMINOLOGY.md`). Legacy on-chain asset id `"vls"` may appear where implementation is described.

---

## 2. Design Principles

1. **Algorithmic price discovery.** Early markets for user tokens should be able to form without requiring a manual market maker as a mandatory step.
2. **Deterministic execution.** Given the same curve state and inputs, buy/sell outcomes must be reproducible on-chain (or in protocol state) without discretionary pricing.
3. **Transparent on-chain parameters.** Curve parameters that affect price, fees, reserves, and migration must be inspectable; UX must not hide impact or inventory limits.
4. **Permissionless where compatible with security.** Token creation and curve trading should remain accessible to ordinary users, subject to anti-spam fees, rate limits, and security rules already defined elsewhere — without inventing new gatekeeping economics here.
5. **Equal rules.** Same protocol rules for creators and traders of a given launch template; no secret preferential pricing.
6. **No mandatory manual market making.** The protocol may provide an algorithmic market path; creators are not required to hire external MMs for basic discovery.
7. **No fair-value promise.** Curve price is a mechanical function of state, not a statement of intrinsic or economic value.
8. **Bonding curve does not create value from nothing.** The curve prices inventory against PPL already paid in/out; it does not mint economic value or guarantee appreciation. Demand must still be earned by the project (`docs/TOKEN-ECONOMY.md` §16, §20).

---

## 3. Token Issuance Layer

Issuance remains the responsibility of the **Token Factory** / Token Economy specifications. This market model **does not change** allocation percentages, vesting, Community Pool rules, or launch fees.

### 3.1 Linkage (conceptual)

```text
Token Create (Factory)
   → supply allocated to protocol buckets
   → bonding-curve inventory receives the curve-allocated share
   → Community Pool / Creator / Liquidity Reserve / Ecosystem remain separate
   → curve trading discovers price against PPL
   → optional later migration toward AMM liquidity (design direction)
```

### 3.2 Reference-only standard launch allocation

Authoritative product/economic language: `docs/TOKEN-ECONOMY.md` §4 and `docs/TOKEN-FACTORY.md` §5.

| Allocation | Share (working / testnet baseline) | Role relative to market model |
|---|---:|---|
| Bonding Curve / Market Supply | 60% | Public curve inventory for buy/sell |
| Community Pool | 10% (**mandatory** protocol rule for standard template) | Distribution — not curve inventory |
| Creator Allocation | 15% | Creator stake; vesting rules apply |
| Liquidity Reserve | 10% | Intended support for post-curve DEX liquidity |
| Ecosystem / Protocol Reserve | 5% | Grants / integrations / incentives |

**Labels.** Shares other than the mandatory 10% Community Pool are documented as **provisional / testnet baselines** pending founder decision (`docs/TOKEN-FACTORY.md` §6; `docs/TOKEN-ECONOMY.md` §21). They are **not** mainnet-approved constants invented by this draft. This document does not alter them.

### 3.3 Settlement asset

Official user-created token markets should use **PPL** as primary settlement (`docs/TOKEN-ECONOMY.md` §2; `docs/ECONOMICS.md` §16): e.g. `USER_TOKEN / PPL`.

---

## 4. Bonding Curve Layer

### 4.1 Core idea

```text
price = f(curve state)
```

- **Buy** and **sell** update curve state deterministically.
- Marginal price rises as inventory is bought from the curve; falls as tokens are sold back — according to the same pricing mechanism (`docs/TOKEN-ECONOMY.md` §7).

### 4.2 Possible curve families (listed; NOT chosen)

This draft **does not select** a mainnet curve family. For design discussion only, families commonly considered include:

- Linear / affine price schedules  
- Polynomial / power curves  
- Logarithmic curves  
- Exponential curves  
- Constant-product / virtual AMM-style invariants (`x · y = k` and variants)  
- Hybrid or piecewise schedules  

**DESIGN DECISION REQUIRED:** which family (if any) is approved for mainnet.

### 4.3 Parameters left open

| Parameter | Status |
|---|---|
| Curve formula / family | **TBD** / **DESIGN DECISION REQUIRED** |
| Initial price | **TBD** |
| Initial reserve (virtual and/or real) | **TBD** |
| Slope / shape coefficients | **TBD** |
| Migration threshold definition | **TBD** (capital, inventory, participants, or combination — see §9) |

### 4.4 Existing implementation — reference only (testnet / provisional)

`packages/core/src/curve.ts` currently implements a **virtual constant-product** bonding curve for the testnet surface, with provisional constants such as `VIRTUAL_NATIVE_RESERVE_BASE`, `CURVE_FEE_BPS`, and migration when remaining inventory ≤ 1/3 of initial curve allocation. `docs/PHASE-2-IMPLEMENTATION.md` and `docs/TOKEN-FACTORY.md` document these as **implemented testnet baselines**, not final protocol constants.

This market-model draft **references** that code for honesty about what exists today. It does **not** promote those numbers or that formula to mainnet-approved status, and it does not change the code.

---

## 5. Buy Mechanics

Conceptual flow (values **TBD** where not already specified elsewhere as provisional testnet):

```text
User quotes buy (PPL in → tokens out)
   → protocol reads current curve state
   → computes deterministic tokensOut, fee, new reserves
   → checks slippage / min received
   → on accept: transfer PPL, mint/deliver tokens from curve inventory, update state
   → may evaluate migration trigger
```

Required conceptual properties:

| Property | Intent |
|---|---|
| Quoted vs execution | Quote reflects current state; execution uses state at apply time |
| Slippage / min received | User-specified minimum tokens out; fail if violated |
| Price impact | Larger buys move further along the curve |
| Fee | Trading fee concept exists; **concrete bps TBD for mainnet** (testnet baseline exists in code — provisional) |
| Deterministic transition | Same inputs + state → same outputs |

Concrete mainnet values for fee bps, min-trade sizes, and quote UX thresholds: **TBD** / **DESIGN DECISION REQUIRED**.

---

## 6. Sell Mechanics

Conceptual flow:

```text
User sells tokens into the curve
   → protocol computes gross PPL out from curve math
   → deducts trading fee (if any)
   → pays seller only from **actual** native reserve held by the curve
   → updates virtual/actual reserves and token inventory
```

**Exit liquidity source transparency.** Sellers receive PPL that was previously paid into the curve (actual native reserve), not an unlimited protocol mint of PPL for exits.

**No unlimited liquidity promise.** If sell demand exceeds actual reserve or curve math yields insufficient output, the trade fails or is bounded by reserve — the market model must not imply infinite exit liquidity.

---

## 7. Price Discovery

- The bonding curve produces a **deterministic spot / marginal price** from public state.
- That price is **not** fair value, intrinsic value, NAV, or a prediction of future economic value.
- External markets (if any), project utility, and off-curve demand can diverge from curve price.
- Product and marketing language must keep this distinction explicit (`docs/TOKEN-ECONOMY.md` §16, §20; `docs/ECONOMICS.md` §19 Anti-Ponzi).

---

## 8. Liquidity Model

Distinguish carefully:

| Concept | Meaning |
|---|---|
| **Algorithmic mechanism** | Curve (or later AMM) that quotes and settles trades by rule |
| **Economic liquidity** | Willingness of capital to stand on both sides of the market |
| **Reserve** | Assets actually held to honor sells / seed pools (e.g. actual native reserve; Liquidity Reserve bucket) |
| **Depth** | How much size can trade before large impact |
| **Treasury / fee Liquidity & Ecosystem** | Network-level buckets from Model A — **not** the same as per-asset curve inventory |
| **Future AMM** | Possible mature venue after bootstrap (§10) |

**Auto market ≠ deep liquidity.** An always-on curve can provide *some* continuous market without guaranteeing deep, low-impact liquidity. Depth depends on inventory, reserves, parameters, and demand — all subject to TBD mainnet choices.

---

## 9. Launch / Bootstrap

Default path (aligned with `docs/TOKEN-ECONOMY.md` §7–§9):

```text
Create Token
   → Bonding Curve active
   → Price discovery via buys/sells
   → Liquidity accumulates (actual native + reserved token inventory)
   → Threshold reached (definition TBD)
   → Possible migration toward AMM / locked pool
   → Open / continued trading
```

**Thresholds TBD.** Candidates discussed in existing docs (not chosen here as mainnet law): PPL raised, participant count, market-cap proxy, liquidity target, inventory sold fraction, or a combination. v0.1 Token Economy recommends preferring a **measurable capital/liquidity threshold** after simulation — still **DESIGN DECISION REQUIRED** for mainnet.

Implemented testnet migration trigger (inventory ≤ 1/3 of initial curve allocation) is **provisional** — reference only.

---

## 10. AMM / Mature Market — Design Direction Only

**DESIGN DIRECTION only.** After bootstrap, a token may graduate to an AMM-style `TOKEN / PPL` pool so that trading continues with pool reserves rather than (or in addition to) the launch curve.

This draft:

- does **not** name or select a specific DEX product;
- does **not** specify pool fee tiers, tick spacing, concentrated liquidity, or LP incentives;
- does **not** authorize AMM implementation work.

Post-migration rules that already appear as product intent elsewhere: protocol-controlled migration, creator cannot withdraw protocol-reserved liquidity, creator allocation remains separate and subject to vesting (`docs/TOKEN-ECONOMY.md` §10–§11). Final AMM fee remains **TBD** for mainnet (testnet baseline `AMM_FEE_BPS` is provisional).

---

## 11. Trading Fees

### 11.1 Separation of fee layers (critical)

| Layer | What it is | Status |
|---|---|---|
| **Network Fee Model A** | Split of eligible **protocol / network** fees: Validators 30% / Community Pool 25% / Treasury 20% / Liquidity & Ecosystem 10% / Growth Pool 15% / Burn 0% | **APPROVED** runtime model (`docs/ECONOMICS.md` §6.1; `docs/ECONOMIC-MODEL-v0.1.md`) |
| **Asset Trading Fee Model** | Fee charged on **user-token curve (and later AMM) trades** — rate and destination table for *that* fee | **Separate design surface**; percentages for mainnet **TBD** |

**Model A is not automatically the user-token trading fee split.** Reusing Model A destinations for curve/AMM trading fees — or choosing a different destination table — is an explicit product decision. This draft lists possible destinations without inventing new percentages.

### 11.2 Possible destinations for asset trading fees (no new %)

Without assigning shares here, destinations that may be considered in a future decision include (non-exhaustive, non-normative):

- Validators / security budget  
- PEOPLE / Community Pool  
- Treasury  
- Liquidity & Ecosystem (network reserve)  
- Growth Pool  
- Burn (Model A network burn is 0%; any burn on trading fees would be a separate approval)  
- Per-asset liquidity / curve reserve reinforcement  
- Creator or project-facing buckets (only if explicitly approved later — not assumed)

**DESIGN DECISION REQUIRED:** trading fee rate(s); whether destinations mirror Model A; whether curve fee and AMM fee share one table.

### 11.3 Testnet reference (provisional)

Current testnet code applies a curve trading fee constant and routes that fee through `routeTradingFee` in core (see `packages/core/src/curve.ts`, `growth-pool.ts`, `index.ts`). Treat as **testnet / provisional behavior**, not as mainnet approval that Asset Trading Fee Model ≡ Network Fee Model A.

---

## 12. Price Impact and Slippage — UX Honesty

Required honesty in quotes and confirmations:

- Show estimated tokens out / PPL out **and** min received.  
- Show that large size increases impact along the curve.  
- Do not present curve price as “market fair value.”  
- Do not imply unlimited sell liquidity.  
- Clearly label launch / curve phase vs any post-migration AMM phase.  
- Paid promotion must never be confused with verification or endorsement (`docs/TOKEN-ECONOMY.md` §13, §17).

Concrete UI thresholds and warning bands: **TBD**.

---

## 13. Early Participant Advantage

Early buyers along an upward-sloping curve typically face lower marginal prices than later buyers — a **known property** of bonding-curve launches, not a bug to “hide.”

The protocol:

- does **not** promise equal returns across time;  
- does **not** promise profit;  
- should disclose early-advantage mechanics in plain language.

Anti-manipulation and anti-abuse controls are future considerations (§14), not a denial that ordering matters.

---

## 14. Bot / MEV / Launch Protection — Future Considerations Only

Not implemented by this draft. Future design may consider (non-normative list):

- launch rate limits and creation fees (already directionally present in Token Economy);  
- quote/execution timing and mempool fairness;  
- MEV / sandwich awareness for curve and AMM phases;  
- optional launch windows, caps, or anti-snipe mechanisms;  
- abuse reporting and reputation signals.

None of the above is specified as protocol law here; **no consensus changes** are proposed.

---

## 15. Transparency Requirements

At minimum, for each launched asset in curve (and later pool) phases, public surfaces should expose:

- allocation buckets and amounts (Factory preview already targets this);  
- curve status, reserves (virtual vs actual), inventory remaining, invariant / parameters in use;  
- fee rates actually applied (labeled provisional vs approved when relevant);  
- migration threshold definition and progress;  
- creator vesting schedule and claimable amounts;  
- Community Pool allocation vs distribution status (distribution pipeline may still be pending — see Token Factory honesty);  
- clear “not financial advice / not fair value” framing where price is shown.

---

## 16. Treasury / Liquidity / Ecosystem Separation

Do not conflate:

| Bucket | Scope |
|---|---|
| **Network Treasury** (Model A 20% of eligible network fees) | Network development / ops — not per-token exit liquidity |
| **Network Liquidity & Ecosystem** (Model A 10%) | Conserved network reserve; deployment mechanics **TBD** (`docs/ECONOMICS.md` §6.1, §20) |
| **Growth Pool** (Model A 15%) | Growth rewards — not price support |
| **Per-asset Liquidity Reserve** (Token Factory allocation) | Intended for that asset’s post-curve market support |
| **Per-asset Ecosystem Reserve** | Asset-level grants / incentives |
| **Curve actual native reserve** | PPL paid in by buyers; source of sell exits while curve is active |

Mixing these in UX or policy language creates false guarantees. Liquidity & Ecosystem fee share is **not** guaranteed price support (`docs/ECONOMIC-MODEL-v0.1.md`).

---

## 17. Security Requirements — Future; No Consensus Changes

Future implementation must preserve:

- signed transactions, nonce / replay protection, admission + apply validation;  
- integer-safe math / conservation where supplies and reserves are concerned;  
- no silent economic-parameter invention by agents (`docs/TOKEN-ECONOMY.md` §22; `docs/ECONOMICS.md` §21);  
- separation of human verification from token endorsement.

This draft proposes **no** consensus, validator, PoS, or storage-format changes.

---

## 18. Open Design Decisions

Full TBD / **DESIGN DECISION REQUIRED** list (owner + repo open items relevant to this model):

1. Mainnet bonding-curve **family / formula** (do not treat testnet virtual CP as approved by default).  
2. **Initial price**, **initial reserve(s)**, **slope / shape** coefficients.  
3. **Migration threshold** definition and numeric targets.  
4. Whether migration is mandatory, optional, or template-specific.  
5. **Asset trading fee** rate(s) for curve and for AMM (mainnet).  
6. **Asset Trading Fee Model** destinations — whether identical to Model A, a subset, or a distinct table.  
7. Min trade sizes, quote TTL, and UX impact/slippage warning policy.  
8. Relationship between Liquidity Reserve drawdown rules and migration math (final mainnet rules).  
9. Handling of residual unsold curve inventory post-migration.  
10. Launch rate limits / anti-spam parameters beyond existing provisional launch fee.  
11. Bot / MEV / launch-protection measures (§14) — if any.  
12. Whether multiple templates may choose different curve parameters.  
13. External liquidity / bridging of PPL — out of scope for MVP economy-first principle (`docs/ECONOMICS.md` §17), but may intersect mature markets later.  
14. Any conflict between “formula not fixed” (`TOKEN-ECONOMY.md` §7, §21) and shipped testnet curve constants — **do not silently “fix”**; founder must confirm promotion or replacement (see §18 note below).

**Noted tension (not resolved here).** `docs/TOKEN-ECONOMY.md` states the exact curve formula is not fixed pending simulation, while `packages/core/src/curve.ts` / `docs/PHASE-2-IMPLEMENTATION.md` / `docs/TOKEN-FACTORY.md` ship a virtual constant-product testnet baseline with concrete provisional constants. This is documented as provisional testnet vs open mainnet decision — **not** an authorization to change economics or code in this task.

---

## 19. Relationship With Existing Token Factory

| Topic | Reference | Note |
|---|---|---|
| Consumer flow, preview, APIs | `docs/TOKEN-FACTORY.md` | Implemented testnet surface |
| Allocation math | `BondingCurveEngine.calculateTokenAllocation` in `curve.ts` | Reference only; unchanged by this doc |
| Community Pool mandatory 10% | `TOKEN-ECONOMY.md`, `TOKEN-FACTORY.md` | Protocol rule for standard template |
| Creator vesting | Testnet baseline documented; mainnet **TBD** | Provisional |
| Curve buy/sell tx types | `curveBuy` / `curveSell` | Protocol exists; trading UI may be incomplete |
| NFT / Issuer Bonus | Explicitly not implemented | Out of scope here |

**Testnet params are not mainnet-approved.** Any numeric baseline cited from Factory/Phase-2/curve code must remain labeled provisional unless a separate founder decision promotes it.

---

## 20. Relationship With Economic Model

- **Model A** (`30 / 25 / 20 / 10 / 15 / 0`) is the **approved Network Fee** destination table for eligible integer protocol fees.  
- **Model A is NOT an automatic user-token trading fee split.**  
- Token Factory **supply** allocation (60/10/15/10/5 working template) is a third, distinct layer from both network fees and asset trading fees (`docs/ECONOMICS.md` §6.4).  
- Growth Pool, Claim D, qualification, and settlement remain governed by `docs/ECONOMIC-MODEL-v0.1.md` and related growth docs — **unchanged** by this market model.  
- Burn remains 0% in Model A; this draft does not reintroduce burn.

---

## 21. Non-Goals

This document does **not**:

- invent or lock mainnet numeric economic parameters;  
- change Token Factory allocation, vesting, or launch fee;  
- change Model A, Growth Pool, Claim D, or emission;  
- modify consensus, validators, storage, or protocol code;  
- implement NFT markets or Issuer Bonus programs;  
- select or implement a specific DEX/AMM;  
- promise price appreciation, equal returns, or unlimited exit liquidity;  
- treat testnet baselines as silently promoted mainnet constants;  
- commit, deploy, or alter git history.

---

## 22. Future Implementation Phases (Roadmap Only)

Roadmap sketch — **not** a schedule commitment and **not** authorization to implement:

| Phase | Focus |
|---|---|
| **A** | Agree mainnet design decisions from §18 (formula, reserves, fees, migration, fee destinations) via simulation + founder approval |
| **B** | Spec freeze: normative Token Market Model v1.0 parameters separated from provisional testnet baselines |
| **C** | Harden curve trading UX (quotes, slippage, impact honesty) against approved params — still no silent param invention |
| **D** | Migration policy + Liquidity Reserve draw rules as approved |
| **E** | AMM / mature-market design (product choice still open) after curve bootstrap criteria are met |
| **F** | MEV / launch-protection evaluation if needed |
| **G** | Mainnet readiness review: economics, security, transparency checklist; only then promote constants |

Phases may reorder after founder decision. No phase implies code change in this draft task.

---

## Document control

| Field | Value |
|---|---|
| Version | 0.1 |
| Classification | DESIGN DRAFT / PROPOSED |
| Primary truth sources consulted | `docs/TOKEN-ECONOMY.md`, `docs/TOKEN-FACTORY.md`, `docs/ECONOMICS.md`, `docs/ECONOMIC-MODEL-v0.1.md`, `docs/PHASE-2-IMPLEMENTATION.md`, `packages/core/src/curve.ts` |
| Bonding Curve attachment brief | **Not found** in session workspace (see §1) |
| Protocol / economics / code changes in this task | **None** |
