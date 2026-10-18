# People's Blockchain — baseline resource & storage (code + runtime audit)

| Field | Value |
| --- | --- |
| Status | AUDIT REPORT (not a protocol change) |
| Date | 2026-09-26 |
| Code base | `main` at `e6f374a` (Windows testnet guide merge); implementation lives under `people-node/` |
| Scope | CODE + RUNTIME measurement only. No consensus/economics/BondingCurveEngine changes. No Mainnet, VPS, archival, prune “improvements”, or repo benchmark scripts |
| Evidence tags | **MEASURED** · **CODE-DERIVED** · **ESTIMATED** · **UNKNOWN** · **BLOCKED** |

This document grounds claims in the current legacy people-node node code. It does **not** depend on AGENTS.md PR #16. Where `docs/BASELINE-AUDIT.md` disagrees with code, **code wins** (called out below).

> **Historical / superseded for native asset naming.** Written against a checkout whose native id was still `vls`. Current runtime native asset is **People / PPL** (`ppl`). Env `VLS_PRICE_USD` below is the name as found; nodes now also accept `PPL_PRICE_USD`.

---

## Evidence classes (how to read numbers)

| Tag | Meaning |
| --- | --- |
| MEASURED | Observed in this audit environment (local process, LevelDB `du`, HTTP `/metrics`, `/chain/head`) |
| CODE-DERIVED | Read from constants, formulas, or control flow without inventing values |
| ESTIMATED | Arithmetic from MEASURED/CODE-DERIVED rates; not a long-run observation |
| UNKNOWN | No code and no measurement |
| BLOCKED | Measurement required but could not be done here (missing fixtures, no Docker, no durable testnet volume) |

Host for MEASURED samples: Linux cloud agent VM, Node.js v22, 4 CPUs, ~16 GiB RAM. **Not** a production validator. Idle chain, **zero** active validators, proposer `"bootstrap-validator"`.

---

## Owner checklist map

| # | Topic | Section |
| --- | --- | --- |
| 1 | Block interval / how blocks are made | A |
| 2 | Storage model | B |
| 3 | Prune model | C |
| 4 | Measured storage | D |
| 5 | Storage growth | E |
| 6 | CPU / RAM / bandwidth | F |
| 7 | Sync / catch-up | G |
| 8 | Two-server testnet | H |
| 9 | Preliminary VPS (beta validator only) | I |
| 10 | Unknown / blocked + risks + next step | J, K, L |

---

## A. Block interval

### Configured interval — CODE-DERIVED

- `DEFAULT_BLOCK_INTERVAL_MS = 3000` in `packages/core/src/index.ts`.
- `NodeService.start` uses `setInterval(() => this.tick(), this.options.blockIntervalMs ?? 3000)` (`apps/node/src/node-service.ts`).
- Override: constructor option `blockIntervalMs` (tests use `60_000`). There is **no** env var that changes the interval in `apps/node/src/index.ts`; production path is **3000 ms**.
- Metrics expose `blockIntervalMs` and `maxThroughputTps = MAX_TRANSACTIONS_PER_BLOCK / (blockIntervalMs/1000)` = **100 / 3 ≈ 33.33 tx/s** theoretical cap (**CODE-DERIVED**; also returned by `/metrics` as **MEASURED** echo of that formula, not a load test).

This is **not** an assumed “5 seconds”. Docs `TECHNICAL-ARCHITECTURE.md` also cite ~3 s as reference configuration.

### Observed interval — MEASURED

On a single local node with default interval, successive `/chain/head` timestamps:

- height 5 vs genesis: **15144 ms / 5 = 3028.8 ms/block**
- height 13 vs 10: **9006 ms / 3 = 3002 ms/block**

Matches the 3000 ms timer (timer + `buildBlock` work, not a separate consensus clock).

### How a block is created — CODE-DERIVED

Each `tick()`:

