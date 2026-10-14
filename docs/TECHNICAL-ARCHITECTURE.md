# PEOPLE'S BLOCKCHAIN — TECHNICAL ARCHITECTURE v0.1

**Status:** Working architecture specification
**Date:** 2026-10-14 (runtime status); body still includes OVN-era design history
**Base (historical):** Open Validator Network (OVN) reference codebase
**Current runtime:** Cosmos EVM testnet chain id **97401** (`chain/`, public RPC + Solidity contracts)
**Network:** People's Blockchain
**Brand:** People
**Native asset:** People (ticker **PPL**)

> **Terminology:** runtime native asset is **People** / **PPL** / id `ppl`. Legacy `vls` /
> `VLS` / `Vallis` appear only in historical notes. See `docs/TERMINOLOGY.md`.

> This document maps the People's Blockchain concept onto the existing OVN codebase. It deliberately separates **what already exists**, **what should be preserved**, and **what must be added or redesigned**. It is an architectural source of truth for AI coding agents. Agents must not invent protocol economics that are not explicitly approved in the project documents.

---

## 0. Current runtime (2026-10-14)

- The public testnet is a Cosmos EVM chain: chain id `97401`, chain name `people_97401-1`, RPC `https://node.peopleblockchain.network/rpc`.
- Chain source is `chain/` in this repo; the public site is www.peopleblockchain.network.
- Live Solidity on 97401: token and NFT factories, bonding curve, AMM/swap, fee gateway, and People Predict.
- Deployment addresses: `website/src/data/evm-deployments-97401.json` and `website/src/lib/predict/deployment.json`.
- `people-node` (OVN) is a historical baseline/archive only; it is not the public network.
- The public testnet cutover is already done — no future migration is pending for it.
- Where marked historical, the rest of this document still describes the OVN-era design baseline.

---

## 1. Architectural strategy

We are **not** throwing away the existing OVN blockchain implementation.

We are creating a new project repository from the OVN codebase and using it as the technical baseline.

Conceptually:

```text
OVN Reference Codebase
        ↓
People's Blockchain
        ├── Preserve working blockchain primitives
        ├── Redesign economic layer
        ├── Add participation protocol
        ├── Add user-created asset layer
        ├── Add DEX / liquidity layer
        └── Rebuild consumer-facing product UX
```

The original OVN repository/archive remains unchanged and is treated as a reference/backup.

The new repository is the only place where product development occurs.

---

## 2. Existing OVN technical baseline

The supplied OVN archive already contains a functioning monorepo with these major areas:

```text
apps/node
apps/web
apps/mobile-lite

packages/core
packages/protocol
packages/p2p
packages/sdk
```

The repository uses npm workspaces and Turborepo.

Current root tooling includes TypeScript, Turbo, Vitest, ESLint/TypeScript checks and CI workflows.

The existing application stack is broadly:

- Node.js/TypeScript backend;
- React + Vite web application;
- PWA support;
- lightweight mobile/browser validator client;
- LevelDB-based persistent node storage;
- WebSocket-based P2P gossip/live updates;
- secp256k1 transaction/key signing;
- SDK for HTTP API and transaction signing.

These foundations should be preserved unless a concrete reason for replacement is demonstrated.

---

## 3. Existing consensus and validator layer

The OVN reference implementation currently uses a **leader-based Proof-of-Stake model with attestation-based finalization**.

Current reference behavior includes:

- one proposer/leader per slot;
- approximately 3 second block interval in the reference configuration;
- validator stake;
- validator warmup/unbonding;
- validator status lifecycle;
- validator uptime/attestation scores;
- block attestations;
- finalization based on an attestation threshold;
- evidence-based slashing;
- full/light node kinds;
- validator referrals.

Reference configuration currently includes values such as:

```text
minStake = 100 PPL
warmupEpochs = 2
unbondingEpochs = 2
lightValidatorWeightMultiplier = 0.5
attestationFinalityThreshold = 0.67
```

These values are **reference implementation parameters only** and must not be assumed to be People's Blockchain mainnet parameters.

### Decision

Preserve the general consensus architecture for the first development phase.

Do not redesign consensus until the product/economic layers are working on a controlled testnet.

---

## 4. Existing slashing layer

OVN already contains evidence-based slashing.

Reference implementation includes:

- double-sign evidence;
- conflicting-attestation evidence;
- stake reduction/slashing;
- temporary validator jail;
- reporter reward from the slashed amount.

This mechanism is useful for validator security and should be retained as a foundation.

### Important People's Blockchain rule

**Mobile participants must not be treated like validators.**

A participant who stops using a phone, loses connectivity, or misses a participation session should not automatically be financially slashed.

Mobile inactivity should affect Participation Power/reward eligibility rather than validator stake.

