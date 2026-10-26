# PEOPLE Blockchain

A blockchain project focused on mass participation, creator-owned tokens, community distribution and an open creator economy.

## Project Status

- **Status:** Early Development
- **Codebase Foundation:** Developed from the PEOPLE Network reference codebase
- **Product Specifications:** Product specifications are located in `/docs`
- **Protocol Parameters:** Current protocol parameters are provisional unless explicitly marked final.

---

## Vision

PEOPLE Blockchain is designed to make blockchain participation accessible to ordinary users using phones, tablets and computers.

The network combines:

- mobile participation;
- community rewards;
- user-created tokens;
- NFTs;
- decentralized trading;
- validator infrastructure;
- staking;
- an ecosystem-native currency.

The goal is to build a network where users are not only blockchain users, but also participants, creators and eventually infrastructure providers.

---

## Core Roles

### Participants

People who participate in the network from phones, tablets or computers.

Participants build Participation Power and may receive ecosystem rewards.

### Creators

Users who create:

- tokens;
- NFTs;
- communities;
- applications;
- projects;
- reward systems.

### Validators

Nodes that maintain blockchain consensus, validate transactions and secure the network.

---

## Native Asset

The native asset of PEOPLE Blockchain is **PEOPLE**, with the ticker **PPL**.

PEOPLE is intended to provide the economic foundation of the network.

Potential uses include:

- transaction fees;
- token creation;
- NFT creation;
- staking;
- validator participation;
- liquidity;
- governance;
- ecosystem services.

Final tokenomics are defined in:

`docs/ECONOMICS.md`

---

## Participation Mining

PEOPLE Blockchain does not rely on traditional proof-of-work mining for ordinary mobile users.

Mobile participation is based on a separate Participation Mining model.

Participants may build Participation Power through:

- verified human participation;
- activity;
- contribution;
- reputation;
- network participation;
- other protocol-defined activities.

See:

`docs/MOBILE-MINING.md`

---

## Community Economy

Every standard token launched through the Token Factory must reserve **10% of its initial supply** for its own token-specific Community Pool.

This allocation is a mandatory protocol rule, not an optional creator choice (`docs/ECONOMICS.md` §9; `docs/TOKEN-ECONOMY.md` §4).

This mechanism is designed to connect:

**Creators → Community → Token Economy**

The detailed rules are defined in:

`docs/TOKEN-ECONOMY.md`

---

## Token Creation

The network is designed to allow ordinary users to create their own tokens without requiring advanced blockchain development skills.

Potential use cases include:

- communities;
- businesses;
- rewards;
- games;
- fundraising;
- creator economies;
- applications.

---

## NFT

The network is intended to support native NFT creation and ownership.

NFT functionality will be integrated into the broader PEOPLE Blockchain economy.

---

## Decentralized Exchange

User-created tokens are intended to be tradable against the native asset.

The planned market architecture includes:

```text
Token Launch
      ↓
Bonding Curve
      ↓
Liquidity Threshold
      ↓
TOKEN / PPL Liquidity Pool
      ↓
Decentralized Trading
```

The detailed parameters are not yet final.

---

## Blockchain Foundation

PEOPLE Blockchain was developed from the PEOPLE Network reference codebase (historical origin only).

**Current public testnet (2026-10):** Cosmos EVM chain id **97401** (`people_97401-1`), RPC `https://node.peopleblockchain.network/rpc`, chain sources in `chain/`. The public site at `www.peopleblockchain.network` already offers asset creation (token/NFT factories), bonding curve launch, AMM/swap, explorer, and multisig against live Solidity contracts under `contracts/` (addresses in `website/src/data/evm-deployments-97401.json`).

The PEOPLE Network `people-node` stack remains in-repo as an archive/baseline; it is **not** the network users connect to today.

---

## Documentation

The `docs/` directory is the primary project specification.

**Product roadmap (statuses):** [`docs/ROADMAP.md`](docs/ROADMAP.md) — canonical list with `docs/roadmap.json` for the public site.