1. `nextHeight = head.height + 1`
2. `selectProposer(state, nextHeight)` — stake-weighted among `status === "active"`; if none, `"bootstrap-validator"`.
3. Local node **proposes if** `VALIDATOR_ADDRESS` is empty **or** equals the selected proposer **or** proposer is `"bootstrap-validator"`.
4. `buildBlock`:
   - takes mempool sorted by fee then timestamp (`compareMempoolPriority`);
   - applies up to `MAX_TRANSACTIONS_PER_BLOCK` (**100**) via `applyTransaction`;
   - `activateValidators`, `updateFinality`, `closeGrowthEpochIfBoundary`;
   - header: `height`, `previousHash`, `proposer`, `timestamp: Date.now()`, `stateRoot: computeStateRoot(state)`;
   - `hash = sha256(JSON.stringify({ header, transactions }))`;
   - pushes onto `state.chain`;
   - if `height % 10 === 0`: `state.epoch += 1` (epoch ≈ 10 blocks ≈ **30 s** at default interval).
5. Gossip `publishBlock` (inv/getdata, not the full block in the first message).
6. `recordBlockApplied`, optional auto-attest (only if `VALIDATOR_ADDRESS` + `VALIDATOR_PRIVATE_KEY` set).
7. On epoch boundary: `distributeEpochRewards`; if RAM chain longer than window, `prune(...)`.
8. `queuePersistDurable` → LevelDB `ChainStore.save`.

If the node is not the proposer: wait `2 * blockIntervalMs` then `recordMissedProposal`.

### What is in a block — CODE-DERIVED

`Block` (`packages/protocol`): `{ header, transactions, hash }`.

Header: `height`, `previousHash`, `stateRoot`, `proposer`, `timestamp`.

No receipts, logs, bloom, uncle list, or execution traces. Transactions are the signed `Transaction` objects included in that block.

### What LevelDB stores vs consensus-critical RAM — CODE-DERIVED

See B. Consensus-critical **live** state is `ChainState` in process memory (accounts, validators, participants, growth, assets/curves/pools, mempool, chain window, attestations, `finalizedHeight`, `stateRoot` inputs). Persistence is JSON in LevelDB (`snapshot` + per-height keys). **HTTP/P2P serving of history uses RAM indexes only** (see G): `ChainStore.getBlock` / `getTransaction` are **not called** from `NodeService`.

---

## B. Storage model

Path: `{DATA_DIR}/chain.db` via `level` (`ChainStore`). Peer book: `{DATA_DIR}/peers.json` (P2P, not chain).

| Key | Value | Written | Read back by node loop/API |
| --- | --- | --- | --- |
| `snapshot` | `PersistedSnapshot`: trimmed `chainState` + `feePool` + `latestReward` + counters + `rewardHistory` | Every durable persist | `load()` on start |
| `block:{height}` | Full block JSON | When head height advances | **Defined** (`getBlock`) but **unused** by `NodeService` / HTTP |
| `blockhash:{hash}` | Height string | With new head | Unused by node loop |
| `tx:{id}` | Tx JSON + `blockHeight` + `blockHash` | Per tx in new head | Unused by node loop |
| `addr:{lowercaseAddress}:txs` | Array of tx ids, **capped at 500** (`slice(-500)`) | Per related address | Unused by node loop (API uses RAM) |
| `checkpoint:{height}` | `{ height, hash, chainState: compactChainStateForCheckpoint }` | When `height > 0 && height % CHECKPOINT_INTERVAL === 0` (`CHECKPOINT_INTERVAL = 100`) | `getNearestCheckpoint` on fork-choice failure |
| `meta:head` | Head height string | With new head | Sets `lastPersistedHeadHeight` |
| `meta:epoch` | Epoch string | Every save | Not required for boot (epoch lives in snapshot) |

**CODE-DERIVED:** there are **no** receipt/event/log keys.

`compactChainStateForCheckpoint`: genesis + tip only (not full window), empty mempool, empty attestation maps, cloned accounts/validators/participants/growth/assets/curves/pools/treasury/burned/etc.

`save()` always `trimChainWindow` on the snapshot object (mutates the in-memory chain if it is the same reference as `NodeService.chainState`).

---

## C. Prune model

### Window constant — CODE-DERIVED

```text
CHAIN_WINDOW_BLOCKS = Number(process.env.CHAIN_WINDOW_BLOCKS ?? 500)
CHECKPOINT_KEEP     = Number(process.env.CHECKPOINT_KEEP ?? 5)
CHECKPOINT_INTERVAL = 100
```

`trimChainWindow` (`packages/core/src/index.ts`):

- `keepFrom = max(1, head.height - keepBlocks + 1)`
- keeps genesis (height 0) if present, plus blocks with `height >= keepFrom`
- drops older `attestationVotes`, `attestationBallots`, `seenBlockHashes`

