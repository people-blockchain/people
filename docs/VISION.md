# People's Blockchain — Vision v0.1

**Status:** Draft / Foundational Product Vision  
**Date:** 2026-09-22  
**Network:** People's Blockchain  
**Brand:** People  
**Native asset:** People (ticker **PPL**)

> Naming follows `docs/TERMINOLOGY.md`: the brand is **People**, the network is
> **People's Blockchain** and the native token is **People** with the ticker **PPL**.

---

## 1. Purpose

People's Blockchain is a consumer-oriented blockchain network designed to make participation in a blockchain economy simple for ordinary people using a phone, tablet, or computer.

The project combines four ideas into one network:

1. **Participation** — ordinary users can join the network without specialized hardware.
2. **Creation** — users can create tokens, NFTs, communities, and other digital assets with minimal technical knowledge.
3. **Ownership** — participants can receive and hold assets created by projects across the ecosystem.
4. **Economic participation** — network activity creates rewards and utility instead of treating users only as passive wallet holders.

The project is intended to become a **people-oriented blockchain economy**, not merely another blockchain infrastructure project and not merely a token-distribution application.

---

## 2. Target users

The primary target is the global mass market, especially users for whom mobile access is much more important than professional computing infrastructure.

Priority regions include:

- Latin America;
- Central and other parts of Africa;
- South and Southeast Asia;
- CIS and Eastern Europe;
- other emerging digital markets.

The product must remain usable for people who are not blockchain developers, traders, or technically sophisticated crypto users.

The product should be understandable with simple concepts such as:

- Participate;
- Earn;
- Create;
- Trade;
- Stake;
- Run a Node.

---

## 3. The core user proposition

A person should be able to join the network with no initial capital and begin participating from a phone.

Participation should create economic opportunity through a combination of:

- network participation;
- participation/reputation power;
- community reward distributions;
- ecosystem activity;
- creation of digital assets;
- referrals and community building, subject to protocol rules.

The system must **not** rely on the assumption that simply clicking a button or keeping an app open creates economic value. The protocol should connect rewards to meaningful participation and to real economic activity inside the network.

---

## 4. The three core roles

### 4.1 Participant

A participant is an ordinary user who joins the network from a mobile device, tablet, or computer.

A participant can:

- maintain a wallet;
- participate in the network;
- build Participation/Mining Power;
- receive eligible ecosystem rewards;
- discover and support projects;
- eventually create tokens and NFTs.

A participant is **not automatically a validator**.

### 4.2 Creator

A creator uses the network to launch a digital asset or community-based project.

A creator may be able to create:

- fungible tokens;
- NFTs;
- community/reward tokens;
- project-specific assets;
- later, DAOs or other programmable organizations.

The network should make asset creation accessible without requiring Solidity or blockchain engineering knowledge.

### 4.3 Validator

A validator provides infrastructure and helps secure the blockchain consensus/network.

Validators may run on computers or dedicated servers and participate in:

- consensus;
- block production/validation;
- attestations/finality;
- network infrastructure;
- other protocol-defined security functions.

Validators are economically different from mobile participants. They receive rewards for securing and operating the blockchain.

---

## 5. The native asset

The network has a native asset: **People**, with the ticker **PPL**.

People is intended to be the native economic and settlement asset of the blockchain.

Its roles are expected to include:

- transaction fees / gas;
- token creation fees;
- NFT creation and related protocol fees;
- staking;
- validator participation;
- liquidity and trading pairs inside the network;
- access to selected advanced features;
- governance, where and when governance is enabled;
- other protocol-defined utility.

The final supply, issuance schedule, fee schedule, burn policy, and reward distribution are **not fixed in this document**. They will be defined in `docs/ECONOMICS.md`.

---

## 6. Participation Mining

The product may use the familiar user-facing term **Mining** because it is easy for a mass-market user to understand.

At the protocol level, the mechanism should be based on meaningful participation rather than proof-of-work performed by a mobile phone.

The working concept is **Participation Mining / Participation Power**.

Participation Power may depend on factors such as:

- verified human participation;
- consistent activity;
- reputation;
- useful contribution;
- community participation;
- curation or discovery;
- staking, if applicable;
- other protocol-defined contribution signals.

The exact formula, limits, decay rules, anti-Sybil mechanics, and reward conversion are defined separately in `MOBILE-MINING.md` and `ECONOMICS.md`.

---

## 7. The Community Pool

A defining feature of People's Blockchain is a protocol-level **Community Pool / People's Pool**.

When a new user-created token is launched, a predetermined portion of its supply is intended to be allocated automatically to the Community Pool according to protocol rules.

For the standard launch template this allocation is a mandatory **10% of the initial token supply** (`ECONOMICS.md` §9; `TOKEN-ECONOMY.md` §4). The remaining launch allocation percentages are provisional and may change before mainnet.

The purpose is to create a two-sided market:

- creators receive an initial distribution mechanism and access to a network of participants;
- participants receive exposure to new projects and assets;
- the network gains a mechanism that connects creation with participation.

The Community Pool is therefore a core economic primitive, not a marketing campaign.

---

## 8. User-created token economy

People's Blockchain should allow an ordinary user to create a token through a simple interface.

The intended flow is approximately:

**Create Token → Define basic parameters → Accept protocol rules → Launch**

The protocol should automatically apply required rules such as:

- supply and allocation constraints;
- community allocation;
- fees;
- liquidity/market initialization rules;
- metadata and token registration;
- other security or anti-abuse rules.

The final token-launch mechanics will be defined in `TOKEN-ECONOMY.md`.

---

## 9. NFT economy

The network should allow users to create NFTs without requiring specialist blockchain knowledge.

NFTs are intended as a native part of the network economy, potentially supporting:

