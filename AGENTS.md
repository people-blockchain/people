# AGENTS.md

## Purpose

This repository contains the development of **People's Blockchain**, a blockchain project based on the existing Open Validator Network (OVN) technical foundation.

This file provides permanent instructions for AI coding agents working in this repository.

---

## 1. Read the Project Context First

Before modifying code, read:

- `README.md`
- `docs/VISION.md`
- `docs/TERMINOLOGY.md`
- `docs/MOBILE-MINING.md`
- `docs/ECONOMICS.md`
- `docs/TOKEN-ECONOMY.md`
- `docs/TECHNICAL-ARCHITECTURE.md`
- `docs/DEVELOPMENT.md` and `docs/WINDOWS-TESTNET.md` for local/internal testnet run paths
- `docs/PROTOCOL-ROADMAP.md` and `docs/PROTOCOL-DECISIONS.md` for operational protocol status
- `docs/ROADMAP.md` and `docs/roadmap.json` for product roadmap statuses (keep in sync on every merged PR that changes scope or status)
- this file’s **Infrastructure / Testnet / Archival / Recovery** sections (below) before any deploy, prune, archival, or VPS work

Планы и статусы — в `docs/ROADMAP.md`, обновлять при каждом слитом PR.

These documents define the current product and protocol direction.

Do not begin major implementation work before understanding them.

**This file is documentation and agent policy.** The infrastructure sections below are a **roadmap and current-implementation inventory**. They do **not** authorize production/Mainnet deploy, Railway/VPS provisioning, pruning changes, DB migrations, consensus changes, or economics changes.

---

## 1a. Scope of Agent Instructions

Instruction files are scoped to the subtree that contains them:

- `AGENTS.md` (this file) governs development of **People's Blockchain** and takes
  precedence over every other instruction file in this repository.
- `website/AGENTS.md` governs work inside `website/` only.
- `people-node/AGENTS.md` is **legacy OVN documentation only**. It
  describes the original Open Validator Network reference codebase — its product name,
  token (`Vallis` / `VLS` as originally shipped), branding and Russian-language response
  convention. **Current People's native asset is People / PPL (`ppl`).** The OVN file is
  kept so the original OVN source stays recoverable and understandable, and it must
  **not** control People's Blockchain development, naming or product decisions.

When the OVN file conflicts with this file or with `docs/`, this file and `docs/` win.

---

## 2. Source of Truth

The `docs/` directory is the primary source of truth for product and protocol decisions.

When code conflicts with an approved specification:

1. Do not silently choose a new rule.
2. Identify the conflict.
3. Explain the technical impact.
4. Ask for a decision or use an explicitly approved implementation instruction.

---

## 3. Never Invent Economic Rules

AI agents must NOT independently invent or modify:

- native token supply;
- emission schedule;
- validator reward rates;
- mobile reward rates;
- Participation Power formulas;
- Community Pool percentages;
- token launch allocations;
- transaction fee distribution;
- burn percentages;
- staking economics;
- bonding curve parameters;
- liquidity migration thresholds;
- referral economics;
- governance economics.

If a required value or rule has not yet been approved, use `TBD` and report the missing decision.

---

## 4. Never Silently Change Consensus

Do not independently change:

- consensus algorithm;
- validator selection;
- block production;
- finality;
- quorum;
- staking requirements;
- slashing;
- block timing;
- transaction limits;
- validator roles.

Any consensus change requires explicit approval.

---

## 5. Preserve Existing Functionality

The existing OVN implementation is the technical foundation of this project.

Prefer:

- reuse;
- extension;
- refactoring;
- modular replacement.

Do not delete or rewrite working modules without documenting why.

Before replacing an existing component, determine:

- what it currently does;
- which modules depend on it;
- whether it can be adapted;
- whether existing tests cover it.

---

## 6. Separate Participant and Validator Roles

Do not assume that a mobile participant is a blockchain validator.

The product architecture distinguishes:

### Participant

A normal user using a phone, tablet, browser or lightweight client.

### Validator

Infrastructure responsible for consensus and network security.

Future mobile participation mechanisms must not compromise consensus security.

---

## 7. Security First

Protocol code must prioritize:

- deterministic behavior;
- validation;
- replay protection;
- authorization;
- state consistency;
- Sybil resistance;
- economic attack resistance;
- validator security;
- safe key handling;
- predictable failure modes.

Never bypass validation merely to make a feature appear to work.

---

## 8. No Fake Blockchain Functionality

Do not implement a fake or simulated blockchain mechanism while presenting it as real protocol functionality.

Examples:

- fake token balances;
- fake on-chain transactions;
- fake mining rewards;
- client-side-only staking;
- simulated validator consensus;
- hard-coded market prices presented as real prices.

Mocks are acceptable for UI development when clearly isolated and documented.

---

## 9. Tests Are Required

For meaningful code changes:

1. Run the relevant existing tests.
2. Add tests for new protocol behavior.
3. Run type checking.
4. Run build checks.
5. Report failures accurately.

Never hide or suppress failing tests just to obtain a green build.

---

## 9a. Never Use the Public PEOPLE RPC from Tests or Agents

The public node (`node.peopleblockchain.network`, `147.45.227.204`) is the production validators' RPC. Load from a test run slowed the whole chain on 2026-10-17.