Tests: `trimChainWindow keeps genesis and recent tips`.

### When disk prune runs — CODE-DERIVED

On epoch boundary (`height % 10 === 0`) **and** `chainState.chain.length > CHAIN_WINDOW_BLOCKS`:

```text
prune(head.height - CHAIN_WINDOW_BLOCKS + 1)
```

`NodeService.prune`: `store.pruneBefore(keepFrom)` then `trimChainWindow` then rebuild RAM indexes.

### What `pruneBefore(height)` deletes — CODE-DERIVED

Deletes:

- `block:{h}` for `0 < h < height`
- `tx:{id}` if `blockHeight < height` and `blockHeight > 0`
- `blockhash:*` pointing at those heights
- `checkpoint:{h}` if `h < height` **except** the newest `CHECKPOINT_KEEP` checkpoints (even if older than the window)

Does **not** delete:

- `snapshot` (still rewritten trimmed)
- `meta:*`
- `addr:*:txs` (stale tx id lists can remain)

Genesis `block:0` is kept (`blockHeight > 0` guard).

### Can the same node keep working after prune? — CODE-DERIVED (not long-run MEASURED)

Yes, as designed: boot is `snapshot` + `trimChainWindow`; proposing uses RAM head + state, not ancient `block:` keys. HTTP `/blocks/:height` returns **404** for heights dropped from RAM even if `block:` still exists on disk (because API never reads LevelDB blocks).

Live prune at height ≥ 510 was **not** MEASURED on a running HTTP node in this audit (process only reached low tens of blocks). In-process LevelDB prune **was** exercised in the throwaway measurer (section D).

### Can a late-joining node fully sync after prune? — CODE-DERIVED: no (see G)

P2P `getBlocksInRange` reads **only** `chainState.chain` (window + genesis), max **100** blocks per response. Checkpoints are **local disk**, not a gossiped archive protocol. A new genesis node cannot reconstruct deleted heights 1 … `keepFrom-1`.

**Do not treat prune as a safe archival policy.** This report does **not** recommend deleting more data.

### Conflict with `docs/BASELINE-AUDIT.md`

That file says older blocks are trimmed from RAM but **preserved in LevelDB block logs**. Current `pruneBefore` **deletes** those keys. **CODE-DERIVED contradiction;** this audit follows the code.

---

## D. Measured storage

### Fixtures / committed chain data — BLOCKED

- No `data/` fixtures in git (`data/` gitignored).
- No `*.ldb` / LevelDB trees in the repo.
- Docker named volumes from an internal testnet were **not** present on this VM (`docker` not installed; `PROTOCOL-ROADMAP.md` mentions a worker-VM testnet that is **not** this environment).

### JSON payload sizes — MEASURED (in-process `JSON.stringify` UTF-8 bytes)

| Object | Bytes | Notes |
| --- | --- | --- |
| Genesis block | 209 | empty txs |
| Height-1 empty block | 335 | no mempool |
| Block with 1 `transfer` | 748 | 1 tx actually applied |
| Block with 100 `transfer`s | 42026 | produced by funding 100 accounts over 100 blocks, then one full block (**MEASURED** produced block, not a guess) |
| Genesis `snapshot` JSON | 1233 | empty economy besides faucet account |
| Compact checkpoint @ genesis | 1197 | |

`enqueueTransaction` requires `tx.nonce === account.nonce` and does **not** reserve nonces, so **one sender can land at most one mempool tx per block** unless other senders exist (**CODE-DERIVED**). Filling 100 txs required 100 funded keys.

### Snapshot JSON vs height (empty blocks, after `trimChainWindow`) — MEASURED

| Height | `chain.length` | Snapshot bytes | Compact checkpoint bytes | Head block bytes |
| --- | ---: | ---: | ---: | ---: |
| 1 | 2 | 1659 | 1545 | 335 |
| 10 | 11 | 5504 | 1547 | 336 |
| 50 | 51 | 22665 | 1548 | 336 |
| 100 | 101 | 44118 | 1551 | 337 |
| 200 | 201 | 87219 | 1552 | 337 |
| 400 | 401 | 173419 | 1552 | 337 |
| 500 | 501 | 216519 | 1552 | 337 |
| 600 | 501 | 216735 | 1552 | 337 |

