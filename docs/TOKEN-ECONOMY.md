# PEOPLE'S BLOCKCHAIN — TOKEN ECONOMY v0.1

Status: Working product/economic specification
Version: 0.1
Date: 2026-09-22

> This document defines the first working model for user-created tokens, Community Pool allocation, token launches, bonding curves and DEX liquidity. Parameters marked **provisional** must be simulated and tested before becoming immutable protocol constants.
>
> **Terminology:** the brand is **People**, the network is **People's Blockchain** and the
> native token is **People**, ticker **PPL** (`docs/TERMINOLOGY.md`).

---

## 1. Purpose

People's Blockchain is not only a blockchain with a native coin. It is a network where ordinary users can create economic assets:

- community tokens;
- project tokens;
- reward/loyalty tokens;
- game tokens;
- creator tokens;
- fundraising tokens within the permitted legal and product framework;
- NFTs and other digital assets.

The Token Factory is therefore a core protocol product, not an optional add-on.

The basic promise is:

> **Create a token in a few steps, distribute it to real participants, give it an automatic market, and let the project grow inside the network.**

---

## 2. Native Settlement Asset

All official user-created token markets should use the native asset of the network — **People**, ticker **PPL** — as the primary settlement asset.

Examples:

```text
PROJECT / PPL
COMMUNITY / PPL
GAME / PPL
CREATOR / PPL
```

PPL therefore becomes the common liquidity and accounting layer between otherwise unrelated projects.

A token creator does not need to create a separate blockchain, deploy a complex smart contract, or manually find a market before the token can have a basic market.

---

## 3. Token Creation

The Token Factory should provide a simple consumer flow:

1. Name
2. Symbol
3. Total supply
4. Token purpose/template
5. Optional metadata/logo
6. Review allocation
7. Pay creation/launch fee in PPL
8. Launch

The protocol displays the complete allocation before confirmation.

A creator cannot alter protocol-reserved allocations after launch.

The Token Factory must generate protocol-compliant token contracts/assets and register the token with the network indexer/explorer.

---

## 4. Standard Launch Allocation

Working default template for v0.1:

| Allocation | Share | Purpose |
|---|---:|---|
| Bonding Curve / Market Supply | 60% | Initial public market inventory |
| Community Pool | 10% | Distributed to eligible participants |
| Creator Allocation | 15% | Creator/project ownership; subject to vesting rules |
| Liquidity Reserve | 10% | Used for post-curve DEX liquidity |
| Ecosystem / Protocol Reserve | 5% | Grants, integrations, launch incentives |

These percentages are **provisional**.

The important protocol principle is that the **10% Community Pool allocation is mandatory** for the standard launch template.

The allocation must be transparent before the creator signs the launch transaction.

---

## 5. Why the Community Pool Exists

The Community Pool creates a two-sided economic exchange.

### Creator receives

- initial distribution to real network participants;
- attention and discovery;
- potential early holders;
- access to the network's social/economic graph.

### Participant receives

- exposure to newly launched projects;
- a potential reward asset without needing to buy it initially;
- an opportunity to discover projects early.

The 10% is therefore designed as a **distribution budget paid by the token project**, not as arbitrary inflation of PPL.

---

## 6. Community Pool Distribution

The Community Pool allocation is not paid equally to every wallet.

Distribution uses the rules from `MOBILE-MINING.md`:

```text
Participant Share
    = Eligible Participation Power
    / Total Eligible Participation Power
    × Community Pool
```

The protocol should use epoch/snapshot accounting to prevent last-second manipulation.

A token-specific Community Pool may be distributed over a defined period rather than immediately. The final schedule will be defined after simulations.

---

## 7. Bonding Curve Launch

The default launch path should be:

```text
Create Token
      ↓
Bonding Curve
      ↓
Threshold reached
      ↓
Liquidity Migration
      ↓
AMM Liquidity Pool
      ↓
Open Trading
```

A bonding curve provides an automatic price-discovery mechanism before a conventional AMM pool has enough liquidity.