- Tests (unit, integration, Playwright) and cloud agents **must never call it**. Mock the node instead: start an ephemeral localhost JSON-RPC server and point `EVM_RPC_URL` at it (see `startRpcNode` in `website/scripts/evm-log-start-blocks.test.mjs`), or use `page.route` in Playwright.
- `website/scripts/no-live-rpc.mjs` enforces this: any `fetch`/`WebSocket` to those hosts in `npm test` is rejected and fails the run, and the Playwright browser cannot resolve the host. Do not remove or bypass the guard.
- `npm run test:live` is the only deliberate exception and is run by a human, never by CI or an agent.
- Agents doing chain diagnostics must ask the owner first and use read-only calls on a local/archive node, never load-test the public endpoint.

---

## 10. Small, Verifiable Changes

Prefer small logical changes over massive rewrites.

Each significant change should:

- have a clear purpose;
- be reviewable;
- preserve unrelated functionality;
- include tests where applicable;
- be documented when it changes architecture or protocol behavior.

Use clear commit messages.

---

## 11. Documentation Must Follow Implementation

When an approved architectural or protocol decision changes:

- update the relevant document in `docs/`;
- keep code and documentation consistent.

Do not modify specifications merely to justify an implementation that was never approved.

---

## 12. Handle Unknown Requirements Explicitly

When requirements are incomplete:

1. Identify what is known.
2. Identify what is unknown.
3. Implement only what is explicitly defined.
4. Mark the remaining decision as `TBD`.
5. Do not invent a business rule.

Technical implementation details may be selected using normal engineering judgment when they do not alter product economics or protocol rules.

---

## 13. Repository Safety

Do not:

- overwrite the original OVN repository;
- delete project history without instruction;
- force-push destructive history;
- remove important files without justification;
- expose private keys, secrets or credentials;
- commit `.env` files containing secrets.

The original OVN source is a reference foundation and must remain recoverable.

---

## 14. Website deploys and PR discipline (agents)

Applies to changes under `website/` and any PR that touches the public site.

1. **Before every push**, from `website/` run locally and ensure all are green:
   - `npm run build`
   - `npm run lint`
   - `npm run typecheck`
2. **If any command fails, do not push.** Fix or report; do not bypass with partial pushes.
3. **One PR per batch of related tasks** for the same initiative; push only when that batch is ready for review (not every intermediate commit unless explicitly requested).
4. **Cloud agents must not merge into `main`.** Open or update a PR and leave merge to humans.
5. **Vercel previews:** `website/vercel.json` sets `git.deploymentEnabled` so only **`main`** deploys (`"*": false`). Do not enable preview deployments for arbitrary branches unless a founder explicitly changes that policy.

---

## 15. Environment and Secrets

Never hard-code:

- private keys;
- seed phrases;
- API secrets;
- passwords;
- production credentials;
- RPC credentials.

Use environment variables or the project's approved secret-management mechanism.

---

## 16. AI Agent Working Procedure

For every major task:

### Step 1 — Understand

Read the relevant specification and existing implementation.

### Step 2 — Inspect

Locate affected modules and dependencies.

### Step 3 — Plan

State the intended implementation approach before making major changes.

### Step 4 — Implement

Make the smallest correct change.

### Step 5 — Test

Run relevant tests, type checks and builds.

### Step 6 — Report

Report:

- what changed;
- what was tested;
- what passed;
- what failed;
- what remains `TBD`;
- any risks or follow-up decisions required.

---

## 17. Do Not Continue Beyond the Requested Scope

When a task is complete, stop.

Do not automatically begin the next protocol phase.

For example, if asked to establish a baseline or to update documentation, do not automatically implement:

- Mobile Mining;
- Token Factory;
- DEX;
- NFT;
- Community Pool;
- new tokenomics;
- new consensus;
- production/Mainnet deploy, Railway/VPS provisioning, pruning, or archival jobs.

Wait for the next explicit task.

---

## 18. Product Decisions vs Technical Decisions

AI agents may independently choose ordinary implementation details when they do not change the approved product behavior.

Examples of acceptable autonomous decisions:

- internal file organization;
- refactoring;
- naming of private helper functions;
- test structure;
- performance improvements that preserve behavior;
- standard error handling;
- non-breaking developer tooling.

Examples requiring explicit approval:

- changing economic formulas;
- changing protocol incentives;
- adding new token issuance;
- changing validator economics;
- changing consensus;
- changing user reward rules;
- changing Community Pool rules.

---

## 19. Current Development Principle

The project is being built incrementally:

1. Audit the OVN foundation.
2. Establish a stable baseline.
3. Finalize protocol economics.
4. Finalize Participation Mining.
5. Implement identity and anti-Sybil mechanisms.
6. Implement token and creator economy.
7. Implement liquidity and DEX.
8. Implement consumer applications.
9. Test extensively.
10. Prepare for testnet and eventually mainnet.

---

## 20. Status Discipline

Treat the following states differently:

- `PROPOSED` — under discussion.
- `TBD` — decision required.
- `APPROVED` — explicitly accepted for implementation.
- `IMPLEMENTED` — implemented in code.
- `TESTED` — behavior verified by tests.
- `PRODUCTION-READY` — explicitly approved as production-ready.

Do not describe a `PROPOSED` or `IMPLEMENTED` feature as production-ready without evidence.

---

## 21. Final Principle

The AI agent is an implementation partner, not the Product Owner.