After the window fills, snapshot JSON **plateaus** (~217 KiB empty). Checkpoint compact blob stays ~1.5 KiB on an empty economy (grows with accounts/assets — **not measured** under load).

### On-disk LevelDB `du -sb` (empty blocks, prune enabled like the node) — MEASURED

Directory includes LSM files (write amplification). Sizes are **not** equal to snapshot JSON.

| Height | Bytes | ≈ |
| ---: | ---: | --- |
| 0 | 1401 | |
| 1 | 3105 | |
| 10 | 37665 | 37 KiB |
| 50 | 611577 | 598 KiB |
| 100 | 2294470 | 2.19 MiB |
| 200 | 7613717 | 7.26 MiB |
| 400 | 10664185 | 10.17 MiB |
| 500 | 9312391 | 8.88 MiB (size **dropped** vs 400 — compaction/overhead) |
| 600 | 11691474 | 11.15 MiB |

### LevelDB with 1 transfer per block (prune on, to height 200) — MEASURED

| Height | Bytes |
| ---: | ---: |
| 1 | 3631 |
| 10 | 61795 |
| 50 | 1150354 |
| 100 | 6178055 |
| 200 | 11986469 (~11.4 MiB) |

### Live HTTP node DATA_DIR — MEASURED

Single `tsx` node, empty blocks, height 13: **`du -sb` = 55609** (~54 KiB). Matches early-height table, not the 600-block LSM sample.

---

## E. Storage growth

### Block rate — CODE-DERIVED (from 3000 ms), corroborated MEASURED

| Period | Blocks (if timer always fires and a proposer exists) |
| --- | ---: |
| Second | 1/3 |
| Hour | 1200 |
| Day | 28 800 |
| 30 days | 864 000 |
| 90 days | 2 592 000 |

If **no** proposer and all nodes wait on misses, height stalls (**CODE-DERIVED**); this audit’s single node always proposed as bootstrap.

### Bytes/block

| Source | Empty | 1 tx/block | 100 tx/block |
| --- | --- | --- | --- |
| Head JSON — MEASURED | ~335–337 B | 748 B | 42026 B |
| Snapshot JSON / block while window filling — MEASURED | ~430 B/block (height 1→500: 216519/500) | UNKNOWN (not sampled) | UNKNOWN |
| LevelDB `du` average 0→600 empty — MEASURED | 11 691 474 / 600 ≈ **19.5 KiB/block** | — | — |
| LevelDB `du` 500→600 empty — MEASURED | (11 691 474 − 9 312 391) / 100 ≈ **23.2 KiB/block** | — | — |
| LevelDB `du` 0→200 with 1 tx — MEASURED | — | ≈ **58.5 KiB/block** | UNKNOWN |

LSM size is **non-monotonic** (400→500 dropped). Treat KiB/block from `du` as **short-run MEASURED**, not a stable physical density.

### Storage / hour / day / month — ESTIMATED only from short-run empty `du`, then **do not use as a warning**

Using 23.2 KiB/block × 1200 blocks/h ≈ **27 MiB/h** ≈ **0.65 GiB/day** empty (**ESTIMATED**). **This is not a 7/30/90-day forecast:** compaction reversed growth once in 100 blocks; account/token/curve state will dominate snapshot/checkpoints; `addr:` keys are unpruned.

### 7 / 30 / 90 day disk warning

**UNKNOWN.** No multi-day DATA_DIR, no production volume, LSM samples too short and non-monotonic. Do not plan capacity from the ESTIMATED 0.65 GiB/day figure.

---

## F. CPU / RAM / bandwidth

### RAM — MEASURED (idle single node)

Process: `node …/tsx src/index.ts` (one proposer, 0 peers then later 2 sockets, empty blocks, height ~10–20):

| Metric | Value |
| --- | --- |
| VmRSS | 54004 KiB ≈ **52.7 MiB** |
| VmHWM | 55900 KiB ≈ **54.6 MiB** |
| VmPeak | 1108120 KiB ≈ **1.08 GiB** virtual (V8 mappings; **not** resident) |
| Threads | 11 |
| Second node (same shape) | VmRSS **54052 KiB** |

CPU: **0.1–0.7%** of one core while idle proposing (**MEASURED**, `ps` `%CPU` over ~15–30 s). **Peak under tx load: UNKNOWN** (no stress).