At the beginning, the token has a deterministic price defined by the curve.

As users buy more tokens from the curve, the marginal price increases.

As users sell back into the curve, the marginal price decreases according to the same deterministic pricing mechanism.

The exact curve formula is **not fixed in v0.1**. It must be selected through simulations that test:

- early buyer protection;
- creator incentives;
- price volatility;
- required liquidity;
- resistance to manipulation;
- capital efficiency;
- transition economics.

---

## 8. Why Use a Bonding Curve

The bonding curve solves the initial-market problem:

> A new token should not require the creator to find a professional market maker before anyone can interact with it.

The protocol can automatically provide:

- initial price discovery;
- deterministic execution;
- a visible launch state;
- a path toward permanent AMM liquidity.

This makes Token Factory usable by ordinary people rather than only experienced crypto developers.

---

## 9. Transition to Liquidity Pool

When a token reaches its predefined migration threshold, the protocol can migrate the launch into an AMM liquidity pool.

Conceptually:

```text
Bonding Curve
   │
   ├── accumulated PPL liquidity
   └── remaining token liquidity inventory
             ↓
      TOKEN / PPL Pool
```

The migration should be deterministic and protocol-controlled.

The exact threshold may be defined by:

- PPL raised;
- number of participants;
- market capitalization;
- liquidity target;
- or a combination of these.

The v0.1 recommendation is to use a **capital/liquidity threshold**, because it is measurable and difficult to interpret subjectively.

---

## 10. Initial AMM Liquidity

Liquidity reserved by the launch template is intended to support the post-curve market.

The target is not to guarantee a token's price.

The purpose is to provide a transparent market with immediately available liquidity after migration.

Liquidity rules must prevent the creator from withdrawing protocol-reserved liquidity.

The creator's own allocation is a separate asset and should be subject to vesting/lock rules defined for the chosen launch template.

---

## 11. Creator Allocation

The creator allocation exists to give the person or project that created the token a meaningful stake in the project.

However, an unrestricted immediately sellable creator allocation creates a strong rug-pull incentive.

Therefore the default template should use:

- vesting;
- transparent unlock schedule;
- clear wallet labeling;
- protocol-visible creator holdings.

Working design direction:

> Creator tokens should not all become freely sellable immediately after launch.

The exact vesting schedule remains provisional and must be chosen after economic and behavioral testing. The current implemented **testnet baseline** is 10% of the creator allocation unlocked upfront at creation with the remaining 90% vesting linearly over 180 days (5,184,000 blocks at 3s/block); see §21 and `docs/PHASE-2-IMPLEMENTATION.md` §5.

---

## 12. Launch Fee

Creating a token requires PPL.

The fee should include at least:

- token creation cost;
- registration/indexing cost;
- economic spam protection.

Optional additional services may have fees:

- featured launch;
- launch promotion;
- advanced token template;
- enhanced analytics;
- creator tooling.

Fees are distributed according to `ECONOMICS.md`.

The network should not make token creation prohibitively expensive for ordinary users.

---

## 13. Featured / Boosted Launches

Creators may optionally spend PPL for additional distribution mechanisms, for example:

- Featured Launch;
- category promotion;
- regional/community discovery;
- creator analytics;
- launch notifications.

Paid promotion must be clearly marked in the product UI.

A creator should never be able to buy a false verification badge or manipulate the Community Pool allocation through payment.

---

## 14. Token Templates

The Token Factory may eventually offer several standard templates:

### Community Token

Designed for communities, groups and social organizations.

### Reward Token

Designed for loyalty, user rewards and contribution programs.

### Project Token

Designed for applications and digital products.

### Creator Token

Designed for creators and communities around individual creators.

### Game Token

Designed for games and virtual economies.

### Fundraising Template

Designed for permitted fundraising use cases and subject to jurisdiction-specific legal controls.

Templates may change economic parameters, but protocol-reserved community and security rules cannot be bypassed.

---

## 15. NFT Economy

NFTs should use the same PPL settlement layer where applicable.

A user should be able to:

