# PEOPLE Network

> **Legacy TypeScript node stack (reference implementation).** People's Blockchain current native asset is **People / PPL** (`ppl`). Vallis (`VLS`) below is the legacy product name, not the live People asset.

Облегчённый блокчейн + веб-панель: любой может подключить сервер, ПК, телефон или планшет как валидатор и получать награды в **Vallis (`VLS`)**.

## Модель консенсуса

**Leader-based PoS** (не BFT): один proposer на слот, блоки ~каждые 3s, финализация по attestation quorum. Это production MVP / public-devnet, не Tendermint-класс.

## Production MVP

- Подписи: `secp256k1`
- Persistent LevelDB + индексы `block:` / `tx:` / `addr:`
- P2P gossip: reconnect, dedup, `request_blocks` catch-up
- PoS: join / leave / unstake, warmup по epoch, evidence-based slashing
- **On-chain referrals:** `joinValidator.payload.referrer` → `Validator.referredBy`; доля награды реферала (`referralShare`, по умолчанию 5%) уходит рефереру в `distributeEpochRewards`
- Governance v0: proposal / vote
- Web: кабинет (earn hub + referrals), explorer, staking, governance, light PWA, docs; уведомления модалками
- SDK: `@people/sdk` с подписью и полным HTTP API

## Быстрый старт

```bash
npm install
npm run build
npm run dev
```

- Сайт: http://localhost:3000
- API: http://localhost:4001
- Live WebSocket: `ws://localhost:4001/ws` (через Vite proxy: `/ws`)

На фронте данные обновляются по WebSocket при новом блоке/tx, без polling каждые 5 секунд.

Остановить занятые порты:

```bash
npm run stop
```

С light-validator:

```bash
npm run dev:all
```

### Docker Compose (public-devnet)

```bash
docker compose up --build
```

Поднимает `node`, `node-2` (bootstrap peer) и `web`. Данные в volumes.

Prod-профиль (данные на хосте в `./data/node-1`, `./data/node-2`, переживают reboot):

```bash
export DEV_API_TOKEN='...'
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

**Важно:** не запускайте `docker compose down -v` на проде — флаг `-v` удаляет volumes с цепочкой. Обычный `restart` / reboot сервера данные **не** стирает: нода пишет LevelDB в `DATA_DIR` и при старте загружает snapshot.

### Отдельный запуск нод

```bash
PEER_ID=node-1 PORT=4001 GOSSIP_PORT=4002 DATA_DIR=./data/node-1 npm --workspace @people/node run dev

PEER_ID=node-2 PORT=4011 GOSSIP_PORT=4012 DATA_DIR=./data/node-2 \
BOOTSTRAP_PEERS=127.0.0.1:4002 npm --workspace @people/node run dev
```

## Веб-маршруты

| URL | Описание |
|-----|----------|
| `/` | Лендинг + live KPI + гайд валидатора |
| `/wallet` | Кабинет: обзор / отправка / история + **earn hub** и реф-ссылка |
| `/validators` | Онбординг валидатора (reveal ключа; реферер из привязки кошелька / `?ref=`) |
| `/staking` | Leave / unstake, доля эпохи, связь с Light |
| `/governance` | Proposal / vote |
| `/light` | Browser light-validator (PWA) |
| `/docs` | API docs |
| `/explorer` | Обозреватель с пагинацией и finalized badges |

Primary nav: flat header links (Home → Roadmap); search + menu on a second row; mobile hamburger.

### Как участвовать (без App Store)

1. **Браузер** — кошелёк и explorer, ничего не ставить.
2. **PWA на телефоне** — «Установить приложение» / Add to Home Screen, затем Launch → Light для attestation.
3. **Full-нода** — запустить `@people/node` на сервере/ПК (не мобильный магазин).

### Заработок и рефералы

1. В `/wallet` → Обзор: faucet → Launch (light) → `/light` Start.
2. После join в кабинете видны stake, награда эпохи, lifetime и статус.
3. Партнёрка: скопируйте ссылку `/wallet?ref=<ваш_адрес>` из кабинета. Гость при создании/входе кошелька закрепляется за вами в браузере; при join валидатора реферер уходит on-chain, и каждый epoch вы получаете `referralShare` от награды приглашённого (если вы `active`).

PWA: service worker `apps/web/public/sw.js`, manifest `manifest.webmanifest`, иконки в `apps/web/public/icons/`. API (`/api`) и WebSocket не кэшируются.

## Переменные окружения (нода)

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `PEER_ID` | random | ID пира |
| `PORT` | `4001` | HTTP API |
| `GOSSIP_PORT` | `PORT+1` | Gossip WS |
| `DATA_DIR` | `./data/<peer>` | LevelDB |
| `BOOTSTRAP_PEERS` | — | `host:port` или `ws://` / `wss://` через запятую |
| `PUBLIC_GOSSIP_URL` | — | Что advertise в hello (`ws://PUBLIC_IP:4002`) |
| `CHAIN_ID` | `people-devnet` | ID сети |
| `NODE_ENV` | — | `production` закрывает faucet без токена |
| `DEV_API_TOKEN` | — | Токен для faucet/admin (`x-api-token`) |
| `ALLOW_DEV_ENDPOINTS` | — | `1` разрешает faucet в production |
| `ALLOW_FAUCET` | — | `1` разрешает faucet при `NODE_ENV=production` |
| `FAUCET_RATE_LIMIT` | `5` | Запросов / мин / адрес |
| `CORS_ORIGIN` | request origin | CORS |
| `BIND_HOST` | `0.0.0.0` | Bind address |
| `PPL_PRICE_USD` | `0.12` | Fallback USD price for node metrics only (`VLS_PRICE_USD` still accepted as alias). Not a public website figure. |
| `TOKEN_CREATE_MIN_FEE` | `1.045005` | Поднимает только **свой** mempool-порог для `tokenCreate` (PPL). Консенсусный минимум — константа `DEFAULT_TOKEN_CREATE_MIN_FEE` = `1.045005`, понизить env нельзя (M13-4) |
| `NFT_MINT_MIN_FEE` | `2.925` | То же для `nftMint`: только локальный mempool-порог, консенсусный минимум — константа `DEFAULT_NFT_MINT_MIN_FEE` = `2.925` (M13-4) |
| `CHAIN_WINDOW_BLOCKS` | `500` | Сколько последних блоков держать в RAM/snapshot/disk window |
| `CHECKPOINT_KEEP` | `5` | Сколько последних checkpoint оставлять при prune |

