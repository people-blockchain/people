# PEOPLE BLOCKCHAIN — ECONOMIC SIMULATION & SPECIFICATION v0.1

**Status:** Working simulation and economic specification  
**Version:** 0.1  
**Date:** 2026-09-22  
**Source-of-Truth Level:** Protocol Specification Document  

> **Terminology:** the brand is **PEOPLE**, the network is **PEOPLE Blockchain** and the
> native token is **PEOPLE**, ticker **PPL** (`docs/TERMINOLOGY.md`).

> [!IMPORTANT]
> **SIMULATION PARAMETERS ONLY NOTICE**  
> All mathematical formulas, coefficients, exponents, caps, decay rates, multipliers, stress-test values, and pool subdivision percentages in this document are **SIMULATION PARAMETERS ONLY** unless explicitly promoted to protocol parameters by founder decision. They must **not** be presented or construed as finalized tokenomics or immutable protocol commitments.

---

## 1. Dynamic Participant Pool Architecture

The PEOPLE Blockchain connects real network usage to participant incentives via a deterministic, multi-stage value pipeline:

```text
Network Activity
       ↓
  Network Fees (and Token Launch Allocations)
       ↓
 Community Pool (Multi-Asset Accounting Layer)
       ↓
Dynamic Participant Pool (Epoch-Specific Reward Allocation)
       ↓
 Eligible Participants (Filtered by Humanity / Anti-Sybil Layer)
       ↓
Participation Power (Sublinear Activity, Contribution, Reputation & Cap)
       ↓
  Reward Epoch (Deterministic Snapshot)
       ↓
  Distribution (Asset-Specific Proportional Allocation)
```

### 1.1 Approved Protocol Fee Allocation (Model A)

Simulation baselines use the **approved** eligible-integer split from `docs/ECONOMIC-MODEL-v0.1.md` / `docs/ECONOMICS.md` §6:

| Destination | Share | Purpose |
|---|---:|---|
| **Validators** | 30% | Base blockchain security, consensus incentives, and infrastructure operations |
| **Community Pool** | 25% | Bridge between protocol fees, token creator economy, and user participation |
| **Treasury** | 20% | Ecosystem grants, security audits, protocol engineering, and core infrastructure |
| **Liquidity & Ecosystem** | 10% | AMM seeding, market depth, pair liquidity, and developer adoption campaigns |
| **Growth Pool** | 15% | Growth referral budget (Beta payout L1 70% / L2 30% of Growth reward budget) |
| **Burn** | 0% | No protocol burn in Model A v0.1 |

### 1.2 Community Pool to Dynamic Participant Pool Simulation Range

The Community Pool holds multi-asset protocol revenues (PPL from transaction and service fees, plus mandatory 10% community allocations from token launches). To prevent arbitrary faucets, rewards are funded dynamically via the **Dynamic Participant Pool**.

For economic simulation and stress-testing purposes, three allocation ratios from the Community Pool into the Dynamic Participant Pool are evaluated:

| Simulation Case | Community Pool → Participant Pool | Effective Share of Total Network Fees | Status |
|---|---:|---:|---|
| **Conservative** | 50% | 12.5% of total network fees | Simulation test case |
| **Central Candidate** | **60%** | **15.0% of total network fees** | **Central simulation candidate** |
| **Expansive** | 70% | 17.5% of total network fees | Simulation test case |

> [!NOTE]
> These ratios are exploratory simulation parameters. They represent dynamic bounds under active investigation and are **NOT final protocol commitments**. The remainder of the Community Pool remains in reserve for long-term community programs, liquidity initiatives, or future governance allocations.

### 1.3 Asset Specificity

The Community Pool and Dynamic Participant Pool operate on a strict **asset-specific invariant**:
- **PPL rewards** originate exclusively from PPL protocol fees.
- **User-created token rewards** originate exclusively from the 10% launch allocation (or token-specific fees) of that specific asset.
- Reward pools are never blended into synthetic tokens or crossed between independent assets.

---

## 2. Participant Reward Model

Reward distribution is deterministic, non-custodial, and strictly pool-constrained.

### 2.1 Conceptual Reward Formula

For any reward epoch $e$ and eligible participant $i$, the reward in a given asset pool is defined as:

$$\text{Reward}_{i, e} = \frac{\text{EligiblePower}_{i, e}}{\text{TotalEligiblePower}_e} \times \text{ParticipantPool}_e$$