The agent's responsibility is:

**understand → plan → implement → test → report**

The founders' responsibility is to decide:

**what the network should be, how its economy works and which protocol rules are approved.**

When in doubt, preserve the existing system, mark the unresolved item as `TBD`, and ask for the decision rather than inventing one.

---

# Infrastructure / Testnet / Archival / Recovery

**Status of this part:** documentation / roadmap only (`PROPOSED` operational plan + evidence-based inventory of what already exists).

**Not in this document’s mandate:** implementing infrastructure, deploying Mainnet, provisioning Railway or a VPS, changing pruning, migrating databases, changing consensus, or changing economics (Model A, Growth Pool, Claim D, Token Factory, bonding curve).

**Evidence rule:** every “Current implementation” claim below is grounded in this checkout’s code or docs. If a mechanism is missing, it is labeled `NOT IMPLEMENTED`, `DESIGN REQUIRED`, or `TBD`. Do not present design ideas as already implemented. Do not invent GB/disk-growth figures. Do not promise hot updates.

---

## Validator / Node Deployment

Goal: a **reproducible** server install path:

`clone → deps → build → config → run → join → sync → validate`

This is the documented path for a **dedicated node/validator process**. A mobile/browser participant is **not** a validator (`§6` above).

### Current implementation

Grounded in `people-node/apps/node`, `packages/core`, `packages/p2p`, `docs/DEVELOPMENT.md`, `docs/WINDOWS-TESTNET.md`, `docker-compose.yml`.

| Item | Status | Evidence |
| --- | --- | --- |
| Full node daemon | **IMPLEMENTED** | `@ovn/node`: Fastify HTTP + WS + `NodeService` (`apps/node/src/index.ts`, `node-service.ts`) |
| CLI flags | **NOT IMPLEMENTED** | Config is **environment variables only** (no commander/yargs/argv parser) |
| Local npm run path | **IMPLEMENTED** | From `people-node`: `npm ci`, `npm run build`, `npm --workspace=@ovn/node run dev` / `start` |
| Docker Compose internal testnet | **IMPLEMENTED** | `docker-compose.yml`: `node` (API `4001`, gossip `4002`), `node-2` (`4011`/`4012`), `web` (`3000`); `CHAIN_ID` default `people-internal-testnet` |
| Host-mount compose overlay | **IMPLEMENTED as a file** | `docker-compose.prod.yml` binds `./data/node-1` and `./data/node-2`. **This is not a Mainnet/production authorization.** Do not treat the filename as production-ready. |
| Persistence | **IMPLEMENTED** | LevelDB at `{DATA_DIR}/chain.db` (`packages/core/src/storage.ts`); peer book `{DATA_DIR}/peers.json` |
| Restart load | **IMPLEMENTED** | On start: open store → load `snapshot` → gossip → propose/attest timers; SIGTERM/SIGINT flush + close |
| Genesis file | **NOT IMPLEMENTED** | Genesis is in-code (`createGenesisBlock` / `createInitialState`); no `genesis.json` |
| Production/Mainnet deploy | **NOT IMPLEMENTED** | `docs/PROTOCOL-ROADMAP.md`: production not deployed; Mainnet not started |
| Reproducible “join remote public network” runbook | **PARTIAL / DESIGN REQUIRED** | Local compose + Windows laptop guide exist; dedicated VPS/server runbook with measured resources does not |

### Required configuration

Node process (from `apps/node/src/index.ts`, `node-service.ts`, `packages/core`):

| Variable | Default (code) | Role |
| --- | --- | --- |
| `PEER_ID` | `peer-<rand>` | Gossip/peer identity (not the validator address) |
| `PORT` | `4001` | HTTP API |
| `GOSSIP_PORT` | `PORT+1` | WebSocket P2P |
| `DATA_DIR` | `./data/${PEER_ID}` | Chain DB + peer book |
| `BOOTSTRAP_PEERS` | empty | Comma-separated `host:port` or `ws://…` |
| `CHAIN_ID` | `ovn-devnet` via `DEFAULT_CONFIG` unless env set | Network identifier; **must match** peers |
| `BIND_HOST` | `0.0.0.0` | HTTP bind |
| `VALIDATOR_ADDRESS` | empty | Local proposer/attestor address |
| `VALIDATOR_PRIVATE_KEY` | empty | Local attestor key (**secret**) |
| `DEV_FAUCET_PRIVATE_KEY` | **required** 64-hex in core | Dev/testnet faucet; **never commit** |
| `ALLOW_FAUCET` / `ALLOW_DEV_ENDPOINTS` | unset | Dev faucet gates |
| `CHAIN_WINDOW_BLOCKS` | `500` | In-memory/snapshot chain window |
| `CHECKPOINT_KEEP` | `5` | Compact checkpoints retained |
| `MEMPOOL_MAX_SIZE` | `10_000` | Mempool cap |

`.env.example` currently lists only `DEV_FAUCET_PRIVATE_KEY` and `CHAIN_ID=people-internal-testnet`. Other variables are documented in `docs/DEVELOPMENT.md` and OVN README — **do not invent additional required vars**.

Compose internal testnet sets `CHAIN_ID=${CHAIN_ID:-people-internal-testnet}`, faucet **on node-1 only**.

### Installation procedure

Documented local path (`docs/DEVELOPMENT.md`):