### Vision

`docs/VISION.md`

Defines what the project is, who it is for and why it exists.

### Mobile Mining

`docs/MOBILE-MINING.md`

Defines Participation Mining, Participation Power and mobile participation.

### Economics

`docs/ECONOMICS.md`

Defines the native asset, emission, fees, validators, treasury and network economics.

### Token Economy

`docs/TOKEN-ECONOMY.md`

Defines user-created tokens, Community Pool, Token Factory, bonding curves and DEX economy.

### Technical Architecture

`docs/TECHNICAL-ARCHITECTURE.md`

Defines the technical architecture; see §0 for the current Cosmos EVM testnet runtime (97401).

### Terminology

`docs/TERMINOLOGY.md`

Defines the official brand, network and asset naming, the deprecated terms that must not be
used as current product names, and the legacy identifiers that are intentionally preserved
for consensus, storage and compatibility reasons.

---

## Source of Truth

The project documentation in `docs/` is the source of truth for product and protocol decisions.

AI coding agents must not independently invent or modify:

- tokenomics;
- emission;
- reward formulas;
- economic parameters;
- consensus rules;
- Community Pool rules;
- mining formulas.

When a required decision has not yet been defined, it must be marked:

`TBD`

and presented for approval before implementation.

---

## Development Principle

The project is being developed in stages:

1. Understand the existing PEOPLE Network foundation.
2. Establish a stable baseline.
3. Define protocol economics.
4. Define participation mechanics.
5. Implement the PEOPLE Blockchain protocol.
6. Implement the creator and token economy.
7. Implement consumer products.
8. Test on internal and public testnets.
9. Prepare for mainnet.

---

## Project Structure

```text
Peoples-Blockchain/
│
├── core/              # Blockchain core
├── protocol/          # Protocol rules
├── p2p/               # Network layer
├── node/              # Validator / node
├── sdk/               # Developer SDK
├── wallet/            # Wallet
├── explorer/          # Blockchain explorer
├── web/               # Web application
├── mobile/            # Mobile / PWA
│
├── docs/              # Project specifications & technical audit
│   ├── VISION.md
│   ├── MOBILE-MINING.md
│   ├── ECONOMICS.md
│   ├── TOKEN-ECONOMY.md
│   ├── TECHNICAL-ARCHITECTURE.md
│   ├── BASELINE-AUDIT.md
│   ├── ARCHITECTURE-MIGRATION.md
│   └── DEVELOPMENT.md
│
└── README.md
```

---

## Current Development Focus

The current priority is not mass deployment.

The current priority is to:

1. audit the existing PEOPLE Network foundation;
2. establish a reproducible development baseline;
3. define the PEOPLE Blockchain economics;
4. define Participation Mining;
5. design the Community Pool;
6. design Token Factory and creator economy;
7. define the DEX and liquidity architecture;
8. implement and test the protocol incrementally.

---

## Development Rules

### Preserve the Foundation

Existing PEOPLE Network functionality must not be removed or rewritten without a documented reason.

### Separate Product Decisions from Implementation

Product and economic decisions are defined first.

Code is implemented afterwards.

### No Autonomous Tokenomics

AI coding agents must not invent:

- token supply;
- emission schedules;
- reward percentages;
- mining formulas;
- fee allocations;
- Community Pool percentages;
- staking economics.

These parameters must come from approved project specifications.

### No Premature Mainnet Assumptions

The network should initially be developed and tested as:

```text
Development
    ↓
Internal Testnet
    ↓
Public Testnet
    ↓
Mainnet
```

---

## Project Philosophy

PEOPLE Blockchain is intended to make blockchain participation accessible to people who do not have:

- expensive hardware;
- advanced blockchain knowledge;
- programming skills;
- large amounts of capital.

The network should allow a participant to progress from:

```text
Participant
    ↓
Contributor
    ↓
Creator
    ↓
Validator
```

without requiring them to leave the ecosystem.

---

