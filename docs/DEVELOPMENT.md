# DEVELOPER GUIDE — PEOPLE'S BLOCKCHAIN

This guide explains how to set up, build, test, and run the **People's Blockchain** monorepo (based on the OVN baseline).

> Naming follows `docs/TERMINOLOGY.md`: brand **People**, network **People's Blockchain**,
> native token **People** (ticker **PPL**, runtime id `ppl`). Legacy `vls` keys in old
> snapshots are migrated on load.

---

## Prerequisites

- **Node.js:** `v20.x` or higher (tested on Node `v24.15.0`)
- **npm:** `v10.x` or higher (tested on npm `v11.12.1`)
- **Git:** Git client installed

---

## Repository Structure

```text
peoples-blockchain/
├── docs/                        # Specifications & Architecture Documentation
│   ├── VISION.md                # High-level vision & product principles
│   ├── ECONOMICS.md             # Native asset, fees, and validator emission
│   ├── MOBILE-MINING.md         # Participation Power & reward mechanics
│   ├── TOKEN-ECONOMY.md         # Token factory, 10% Community Pool & DEX
│   ├── TECHNICAL-ARCHITECTURE.md# System architecture and roadmap
│   ├── BASELINE-AUDIT.md        # Complete audit of the codebase
│   ├── ARCHITECTURE-MIGRATION.md# Keep/Adapt/Replace/New matrix
│   ├── DEVELOPMENT.md           # Developer runbook (this document)
│   └── WINDOWS-TESTNET.md       # Internal testnet on Windows (Docker Compose)
├── people-node/ # Reference codebase & monorepo workspace
│   ├── packages/
│   │   ├── protocol/            # Protocol types, schemas, and interfaces
│   │   ├── core/                # Ledger, crypto, LevelDB store, consensus logic
│   │   ├── p2p/                 # WebSocket gossip network & peer discovery
│   │   └── sdk/                 # Client library & tx signing utilities
│   ├── apps/
│   │   ├── node/                # Fastify blockchain node daemon
│   │   ├── web/                 # React + Vite web dashboard & PWA
│   │   └── mobile-lite/         # Headless light node runner
│   ├── scripts/                 # Dev stop and smoke test scripts
│   ├── turbo.json               # Turborepo task pipeline configuration
│   └── package.json             # Root monorepo configuration & workspaces
├── AGENTS.md                    # Instructions and rules for AI coding agents
└── README.md                    # Project overview
```

---

## Getting Started

All development commands are executed inside the monorepo folder:

```bash
cd people-node
```

### 1. Install Dependencies

Use `npm ci` for a clean, reproducible installation:

```bash
npm ci
```

### 2. Build All Packages and Applications

Before running type checks or starting applications, compile all workspaces:

```bash
npm run build
```

> **Note:** Turborepo handles package inter-dependencies automatically. `@ovn/protocol` is compiled first, followed by `@ovn/core`, `@ovn/p2p`, `@ovn/sdk`, and the frontend/node applications.

### 3. Run Type Checking and Linting

```bash
# Typecheck all packages
npm run typecheck

# Lint all packages
npm run lint
```

### 4. Run Automated Tests

Execute unit and integration tests across all packages using Vitest:

```bash
npm run test
```

To run tests for a specific workspace:

```bash
npm run test --workspace=@ovn/core
npm run test --workspace=@ovn/node
npm run test --workspace=@ovn/sdk
```

---

## Running the Blockchain Locally

### 1. Start a Single Full Node (Development Mode)

Starts the node daemon on port `4001` with P2P gossip on port `4002`:

```bash
npm --workspace=@ovn/node run dev
```

Key endpoints:
- API Index: `http://localhost:4001/`
- Health check: `http://localhost:4001/health`
- Node Metrics: `http://localhost:4001/metrics`
- Prometheus Metrics: `http://localhost:4001/metrics/prometheus`
- Chain Snapshot: `http://localhost:4001/snapshot`
- AMM v0.1 pools: `GET /liquidity-pools`, `GET /liquidity-pools/:poolId`, `GET /liquidity-pools/:poolId/quote?tokenIn=&amountIn=`
- AMM txs use the existing `POST /tx` path (`ammCreatePool`, `ammAddLiquidity`, `ammRemoveLiquidity`, `ammSwap`)
- Live WebSocket feed: `ws://localhost:4001/ws`