`chainWindowBlocks` in metrics equalled RAM chain length (6 at height 5, 11 at height 10) — MEASURED.

### Peers — MEASURED + CODE-DERIVED

- `maxPeers` default **32** (`packages/p2p`).
- Two local nodes: each reported `peerCount: 2`, `outboundPeerCount: 1` (**MEASURED**). `peerCount()` is `sockets.size` (likely inbound + outbound to the same peer).
- Production fan-out / WAN RTT: **UNKNOWN**.

### Bandwidth / sync throughput — UNKNOWN (bytes on wire)

- CODE-DERIVED: blocks advertised via `inv`; bulk `blocks_response` gzip if JSON > **32 000** bytes (`BULK_SYNC_GZIP_THRESHOLD`).
- Empty block ~337 B; 100-tx block ~42 KiB JSON → gzip path for bulk of many full blocks.
- `/proc/<pid>/io` `write_bytes` was 0 during the short run (unhelpful for sockets). **No** packet capture.

### Throughput cap — CODE-DERIVED

`maxTxPerBlock=100`, interval 3 s → **33.33 tx/s** if every block is full and apply stays within the tick. **Not MEASURED** under load.

---

## G. Sync / catch-up

### Initial start — CODE-DERIVED

1. Open LevelDB; `load()` snapshot or genesis `createInitialState()`.
2. Gossip listen; `BOOTSTRAP_PEERS` (comma-separated, `ws://` prefixed if missing).
3. `requestCatchUp()` immediately and every **8 s**: `requestBlocks(max(0, head-5), head+50)`.
4. On `request_blocks`, reply `getBlocksInRange` — filter RAM chain, **`.slice(0, 100)`**.
5. Apply consecutive remote blocks with `tryApplyRemoteBlock` (must be `head+1`, valid hash link, txs verify, `stateRoot` match).
6. If none applied: `chooseFork` / `chooseForkWithCheckpoint` using **local** `getNearestCheckpoint`.

Gap `height > head+1` → request range, do not apply.

### What a new peer gets — CODE-DERIVED

- Recent window in RAM (≤ 500 + genesis) if the peer still has those heights.
- At most 100 blocks per response.
- Catch-up window requested is only **~55 heights** ahead of local head per 8 s tick (`head-5` … `head+50`).

Theoretical upper bound if responses are always full 100 consecutive applyable blocks every 8 s: **12.5 blocks/s** vs production **0.33 blocks/s** (**CODE-DERIVED**). **Not MEASURED** as a successful catch-up of a long gap.

### After prune / late join — CODE-DERIVED

| Need | Available to a new node |
| --- | --- |
| Full historical blocks 1…N | **No** (not in peer RAM; not served from LevelDB; not a dedicated archive protocol) |
| Current balances/validators | Only if it can replay from genesis **or** load a **local** checkpoint + replay **contiguous** remote blocks after that height |
| Checkpoint from a peer | **No gossip type** for checkpoint blobs |

**State recovery** for an existing node: `snapshot` on disk. If snapshot is lost and checkpoints remain, there is **no** documented operator path in `apps/node` to boot from `checkpoint:*` alone (load is snapshot-only) — **CODE-DERIVED**.

### Two-node experiment (hashes) — MEASURED

With **unset** `VALIDATOR_ADDRESS`, **both** nodes propose every tick (`shouldPropose` true because of `"bootstrap-validator"`). After ~16 s:

- node-1 height 8, hash prefix `8cf31692…`
- node-2 height 5, hash prefix `82fecb0b…` (different `previousHash`)

They were **forked**, not synced to one tip. CI `scripts/ci-smoke.sh` asserts **height** closeness (`DIFF <= 4` / catch-up `<= 5`), **not** equal head hashes.

---

## H. Two-server testnet (existing compose — do not deploy)

### Topology — CODE-DERIVED (`people-node/docker-compose.yml`)

| Service | Ports | `PEER_ID` | `DATA_DIR` | Faucet | Bootstrap |
| --- | --- | --- | --- | --- | --- |
| `node` | 4001 HTTP, 4002 gossip | `node-1` | `/data/node-1` | `ALLOW_FAUCET=1` | none |
| `node-2` | 4011 HTTP, 4012 gossip | `node-2` | `/data/node-2` | `ALLOW_FAUCET=0` | `BOOTSTRAP_PEERS=host.docker.internal:4002` |
| `web` | 3000 | — | — | — | `NODE_API_URL=http://host.docker.internal:4001` |