- mint an NFT;
- create a collection;
- sell an NFT;
- buy an NFT;
- transfer an NFT;
- optionally connect an NFT collection to a community/token economy.

NFTs are a separate asset type but share the same wallet, gas and marketplace infrastructure.

---

## 16. Token Utility

The Token Factory must not imply that every token automatically has economic value.

A token's value depends on actual use, demand, liquidity and the behavior of its project/community.

Creators should be able to define legitimate utility such as:

- access to a community;
- discounts;
- rewards;
- in-app items;
- governance inside a project;
- reputation/points;
- digital goods;
- game assets;
- creator benefits.

The protocol provides infrastructure and distribution; it does not guarantee demand or price.

---

## 17. Anti-Spam and Anti-Abuse

Permissionless token creation creates unavoidable spam risk.

The protocol therefore needs economic and reputation filters:

- launch fee in PPL;
- rate limits;
- creator history;
- transparent project metadata;
- abuse reporting;
- suspicious-account detection;
- optional minimum creator requirements for higher-risk templates;
- separation between verified human status and project verification.

A token being created by a verified person must **not** be interpreted as an endorsement of that token.

---

## 18. Discovery and Ranking

The network needs a Launch Feed.

Possible ranking signals:

- genuine participant activity;
- liquidity;
- trading volume;
- holder growth;
- creator reputation;
- age of project;
- community engagement;
- fraud/risk signals.

Ranking must not simply become a pay-to-win system.

Paid promotion may increase visibility in clearly labeled promotional placements, but organic discovery should remain meaningful.

---

## 19. Economic Flywheel

The intended cycle is:

```text
Creator
   ↓
Launch Token
   ↓
10% Community Allocation
   ↓
Participants discover/receive token
   ↓
Some participants become users/buyers
   ↓
Trading creates PPL demand
   ↓
Fees are generated
   ↓
Fees support Validators + Community + Treasury + Ecosystem
   ↓
Better network
   ↓
More Creators
```

This is the core network effect we are trying to create.

---

## 20. Critical Distinction

The network does **not** promise:

> "Create a token and it will become valuable."

It promises:

> "Create a token and the network provides standardized issuance, initial distribution, market infrastructure and access to participants."

Demand must still be earned by the creator/project.

---

## 21. Parameters Still Open

The following must not be hard-coded until simulations are completed:

- exact bonding curve formula;
- starting price;
- migration threshold;
- creator vesting schedule — *implemented testnet baseline: 10% of the creator allocation unlocked upfront at creation, remaining 90% vesting linearly over 180 days (5,184,000 blocks at 3s/block); provisional, final schedule `TBD` — see §11 and `docs/PHASE-2-IMPLEMENTATION.md` §5*;
- exact launch allocation percentages other than the **mandatory 10% Community Pool allocation** (the 10% itself is a protocol rule, not an open parameter);
- AMM fee — *implemented testnet baseline: 30 bps (0.30%) stored as `feeBps` on each `LiquidityPoolState` (`AMM_FEE_BPS`); AMM v0.1 exact-in swaps keep this LP fee in-pool and it is not Growth-eligible. Protocol `tx.fee` on AMM txs is the ordinary transfer tariff. Final mainnet AMM fee remains `TBD`*;
- minimum liquidity;
- maximum token supply rules;
- launch rate limits;
- token-specific reward duration;
- special templates and their parameters.

> **Status note:** The items annotated above are working testnet baselines only. They are provisional and must not be treated as final protocol constants or promoted to production rules without an explicit founder/governance decision. The bonding-curve formula and migration threshold also have implemented testnet baselines documented in `docs/PHASE-2-IMPLEMENTATION.md` §4 and §6 and remain provisional.

---

## 22. Protocol Safety Rule for AI Agents

AI coding agents must not invent token-economic parameters.

If this document does not define a parameter, the implementation must either:

1. expose it as a clearly marked configurable testnet parameter; or
2. stop and report the missing decision.

Agents must never silently choose a bonding curve, supply allocation, fee split, vesting schedule or migration threshold as a production rule.

---