### 2. Start the Web Dashboard & Wallet

Starts the Vite development server for the web interface on `http://localhost:3000`:

```bash
npm --workspace=@ovn/web run dev
```

Open `http://localhost:3000` in your browser to access the wallet, explorer, and staking views.

### 3. Start Both Node and Web Together

```bash
npm run dev
```

### 4. Stop Running Dev Instances

If background node or Vite processes need to be terminated:

```bash
bash scripts/stop-dev.sh
```

### 5. Internal testnet (Docker Compose)

Not mainnet. From `people-node`:

1. Copy `.env.example` to `.env`.
2. Set `DEV_FAUCET_PRIVATE_KEY` to a testnet-only hex key. Never commit `.env`.
3. `docker compose --env-file .env up --build -d`
4. Node: `http://localhost:4001/health` · web: `http://localhost:3000` · node-2: `http://localhost:4011/health`

Faucet is enabled on node-1 only. Do not use `docker-compose.prod.yml` for this stack.

Windows (unused laptop, Docker Desktop + WSL2): `docs/WINDOWS-TESTNET.md`.

---

## Single extra node (VPS / any Docker host)

Portable image: `people-node/Dockerfile.node` (same image Railway uses). Not mainnet. Do not set `ALLOW_DEV_ENDPOINTS`.

```bash
cd people-node
cp .env.node.example .env.node
# fill CHAIN_ID, DEV_FAUCET_PRIVATE_KEY (same as the seed network), BOOTSTRAP_PEERS, PUBLIC_GOSSIP_URL
docker compose -f docker-compose.node.yml --env-file .env.node up --build -d
```

Check `http://127.0.0.1:4001/health`. How to join the network (bootstrap, genesis, validator, ports): section **How to connect a new node** below, and the Token Factory report.

---

## Running Multi-Node Clusters & Smoke Tests

The project includes a multi-node smoke test script that boots 3 nodes, forms a peer network, tests faucet distributions, transaction execution, partition recovery, and p95 API latency:

```bash
npm run ci:smoke
```

---

## Environment Variables

| Variable | Workspace | Default | Description |
|---|---|---|---|
| `PORT` | `@ovn/node` | `4001` | HTTP API port for the node |
| `GOSSIP_PORT` | `@ovn/node` | `4002` | WebSocket P2P gossip port |
| `DATA_DIR` | `@ovn/node` | `./data/<peerId>` | Directory for LevelDB blockchain data |
| `PEER_ID` | `@ovn/node` | `peer-<rand>` | Unique identifier for the node peer |
| `BOOTSTRAP_PEERS`| `@ovn/node` | `""` | Comma-separated gossip seeds (`host:4002`, `ws://host:4002`, `wss://…`) |
| `PUBLIC_GOSSIP_URL` | `@ovn/node` | `""` | Advertised listen URL for peer-exchange (`ws://PUBLIC_IP:4002`). Alias: `GOSSIP_ADVERTISE`. Without this, hello advertises `ws://127.0.0.1:$GOSSIP_PORT`, which other hosts cannot dial. |
| `CHAIN_ID` | `@ovn/node` | `ovn-devnet` | Blockchain network identifier |
| `ALLOW_DEV_ENDPOINTS` | `@ovn/node` | `""` | Set to `1` to enable debug/dev-only routes. Public Railway testnet must leave this unset. Testnet faucet is `ALLOW_FAUCET=1` instead. |
| `PPL_PRICE_USD` | `@ovn/node` | `0.12` | Fallback reference for node metrics only. Not a market rate. Do not show USD on the public website. |
| `TOKEN_CREATE_MIN_FEE` | `@ovn/core` | `1.045005` | Owner-approved minimum `tokenCreate` fee in PPL. |
| `NFT_MINT_MIN_FEE` | `@ovn/core` | `2.925` | Owner-approved minimum `nftMint` fee in PPL. |
| `DEFAULT_TRANSFER_FEE` | `@ovn/core` / `@ovn/sdk` | `0.004875` | Owner-approved ordinary transfer client default (not hashed in `stateRoot`). Batch scales with this tariff. |
| `NODE_API_URL` | `@ovn/mobile-lite`| `http://localhost:4001` | Target node API URL for light worker |
| `VITE_NODE_URL` | `@ovn/web` | `http://localhost:4001` | Backend API URL for the web dashboard |
| `VITE_WS_URL` | `@ovn/web` | `ws://localhost:4001/ws` | Live WebSocket endpoint for the web dashboard |
| `DEV_FAUCET_PRIVATE_KEY` | `@ovn/node`, `@ovn/core` | unset | `DEV_FAUCET_PRIVATE_KEY` задаётся локально, never commit. |
| `SECURITY_UPGRADE_HEIGHT` | `@ovn/core` | unset | Высота активации правил security protocol v2. **Обязательна на любой сети, доступной посторонним.** Должна быть одинаковой на всех нодах: расхождение раскалывает цепь на высоте H. Пустое значение = не задана. |
| `VALIDATOR_ALLOWLIST` | `@ovn/core` | `""` | Список адресов (канонический нижний регистр, через запятую), которым разрешён `joinValidator` после `SECURITY_UPGRADE_HEIGHT`. Без `SECURITY_UPGRADE_HEIGHT` нода не стартует. Пустой список допустим для сети только из bootstrap. |