- art;
- collectibles;
- memberships;
- tickets;
- digital certificates;
- game assets;
- community assets;
- other programmable digital ownership use cases.

The detailed NFT protocol and marketplace architecture are not yet fixed.

---

## 10. Market and liquidity model

User-created tokens need a native market mechanism.

The current working direction is:

**Token Launch → Initial Price Discovery → Liquidity Pool / DEX**

A bonding-curve launch mechanism is being considered for initial price discovery, followed by an AMM liquidity pool when predefined conditions are reached.

This is a design direction, not yet a final protocol specification.

The network's native asset is expected to be the primary settlement/base asset for internal token markets.

---

## 11. The network economic flywheel

The intended high-level economic cycle is:

**People join the network**

→ participate

→ receive participation rights/rewards

→ creators launch projects and tokens

→ projects distribute part of their token supply to the Community Pool

→ participants discover and use project assets

→ trading creates demand for the native asset

→ network activity generates fees

→ fees support validators, the ecosystem, and participant rewards according to protocol rules

→ more creators and participants join

→ the ecosystem grows.

The protocol must ultimately be designed so that economic value is connected to actual network use rather than to endless issuance alone.

---

## 12. Product philosophy

People's Blockchain should prioritize:

### Simplicity

A person should be able to understand the main actions without understanding blockchain internals.

### Accessibility

A phone should be enough to participate in the consumer layer of the network.

### Ownership

Users should be participants in the ecosystem, not merely traffic sent to a centralized platform.

### Transparency

Core economic rules should be explicit, deterministic, and auditable.

### Sustainable incentives

Rewards should ultimately be connected to network activity, security, and economic utility.

### Progressive decentralization

The system can begin with controlled infrastructure during development and testing and become more open as security, tooling, and economic controls mature.

---

## 13. What People's Blockchain is not

People's Blockchain is not intended to be:

- a proof-of-work mining network where phones perform expensive computation;
- a simple referral pyramid where rewards depend primarily on recruitment;
- a blockchain whose only utility is speculation on its native asset;
- a platform where every token is guaranteed to have monetary value;
- a promise of guaranteed income or guaranteed investment returns.

User-created assets can fail, lose value, or have no market. The protocol should not imply otherwise.

---

## 14. Security and abuse principles

The network must anticipate:

- Sybil attacks;
- fake accounts;
- automated farming;
- spam token launches;
- malicious creators;
- validator attacks;
- market manipulation;
- reward abuse;
- wash trading;
- collusion;
- governance concentration.

The protocol should use identity, reputation, economic deposits, rate limits, staking/slashing where appropriate, and other controls as necessary.

Specific mechanisms must be defined in the relevant technical and economic documents rather than improvised by individual application developers.

---

## 15. Relationship to the existing PEOPLE Network codebase

The current project is being developed from the existing **PEOPLE Network** codebase supplied as a reference implementation.

The original PEOPLE Network repository/ZIP is preserved unchanged as the reference baseline.

The new People's Blockchain repository is a separate development project that may reuse, redesign, refactor, or replace parts of the PEOPLE Network implementation.

The existing technical foundation includes blockchain/network concepts such as:

- nodes;
- validators;
- staking;
- consensus/finality;
- peer-to-peer networking;
- wallet functionality;
- explorer functionality;
- SDK/application layers.

The People's Blockchain project will not assume that existing PEOPLE Network economic rules are final.

---

## 16. Decision authority

The project has a strict separation between **product decisions** and **implementation**.

The product/protocol specification is the source of truth for economic and functional decisions.

AI coding agents and implementation developers may:

- implement approved specifications;
- improve code quality;
- write tests;
- refactor implementation;
- identify technical risks;
- propose alternatives.

They must not silently invent or change:

- token supply;
- emission rules;
- reward formulas;
- fee allocation;
- community allocation;
- consensus economics;
- governance power;
- staking/slashing rules.

Those decisions belong to the project's approved protocol specifications.

---

## 17. Current non-final decisions

The following items are intentionally **open** and must be resolved in later documents:

- maximum or target supply;
- emission schedule;
- mobile participation formula;
- Proof of Humanity / identity approach;
- anti-Sybil model;
- Community Pool percentage and distribution formula;
- exact token-launch allocation;
- bonding-curve formula and migration threshold;
- DEX/AMM design;
- validator requirements;
- staking requirements;
- slashing parameters;
- governance model;
- bridge/external liquidity strategy;
- mainnet launch criteria.

No AI agent should infer these values without an approved specification.

---

## 18. Long-term vision

People's Blockchain aims to become a global, consumer-oriented blockchain economy where a person can start with a phone and progress through multiple levels of participation:

**Participant → Contributor → Creator → Validator**

The intended end state is an ecosystem where people can:

- participate in network activity;
- earn from legitimate ecosystem activity;
- create their own digital assets;
- build communities;
- discover and support projects;
- use and trade assets;
- provide infrastructure;
- become economically aligned with the growth of the network.

The long-term goal is not to maximize the number of tokens distributed. The goal is to build a network where **participation, creation, ownership, liquidity, and infrastructure reinforce one another in a sustainable economic system**.

---

## 19. Source-of-truth rule

This document defines the project's **high-level vision and product principles**.

For detailed decisions, always defer to the more specific approved documents:

1. `ECONOMICS.md` — native asset and network economics;
2. `MOBILE-MINING.md` — participation and reward mechanics;
3. `TOKEN-ECONOMY.md` — user-created tokens, launch mechanics, liquidity, DEX;
4. `TECHNICAL-ARCHITECTURE.md` — implementation architecture;
5. `ROADMAP.md` — delivery sequence.

When documents conflict, the more specific approved protocol document takes precedence, and unresolved conflicts must be surfaced instead of silently guessed.