1. Clone this repository (access required; repo visibility is a founder decision — do not change it).
2. `cd people-node`
3. `npm ci` then `npm run build` (workspaces resolve **`dist/`**, not `src/`).
4. Copy `.env.example` → `.env`; set a **testnet-only** `DEV_FAUCET_PRIVATE_KEY`; never commit `.env`.
5. Run either:
   - single node: `npm --workspace=@ovn/node run start` (after build) or `run dev`;
   - internal testnet: `docker compose --env-file .env up --build -d` (**not** `docker-compose.prod.yml` for that stack).
6. Check `GET /health` on the API port; optional `GET /snapshot`, `GET /metrics`.
7. Join: set `BOOTSTRAP_PEERS` to an existing gossip endpoint; **same `CHAIN_ID`**.
8. Validate: set `VALIDATOR_ADDRESS` + `VALIDATOR_PRIVATE_KEY` if this process should attest/propose when selected.

Windows laptop compose path: `docs/WINDOWS-TESTNET.md`.

**VPS/server production install:** `DESIGN REQUIRED`. Do not auto-provision hosts in agent tasks unless explicitly requested **and** this document’s safety rules allow it (they currently do not for Mainnet/Railway).

### Data directory

| Path | Contents | Consensus-critical? |
| --- | --- | --- |
| `{DATA_DIR}/chain.db` | LevelDB: `snapshot`, `block:{height}`, `blockhash:{hash}`, `tx:{id}`, `addr:{lc}:txs` (cap ~500 ids), `checkpoint:{height}`, `meta:head`, `meta:epoch` | **Yes** for this node’s recoverable state. Historical `block:`/`tx:` rows **may already be pruned** (see Blockchain Growth). |
| `{DATA_DIR}/peers.json` | Gossip peer book | Reconstructable from bootstrap + peer exchange |
| Validator keys under `DATA_DIR` | — | **NOT IMPLEMENTED** (keys come from env / client keystore, not the chain DB) |

`data/` is gitignored. Named Docker volumes: `ovn-data`, `ovn-data-2`. Overlay bind mounts: `./data/node-1`, `./data/node-2`. **Do not** `docker compose down -v` if the chain must be kept.

### Network ports

| Port (compose defaults) | Role |
| --- | --- |
| `4001` | node-1 HTTP API |
| `4002` | node-1 gossip WS |
| `4011` / `4012` | node-2 API / gossip |
| `3000` | web / explorer |

Do not expose a local/internal testnet to the public internet without an explicit founder-gated network plan. `docs/WINDOWS-TESTNET.md` already forbids casual port forwarding “for the whole network”.

### Validator identity

- **Peer id** (`PEER_ID`) ≠ **validator address**.
- Full-node validator identity: `VALIDATOR_ADDRESS` + `VALIDATOR_PRIVATE_KEY` in the process environment (`node-service.ts`).
- Core has AES-256-GCM + scrypt helpers (`packages/core/src/keystore.ts`) used by clients; the **node does not write validator keys into LevelDB**.
- Web wallet custody: encrypted browser storage (not a server key vault).
- `POST /bootstrap` join bundle may include a public validator key field for QR/join UX — **not** a private-key distribution channel.
- Lost `VALIDATOR_PRIVATE_KEY`: that identity cannot attest; recovery of the **key** is impossible from chain data. Protocol-level key rotation: **NOT IMPLEMENTED** / `DESIGN REQUIRED`.

### Peer / bootstrap configuration

- Seed: `BOOTSTRAP_PEERS`.
- Persistence: `{DATA_DIR}/peers.json`.
- After `hello`, peers are exchanged (`@ovn/p2p`).
- Compose node-2 example: `BOOTSTRAP_PEERS: host.docker.internal:4002`.
- Listen advertisement currently uses local `ws://127.0.0.1:${gossipPort}` in P2P defaults — **public IP advertisement is not an automatic production mechanism** (`DESIGN REQUIRED` if a remote VPS must be dialable).

### Restart / recovery

**IMPLEMENTED for the same `DATA_DIR`:** crash/SIGTERM → `flushPersist` → LevelDB close; next start loads `snapshot` and continues from persisted head (log: loaded height vs genesis).

**NOT a full-network archival resync:** catch-up uses `request_blocks` with a bounded range (on the order of tens of blocks per request; responses capped). Combined with chain-window prune, a **new empty node cannot be assumed to reconstruct full history** from a pruned peer. State recovery of a **restarting** node relies on its local `snapshot` + remaining keys, not on an archival protocol.

### Resource requirements

**TBD until measured.** Do not invent vCPU/RAM/disk/IOPS figures.

Existing soft guidance (not a production spec): `docs/WINDOWS-TESTNET.md` notes Docker Desktop + two nodes + web is more comfortable at **4–8 GB RAM** for Docker than a 2 GB default. That is laptop operator advice, not a validator SLA.

Future measurement (see Blockchain Growth) must record: CPU, RSS, LevelDB size, `du` of `DATA_DIR`, API p95, gossip buffer, height.

### Security requirements

- Never commit `.env`, private keys, seed phrases, faucet keys, `DEV_API_TOKEN`.
- Faucet and `ALLOW_DEV_ENDPOINTS` are **dev/testnet** controls; do not enable them on any network presented as Mainnet.
- Do not bypass signature, nonce, or state validation to “make deploy work”.
- Treat `CORS_ORIGIN=*` in internal compose as **not** a production CORS policy.
- Secrets: environment or an approved secret manager only (`§14` above). No keys in public git.

