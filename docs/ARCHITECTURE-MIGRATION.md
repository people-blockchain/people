# ARCHITECTURE MIGRATION MATRIX — PEOPLE BLOCKCHAIN

**Date:** 2026-09-22  
**Status:** Baseline Migration Strategy  
**Reference Codebase:** PEOPLE Network

**Target Project:** PEOPLE Blockchain

> **Historical / superseded for native asset naming.** Current runtime native asset is
> **PEOPLE** (`PPL`, id `ppl`). `VLS` / `vls` / `Vallis` below are the PEOPLE Network baseline identifiers
> as of this matrix’s date, not the live asset.

---

## 1. Architectural Strategy

The development principle for PEOPLE Blockchain is **incremental evolution without destructive rewrites**:
- **Preserve** robust blockchain primitives (cryptography, LevelDB persistence, P2P gossip, deterministic state machine).
- **Separate** consensus validation (server/PC nodes) from mobile participation (phones, tablets, browsers).
- **Adapt** existing web and client tools for consumer UX.
- **Implement** new economic primitives (Token Factory, Community Pool, Bonding Curve, DEX, Proof of Humanity) as dedicated, testable protocol modules.

---

## 2. Component Migration Matrix

| Component | Current State in PEOPLE Network | Decision | Technical Rationale & Migration Path |
| :--- | :--- | :---: | :--- |
| **Blockchain Core** | Fastify node daemon, deterministic state transition (`applyTransaction`), in-memory mempool, LevelDB storage (`ChainStore`). | **KEEP** | The core state machine, block hashing, and storage abstractions are robust and clean. New transaction families will be integrated into this engine incrementally. |
| **Consensus** | Leader-based PoS with attestation quorum (3s block time, deterministic proposer selection, 67% BFT finality). | **KEEP** | Preserved for testnet and prototype phases. Provides reliable block production and finality without needing consensus changes prior to economic milestones. |
| **P2P Networking** | WebSocket gossip protocol (`@people/p2p`), peer discovery, reconnect backoff, peerbook persistence, block catch-up. | **KEEP** | Fully functional peer-to-peer gossip layer. Security hardening and libp2p migration deferred to post-testnet phases. |
| **Validator Subsystem** | Validator lifecycle (`joining`, `active`, `unbonding`, `slashed`), warmup (2 epochs), slashing for double-sign / conflicting attestations. | **KEEP** | Provides complete validator infrastructure. Kept strictly for dedicated security nodes; decoupled from consumer mobile participants. |
| **Staking** | Capital deposit for validators (min 100 VLS), unbonding period (2 epochs), penalty slashing. | **ADAPT** | Retained for validator security. For participant mining, any future stake boost must be adapted to a sublinear curve ($\sqrt{\text{stake}}$) as per `ECONOMICS.md`. |
| **Wallet** | Web and client wallet in `@people/sdk` and `apps/web`: secp256k1 key generation, AES-GCM encrypted keystore, seed phrases, batch transfers. | **ADAPT** | Reusable for PEOPLE Blockchain consumer identity. Adapt to display multi-token portfolios, Community Pool claimable vouchers, and Participation Power. |
| **Explorer** | Basic block, transaction, address, and status explorer in `apps/web` and HTTP endpoints in `apps/node`. | **ADAPT** | Expand explorer indexing to track user-created tokens, liquidity pools, bonding curve progress, community allocations, and NFT transfers. |
| **Mobile / Light Node** | In-browser/CLI light node (`LightPage.tsx`, `apps/mobile-lite`) that stakes capital and signs block attestations over HTTP. | **ADAPT** | Must be repurposed. Discontinue requiring capital stake and attestation duties for phones. Repurpose the lightweight HTTP/PWA client into the **Participant Mining Client**. |
| **Rewards Engine** | Epoch issuance (50 VLS) + fee pool split among active validators weighted by stake, uptime, and attestations. | **ADAPT** | Retain validator security emission. Route eligible network fees per **Model A** (30% Validators, 25% Community Pool, 20% Treasury, 10% Liquidity & Ecosystem, 15% Growth Pool, 0% Burn) per `docs/ECONOMIC-MODEL-v0.1.md` / `docs/ECONOMICS.md` §6. |
| **Referral System** | 1-tier validator referral system (5% cut of referee validator reward paid to active referrer). | **ADAPT** | Preserve validator referral or replace with multi-signal user onboarding referral system with anti-farming caps and verified human requirements (`TBD`). |
| **Governance** | Stake-weighted voting by active validators on 3 protocol parameters (`minStake`, `issuance`, `lightWeight`). | **ADAPT** | Sufficient for early testnet parameter tuning. Long-term decentralized governance for PEOPLE Blockchain will be defined in a later specification. |
| **Participation Protocol** | None. Only stake-based validator attestations exist. | **NEW** | Build new protocol layer: participant registration, session heartbeats, non-stake activity tracking, and Participation Power calculation. |
| **Anti-Sybil / Humanity** | None. | **NEW** | Implement multi-signal human verification, device/account continuity, rate limiting, and reputation maturation. |
| **Token Factory** | None. Blockchain only recognizes single native token (`VLS`). | **NEW** | Implement asset creation subsystem: name, symbol, supply templates, mandatory 10% Community Pool reservation, and token registry. |
| **Community Pool** | None. | **NEW** | Implement protocol-level accounting pool that holds a mandatory 10% of new token launches and a provisional 25% of network fees (fee share `TBD`), distributing via Participation Power epochs. |
| **Bonding Curve** | None. | **NEW** | Implement deterministic mathematical bonding curve for initial price discovery and capital accumulation prior to DEX migration. |
| **DEX / AMM** | None. | **NEW** | Implement constant-product ($x \cdot y = k$) AMM for `TOKEN / PPL` trading, liquidity reserves, swaps, and automated migration from curves. |
| **NFT Subsystem** | None. | **NEW** | Implement digital collectibles layer: collections, unique token IDs, ownership mapping, and external metadata URI standards. |

---

## 3. Decision Status Legend

- **KEEP:** Existing PEOPLE Network module is technically sound and meets immediate architectural needs. Retained without structural redesign.
- **ADAPT:** Existing PEOPLE Network module provides valuable technical foundation but requires refactoring, parameter tuning, or UX realignment to fit PEOPLE Blockchain product principles.
- **REPLACE:** Existing module is fundamentally incompatible with the target vision and will be phased out for a modern alternative (`TBD`).
- **NEW:** Subsystem does not exist in PEOPLE Network and must be engineered from specifications.