## Economic Flywheel

The intended long-term economic cycle is:

```text
More Participants
        ↓
More Creators
        ↓
More Tokens / NFTs / Projects
        ↓
More Network Activity
        ↓
More Trading / Transactions
        ↓
More PPL Utility
        ↓
More Network Fees
        ↓
More Rewards / Infrastructure Incentives
        ↓
More Participants
```

This flywheel is a core design objective, but its final economic parameters are still under development.

---

## Important Terminology

### PEOPLE (PPL)

The native asset of PEOPLE Blockchain. The brand is **PEOPLE**, the network is
**PEOPLE Blockchain** and the ticker is **PPL**.

Official slogans:

- English: “Created by people. For the community.”
- Russian: «Создано людьми. Для сообщества.»

See `docs/TERMINOLOGY.md` for the complete terminology source of truth.

### Native asset identifier (`ppl`)

The official product and token identity is **PEOPLE (PPL)**.

The **on-chain** asset identifier is `ppl` (lowercase map key, same convention as the former
`vls`). Genesis `AssetMetadata` is `name: "People"` / `symbol: "PPL"`. Old LevelDB snapshots
that still key balances as `vls` are remapped on load; `vls` is not a second current asset.

All nodes on a network must run a compatible binary together (state root includes asset
metadata). See `docs/TERMINOLOGY.md` §4.1.

### Participation Power

A protocol-defined measure of a participant's contribution and eligibility for ecosystem rewards.

### Community Pool

A protocol-controlled, **asset-specific** pool receiving allocations from participating projects and/or network revenues for distribution to eligible participants. Standard user-created tokens allocate a mandatory 10% of initial supply to their own token pool, while a provisional 25% share of PPL protocol fees flows to the PPL pool. PPL fee pools and user-token pools are never merged or converted into a single global pool.

### Token Factory

The planned system allowing users to create their own tokens without writing smart-contract code manually.

### Bonding Curve

A mathematical pricing mechanism that can be used during the initial launch phase of a user-created token.

### Liquidity Pool

A decentralized liquidity pool used for ongoing trading after the initial launch phase.

### Validator

A network node responsible for blockchain consensus and transaction validation.

### Mobile Participant

A user participating in the network from a mobile or lightweight device. A mobile participant is not automatically a full blockchain validator.

---

## Security and Trust

The project must prioritize:

- protocol correctness;
- economic sustainability;
- Sybil resistance;
- validator security;
- transparent rules;
- deterministic protocol behavior;
- reproducible builds;
- extensive testing.

Security mechanisms such as staking and slashing apply to roles that have protocol-level responsibilities. Ordinary participants should not be exposed to validator-level financial penalties merely for being inactive.

---

## Project Status

This project is currently in the:

**Architecture / Early Development / Prototype**

stage.

Economic and protocol parameters are provisional unless explicitly marked as final.

The system is experimental and is not yet production-ready or intended for unrestricted real-world deployment.

---

## License

The project license and open-source policy will be defined separately.

---

## Disclaimer

Nothing in this repository should be interpreted as a guarantee of token value, profitability or financial return.

The protocol is being designed and tested as experimental blockchain infrastructure.

---

## Repository layout

- `chain/` — Cosmos EVM chain (PEOPLE testnet, chain id 97401) and helper scripts
- `contracts/` — Solidity contracts (Foundry); `contracts/lib/*` are git submodules
- `people-node/` — node / validator software (TypeScript)
- `website/` — Next.js web app (deployed on Vercel)
- `docs/` — protocol, economics and architecture documents

Clone with submodules:

```bash
git clone --recurse-submodules https://github.com/people-blockchain/<repo>.git
```

Public testnet RPC: `https://node.peopleblockchain.network/rpc`

## Security

See [SECURITY.md](SECURITY.md). Never commit `.env` files or private keys; CI runs gitleaks on every push.

## License

Apache License 2.0 — see [LICENSE](LICENSE). Contact: hello@peopleblockchain.network