---

## Two-Server Test Environment

**Nearest plan (not this task):**

1. **First:** one agent/dev server (or existing worker VM) running the **internal testnet** compose from approved `main` SHA — already the operational pattern described in `docs/PROTOCOL-ROADMAP.md` / `docs/WINDOWS-TESTNET.md` (local/internal; **not Mainnet**).
2. **Later:** a second user VPS **after a disk-usage check** on the first host (see measurement methodology). No second host until that check exists.
3. **Checks on the two-node (or two-host) pair:** sync (heads move together), state-root equality at the same height, block propagation, validator participation (propose/attest when keys are set).

**This documentation update does not auto-deploy anything.** No Railway, no VPS provisioning, no production ingress.

`ci:smoke` (`scripts/ci-smoke.sh`) already boots **three local processes** for catch-up/chaos — that is a **dev/CI script**, not a two-VPS environment.

Cross-host gossip, advertised public listen addresses, TLS, firewall, and clock/disk SLOs: **DESIGN REQUIRED**.

---

## GitHub / Version Flow

Required flow:

```text
GitHub → branch/PR → review → merge main → server pulls approved SHA → build → restart
```

**Do not develop on the server.** Server trees track **merged `main` (or an explicitly approved tag/SHA)** only.

### Current implementation

| Piece | Status |
| --- | --- |
| GitHub-hosted git | **IMPLEMENTED** (this repo) |
| PR-based development | **IMPLEMENTED** as project practice (`AGENTS.md` §10; existing merged PRs in `docs/PROTOCOL-ROADMAP.md`) |
| CI workflow **file** | **IMPLEMENTED as files**: root `.github/workflows/ci.yml` (Node 22, `people-node` typecheck/lint/build/test + PWA asset check + `scripts/ci-smoke.sh`, plus the website checks) and a nested `people-node/.github/workflows/ci.yml` with the same people-node steps. GitHub only loads the **root** directory, so the root file is the one that runs; the nested copy is kept for the subtree's own history and does **not** execute on GitHub. |
| Root `.github/workflows/` | **PRESENT** (verified on this checkout): `ci.yml` (pull_request + push to `main`), `contracts-ci.yml` and `chain-ci.yml` (path-filtered pull_request), `node-image.yml` (push to `main` under `people-node/**`, plus `workflow_dispatch`), `db-migrate.yml`, `testnet-evm-deploy.yml`, `testnet-evm-seed.yml` (all `workflow_dispatch` only) and `sale-watch-cron.yml` (every 10 minutes). |
| CD / auto-deploy to servers | **NOT IMPLEMENTED.** `node-image.yml` builds and pushes a `ghcr.io` image on pushes to `main` under `people-node/**`, but nothing pulls it onto a server; `testnet-evm-deploy.yml`, `testnet-evm-seed.yml` and `db-migrate.yml` are `workflow_dispatch`-only. Server trees still update only by pulling an approved SHA by hand. |
| On-disk deploy metadata (commit SHA, config version, node version, chain-state compatibility) | **NOT IMPLEMENTED** as a first-class node field (`protocolVersion` grep: empty). `package.json` version is `1.0.0` and is **not** a chain compatibility signal. |
| Rollback tooling | **NOT IMPLEMENTED** (rollback = git checkout previous **approved** SHA + rebuild/restart **plus** compatible `DATA_DIR`; compatibility matrix `DESIGN REQUIRED`) |

Track **when implemented** (future; do not fake it now):

- git commit SHA of the running binary;
- config identity (`CHAIN_ID` + env fingerprint — **without secrets**);
- node/package versions;
- chain-state compatibility (which heights/snapshots a binary may load);
- rollback SHA.

Until that exists, operators must record SHA + `CHAIN_ID` + `DATA_DIR` out of band.

---

## Blockchain Growth / Disk Usage

### Current on-disk structure (from code)

Authoritative store: `ChainStore` in `packages/core/src/storage.ts` (npm `level`, **not** RocksDB/SQLite).

**Persisted snapshot (`snapshot` key)** includes trimmed `chainState` plus `feePool`, rewards, and related counters. `chainState` load path also reconstitutes assets, community pool, treasury, burn, curves, vesting, reserves, participants, growth-pool fields, liquidity pools, etc. If a field is missing on old snapshots, load applies defaults — that is **compatibility glue**, not an archival format guarantee.

**Also stored:** per-height blocks (incremental `block:` for new heads), tx index, address tx lists (capped), compact checkpoints every **100** blocks (`CHECKPOINT_INTERVAL`), `meta:head` / `meta:epoch`.

**HTTP `GET /snapshot`** is a **live API view** (head, validators, finalized height, peers, mempool, epoch). It is **not** a backup/export tool.

### Consensus-critical vs reconstructable

| Data | Class |
| --- | --- |
| Current accounts/balances, validators, mempool-in-snapshot, assets, curves, growth/community/treasury fields, head block, state root at head | **Consensus-critical for this node to continue** (in the snapshot) |
| Recent window of blocks (`CHAIN_WINDOW_BLOCKS`, default 500) + kept checkpoints (`CHECKPOINT_KEEP`, default 5) | **Needed for local fork/replay within the window** |
| Historical `block:` / `tx:` below prune height | **Deleted by current prune** — **not** retained as archival history |
| `peers.json` | Reconstructable |
| Address tx lists | Convenience index (capped); not a full history guarantee |
| Validator/faucet private keys | **SECRET** — not in DB; cannot be reconstructed from chain |