- `CHAIN_ID=${CHAIN_ID:-people-internal-testnet}`
- Named volumes `people-data`, `people-data-2`
- Comment in compose: host-gateway used because container-to-container gossip may be dropped on some VMs
- `.env.example`: `DEV_FAUCET_PRIVATE_KEY`, `CHAIN_ID=people-internal-testnet`
- Overlay `docker-compose.prod.yml`: host bind `./data/node-1|2`, tighter faucet/API token; **not** for this internal testnet per file comment

Windows operator guide: `docs/WINDOWS-TESTNET.md` (compose from `people-node`, copy `.env.example`, **no** `docker compose down -v`).

### Env vars that affect node process — CODE-DERIVED (non-exhaustive)

`PEER_ID`, `PORT`, `GOSSIP_PORT`, `DATA_DIR`, `BOOTSTRAP_PEERS`, `CHAIN_ID`, `NODE_ENV`, `DEV_API_TOKEN`, `ALLOW_DEV_ENDPOINTS`, `ALLOW_FAUCET`, `CORS_ORIGIN`, `BIND_HOST`, `PUBLIC_API_URL`, `DEV_FAUCET_PRIVATE_KEY`, `CHAIN_WINDOW_BLOCKS`, `CHECKPOINT_KEEP`, `VALIDATOR_ADDRESS`, `VALIDATOR_PRIVATE_KEY`, `MEMPOOL_MAX_SIZE`, `VLS_PRICE_USD`, `WS_MAX_BUFFERED_BYTES`, `WS_HEARTBEAT_MS`, `FAUCET_RATE_LIMIT`.

### Reproducible locally **without code changes**?

| Path | Status |
| --- | --- |
| Documented Docker Compose two-node + web | **CODE-DERIVED** yes (needs Docker + local `.env`). **BLOCKED** on this audit VM (`docker` missing) |
| Two `npm --workspace @people/node run dev` processes | **MEASURED** they **start, gossip, and produce blocks**, but **do not share one chain** unless proposer identity is constrained by env (empty `VALIDATOR_ADDRESS` → dual bootstrap proposers) |
| CI smoke | **CODE-DERIVED**: three nodes `4101/4111/4121`, `scripts/ci-smoke.sh`; height checks only |

Operator RAM hint in `WINDOWS-TESTNET.md` (4–8 GiB Docker Desktop) is **documentation**, not a measurement on this VM.

---

## I. Preliminary VPS baseline — **beta validator only** (not Mainnet)

Conservative sketch for a **single** full node process similar to compose `node` (HTTP + gossip + LevelDB). **Not** a capacity plan for public Mainnet.

| Resource | Suggestion | Evidence |
| --- | --- | --- |
| CPU | **2 vCPU** | Idle **MEASURED** ≪ 1 core; load/attestations/P2P **UNKNOWN** → do not use 1 vCPU as a promise |
| RAM | **2 GiB** process budget (4 GiB if this VPS also runs `web` + second node) | Idle RSS **~55 MiB MEASURED**; VmPeak virtual **~1.1 GiB MEASURED** (not RSS); snapshot JSON empty **~217 KiB MEASURED**; growth of accounts/curves **UNKNOWN** |
| Disk | **40 GiB** SSD starting point | 11 MiB at 600 empty blocks **MEASURED**; 7/30/90 **UNKNOWN**; leave headroom for LSM, logs, Docker layers |
| Disk growth | **UNKNOWN** | See E |
| Bandwidth | **UNKNOWN** | No WAN sample; gossip JSON/gzip **CODE-DERIVED** only |
| Sync | Assume **window-only**; cannot archive-sync | CODE-DERIVED G |
| Block interval | **3 s** as implemented | CODE-DERIVED + MEASURED |

`VLS_PRICE_USD` default `0.12` appeared on `/metrics` (**CODE-DERIVED** env default). It is **not** a measured market price.

---

## J. UNKNOWN / BLOCKED