`/metrics` также возвращает: `transactionCount`, `totalValidatorRewards`, `tokenPriceUsd`, `referenceTokenPriceUsd`, `finalizedHeight`, `finalizedLag`, `rejectedTxCount`, `missedProposalCount`, `attestationQuorumHeights`, `outboundPeerCount`, `reconnectCount`, `bannedPeerCount`, `suggestedTransferFee`.

Prometheus: `GET /metrics/prometheus`.

### Testnet hardening

- Attestation tx must include `headerHeight` + `blockHash`; finality advances only via attestation quorum when validators are active.
- Nodes auto-detect double-sign tips, emit `slash_candidate` on `/ws`, and submit on-chain `slashEvidence` (reporter share of slashed stake).
- Gossip persists a peer book at `DATA_DIR/peers.json`, exchanges peers after hello, and applies dial backoff / temporary bans.

### Referral rules (on-chain)

- Self-referral запрещён; реферер на join должен быть `joining` или `active`.
- `referredBy` фиксируется один раз при join.
- Если реферер inactive в момент epoch — весь reward остаётся рефералу.
- Параметр сети: `NetworkConfig.referralShare` (default `0.05`, clamp 0–0.2). В `RewardDistribution.referralPayouts` — суммы бонусов за эпоху.

## API (кратко)

- `GET /health`, `GET /health/details`, `GET /metrics`, `GET /snapshot`
- Explorer: blocks / transactions / search / address / accounts
- `GET /governance/proposals`
- `GET /rewards/latest`, `GET /rewards/history`
- `POST /tx`, `POST /bootstrap`
- `POST /faucet/fund` (dev / token)
- `POST /security/report` (evidence)

Полный список: `/docs`, `GET /` или OpenAPI `GET /openapi.yaml`.

## SDK

```ts
import { PeopleClient, generateKeyPair } from "@people/sdk";

const client = new PeopleClient({ baseUrl: "http://localhost:4001" });
const key = generateKeyPair();
await client.fundFromFaucet(key.address, 200);
await client.joinValidator(key.privateKey, 120, "light", 0, "0xReferrer...");
const account = await client.getAddress(key.address);
await client.sendTransfer(key.privateKey, {
  to: "0xabc...",
  amount: 5,
  nonce: account.nonce,
  fee: 0.1,
  memo: "Invoice #42"
});
await client.sendBatchTransfer(key.privateKey, {
  nonce: account.nonce + 1,
  fee: 0.145,
  recipients: [
    { to: "0xaaa...", amount: 10, memo: "Salary" },
    { to: "0xbbb...", amount: 5, memo: "Bonus" }
  ]
});
const metrics = await client.getMetrics();
```

`joinValidator(privateKey, stake, nodeKind, nonce?, referrer?)` — опциональный `referrer` попадает в `payload.referrer`.

### Memo

- Одиночный перевод: `payload.memo` относится к этому платежу.
- Массовый перевод (`payload.recipients`): memo задаётся **у каждого получателя** (`recipients[].memo`), общий `payload.memo` запрещён.
- Лимит memo: 256 символов на платёж.
- В batch до 50 платежей в одной tx, одна комиссия на пакет.

### Комиссии (fee market)

- При сборке блока mempool сортируется по **убыванию fee** (при равенстве — раньше по времени).
- Зависимые tx (fund → join) в том же блоке всё ещё проходят за счёт multi-pass.
- Рекомендуемая комиссия: `metrics.suggestedTransferFee` (база 0.004875 PPL, Solana-aligned; растёт от median pending fees и размера mempool). В кошельке подставляется автоматически.

### Хранение и prune

- В RAM и в `snapshot` держится окно последних блоков (`CHAIN_WINDOW_BLOCKS`, по умолчанию 500) + genesis.
- На диске prune удаляет старые `block:` / `tx:` / `blockhash:` и лишние `checkpoint:` (оставляет ~`CHECKPOINT_KEEP` последних).
- Checkpoint каждые 100 блоков — **компактный** (accounts/validators + tip), без полной истории блоков.
- Метрики: `chainWindowBlocks`, `prunedBeforeHeight`.

## Тесты / CI

```bash
npm test
npm run typecheck
```

GitHub Actions: typecheck + build + tests + 3-node chaos smoke (partition catch-up + peer book).

## Структура

```
apps/node          Fastify API + нода
apps/web           React + Vite
apps/mobile-lite   CLI light-validator
packages/core      chain logic, crypto, storage, rewards/referrals
packages/protocol  типы
packages/p2p       gossip
packages/sdk       HTTP + signing
```

## Устранение проблем

- `ECONNREFUSED :4001` — нода не запущена (`npm run dev` / `npm run stop` затем снова).
- `EADDRINUSE` — `npm run stop`.
- Vite на `:3001` — порт 3000 занят.