### Предупреждение (M10-1, шаг 0)

Без `SECURITY_UPGRADE_HEIGHT` валидатором становится любой адрес со 100 PPL.
На любой сети, доступной посторонним, задавайте `SECURITY_UPGRADE_HEIGHT` и
`VALIDATOR_ALLOWLIST` одинаково на всех нодах (пример — в
`people-node/docker-compose.yml`, порядок активации — в
[AUDIT-CRITICAL-FIXES.md](AUDIT-CRITICAL-FIXES.md), раздел «Coordinated testnet
activation procedure»).

Это снижает риск, но не убирает его: у каждой высоты сейчас ровно один
допустимый proposer, и если он офлайн или молчит нарочно, цепь стоит, пока он не
вернётся. Резервный proposer (раунды внутри высоты) и детерминированный учёт
пропусков — изменение правил консенсуса (AGENTS.md §4) и требуют отдельного
письменного решения владельца; **не менять правила выбора proposer без него**
(M10-1, шаги 1-2).

---

## Как подключить новую ноду к сети

Не Mainnet. Образ: `Dockerfile.node` (тот же, что Railway). Compose на одном сервере: `docker-compose.node.yml`.

Genesis в коде (`createInitialState`). Отдельного `genesis.json` нет. Чтобы две ноды были в одной сети, нужны **один и тот же** бинарник/тег образа, **один `CHAIN_ID`**, и **один `DEV_FAUCET_PRIVATE_KEY`**: из ключа считается `FAUCET_ADDRESS`, иначе genesis/`stateRoot` разъедутся.

### Seed и bootstrap

1. Seed — нода, у которой **доступен gossip TCP** (`GOSSIP_PORT`, по умолчанию **4002**). Публичный HTTP Railway **не** является seed: сайт ходит на HTTP, пиры — на WebSocket gossip.
2. На seed задайте `PUBLIC_GOSSIP_URL=ws://<публичный_IP_или_DNS>:4002`, иначе hello отдаёт `ws://127.0.0.1:4002`, и чужие хосты не смогут перезвонить.
3. На новой ноде: `BOOTSTRAP_PEERS=<seed_host>:4002` (или `ws://…`, несколько через запятую).
4. Если публичная нода живёт только на Railway без TCP **4002**, сначала откройте gossip на Railway (TCP proxy) **или** сделайте seed на VPS и пропишите `BOOTSTRAP_PEERS` у Railway на этот VPS. Иначе VPS не увидит блоки seed.

Поздний join с пустым `DATA_DIR`: догон истории ограничен окном (`CHAIN_WINDOW_BLOCKS`) и prune. Пустая нода **не обязана** восстановить полную историю у уже порезанного пира. Подключайте ноды, пока окно ещё покрывает голову, или копируйте HOT volume (операторски, не протокол archival — archival **NOT IMPLEMENTED**).

### Compose на сервере