---

## 5. Existing ledger/state layer

The current core contains state for:

- accounts and balances;
- nonces;
- validators;
- mempool;
- blocks;
- epochs;
- governance proposals;
- attestation votes/ballots;
- finalized height;
- block/hash tracking.

The current protocol transaction types include:

```text
transfer
joinValidator
leaveValidator
unstake
attestation
slashEvidence
proposal
vote
```

### Future transaction families

People's Blockchain will need protocol transaction types for at least:

```text
registerParticipant
participationHeartbeat / participationProof
updateParticipation
createToken
mintToken (if applicable)
burnToken (if applicable)
createNFT
transferToken
transferNFT
createPool
swap
addLiquidity
removeLiquidity
migrateLiquidity
claimCommunityReward
createLaunch
claimCreatorReward
stake
unstake
```

The final transaction model will be defined after the economic model is finalized.

Do not add large numbers of speculative transaction types in one change. Implement them in protocol milestones.

---

## 6. Existing networking layer

The reference project already provides P2P gossip with:

- peer discovery/exchange;
- reconnect/backoff;
- peer book persistence;
- block catch-up;
- temporary peer bans;
- duplicate handling;
- WebSocket-based gossip.

### Decision

Preserve the networking layer for MVP.

The first project milestone is **not** to invent a new P2P protocol.

Security hardening and production decentralization come later.

---

## 7. Existing storage layer

The node uses persistent LevelDB storage and indexes for blockchain data.

The reference implementation has:

- block indexes;
- transaction indexes;
- address indexes;
- checkpoints;
- chain-window pruning.

### Decision

Retain LevelDB for the initial network implementation.

Do not introduce a second database technology until there is a measurable requirement.

---

## 8. Existing API and SDK layer

The node exposes HTTP APIs plus WebSocket/live data.

The SDK already handles:

- key generation;
- signing;
- transaction submission;
- node queries;
- validator operations;
- transfers.

### Decision

Extend `@ovn/sdk` rather than creating a second SDK.

New product operations should eventually be exposed through the same SDK/API contract.

---

## 9. Existing web product

The reference web app already contains pages/components for:

- landing page;
- wallet;
- validators;
- staking;
- governance;
- light participation;
- explorer;
- search;
- network status;
- roadmap/docs.

This means the existing frontend can provide a useful shell for the first product iteration.

However, the product hierarchy must change.

### Current mental model

```text
Blockchain
  → Validator
  → Stake
  → Earn
```

### People's Blockchain mental model

```text
Participate
  → Earn
  → Discover
  → Create
  → Trade
  → Stake
  → Validate
```

Validators become an advanced role rather than the main consumer entry point.

---

## 10. Existing mobile/light architecture

The reference project already contains a lightweight validator path and a PWA/browser light-validator experience.

This is useful as a technical starting point, but the product meaning must change.

### Old meaning

Light participation is presented primarily as a lighter validator mode.

### New meaning

The consumer mobile path should become **Participation Mining**.

A mobile device can participate in the application/protocol without pretending to be a full consensus validator.

A user may later become a real validator by operating a supported node on a computer/server.

---

## 11. New protocol layer: People's Participation Protocol

This is the main new subsystem.

It lives above the base blockchain primitives and connects real ecosystem activity to participant incentives:

```text
Network Activity
        ↓
Network Fees & Token Launch Allocations
        ↓
Community Pool (Multi-Asset Accounting Layer)
        ↓
Dynamic Participant Pool (Reward Allocation per Epoch)
        ↓
Eligible Participants (Filtered by Humanity / Anti-Sybil Layer)
        ↓
Participation Power (Sublinear Activity, Contribution, Reputation & Hard Cap)
        ↓
Reward Epoch (Deterministic Snapshot)
        ↓
Distribution (Asset-Specific Proportional Allocation)
```

The design enforces that a person's Participation Power changes over time without altering their wallet balance.

Participation Power is strictly an internal accounting quantity, not a tradable token.

The formal mathematical simulation model and invariants are documented in `ECONOMIC-SIMULATION-v0.1.md`, and product rules are defined in `MOBILE-MINING.md`.

---

## 12. Identity and Anti-Sybil layer

The reference OVN code does not provide the consumer-grade proof-of-human system required by People's Blockchain.

We therefore need a new identity/anti-Sybil subsystem.

### Architectural Principle: Decoupled Eligibility Layer

Humanity is primarily an **ELIGIBILITY / TRUST / LIMIT layer**, NOT an unbounded financial reward multiplier.

The protocol separates identity verification from economic reward calculation:
- Proof-of-Humanity does not linearly multiply token payouts.
- The layer enforces access gates, confidence tiers, probation/maturation schedules, and maximum effective power caps (`PowerCap` tiers).