### What already exists (do not re-implement casually)

| Mechanism | Status |
| --- | --- |
| In-memory / snapshot window `trimChainWindow` | **IMPLEMENTED** (`CHAIN_WINDOW_BLOCKS`) |
| Disk `pruneBefore` of old `block:` / `tx:` / `blockhash:` / extra checkpoints | **IMPLEMENTED** (triggered from node on epoch boundary when window exceeded; every 10 blocks is the validator epoch boundary in this codebase) |
| Compact checkpoint payload | **IMPLEMENTED** (`compactChainStateForCheckpoint`) |
| Archival / full-history mode | **NOT IMPLEMENTED** |
| Snapshot file export / restore CLI | **NOT IMPLEMENTED** |
| LevelDB compaction tuning | **NOT IMPLEMENTED** (no app-level compaction API) |
| Log rotation | **NOT IMPLEMENTED** (Fastify logger only) |

**Do not change pruning in documentation-only or opportunistic tasks.** Changing prune alters what can be recovered. Any prune/archival change needs explicit approval and must not break consensus or state recovery.

### Measurement methodology (required before any GB forecast)

**No fabricated growth numbers.** Until operators record measurements, disk forecasts are `TBD`.

On a running internal testnet node, at known height `H`:

1. `du -sb "$DATA_DIR"` and `du -sb "$DATA_DIR/chain.db"`.
2. Record height, epoch, `chainWindowBlocks`, `prunedBeforeHeight` (metrics), peer count, mempool size.
3. Repeat at several heights (e.g. after N blocks) on the **same** config.
4. Derive **bytes per block** empirically: Δdisk / Δheight over each interval (report interval, not a single magic constant).
5. Separate: LevelDB size vs logs vs Docker image vs overlay.
6. Only then may a **projection** be labeled `ESTIMATE from measured Δ` with the sample range. Never publish a GB mainnet forecast from imagination.

---

## Archival Strategy (design, not implement)

**Principle: ARCHIVING MUST NEVER BREAK CONSENSUS OR STATE RECOVERY.**

Three layers (**DESIGN REQUIRED** — not implemented as named operational modes):

| Layer | Intent | Current code |
| --- | --- | --- |
| **HOT** | Validator/node `DATA_DIR`: windowed blocks + snapshot + recent checkpoints | **IMPLEMENTED** as the only live mode (window + prune) |
| **ARCHIVE** | Append-only full history (blocks/txs) for explorers, audits, late joiners | **NOT IMPLEMENTED**. Current prune **deletes** old `block:`/`tx:` keys. HTTP snapshot is not an archive. |
| **BACKUP** | Encrypted copies of HOT (and later ARCHIVE) plus **offline** secrets | **NOT IMPLEMENTED** as tooling (operators may copy volumes by hand; no project backup CLI) |

Design constraints for any future implementation:

1. A validating node must be able to restart from **HOT** alone without the archive.
2. Archive jobs must be **read-copy** (or dedicated archival nodes), not “delete from validators first”.
3. Do not prune below what HOT needs for the implemented fork/checkpoint replay (`getNearestCheckpoint`, `chooseForkWithCheckpoint`).
4. Late-joining nodes that need history older than the window require an **ARCHIVE** or snapshot-bootstrap protocol — **neither exists today**. Do not pretend compose node-2 solved archival join from genesis at high height.
5. Checksums (height, block hash, state root) must be verified after copy. Format versioning is `DESIGN REQUIRED`.

**This section must not be executed as a prune/migration task.**

---

## Backup / Disaster Recovery

**Status:** future recovery paths. Automated DR: **NOT IMPLEMENTED**.

### PUBLIC / RECONSTRUCTABLE vs SECRET / SENSITIVE

| Class | Examples | Handling |
| --- | --- | --- |
| **PUBLIC / RECONSTRUCTABLE** | Blocks, txs, public keys, `CHAIN_ID`, peer addresses, explorer data, this git repo’s public files | May live in git, archives, logs (once a public network exists). Still do not leak internal `.env`. |
| **SECRET / SENSITIVE** | `VALIDATOR_PRIVATE_KEY`, `DEV_FAUCET_PRIVATE_KEY`, `DEV_API_TOKEN`, wallet seeds, secret manager material | **Never in git** (public or private). Env or secret manager. Offline encrypted backup `DESIGN REQUIRED`. Lost secrets are **not** recoverable from LevelDB. |

### Scenarios A–H (future paths)

