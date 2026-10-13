# PEOPLE'S BLOCKCHAIN — MOBILE MINING v0.1

> **Terminology:** the brand is **People**, the network is **People's Blockchain** and the
> native token is **People**, ticker **PPL** (`docs/TERMINOLOGY.md`).

## 1. Purpose

Mobile Mining is the user participation layer of People's Blockchain.

Its purpose is to let ordinary users participate in the network from a phone, tablet, or browser without requiring specialized hardware.

Mobile Mining is not Proof-of-Work and does not pretend that a phone performs computational mining for consensus security.

A participant earns the right to receive a share of ecosystem rewards by proving human participation and contributing useful activity to the network.

The mobile participant is not automatically a blockchain validator.

---

## 2. Core principle

The protocol separates three concepts:

1. **Participation** — being a verified human and remaining active.
2. **Contribution** — performing useful actions that improve the ecosystem.
3. **Validation** — securing the blockchain through validator nodes.

Mobile Mining belongs to Participation + Contribution.

Validator rewards belong to blockchain security.

These roles may be combined by the same person, but they are economically and technically distinct.

---

## 3. User experience

The basic experience must remain extremely simple.

A new participant should be able to:

1. Create a wallet/account.
2. Complete the available human-verification process.
3. Start a participation session.
4. See current Mining Power / Participation Power.
5. See estimated and realized ecosystem rewards.
6. Return later and continue participating.

The product should feel like a simple consumer application, not like a blockchain administration console.

---

## 4. Participation Power

The working concept is **Participation Power**.

Participation Power is the protocol value used to determine a participant's relative share of eligible rewards from the Dynamic Participant Pool.

Important architectural principles:
- Power is **NOT a token**.
- Power is **NOT transferable** between wallets.
- Power does **not alter wallet balances**.
- Power determines relative eligibility and proportional share in an epoch's available pool.
- Activity and Contribution must feature **diminishing returns** (sublinear scaling).
- Power must have a **hard upper bound** (`PowerCap`).
- Inactivity causes **gradual decay**, recoverable through genuine activity.
- New accounts have **maturation limits**.
- No single factor can create unlimited Power.

The conceptual model is:

```text
Participation Power ∝ Base × Activity × Reputation × Contribution
```

Architecturally, **Humanity / Sybil resistance is decoupled as an ELIGIBILITY / TRUST / LIMIT layer** rather than an unbounded financial multiplier.

For simulation purposes, a representative stress-test model evaluated:

```text
Power = min(Base × sqrt(Activity) × sqrt(Contribution) × Reputation, PowerCap)
```

This mathematical form is a simulation framework, not a final protocol formula. All exact coefficients, exponents, caps, and decay functions are **TBD** (see `ECONOMIC-SIMULATION-v0.1.md`).

---

## 5. Base Power

Every verified participant starts with a common base level of Participation Power.

The base level must be small enough that additional useful contribution matters, but large enough that a new user immediately sees meaningful participation.

There must be a hard upper bound on each multiplier so that no single factor can create unlimited power.

---

## 6. Humanity and Anti-Sybil Layer

Humanity is primarily an **ELIGIBILITY / TRUST / LIMIT layer**, NOT an unbounded financial multiplier.

The protocol separates identity verification from economic reward calculations. Proof-of-Humanity must not become an arbitrary scalar multiplier (e.g. $10\times$ rewards) because that would financialize identity and incentivize Sybil attacks on the identity layer itself.

Instead, the Humanity layer governs:
- baseline protocol reward eligibility;
- maximum effective power ceilings (`PowerCap` tiers);
- account maturation schedules and probationary periods;
- confidence and trust tiers;
- delayed eligibility and anomaly review flags.

The network needs a mechanism to distinguish one real person from large numbers of automated or duplicate accounts. The exact identity mechanism is deliberately not fixed in v0.1 (PLANNED / TBD).

Possible privacy-preserving signals include:
- account age and maturation;
- device and session continuity;
- lightweight verification (phone/email/attestations);
- social or wallet attestations;
- trusted-person graph and cluster analysis;
- external proof-of-personhood / ZK-uniqueness providers;
- behavioral anomaly detection.

The protocol must minimize on-chain identity data and avoid storing unnecessary personal data. A participant must not be required to expose sensitive identity information simply to use the basic network.