The architecture should support multiple signals rather than depending on one fragile signal.

Possible signals include:
- verified account/device continuity over time;
- time-based participation history;
- trusted graph attestations;
- behavioral consistency and interaction cadence;
- account age and maturation;
- rate limits;
- device/account binding where appropriate;
- later external privacy-preserving proof-of-personhood integrations (e.g. ZK uniqueness).

### Design rule

No single signal should be enough to generate unlimited reward power.

Identity data should be minimized and protected. Where possible, the protocol should use cryptographic attestations/claims rather than storing unnecessary personal data on-chain.

---

## 13. New asset layer: Token Factory

The reference protocol currently does not provide the full user-created token economy required by the project.

We need a new asset subsystem.

Core responsibilities:

- create token definitions;
- enforce standard launch allocation;
- register metadata;
- manage token balances;
- support token transfers;
- manage protocol-owned/community allocations;
- expose token data to wallet/explorer/DEX;
- emit events for indexing.

### Architectural principle

A user-created token is an application-level asset secured by the People's Blockchain.

It is not a new blockchain.

---

## 14. Community Pool subsystem

The Community Pool is a protocol-controlled accounting system.

At launch, every standard token must allocate **10% of its initial supply** to its token-specific Community Pool (mandatory protocol rule per `ECONOMICS.md` §9 and `TOKEN-ECONOMY.md` §4). In addition, a provisional **25%** of protocol fees in PPL flow into the PPL Community Pool (provisional v0.1 parameter; TBD). These two inflows are accounted per asset ID and are never merged.

From the Community Pool, a protocol-defined share is allocated into the **Dynamic Participant Pool** for active reward distribution (tested in simulation at 50%, 60%, and 70%, with 60% as central candidate; TBD).

The subsystem needs:

- multi-asset accounting preserving strict asset specificity (PPL fee pool and each user-token pool remain separate);
- per-token community allocation tracking;
- reward epochs and deterministic block snapshots;
- eligible participant calculation (filtered by Humanity / Anti-Sybil layer);
- Participation Power calculation with diminishing returns and hard `PowerCap`;
- enforcement of the Reward Concentration Guard (`MaximumRewardSharePerEpoch = TBD`);
- claim accounting and anti-double-claim protection;
- zero-pool invariant enforcement (no unbacked guaranteed income);
- distribution history and event emission.

The initial implementation should prefer deterministic on-chain accounting over a centralized off-chain database.

---

## 15. Token market layer

The project needs a native market layer.

Target architecture:

```text
Token Launch
    ↓
Bonding Curve
    ↓
Migration Threshold
    ↓
TOKEN / PPL AMM Pool
    ↓
DEX Trading
```

The curve and AMM math must be isolated in testable protocol modules.

They must not be embedded directly into React components or node API handlers.

---

## 16. DEX architecture

The DEX will require at minimum:

- pool state;
- reserve accounting;
- swap calculations;
- liquidity shares/positions;
- fees;
- add/remove liquidity;
- price/oracle display data;
- launch/migration flow.

The initial implementation should be a simple deterministic AMM suitable for the network, not a feature-complete copy of a major external DEX.

The first version should prioritize:

1. correctness;
2. deterministic math;
3. reentrancy/state safety;
4. test coverage;
5. clear fee accounting.

Advanced routing and multi-hop features can come later.

---

## 17. NFT subsystem

NFT support should eventually include:

- collection metadata;
- token IDs;
- ownership;
- transfer;
- minting rules;
- creator metadata;
- marketplace compatibility later.

NFT storage architecture must not store large media files directly inside blockchain state.

The blockchain should store ownership, immutable metadata references and hashes/identifiers as appropriate.

Media storage can use external/object storage/content-addressed infrastructure in later stages.

---

## 18. Native asset / economics integration

The current OVN implementation uses a simple account-balance model with the native **PPL** asset and validator issuance.

People's Blockchain requires this layer to evolve into the economic model described in `ECONOMICS.md`.

The implementation must eventually support separate accounting concepts for:

```text
PPL balance
validator stake
validator rewards
fee pool
Community Pool
Dynamic Participant Pool
Treasury
burned supply
user-token balances
DEX reserves
```

These balances must have explicit accounting rules and auditable state transitions.

---

## 19. Validator economy

The validator layer should continue to secure the base chain.

Validators should receive a combination of:

- protocol security emission;
- eligible network fees;
- potentially other protocol-defined infrastructure rewards.

Their compensation must be independent of mobile participation rewards.

This prevents the misconception that everyone with a phone is securing consensus.

---

## 20. Governance

The current OVN governance is validator/stake-oriented.

It may be retained for early network administration, but long-term governance needs a dedicated design for People's Blockchain.