| Item | Tag | Why |
| --- | --- | --- |
| Durable internal-testnet volume sizes (worker VM in `PROTOCOL-ROADMAP.md`) | BLOCKED | Not this environment |
| Docker Compose resource stats | BLOCKED | No Docker |
| 7/30/90 day disk | UNKNOWN | No long run; LSM non-monotonic |
| CPU/RAM under full 100-tx blocks + many validators + attestations | UNKNOWN | Idle-only MEASURED |
| Bytes/s gossip on WAN | UNKNOWN | |
| Successful catch-up across prune boundary | UNKNOWN / CODE-DERIVED fail path | Not executed at height > 500 live |
| `addr:` key growth with many addresses | UNKNOWN | Unpruned by design |
| Snapshot size with Token Factory / DEX state | UNKNOWN | Empty economy MEASURED only |
| Whether LevelDB `getBlock` was ever intended as an HTTP fallback | UNKNOWN | Dead read API in store |

---

## K. Risks

1. **Dual bootstrap proposers** split the testnet chain when `VALIDATOR_ADDRESS` is unset on every node (**MEASURED** hashes diverged).
2. **Prune + windowed P2P** means history is not a complete replica; explorers 404 for old heights even if disk still has keys, and **lose** them after `pruneBefore` (**CODE-DERIVED**).
3. **Checkpoints are local-only**; new peers cannot fetch them (**CODE-DERIVED**).
4. **`addr:*:txs` not pruned** — unbounded if unique addresses grow (**CODE-DERIVED**).
5. **Snapshot rewritten every block** → LSM amplification; `du` can jump or drop (**MEASURED**).
6. **CI smoke does not prove hash identity** of two nodes (**CODE-DERIVED**).
7. Docs (`BASELINE-AUDIT.md`) can overstate LevelDB retention vs prune (**CODE-DERIVED** conflict).
8. **No protocol backup/archival** — Docker volumes are operational persistence, not a recovery product (**CODE-DERIVED**).
9. Default `/metrics` token price env is easy to misread as a real price (**CODE-DERIVED**).

---

## Architecture classification (from **existing** code only)

| Class | Present in code? | What it is | Safe to delete? |
| --- | --- | --- | --- |
| **HOT** | Yes | RAM `ChainState` (windowed `chain`, mempool, indexes); live HTTP/WS; gossip pools | No — this **is** the node |
| **ARCHIVE** | Partial | LevelDB `block:` / `tx:` / `blockhash:` / extra `checkpoint:` beyond keep-N | **Not proven safe** for recovery: API/P2P do not read `block:`/`tx:`; prune already deletes them. **Do not delete additional keys** without a tested restore |
| **BACKUP** | No (protocol) | Wallet seed backup strings in **web** i18n/custody only; compose volumes / `./data` bind mounts | Volumes: `docker compose down -v` **destroys** chain (documented). Not an off-site backup |

---

## L. Next recommended technical step

**Do not implement protocol, prune, or archival features in this step.**

Recommended next **measurement** (operator/runbook, not a repo script unless separately approved):

1. On the **existing** internal two-node compose (or two processes) set **exactly one** proposer via `VALIDATOR_ADDRESS` / `VALIDATOR_PRIVATE_KEY` (or leave a single node proposing) so heads can share hashes.
2. Record every N minutes: `du -sb $DATA_DIR`, `/metrics` (`height`, `peerCount`, `chainWindowBlocks`, `prunedBeforeHeight`), and head **hash**.
3. After height > 500, query `/blocks/1` vs `/blocks/{head}` and note 404 vs 200 — confirm prune/API behavior on a live chain.
4. Optionally `docker stats` CPU/RAM if Compose is used.

Stop there. No Mainnet, no VPS purchase, no prune redesign.

---

## Appendix — later commands (not added to the repo)

If a future approved job adds tooling, useful observations (already used ad hoc):

- Persist N empty blocks through `ChainStore.save` + `pruneBefore` and `du -sb`.
- `JSON.stringify` sizes of `buildBlock` outputs at 0 / 1 / 100 txs.
- `curl /chain/head` twice; divide timestamp delta by height delta.
- `grep VmRSS /proc/$pid/status` on the `tsx`/`node dist/index.js` worker (not the parent `npm` process).

---

## What this audit did **not** do

- Change protocol, consensus, economics, or `BondingCurveEngine`
- Start Mainnet, buy VPS, or alter production
- Implement archival/backup/prune improvements
- Add benchmark scripts to the repository