---

## 7. Activity Factor

Activity should reward genuine continued participation, not endless clicking.

Examples of legitimate activity:

- returning to the network;
- maintaining an active session;
- claiming or reviewing rewards;
- interacting with launches;
- using network services;
- participating in community functions.

The protocol should use time windows and diminishing returns.

Repeated low-value actions must not create unlimited Power.

Example design principle:

```text
Day 1 activity   → meaningful increase
Day 2 activity   → smaller increase
Continuous use   → maintains Power
Spam clicks      → little or no additional Power
```

---

## 8. Contribution Factor

Contribution is intended to measure useful economic or community activity.

Potential contribution events include:

- creating a legitimate project;
- launching a token;
- creating NFTs;
- providing liquidity;
- participating in approved curation mechanisms;
- helping onboard verified users;
- operating ecosystem infrastructure;
- contributing to open-source components;
- other protocol-approved activities.

Contribution rewards must be subject to caps and quality controls.

The protocol must not reward activity merely because it generates volume.

---

## 9. Reputation Factor

Reputation is a long-term signal.

A participant who remains active and behaves honestly should gradually build higher reward eligibility.

Reputation should increase slowly and decay slowly.

Examples of positive signals:

- account longevity;
- verified-human continuity;
- successful participation in projects;
- useful referrals;
- successful community contributions;
- absence of fraud flags.

Examples of negative signals:

- Sybil behavior;
- collusion;
- fraudulent projects;
- manipulation of community mechanisms;
- protocol abuse.

Reputation must never become an irreversible personal score. The participant must be able to recover from temporary loss of activity through continued legitimate behavior.

---

## 10. Staking and Mobile Mining

Staking may increase Participation Power, but it must not dominate the system.

If staking is used as a multiplier, the preferred design direction is sublinear rather than linear.

Example concept:

```text
Stake Multiplier ∝ sqrt(stake)
```

This means capital provides an advantage without allowing large holders to capture the entire mobile reward system.

Exact limits are deferred to ECONOMICS.md.

---

## 11. Reward sources

Mobile Mining should not primarily create unlimited new PPL tokens.

Eligible mobile/community rewards may come from:

### A. Community allocations

Every standard token launched through the Token Factory must reserve **10% of its initial supply** for the Community Pool of that token.

This 10% allocation is a **mandatory protocol rule**, not an optional creator choice (`ECONOMICS.md` §9; `TOKEN-ECONOMY.md` §4). It is a project supply allocation accounted per asset ID: a token-specific Community Pool is never merged with, swapped into, or converted to the PPL network-fee Community Pool.

### B. Network fees

A defined portion of real network fees may flow to the Community Pool.

### C. Ecosystem incentives

Treasury-approved campaigns may distribute additional rewards for specific growth or adoption goals.

The exact proportions belong in ECONOMICS.md.

---

## 12. Reward calculation

For each deterministic reward epoch, the participant's eligible reward share is:

```text
Participant Reward =
    Participant Eligible Power
    / Total Eligible Network Power
    × Dynamic Participant Pool
```

Operational rules:
1. **Deterministic Epoch Snapshots:** Rewards must be calculated from verifiable block snapshots at epoch boundaries to prevent manipulation and flash-loan attacks.
2. **Asset Specificity:** PPL fee pools and user-token community pools remain strictly separate. Participants claim rewards asset-by-asset from the respective Dynamic Participant Pool.
3. **Reward Concentration Guard:** To prevent small cohorts from capturing excessive shares during low-participation periods, the protocol requires a concentration ceiling:
   ```text
   RewardShare_i <= MaximumRewardSharePerEpoch (TBD)
   ```
4. **Future Design Option (Pool Subdivision):** The Dynamic Participant Pool may optionally be subdivided in future phases into Base Participation Rewards (e.g. 70% simulation concept), Contribution Rewards (e.g. 20% simulation concept), and Growth/Community Reserve (e.g. 10% simulation concept). These percentages are strictly NON-FINAL simulation concepts (see `ECONOMIC-SIMULATION-v0.1.md`).

---

## 13. No guaranteed income

The network must never present Participation Power as a guaranteed financial return or passive yield.