Do not assume that one-unit-one-vote or pure stake-weighted governance is the final model.

Governance evolution should be specified separately after the base protocol is stable.

---

## 21. Product/application architecture

The target consumer product should eventually contain:

```text
Public Website
   ├── Home
   ├── How it works
   ├── Explore
   └── Docs

Web/PWA App
   ├── Wallet
   ├── Mining / Participate
   ├── Rewards
   ├── Launch Token
   ├── Create NFT
   ├── Launch Feed
   ├── Swap / DEX
   ├── Portfolio
   ├── Referrals / Community
   └── Profile / Reputation

Advanced
   ├── Validator
   ├── Staking
   ├── Governance
   └── Developer tools
```

The consumer path should not force a new user to understand validators, staking or blockchain consensus before they can participate.

---

## 22. Indexing and explorer requirements

The current explorer should eventually become asset-aware.

It needs to index:

- tokens;
- token holders;
- launches;
- pools;
- swaps;
- NFTs;
- community allocations;
- reward claims;
- validator activity;
- participation metrics.

For MVP, an application indexer may run off-chain while the authoritative balances and protocol state remain on-chain.

---

## 23. API evolution

The current API can be extended rather than replaced.

New API domains will likely include:

```text
/participants
/reputation
/rewards
/tokens
/launches
/pools
/swaps
/nfts
/market
```

Read APIs may be optimized for frontend performance.

Write operations must ultimately map to signed protocol transactions or protocol-authorized actions with deterministic rules.

---

## 24. Security principles

All new financial logic must be deterministic and heavily tested.

Required protections include:

- integer/precision-safe arithmetic;
- overflow/underflow protection where applicable;
- deterministic rounding;
- authorization checks;
- nonce protection;
- replay protection;
- state transition validation;
- double-claim prevention;
- pool invariant checks;
- transaction ordering assumptions documented and tested;
- anti-spam limits;
- economic attack simulations.

No financial mechanism should depend on a frontend calculation being honest.

---

## 25. Development sequence

The project should be developed in the following order.

### Phase 0 — Baseline

- create new repository from OVN reference;
- preserve original archive;
- make baseline build/typecheck/tests pass;
- rename product-facing references gradually, not in one risky bulk edit.

### Phase 1 — Protocol foundations

- formalize native asset model;
- formalize fee accounting;
- implement agreed economics;
- add protocol versioning/configuration.

### Phase 2 — Participation

- participant state;
- identity/anti-Sybil foundation;
- Participation Power;
- participation reward accounting.

### Phase 3 — Token Economy

- Token Factory;
- Community Pool;
- token balances/transfers;
- launch events;
- token explorer/indexing.

### Phase 4 — Markets

- bonding curve;
- liquidity migration;
- AMM pool;
- swap;
- fees.

### Phase 5 — NFT

- NFT core;
- mint/transfer;
- collections;
- marketplace groundwork.

### Phase 6 — Consumer product

- redesigned landing page;
- onboarding;
- mining dashboard;
- launch flow;
- wallet/portfolio;
- exploration/discovery.

### Phase 7 — Testnets

- internal testnet;
- controlled public testnet;
- load tests;
- economic simulations;
- adversarial testing;
- security review.

### Phase 8 — Mainnet preparation

Only after the protocol/economic/security criteria are met should mainnet parameters be frozen.

---

## 26. What must NOT be changed accidentally

AI coding agents must not silently change:

- native token emission;
- validator reward percentages;
- fee allocation;
- Community Pool percentage;
- Participation Power rules;
- bonding curve formula;
- migration threshold;
- staking rules;
- slashing rules;
- consensus finality parameters;
- governance authority.

Any change to these requires an explicit update to the relevant specification document first.

---

## 27. Source-of-truth hierarchy

When documents conflict, use this order:

1. explicit founder decision recorded in the latest approved specification;
2. `ECONOMICS.md` for economic rules;
3. `MOBILE-MINING.md` for participation rules;
4. `TOKEN-ECONOMY.md` for token/DEX rules;
5. this document for architecture boundaries;
6. `VISION.md` for high-level product intent;
7. existing OVN code only as the current implementation baseline.

Existing code is **not automatically the intended final behavior**.

---

## 28. Current conclusion

The existing OVN codebase is a useful blockchain foundation, not the finished People's Blockchain.

The most important architectural decision is to build the project as two clearly separated layers:

```text
BASE BLOCKCHAIN
Consensus / P2P / Blocks / Validators / Storage / Wallet

                    +

PEOPLE'S ECONOMY
Participation / Community Pool / Token Factory / NFT / DEX / Rewards
```

The first development objective is therefore **not** to rewrite the blockchain core. It is to make the economic and participation layer explicit, deterministic and testable, then integrate it with the existing core.