```bash
cd people-node
cp .env.node.example .env.node
# CHAIN_ID, DEV_FAUCET_PRIVATE_KEY как у сети, BOOTSTRAP_PEERS, PUBLIC_GOSSIP_URL
docker compose -f docker-compose.node.yml --env-file .env.node up --build -d
curl -sS http://127.0.0.1:4001/health
```

У присоединяющихся нод `ALLOW_FAUCET=0`. Faucet только на согласованном public/seed. `ALLOW_DEV_ENDPOINTS` не задавать.

### Как добавить валидатора

Блоки на пустом `validators` идут от `bootstrap-validator` без ключа. Именованный валидатор:

1. `node scripts/print-testnet-keypair.mjs` — **отдельный** ключ, не faucet.
2. Пополнить адрес (≥ `minStake` **100** PPL + комиссия `0.004875`) faucet’ом или переводом.
3. `NODE_URL=http://127.0.0.1:4001 VALIDATOR_PRIVATE_KEY=… node scripts/join-validator.mjs` (`STAKE` default 100, `NODE_KIND=full`). Статус `joining`, `active` после `warmupEpochs` (сейчас **2** эпохи).
4. На процессе ноды: `VALIDATOR_ADDRESS` + `VALIDATOR_PRIVATE_KEY`, затем restart. Телефон не валидатор консенсуса.

### Порты

| Порт (default) | Назначение | Firewall |
|---|---|---|
| **4001** TCP | HTTP API (`/health`, `/tx`, explorer) | Публично только если это RPC; иначе localhost + reverse proxy |
| **4002** TCP | Gossip WebSocket | Между нодами сети. Без него join по P2P не работает |
| 443 | HTTPS к API | Опционально, terminate на proxy; gossip в этом образе без TLS (`ws://`) |

Railway: HTTP = `$PORT`. Gossip 4002 нужно публиковать отдельно, если эта нода — seed.

### Публичный HTTPS для ноды на VPS

Для браузера и прод-сайта нужен **HTTPS** к HTTP API ноды (`PORT`, по умолчанию **4001**). Gossip (**4002**) остаётся **сырым TCP/WebSocket** без TLS-терминации на том же домене.