| ID | Scenario | Current behavior | Future recovery path |
| --- | --- | --- | --- |
| **A** | Process crash / SIGTERM | Graceful `stop` + persist **IMPLEMENTED** | Restart same binary + same `DATA_DIR` |
| **B** | Host reboot | Compose `restart: unless-stopped`; volumes persist if not `-v` | Confirm Docker/systemd policy; do not recreate empty volumes |
| **C** | Disk full | **NOT HANDLED** as a first-class mode | Measure growth first; alerting `DESIGN REQUIRED`; never “just prune harder” without archival |
| **D** | Corrupted LevelDB | **NOT IMPLEMENTED** (no repair CLI) | Restore HOT backup; or resync — resync from peers **may fail** if history pruned (`DESIGN REQUIRED`) |
| **E** | Lost validator key | Node can still sync as non-attestor | New key = new validator identity; old stake path follows existing unstake/leave rules — **do not invent key recovery** |
| **F** | Lost faucet key | Faucet cannot sign; genesis faucet **address** is derived from the key at runtime | Rotate only on networks where faucet is allowed; never reuse as custody |
| **G** | Accidental `docker compose down -v` | Named volumes **deleted** | Treat as chain loss unless BACKUP layer exists |
| **H** | Total host loss | No project off-host backup | Rebuild from git SHA + secrets from secret manager + BACKUP of `DATA_DIR`; if no backup and no archive, **that chain is gone** unless another honest node still has compatible state |

Do not write recovery runbooks that require undocumented RPC tricks or skipped validation.

---

## Validator Network Model

**Current implementation (multi-process, not a sized public validator set):**

- Leader-based PoS, ~3s block interval, attestation finality threshold default **0.67** (reference parameters — **not** frozen Mainnet parameters; `docs/TECHNICAL-ARCHITECTURE.md`).
- Compose: two full nodes; smoke script: three nodes.
- Proposer selection from active stake; local node proposes when `VALIDATOR_ADDRESS` matches (or bootstrap/empty-address behavior in code).
- Light vs full `nodeKind` exists in the **reference** validator path; product rule remains: phones are participants, not consensus validators.

**Requirements for a public multi-validator network (count, geography, hardware, bandwidth, stake distribution, sentry topology):** `TBD` until benchmarked on a controlled testnet.

Do not silently change consensus, validator selection, quorum, slashing, or block timing (`§4`).

---

## Testnet / Beta Phase

Internal testnet is **UP (IN PROGRESS)** per `docs/PROTOCOL-ROADMAP.md` (`CHAIN_ID=people-internal-testnet`). That is **not** Mainnet and **not** production.

**Change path for protocol-affecting work:**

```text
proposal → implementation → tests → review → PR → merge main → network upgrade from approved SHA
```

**No manual per-node consensus edits.** Especially forbidden as one-off server patches:

- fees, referral, partner, token market, validator rewards, Growth Pool, consensus.

All nodes on a network must run **compatible** binaries and `CHAIN_ID`. Coordinated upgrade machinery (version gates, height-based forks): **NOT IMPLEMENTED** / `DESIGN REQUIRED`.

Beta/public testnet, load tests, independent audit: **not started** per `docs/PROTOCOL-ROADMAP.md`. External audit remains the recorded next protocol task there — **this file does not override that with a deploy**.

---

## Protocol Upgrades / Hot Change

**Do not promise hot updates.** There is no SIGHUP/config-watch/hot-reload of consensus or economics in the node.

`protocolVersion` (and similar network upgrade fields): **NOT IMPLEMENTED** (`DESIGN REQUIRED` if/when upgrades must be explicit).

Split change classes:

| Class | Meaning | How it may change today | Hot-swap? |
| --- | --- | --- | --- |
| **A. Off-chain config** | Env: ports, bind, CORS, faucet gates, bootstrap list, `DATA_DIR` | Restart process with new env | **No** — restart required |
| **B. On-chain param** | Subset of `NetworkConfig` | Governance `proposal`/`vote` can change `minStake`, `epochBaseIssuance`, `lightValidatorWeightMultiplier` via `applyProposalParams` (**PARTIAL**). Other economic/consensus params are **not** generally vote-gated | **No** hot-reload; included in subsequent blocks |
| **C. Consensus** | Algorithm, timing, finality, validator roles | Code change + coordinated binary upgrade | **No** |
| **D. Economic** | Model A splits, rewards, referral, Growth Pool, Token Factory, curve fees | Spec + tests + PR; **founder-gated** where required (`§3`, `§17`) | **No** |
| **E. Data structure** | Snapshot/schema/LevelDB layout | Load-time defaulting exists for some new fields; **formal migrations: NOT IMPLEMENTED** | **No** |

Until versioning fields exist, compatibility is “same `CHAIN_ID` + operators know the SHA”. That is operational, not a protocol guarantee.

---

## Growth Referral / Partner / Economic Parameters

**Do not change Growth referral weights, Model A, Growth Pool, Claim D, Token Factory allocations, or bonding-curve parameters in documentation-only or opportunistic PRs.**

Public CURRENT surfaces must mirror runtime Beta payout **L1=70 / L2=30** of the Growth reward budget (Growth Pool remains 15% of eligible fees). Do not reintroduce the retired public five-line Partner Program **15/5/3/2/1** as CURRENT.

Future parameter changes (referral weights, fee splits, rewards) require:

1. a **versioned, configurable** mechanism (on-chain and/or explicitly versioned config — **DESIGN REQUIRED** beyond the three governance fields above);
2. an **audit trail** (spec change + PR + tests + recorded SHA);
3. founder approval when the value is economic (`§3`, `§17`).

If a number is not approved, write `TBD`. Do not silently copy OVN `referralShare` / validator-referral cuts into People’s participant/partner economics.

---

## Public / Private Repository Strategy

`docs/WINDOWS-TESTNET.md` states the GitHub repository is **private**. `docs/PROTOCOL-ROADMAP.md` records **public repo: none** and **do not publish**.