Where:
- $\text{EligiblePower}_{i, e}$: Verified effective Participation Power of participant $i$ at epoch snapshot $e$ (subject to maturation, verification tiers, and the Reward Concentration Guard).
- $\text{TotalEligiblePower}_e$: Sum of all $\text{EligiblePower}_{j, e}$ across all verified, active participants for epoch $e$:
  $$\text{TotalEligiblePower}_e = \sum_{j \in \text{Eligible}} \text{EligiblePower}_{j, e}$$
- $\text{ParticipantPool}_e$: Actual balance available in the Dynamic Participant Pool for that specific asset at epoch snapshot $e$.

### 2.2 Core Operational Rules

1. **Epoch Snapshots:** Rewards must be calculated using deterministic, verifiable state snapshots at pre-defined epoch boundaries (e.g., block intervals). Instantaneous or real-time continuous distribution is prohibited to prevent front-running, balance manipulation, and flash loan attacks.
2. **Zero Pool Invariant (No Guaranteed Income):** The protocol does **NOT** introduce or guarantee a fixed participant income, flat mining rate, or passive APR. If $\text{ParticipantPool}_e = 0$, then $\text{Reward}_{i, e} = 0$ for all participants.
3. **Pool-Dependent Compensation:** Rewards are strictly dependent on real eligible network participation and actual available fee/allocation pools. The protocol will never mint unbacked reserve tokens to compensate for low epoch activity.

---

## 3. Participation Power

Participation Power is an abstract protocol metric representing a participant's relative standing and contribution during a reward epoch.

### 3.1 Conceptual Framework

The overarching design framework is:

$$\text{Power} \propto \text{Base} \times \text{Activity} \times \text{Reputation} \times \text{Contribution}$$

Subject to two foundational mathematical constraints:
1. **Sublinear (diminishing-return) scaling** on all dynamic inputs.
2. **A hard upper bound** ($\text{PowerCap}$) on total effective Power.

### 3.2 Representative Stress-Test Model

For simulation and stress-testing only, the following mathematical form was evaluated:

$$\text{Power} = \min\left(\text{Base} \times \sqrt{\text{Activity}} \times \sqrt{\text{Contribution}} \times \text{Reputation}, \; \text{PowerCap}\right)$$

> [!WARNING]
> This specific mathematical expression is a representative simulation model and **is NOT yet an approved or final protocol formula**. All exact coefficients, exponents, base thresholds, decay functions, and caps are **TBD**.

### 3.3 Important Architectural Principles

1. **Power is NOT a Token:** Participation Power has no ERC-20/SPL/token interface, cannot be minted as an asset, and does not exist in circulating supply.
2. **Non-Transferability:** Power cannot be transferred, delegated, sold, wrapped, or pledged between accounts or wallets.
3. **No Balance Mutation:** Building or losing Power does not alter wallet asset balances.
4. **Relative Share Determinator:** Power determines only the participant's relative proportion of eligible rewards within an epoch.
5. **Diminishing Returns on Activity:** Brute-force repetitive interactions yield progressively smaller marginal power increases.
6. **Diminishing Returns on Contribution:** Outsized economic transactions yield sublinear power scaling to prevent whale dominance.
7. **Hard Upper Bound:** Every participant's Power is capped at a strict protocol ceiling ($\text{PowerCap}$).
8. **Inactivity Decay:** Ceasing participation leads to gradual, predictable power decay over subsequent epochs, preventing permanent entitlement from past activity.
9. **Activity-Driven Recovery:** Returning participants can recover their Power through renewed legitimate network activity without punitive permanent blacklisting.
10. **Maturation and Onboarding Limits:** New accounts are subject to initial eligibility constraints and maturation timeframes before reaching full power potential.
11. **Single-Factor Saturation Resistance:** No single variable (e.g., extreme activity, high capital, or longevity) can bypass the cap or compensate for deficiencies in other dimensions.

---

## 4. Humanity and Sybil Resistance Layer

A fundamental architectural principle of PEOPLE Blockchain is the separation between identity verification and economic reward calculation:

```text
┌────────────────────────────────────────────────────────┐
│             Humanity / Anti-Sybil Layer                │
│    (Eligibility Gate, Trust Tiers, Limit Boundary)     │
└──────────────────────────┬─────────────────────────────┘
                           │ Sets Max Effective Power,
                           │ Tiers & Eligibility
                           ▼
┌────────────────────────────────────────────────────────┐
│             Economic Reward Calculation                │
│       (Participation Power, Pool Proportions)          │
└────────────────────────────────────────────────────────┘
```

### 4.1 Humanity as an Eligibility and Boundary Layer