1. **DNS:** поддомен, например `node.peopleblockchain.network`, **A-запись** на публичный IPv4 VPS.
2. **Firewall:** открыть **80** и **443** (Let's Encrypt / ACME через Caddy). Порт **4002** — только для пиров сети (не проксировать через Caddy).
3. **Caddy** на хосте (reverse proxy к локальной ноде):

```caddyfile
node.peopleblockchain.network {
  reverse_proxy localhost:4001
}
```

Caddy сам получит и обновит TLS-сертификат. API ноды снаружи: `https://node.peopleblockchain.network/health`, `https://node.peopleblockchain.network/tx`, и т.д.

4. **Сайт (`website/`):** задайте публичный RPC, например `OVN_RPC_URL=https://node.peopleblockchain.network` (или имя переменной из `website/.env.example` для URL ноды). Без HTTPS браузер заблокирует запросы с прод-домена к `http://…`.

**Установка Caddy рядом с Docker Compose (кратко):** на VPS установите Caddy (пакет ОС или официальный образ). Нода в compose слушает `127.0.0.1:4001` (не публикуйте 4001 в интернет, если достаточно proxy). Пример отдельного сервиса в `docker-compose.node.yml` на том же хосте:

```yaml
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
```

В `Caddyfile` используйте `reverse_proxy host.docker.internal:4001` или имя сервиса `node:4001`, если Caddy в той же compose-сети. `PUBLIC_GOSSIP_URL` по-прежнему указывает на `ws://<хост>:4002` (или публичный IP/DNS и порт gossip), не на HTTPS-домен API.

### Требования к серверу

**TBD** до серии замеров (`du`, RSS, height). Локальный smoke образа: порядка **~51 MiB RSS**, CPU доли процента. Ориентир для одной testnet-ноды: **1 vCPU, 1 GB RAM**, диск под volume `/data` (LevelDB); не SLA. Docker Engine, открытые порты выше, стабильный публичный IP или DNS для `PUBLIC_GOSSIP_URL`.

---

## Development Guidelines

1. **Protocol Immutability:** Never alter economic parameters, emission rates, or consensus algorithms without an explicit update to the approved specification in `docs/`.
2. **Deterministic Primitives:** Keep state transitions pure and deterministic. Never introduce floating-point arithmetic errors in financial logic.
3. **Always Verify Builds:** Always run `npm run build && npm run typecheck && npm run test` before submitting changes.


## Security protocol v2 (2026-09-30)

Fresh testnets require `BOOTSTRAP_ADDRESS` on every node and a separate
`BOOTSTRAP_PRIVATE_KEY` on the seed only. Generate it using the existing
`generateKeyPair` helper in a private environment; do not paste it into logs or Git.
Followers must leave the private bootstrap key unset. Existing v1 DATA_DIRs are
rejected, preserved and require an explicitly reviewed migration or approved new
chain. See [upgrade constraints](SECURITY-HARDENING.md) and
[approved decisions](PROTOCOL-DECISIONS.md). This is not a Mainnet deployment path.

## Public-only node onboarding (v2)

See [PUBLIC-NODE-ONBOARDING.md](PUBLIC-NODE-ONBOARDING.md). Followers now use public `GENESIS_FAUCET_ADDRESS` plus `BOOTSTRAP_ADDRESS`; do not distribute the faucet private key. Public image/endpoint release is gated separately. Earlier private-key-based internal testnet examples remain seed/development paths, not public join instructions.

### Live public testnet v2 (already running)

This is **not Mainnet**. The archive seed is already producing protocol v2 blocks.

| Item | Value |
| --- | --- |
| `CHAIN_ID` | `people-public-testnet-v2-2026-09-30` |
| HTTP / HTTPS API | `https://node.peopleblockchain.network` (process listens on `127.0.0.1:4001`) |
| Gossip | Port **4002** open on the VPS; published seed also lists `wss://node.peopleblockchain.network/gossip` |
| Manifest | `GET https://node.peopleblockchain.network/network` |
| Website RPC env | `OVN_RPC_URL=https://node.peopleblockchain.network` (host/Vercel env only; never commit secrets) |

Public join fields (not secrets) come from `/network`: `genesisHash`, `genesisFaucetAddress`, `bootstrapAddress`, `bootstrapPeers`, token/NFT min fees. Followers set **no** `DEV_FAUCET_PRIVATE_KEY`, **no** `BOOTSTRAP_PRIVATE_KEY`, `ALLOW_FAUCET=0`, and leave `ALLOW_DEV_ENDPOINTS` unset.

Preferred follower path: Docker image from [PUBLIC-NODE-ONBOARDING.md](PUBLIC-NODE-ONBOARDING.md) with `NODE_NETWORK_URL=https://node.peopleblockchain.network/network`. Manual `.env.node` must copy those public fields exactly so genesis/`stateRoot` match. Do not reuse a v1 `DATA_DIR`. Do not use `CHAIN_ID=people-public-testnet` (different network).

Seed host (VPS `node.peopleblockchain.network`, FASTPANEL/nginx):

1. Node process: `BIND_HOST=127.0.0.1`, `PORT=4001`, `GOSSIP_PORT=4002`.
2. Reverse proxy HTTPS to `http://127.0.0.1:4001` with **WebSocket upgrade** for `/ws` and `/gossip` (and HTTP for `/health`, `/tx`, `/network`, `/chain/head`).
3. Keep gossip TCP **4002** reachable for peers that dial `ws://…:4002`. The live `/network` list currently advertises `wss://node.peopleblockchain.network/gossip`.
4. Archive seed keeps `ARCHIVE_MODE=1` from genesis. Faucet/dev endpoints stay off on public followers.

Example nginx location (FASTPANEL-compatible; adjust SSL as the panel already terminates TLS):

```nginx
location / {
  proxy_pass http://127.0.0.1:4001;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

Set `TRUST_PROXY_HEADERS=1` on the node **only** if this proxy overwrites `X-Real-IP`.

### Explorer live updates

The website `/explorer` connects directly from the browser to the node's `/ws`
endpoint. Vercel serves the page; it does not proxy WebSocket connections.
The endpoint defaults to the configured HTTP RPC origin converted to `ws`/`wss`
with `/ws` appended. Override it with `OVN_WS_URL` (public URL, no credentials).
For the public v2 testnet use `wss://node.peopleblockchain.network/ws`.

The client checks the node's `hello.chainId` against `NEXT_PUBLIC_CHAIN_ID`, loads
its initial `feed`, and applies confirmed `block` events. Pending `tx` events
are not shown as confirmed transactions. Connection failures retain the last
rows with an offline status; retry backs off to 30 seconds, then the new feed
recovers missed events. Application ping/pong detects a stale connection.
Search and individual record pages continue to use the HTTP API.
Run `cd website && npm run test:explorer-live` for transport regression tests.

### Cosmos EVM website explorer live connection

With `NEXT_PUBLIC_CHAIN=cosmos-evm` (the default), `/explorer` uses a browser
WebSocket directly to `wss://node.peopleblockchain.network/ws`. Vercel serves the
page and does not proxy this socket. `EVM_WS_URL` can override the public endpoint;
otherwise the EVM RPC origin is converted to ws/wss with the `/ws` path. URLs with
credentials, query strings or fragments are rejected before reaching the browser.

The client verifies `eth_chainId` against 97401, subscribes to `newHeads`, and reads
blocks with `eth_getBlockByNumber` over the same connection. The initial snapshot
and reconnect recovery are bounded to the latest **40 blocks**; 12 blocks and up
to 12 confirmed transactions from that window are displayed. This feed is not a
full historical transaction index. Block/transaction lookup by height/hash remains
available separately. The compatibility recent-transaction HTTP endpoint also
stops after 40 blocks rather than scanning to genesis.

Only startup/reconnection shows “Connecting”; new blocks keep the online status.
RPC errors, a wrong chain, handshake/read timeouts (20 seconds), or a stale head
subscription (over 45 seconds) mark the connection unavailable. Previous rows
remain visible while reconnecting with exponential backoff. Teardown cancels
requests and timers. Reads run sequentially so burst notifications cannot pile up
overlapping scans. The wallet uses the same EVM subscription client to refresh after blocks.
Legacy `ovn-node` retains its existing hello/feed WebSocket.

Verification: `cd website && npm run test:explorer-live`; browser regression:
`npx playwright test scripts/explorer-live.spec.mjs` against a Cosmos EVM build.

**Browser Origin prerequisite:** nginx forwarding Upgrade/Connection is not
sufficient. Cosmos EVM checks the browser's `Origin` separately. Its default
`ws-origins = ["127.0.0.1", "localhost"]` rejected both the public website and
local browser checks with HTTP 403 on the current testnet. The public RPC node
must explicitly admit the website hostname in `config/app.toml` (Cosmos EVM
compares `Origin` URL Hostname against these entries, not the full URL):

```toml
[json-rpc]
# Keep existing origins and add only the trusted website origin.
ws-origins = ["127.0.0.1", "localhost", "www.peopleblockchain.network"]
```

This configuration takes effect after an operator-approved restart of the same
node/home/data. Back up app.toml first. It does not change chain ID, consensus or
balances. Avoid `*` or disabling Origin validation. Additional sites/development
origins require their own explicit allowlist decision. On the current two-validator
single-host setup, restarting either validator can temporarily pause blocks;
verify fresh heights afterward. Public HTTP RPC responding successfully, or a
WebSocket probe without Origin, does not prove that browsers can subscribe.

On this testnet binary, editing app.toml alone did not apply the WebSocket
allowlist. The approved policy was applied explicitly to node0's systemd
ExecStart using the native flag (all other start arguments retained):

```text
--json-rpc.ws-origins 127.0.0.1,localhost,www.peopleblockchain.network
```

Verified on 2026-10-03: `Origin: https://www.peopleblockchain.network` can
connect and read `eth_chainId = 0x17c79`; an unrelated origin still returns
403. The final explorer build streams real blocks in a browser on localhost
using the existing loopback allowance. Both validators are active with matching
block/app hashes at common height 22140, unchanged genesis
`f83e28c1a2d0b5985519277f1df4279f90aed06ce4265453119a824b3c7f80fa`,
and chain ID `people_97401-1`. This verifies the testnet operation, not Mainnet
readiness. PR #131 remains for manual merge; the public website requires its
normal main-to-Vercel publication before it uses this client.