Core invariants:
- **Zero Pool Invariant:** If the Dynamic Participant Pool for an asset is zero, rewards are zero. The protocol never mints unbacked tokens to artificially guarantee participant income.
- **Variable Market Value:** The UI must distinguish estimated rewards, accrued snapshot rewards, claimed rewards, and realized market value. Market prices of user-created tokens are market-driven and may fluctuate or fall to zero.

---

## 14. Referral system

Referrals are allowed, but direct payment for simply creating accounts is not the desired long-term model.

A useful referral should contribute to the network.

The future design may reward a referrer based on the verified and sustained activity of the referred participant, with caps and anti-abuse controls.

Self-referrals and circular referral farming must be blocked.

Referral mechanics must never become the primary source of network value.

---

## 15. Anti-Sybil principles

The system must assume that participants will attempt to create multiple identities if rewards are valuable.

Required defenses include several independent signals rather than a single identity check.

The system should use:

- rate limits;
- device/account continuity;
- verification tiers;
- reputation maturation;
- reward caps for new accounts;
- anomaly detection;
- delayed reward eligibility where appropriate;
- graph analysis for suspicious clusters;
- manual or automated review for high-value abuse cases.

No single defense should be treated as perfect.

---

## 16. New-user protection

New users should not be punished merely because they are new.

However, new accounts should initially have lower reward limits until they establish legitimate history.

Example concept:

```text
New account
   ↓
Basic participation
   ↓
Human verification
   ↓
Maturation period
   ↓
Higher reward eligibility
   ↓
Full participation
```

Exact durations and limits are not fixed in v0.1.

---

## 17. Inactivity

A participant who stops using the network should gradually lose active Power or reward eligibility.

The system should prefer decay over hard resets.

Example principle:

```text
Active → Power maintained
Inactive → Power slowly decays
Return → Power recovers through activity
```

This prevents users from farming Power once and remaining permanently entitled to the same reward share.

---

## 18. Mobile participant vs validator

The protocol must clearly distinguish:

### Mobile Participant

- does not secure consensus;
- may use a phone, tablet, or browser;
- earns participation/community rewards;
- does not need server infrastructure.

### Full Validator

- participates in consensus;
- maintains blockchain state;
- may produce or attest blocks;
- may require stake;
- earns validator rewards.

### Optional Light Node

A lightweight device mode may assist with selected network functions, but the protocol must not claim that a browser or phone is a full validator unless it actually performs the required consensus duties.

---

## 19. Reward fairness principles

The mobile economy should follow these principles:

1. One real person should have meaningful access to the network.
2. Capital may improve participation but must not dominate it.
3. Long-term contribution should matter more than short-term gaming.
4. Rewards should come primarily from real network activity and ecosystem assets.
5. The protocol should not require permanent inflation of PPL to sustain mobile rewards.
6. The richest participants should not automatically control the entire reward pool.
7. Automated farming should be economically unattractive.

---

## 20. What is NOT decided yet

The following are deliberately deferred (TBD):

- exact Humanity / Sybil verification implementation and tiering rules;
- exact Participation Power coefficients, diminishing-return exponents, and hard `PowerCap`;
- exact reputation growth and decay rates;
- exact Contribution scoring formulas;
- whether staking directly affects mobile Power;
- exact referral rewards and anti-abuse safeguards;
- exact reward epoch duration (block count);
- Dynamic Participant Pool allocation percentage from Community Pool (central simulation candidate: 60%, TBD);
- MaximumRewardSharePerEpoch (Reward Concentration Guard, TBD);
- Participant pool subdivision percentages (Base / Contribution / Reserve, TBD);
- final PPL emission parameters.

These decisions are modeled in `ECONOMIC-SIMULATION-v0.1.md` and will be formalized jointly with `ECONOMICS.md` and `TECHNICAL-ARCHITECTURE.md`.

---

## 21. Source-of-truth rule for AI agents

AI coding agents must not invent or modify Mobile Mining economics.

When implementing this system, the agent must:

1. Read `VISION.md`.
2. Read `ECONOMICS.md`.
3. Read `ECONOMIC-SIMULATION-v0.1.md`.
4. Read this `MOBILE-MINING.md`.
5. Implement only approved rules.
6. Mark unresolved protocol questions as `TBD` instead of inventing answers.
7. Add tests for every approved reward rule.

No economic parameter should be changed silently during implementation or refactoring.