- **Humanity is NOT a Financial Multiplier:** The protocol strictly rejects treating Proof-of-Humanity as an unbounded scalar multiplier (e.g., $10\times$ rewards for higher verification). Doing so creates pay-to-win dynamics or financializes identity credentials.
- **Humanity as an Eligibility and Risk Control Layer:** Humanity mechanisms govern:
  - Protocol reward eligibility (binary or tiered access).
  - Maximum effective power limits ($\text{PowerCap}_{\text{tier}}$).
  - Account maturation schedules and probationary holding periods.
  - Confidence and trust tiers.
  - Delayed claim windows during anomaly investigations.
  - Anomaly review flags.

### 4.2 Candidate Privacy-Preserving Signals

The protocol evaluates multi-signal composite identity rather than a single fragile verification point:
- Account and device continuity over extended sessions.
- Out-of-band lightweight verifications (e.g., email, SMS, decentralized identifiers).
- Behavioral consistency and interaction cadence.
- Graph-based cluster analysis (detecting coordinated bulk-minted wallets).
- Reputation maturation through sustained honest network participation.
- Privacy-conscious third-party cryptographic attestations (zero-knowledge proofs of uniqueness).

*Status:* **PLANNED / TBD.** No specific third-party provider or algorithm is hardcoded in this baseline.

---

## 5. Economic Stress-Test Results and Architectural Conclusions

Ten economic stress-test attack vectors were simulated against the conceptual model:

### 5.1 Stress-Test Categories

1. **Sybil Attack:** Mass generation of automated accounts to siphon base participation pools.
2. **Whale Attack:** High-net-worth accounts deploying large capital to dominate contribution scores and monopolize reward epochs.
3. **Bot Farming:** High-frequency script-driven transactions to maximize activity scores.
4. **Referral Farming:** Circular, synthetic referral trees designed to capture referral overrides.
5. **Dormant / Inactive Accounts:** Historic participants retaining reward shares without ongoing participation.
6. **Fee Collapse:** Protracted market downturns resulting in negligible network fee generation.
7. **Fee Explosion:** Extreme transaction volume surges generating sudden windfalls in the Community Pool.
8. **Pool Starvation:** Extended periods where protocol fees approach zero.
9. **Creator Farming:** Launching spam or low-effort tokens solely to harvest creator contribution allocations.
10. **Reward Concentration:** Natural drift where top accounts accumulate an overwhelming fraction of epoch rewards.

### 5.2 Observed Architectural Conclusions

The simulations confirmed key architectural requirements:

- **Sublinear Mitigation of Bot Farming:** Nonlinear scaling (e.g., square-root dampening) of activity and contribution drastically diminishes the economic return of automated spam and brute-force transaction flooding.
- **Hard Power Cap Limits Individual Whale Capture:** A protocol-enforced $\text{PowerCap}$ prevents high-volume or high-capital actors from capturing more than a fixed maximum proportion of an epoch's power base.
- **Sybil Resistance Requires an Independent Identity Layer:** While sublinear scaling reduces the marginal return of splitting activity across accounts, it does not completely eliminate Sybil profitability without an independent Humanity/eligibility gate that imposes friction and limits on unverified clusters.
- **Inactivity Decay Naturally Restores Pool Capacity:** Gradual power decay cleanly recycles reward capacity to current active participants without requiring manual governance purges.
- **Concentration Guard Needed Against Low-Participation Drift:** During periods of low network participation or severe decay among inactive accounts, remaining active accounts could inadvertently capture an excessive share of rewards unless protected by an explicit concentration guard.
- **Proportional Contraction Under Fee Collapse:** During fee collapse or pool starvation, the Dynamic Participant Pool contracts organically. The protocol must absorb this contraction naturally through lower reward payouts rather than compensating participants via unbacked inflation.
- **Organic Fee Scaling:** Fee explosion increases participant rewards purely from real economic velocity without destabilizing core token emissions.
- **Asset Creation Alone is NOT Legitimate Contribution:** Merely calling the `tokenCreate` transaction must not qualify as high-value Contribution. Contribution scoring must evaluate sustained on-chain liquidity, verified trade volume, or community adoption rather than raw button clicks.

---

## 6. Reward Concentration Guard

### 6.1 Design Requirement

Simulation revealed that while $\text{PowerCap}$ restricts an individual's nominal Power, in epochs where the number of active participants is unusually low, a small cohort could still capture an unhealthy fraction of the total reward pool.

Therefore, the protocol requires a dedicated safeguard:

$$\text{RewardShare}_{i, e} \le \text{MaximumRewardSharePerEpoch}$$

$$\text{MaximumRewardSharePerEpoch} = \text{TBD}$$

### 6.2 Economic Safety Parameter