**Agents must not change GitHub repository visibility.**

| May be public later (founder-gated) | Must stay private / secret |
| --- | --- |
| Protocol specs intended for users, public docs, source that has been scrubbed of secrets, explorer UX | Private keys, `.env`, faucet keys, partner-only operational runbooks with IPs/credentials, unreleased security findings |

Secrets: environment variables or the approved secret manager only. Never commit `.env` files containing secrets (`§13`–`§14`).

Visibility stays as-is until an explicit founder decision.

---

## Token Market Research — Next Technical Priority

**Before any new Mainnet bonding curve:** do **not** edit curve code in a docs/infrastructure PR.

Required sequence:

1. **Audit** existing `BondingCurveEngine` (`packages/core/src/curve.ts`) and tests (`packages/core/src/curve.test.ts`): virtual constant-product, reserves, buy/sell, fee (`CURVE_FEE_BPS = 100`), invariant `K`, rounding (integer floor), price-impact/slippage (`minTokensOut`), migration to locked AMM pool (`AMM_FEE_BPS = 30`), persistence. Post-migration **AMM v0.1 swap trading is IMPLEMENTED** (`ammCreatePool` / `ammAddLiquidity` / `ammRemoveLiquidity` / `ammSwap`; LP fee stays in-pool at 30 bps; protocol `tx.fee` follows Model A). Do **not** change that fee or Model A in opportunistic PRs. Final mainnet AMM fee remains `TBD`.
2. **Math model** written as a spec (working numbers remain provisional per `docs/TOKEN-ECONOMY.md` / Phase 2 notes).
3. **Simulation table:** small / medium / large **buy and sell**, recording spot, execution, impact, reserves, inventory, fee, slippage.
4. **Design decision** (founder-gated for economics).
5. **Implementation** only after that decision — not before.

`docs/TOKEN-MARKET-MODEL-v0.1.md` is a **DESIGN DRAFT — pending merge** (path reserved; **file not present on this `main` checkout**). Do not invent its contents. When it lands, it does not override approved economics until explicitly accepted.

---

## Documentation Rule

Do **not** duplicate large economic tables here. Link and label **status**.

| Document | Role on this checkout |
| --- | --- |
| `docs/ECONOMICS.md` | Working economic specification v0.1; many values **provisional** / not final protocol constants |
| `docs/ECONOMIC-MODEL-v0.1.md` | Approved Model A specification text + Beta Growth payout weights (L1=70 / L2=30). Status header aligned with live code: Model A eligible-integer split via `GROWTH_FEE_SPLIT_ACTIVE = true` in `people-node/packages/core/src/growth-pool.ts` (see `docs/PROTOCOL-DECISIONS.md`, subject to audit). `LEGACY_FEE_SPLIT` is fallback only. Do **not** change Model A / Growth Pool / settlement percentages in opportunistic PRs. |
| `docs/TOKEN-ECONOMY.md` | Working token/DEX/curve product spec; provisional parameters |
| `docs/TOKEN-FACTORY.md` | **Not present on this `main` checkout.** Do not invent it. Token Factory behavior is documented in `docs/TOKEN-ECONOMY.md` and `docs/PHASE-2-IMPLEMENTATION.md` |
| `docs/TOKEN-MARKET-MODEL-v0.1.md` | **DESIGN DRAFT — pending merge** (missing on this checkout) |
| `docs/PROTOCOL-DECISIONS.md` | Operational registry of implementation decisions vs APPROVED vs NOT YET APPROVED |
| `docs/PROTOCOL-ROADMAP.md` | Operational phase status (testnet/audit/mainnet flags) |
| `docs/TECHNICAL-ARCHITECTURE.md` | Architecture boundaries; existing code is **not** automatically final behavior |
| `docs/DEVELOPMENT.md` / `docs/WINDOWS-TESTNET.md` | Developer and internal-testnet run paths |

Status vocabulary (`§19`): `PROPOSED` · `TBD` · `APPROVED` · `IMPLEMENTED` · `TESTED` · `PRODUCTION-READY`.

Additional labels for this infrastructure part:

- **authoritative** — approved spec or this policy file;
- **design draft** — not approved for implementation;
- **approved economics** — Model A identities in the economic-model doc (percentages); runtime enablement is an implementation decision subject to audit;
- **testnet provisional** — coded for internal testnet, not Mainnet constants;
- **founder-gated** — visibility, Mainnet, partner economics, consensus, production deploy.

Hierarchy when docs conflict: `docs/` source of truth + `§2` / Technical Architecture §27; **do not silently pick a new economic rule**.

---

## Safety rule (infrastructure restated)

Agents **must not**, unless the user explicitly requests **and** founders have approved a specification that this file still does not treat as a license to freelance:

- deploy production or Mainnet;
- provision Railway, VPS, or public ingress as part of a “while we’re here” task;
- change GitHub repository visibility;
- prune, compact, or migrate live chain data;
- change consensus, validator selection, finality, or block timing;
- change Model A, Growth Pool, Claim D, Token Factory economics, bonding-curve math, partner/referral economics;
- commit secrets or `.env` files containing secrets;
- auto-commit to `main`;
- present design, drafts, or compose filenames as production-ready.

Infrastructure work stays: **understand → plan → (explicit task) implement → test → report**. When in doubt: preserve the system, mark `TBD`, ask.