- **Status:** **DESIGN REQUIREMENT / TBD.**
- The exact numerical ceiling (e.g., $1.0\%$, $2.5\%$, or $5.0\%$ of an epoch's participant pool) is deliberately not fixed.
- Any excess reward amounts that would exceed this threshold must either roll over into the Community Pool reserve, carry forward to subsequent epochs, or be redirected according to protocol governance rules.

---

## 7. Future Design Option: Participant Pool Subdivision

To decouple basic human presence from sophisticated economic contribution, the protocol considers an optional subdivision of the Dynamic Participant Pool as a **future design option**:

```text
                       ┌───────────────────────────────────────────────┐
                       │          Dynamic Participant Pool             │
                       └──────────────────────┬────────────────────────┘
                                              │
         ┌────────────────────────────────────┼──────────────────────────────────┐
         ▼                                    ▼                                  ▼
┌──────────────────────────┐    ┌──────────────────────────┐    ┌──────────────────────────────────┐
│ Base Participation (TBD) │    │ Contribution Rewards(TBD)│    │ Growth / Community Reserve (TBD) │
│    [e.g. 70% Concept]    │    │    [e.g. 20% Concept]    │    │        [e.g. 10% Concept]        │
└──────────────────────────┘    └──────────────────────────┘    └──────────────────────────────────┘
```

### 7.1 Illustrative Simulation Concept

During stress testing, a representative allocation concept was explored:
- **Base Participation Rewards (e.g., 70% simulation concept):** Distributed to all verified human participants meeting minimum baseline activity.
- **Contribution Rewards (e.g., 20% simulation concept):** Distributed to participants providing measurable economic value (liquidity provision, developer infrastructure, verified curation).
- **Growth / Community Reserve (e.g., 10% simulation concept):** Retained for special onboarding milestones, referral quality bonuses, and seasonal incentives.

> [!CAUTION]
> **NOT AN APPROVED PROTOCOL RULE.**  
> The 70% / 20% / 10% breakdown is strictly an illustrative simulation concept. These percentages are **NON-FINAL** and must **NOT** be treated as protocol constants. The subdivision structure remains a candidate design option for future testnet evaluation.

---

## 8. Economic Design Invariants

All future protocol implementations, smart contracts, node services, and consensus modifications must strictly adhere to these fifteen invariants:

1. **No Guaranteed Participant Income:** The protocol shall never promise, compute, or disburse a fixed, guaranteed return, passive dividend, or risk-free yield.
2. **No Unfunded Reward Obligations:** Reward distributions must never exceed the actual, cleared asset balance available in the respective Dynamic Participant Pool at the epoch snapshot.
3. **No Autonomous Tokenomics Invention:** AI coding agents and engineering contributors must never independently invent, tune, or deploy economic parameters or formulas without explicit founder approval.
4. **Real Network Value Connection:** Participant incentives must derive directly from actual on-chain fee generation, ecosystem asset creation, and verifiable network utility.
5. **Non-Transferable Participation Power:** Participation Power is strictly an internal accounting score. It cannot be bought, sold, transferred, wrapped, or pledged.
6. **Strict Asset-Specific Segregation:** PPL fee pools and user-created token community allocations must remain asset-specific. PPL is never minted to subsidize user tokens, and user tokens never dilute PPL reserves.
7. **Deterministic Community Pool Accounting:** All inflows, holdbacks, epoch slices, and claim disbursements must follow mathematically deterministic, replay-verifiable state transitions.
8. **Decoupled Identity and Reward Layers:** Humanity/anti-Sybil verification acts solely as an access gate and risk ceiling; it must never operate as an unbounded financial reward multiplier.
9. **Mandatory Diminishing Returns:** All activity, contribution, and volume metrics must employ strictly sublinear mathematical scaling.
10. **Mandatory Hard Power Limits:** Participation Power must be bounded by a protocol-enforced ceiling ($\text{PowerCap}$).
11. **Mandatory Inactivity Decay:** Inactivity must cause predictable, continuous decay of effective Participation Power over time.
12. **New Participant Maturation Safeguards:** New accounts must pass through onboarding phases and maturation constraints before unlocking maximum reward ceilings.
13. **Creator Value Verification:** Token or asset creation alone must never automatically award unearned contribution points; contribution rewards require demonstrated economic utility.
14. **No Permanent Inflation Reliance:** The protocol must not rely on permanent or escalating PPL token inflation as the primary mechanism to sustain mobile and participant rewards.
15. **Unresolved Parameters Remain TBD:** Any economic coefficient, percentage, threshold, or timing interval not explicitly approved in the authoritative specification documents must remain labeled `TBD`.
