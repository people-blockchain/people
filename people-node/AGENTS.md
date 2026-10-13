# AGENTS.md — контекст для ИИ-агентов

> **Legacy OVN documentation.** People's Blockchain current native asset is **People / PPL** (`ppl`). Vallis (`VLS`) in this file is the original OVN token name. Root `AGENTS.md` and `docs/` win for People's Blockchain.

Этот файл — канонический обзор репозитория **Open Validator Network (OVN)** для агентов и людей. Читать перед правками протокола, ноды, SDK или веба. Пользовательские ответы в чате — **на русском**, если не попросили иначе. Публичный человеческий README: [`README.md`](README.md). OpenAPI: [`docs/openapi.yaml`](docs/openapi.yaml).

> Не путать с корневым `SKILL.md` (если появится) — это сторонний Apple Design skill, к OVN не относится.

---

## 1. Продукт в одном абзаце

**Open Validator Network** — монорепо облегчённого публичного блокчейна + веб-панели. Исторический токен OVN — **Vallis (`VLS`)**. Текущий native People's Blockchain — **People (`PPL`)**.

Консенсус: **leader-based PoS** (не Tendermint / не BFT). Один proposer на слот, блоки ~каждые **3s**, финализация по **attestation quorum** (`attestationFinalityThreshold`, по умолчанию **0.67**). Это production MVP / public-devnet.

---

## 2. Монорепо и пакеты

```
apps/node          @ovn/node         Fastify HTTP + WS + NodeService loop
apps/web           @ovn/web          React 19 + Vite PWA
apps/mobile-lite   @ovn/mobile-lite  CLI light-validator
packages/protocol  @ovn/protocol     только типы (TxType, Block, NetworkConfig, …)
packages/core      @ovn/core         chain logic, crypto, LevelDB, keystore, rewards
packages/p2p       @ovn/p2p          GossipNetwork (WebSocket gossip)
packages/sdk       @ovn/sdk          HTTP client + signing (browser-safe, без LevelDB)
scripts/           ci-smoke, stop-dev
docs/openapi.yaml
docker-compose.yml (+ docker-compose.prod.yml)
.github/workflows/ci.yml
```

### Граф зависимостей

```
protocol (no deps)
   ↑
   ├── core   (+ @noble/secp256k1, @noble/hashes, level)
   ├── p2p    (+ ws)
   └── sdk    (+ @noble/*)     ← НЕ зависит от core

node        → core, p2p, protocol, fastify, ws
web         → sdk, react, react-router (+ локальные noble-хелперы)
mobile-lite → core, protocol, sdk
```

### Критично: `dist/`, не `src/`

У пакетов `"main": "dist/index.js"`, `"types": "dist/index.d.ts"`, `"type": "module"`. Воркеспейсы резолвят **собранный `dist/`**.

После изменений в `protocol` / `core` / `sdk` / `p2p` обязательно:

```bash
npm run build
# или точечно: npm run build --workspace @ovn/protocol && …
```

`turbo.json`: `build` → `dependsOn: ["^build"]`; `test` → `dependsOn: ["^build"]`.

`data/` в `.gitignore` — LevelDB и peer book; **не коммитить**.

---

## 3. Команды

```bash
npm install
npm run build
npm run dev          # node + web  → :4001 API, :3000 site
npm run dev:all      # + mobile-lite
npm run stop         # scripts/stop-dev.sh
npm test
npm run typecheck
npm run ci:smoke     # 3-node chaos + SDK smoke
```

Docker:

```bash
docker compose up --build
# prod overlay (данные на хосте ./data/node-1|2):
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

**Не** делать `docker compose down -v` на проде — `-v` сносит volumes с цепочкой.

---

## 4. Консенсус и жизненный цикл цепи

Источник истины: [`packages/core/src/index.ts`](packages/core/src/index.ts), цикл ноды: [`apps/node/src/node-service.ts`](apps/node/src/node-service.ts).

### Константы / DEFAULT_CONFIG

| Параметр | Значение |
|----------|----------|
| `chainId` | `ovn-devnet` (или `CHAIN_ID`) |
| `minStake` | `100` |
| `warmupEpochs` | `2` |
| `unbondingEpochs` | `2` |
| `lightValidatorWeightMultiplier` | `0.5` |
| `epochBaseIssuance` | `50` |
| `attestationFinalityThreshold` | `0.67` |
| `referralShare` | `0.05` (clamp 0–0.2 при выплате) |
| `DEFAULT_BLOCK_INTERVAL_MS` | `3000` |
| `MAX_TRANSACTIONS_PER_BLOCK` | `100` |
| Epoch boundary | каждые **10** блоков (`height % 10 === 0`) |
| `SLASH_FRACTION` | `0.25` |
| `SLASH_REPORTER_SHARE` | `0.1` |
| `SLASH_JAIL_EPOCHS` | `5` |
| `CHAIN_WINDOW_BLOCKS` | env, default `500` |
| `CHECKPOINT_INTERVAL` | `100` |
| `CHECKPOINT_KEEP` | env, default `5` |

### Proposer

`selectProposer(state, slot?)` — взвешенный по active stake; seed `(slot ?? headHeight+1) % totalStake`. Нет active → `"bootstrap-validator"`.

### Блок

`buildBlock`:

1. Mempool сортируется `compareMempoolPriority` (больше `fee` раньше; при равенстве — раньше `timestamp`).
2. Multi-pass применение tx (зависимости nonce в одном блоке).
3. `stateRoot` → push block.
4. На `height % 10 === 0`: `state.epoch += 1`, `activateValidators` (warmup).

### NodeService.tick

Каждые ~3s:

- Propose, если локальный валидатор = proposer (или bootstrap).
- Иначе учёт miss → `recordMissedProposal` после `2 * interval`.
- После propose: gossip block, auto-attest, на epoch boundary — rewards + prune.
- Catch-up каждые ~8s; offline validators через `markOfflineValidators` (~10 мин idle).

### Finality

`updateFinality`: вес attestations / weighted active stake ≥ threshold; contiguous (без дыр). Payload attestation: `{ headerHeight, blockHash, kind? }`. Конфликт attestations → auto-slash в `applyTransaction`.

### Fork / remote

`tryApplyRemoteBlock`, `chooseFork` (длиннее валидная цепь), `chooseForkWithCheckpoint` + `replayChainFromCheckpoint`.

### Prune

- RAM / snapshot: окно `CHAIN_WINDOW_BLOCKS` (`trimChainWindow`).
- Диск: compact checkpoint каждые 100 блоков; `pruneBefore` удаляет старые `block:` / `tx:` / `blockhash:` и лишние checkpoint (оставить `CHECKPOINT_KEEP`).

---

## 5. Типы транзакций и payload

`TxType` в [`packages/protocol/src/index.ts`](packages/protocol/src/index.ts):

`transfer` | `joinValidator` | `leaveValidator` | `unstake` | `attestation` | `slashEvidence` | `proposal` | `vote`

| Type | Важно |
|------|--------|
| `transfer` | Single: `to`, `amount`, опц. `payload.memo` (≤256). Batch: `to: "batch"`, `payload.recipients[]` `{to,amount,memo?}` ≤50; **запрещён** общий `payload.memo`. |
| `joinValidator` | `to: "staking_pool"`, `amount` ≥ minStake; `payload.nodeKind` `"full"\|"light"`; опц. `payload.referrer` → `Validator.referredBy` (один раз). Self-ref запрещён; referrer должен быть `joining` или `active`. |
| `leaveValidator` | → `unbonding`, `unbondingEpoch = epoch + unbondingEpochs` |
| `unstake` | после unbonding; stake → balance; `inactive` |
| `attestation` | `payload.headerHeight`, `payload.blockHash` |
| `slashEvidence` | `double_sign` \| `conflicting_attestation`; `validator`, `height`, `blockHashA/B`, опц. `reporter` |
| `proposal` | `payload.params`: `minStake` \| `epochBaseIssuance` \| `lightValidatorWeightMultiplier` |
| `vote` | `payload.proposalId`, `payload.support`; quorum 50% active stake |

Комиссии batch: `BATCH_FEE_BASE=0.004875`, `PER_EXTRA=0.000244`, `CAP=0.024375` (масштаб от transfer tariff). Default transfer fee `0.004875` PPL. Рекомендация: `suggestedTransferFee` / metrics `suggestedTransferFee`.

Путь применения: `enqueueTransaction` (verify sig) → mempool → `applyTransaction` в блоке.

Подпись: secp256k1; канонический JSON tx **без** `signature`/`publicKey`; адрес = `0x` + первые 40 hex от `sha256(compressedPubkey)`.

Dev faucet: `DEV_FAUCET_PRIVATE_KEY` задаётся локально, never commit. Genesis balance `1_000_000`. Только для devnet.

---

## 6. Награды и рефералы

Функция: `distributeEpochRewards(state, config, feePool)` в core.

**Когда:** в `tick()` после блока на границе эпохи (`height % 10 === 0`).

Алгоритм:

1. Только `status === "active"`.
2. `totalReward = epochBaseIssuance + feePool`.
3. Вес = `stake * uptimeScore * attestationScore * nodeWeight` (light × `lightValidatorWeightMultiplier`).
4. Referral: если у валидатора есть `referredBy` и реферер **active**, cut = `rawReward * referralShare` уходит рефереру; учитывается в `RewardDistribution.referralPayouts`.
5. **Баланс обновляется сразу**: `ensureAccount(address).balance += amount` — это **не** отдельная user transfer-tx в mempool/истории переводов. Валюта — нативный **PPL**.
6. Нода: `recordEpochReward`; `feePool = 0` если что-то выплатили.

`feePool` растёт при `submitTransaction` (`+= tx.fee`), когда tx попадает в mempool.

Если реферер inactive в момент epoch — весь reward остаётся рефералу.

---

## 7. HTTP / WebSocket API (нода)

Файл: [`apps/node/src/index.ts`](apps/node/src/index.ts). Default `PORT=4001`, gossip `PORT+1`.

**GET:** `/`, `/health`, `/health/details`, `/ready`, `/metrics`, `/metrics/prometheus`, `/security/slash-candidate`, `/openapi.yaml`, `/chain/head`, `/snapshot`, `/blocks`, `/blocks/:height`, `/transactions`, `/transactions/:id`, `/search?q=`, `/address/:address`, `/address/:address/transactions`, `/accounts`, `/chain/config`, `/validators`, `/rewards/latest`, `/rewards/history`, `/governance/proposals`

**POST:** `/tx`, `/bootstrap`, `/faucet/fund`, `/security/report`

**WS `/ws`:** при коннекте — `hello` (tokenSymbol `PPL`, tokenName `People`), `snapshot`, `metrics`, `feed`, `rewards`. Live: `snapshot|metrics|feed|block|rewards|tx|slash_candidate`. Client `ping` → `pong`.

Vite proxy: `/api` и `/ws` → нода.

---

## 8. Storage (LevelDB)

`ChainStore` → `{DATA_DIR}/chain.db`.

| Key | Value |
|-----|--------|
| `snapshot` | PersistedSnapshot (trimmed chain) |
| `block:{height}` | block JSON |
| `blockhash:{hash}` | height |
| `tx:{id}` | tx + block meta |
| `addr:{lc}:txs` | список id (cap ~500) |
| `checkpoint:{height}` | compact state |
| `meta:head`, `meta:epoch` | числа |

Peer book: `{DATA_DIR}/peers.json` (P2P).

---

## 9. P2P gossip

[`packages/p2p/src/index.ts`](packages/p2p/src/index.ts) — `GossipNetwork`.

`WireMessage.type`: `hello` | `tx` | `block` | `request_blocks` | `blocks_response` | `inv` | `getdata` | `peers`

Peer book, обмен пирами после hello, dial backoff, ban ~10 мин, maxPeers ~32, reconnect ~5s. Publish tx/block через `inv` + `getdata`.

---

## 10. SDK (`@ovn/sdk`)

[`packages/sdk/src/index.ts`](packages/sdk/src/index.ts)

- Crypto: `generateKeyPair`, `keyPairFromPrivateKey`, `addressFromPublicKey`, `signTransaction`
- `OvnClient` + `OvnApiError`; опц. `x-api-token`
- Reads: health, metrics, head, snapshot, config, blocks/txs, search, address, validators, proposals, rewards
- Writes: `submitTx`, `sendTransfer`, `sendBatchTransfer`, `fundFromFaucet`, `joinValidator(privateKey, stake, nodeKind, nonce?, referrer?)`, `leaveValidator`, `unstake`, proposal/vote, `reportSecurity`, `getJoinBundle`
- Memo/fee helpers зеркалят правила core

---

## 11. Web (`@ovn/web`)

### Маршруты (`App.tsx`)

`/` landing · `/wallet` кабинет/earn hub · `/validators` launch/join · `/staking` · `/governance` · `/light` PWA validator · `/docs` · `/explorer` · `/pricing` · `/roadmap` · `/block/:height` · `/tx/:id` · `/search` · `/address/:address`

Primary nav: flat links with visual weight — Wallet/Launch/Light/Explorer primary, other links secondary + separator; search + nav on a second row; mobile hamburger.

### Контексты (порядок)

`PrefsProvider` → `NotifyProvider` → `LiveProvider` → `WalletProvider`

| Context | Файл | Роль |
|---------|------|------|
| Prefs | `PrefsContext.tsx` | `en`/`ru`, theme; default theme light; lang из browser `ru*` |
| Notify | `NotifyContext.tsx` | модалки `notify` / error / success / info (не inline banners) |
| Live | `LiveContext.tsx` | WS live state |
| Wallet | `WalletContext.tsx` | session, lock, pending key reveal |

i18n: [`apps/web/src/i18n.ts`](apps/web/src/i18n.ts) — полные `en` + `ru`.

### Рефералы на вебе

[`apps/web/src/referral.ts`](apps/web/src/referral.ts):

- Capture `?ref=0x…` → `sessionStorage` (`ovn-referrer`)
- Share path: `/wallet?ref=<addr>` (гость создаёт/подключает кошелёк)
- При `openSession` — `bindPendingReferrer` в `localStorage` (`ovn-referrer-bindings`, first wins)
- Launch наследует через `inheritReferrerBinding` / `resolveJoinReferrer` → `joinValidator`
- On-chain `referredBy` по-прежнему только в момент join; клиентская привязка переживает вкладку
- Кабинет: invite link, guest-bound banner, count / `referralPayouts`

### Custody на вебе

- Кошельки: `walletStorage.ts` — AES-GCM + PBKDF2 (`encryptedPrivateKey`, опц. `encryptedMnemonic`).
- Seed: BIP39 12 слов → BIP32 `m/44'/60'/0'/0/0` (`seedPhrase.ts`); confirm quiz при create; export backup из кабинета.
- Light/Launch devices: `devices.ts` + `DeviceVaultContext` — только `encryptedPrivateKey` на диске; ключ в RAM после unlock; legacy plaintext → миграция перед attestation.

### Light / PWA

`/light` — browser light-validator; SW `public/sw.js` (shell cache; API/WS network-only); manifest; иконки в `public/icons/`.

`/status` — честный network status (Devnet/Testnet badge, active validators, finalized, lag, quorum). `networkEnv.ts` классифицирует `chainId`; faucet/demo price скрыты или помечены вне mainnet.

`/staking` и `/earn` — экран «Доходность» (stake, uptime, attestation, share, forecast/realized APR). `/validator/:address` — публичный профиль. Launch: сценарии phone/PC/server + readiness checklist.

### UX-соглашения (текущие)

- Ошибки/успехи — через Notify modal (centered), не постоянные banners.
- Wallet tabs (Account | Send | History) — segmented chrome **внутри** карточки.
- Staking: APR ≠ share hint; unbonding/claimable; связи с cabinet/Light.
- Offline notify — один раз из SiteLayout.

---

## 12. Env (нода) — кратко

`PEER_ID`, `PORT`, `GOSSIP_PORT`, `DATA_DIR`, `BOOTSTRAP_PEERS`, `CHAIN_ID`, `NODE_ENV`, `DEV_API_TOKEN`, `ALLOW_DEV_ENDPOINTS`, `ALLOW_FAUCET`, `FAUCET_RATE_LIMIT`, `CORS_ORIGIN`, `BIND_HOST`, `PUBLIC_API_URL`, `PPL_PRICE_USD` (alias `VLS_PRICE_USD`), `CHAIN_WINDOW_BLOCKS`, `CHECKPOINT_KEEP`, `VALIDATOR_ADDRESS`, `VALIDATOR_PRIVATE_KEY`, `MEMPOOL_MAX_SIZE`, `WS_*`.

Compose: `node` (4001/4002, faucet on), `node-2` (4011/4012, bootstrap peer, faucet off), `web` (3000).

---

## 13. Тесты — куда смотреть

| Файл | Что покрывает |
|------|----------------|
| `packages/core/src/index.test.ts` | консенсус, rewards, referrals, batch, slash, prune, fork |
| `packages/sdk/src/index.test.ts` | клиент / подпись |
| `packages/p2p/src/index.test.ts` | gossip |
| `apps/node/src/node-service.test.ts` | tick / propose |
| `apps/node/src/api.integration.test.ts` | HTTP |
| `scripts/ci-smoke.sh` + `ci-smoke-sdk.ts` | multi-node |

CI: typecheck, lint, build, test, PWA assets check, smoke.

---

## 14. Правила для агентов при правках

1. **Сначала** прочитать этот файл + релевантный `src` пакет; не выдумывать BFT/Tendermint-модель.
2. Меняя типы в `protocol` — обновить core + sdk + web/node consumers и **пересобрать `dist/`**.
3. Реферальные выплаты — balance credit в epoch rewards, **не** отдельная transfer-tx.
4. Не коммитить `data/`, `node_modules`, `dist` (gitignore), `apps/web/dev-dist/` (локальный Vite PWA cache), секреты.
5. Не трогать git config; коммиты/push — только по явной просьбе пользователя.
6. На старых Git без `--trailer` обычный `git commit` может падать из-за wrapper/hook — тогда `write-tree` + `commit-tree` + `update-ref` (без `--no-verify` без просьбы).
7. UI: следовать существующему visual language OVN; не тащить generic purple/AI-landing клише; ответы пользователю — по-русски.
8. Минимальный diff: не рефакторить «заодно», не писать markdown без запроса (кроме случаев вроде этого AGENTS.md).
9. Локальный crypto/memo на вебе (`txCrypto.ts`, `txMemo.ts`) держать согласованным с `@ovn/sdk` / core.
10. `DEV_FAUCET_PRIVATE_KEY` задаётся локально, never commit. Не использовать как production custody.

---

## 15. Типичные задачи → точки входа

| Задача | Где править |
|--------|-------------|
| Новый TxType / поле Validator | `protocol` → `core` apply/build → `sdk` → web forms → rebuild |
| Награды / referralShare | `distributeEpochRewards`, tests в `core/index.test.ts`, UI Wallet earn |
| Финальность / attestation | `updateFinality`, LightPage, NodeService auto-attest |
| Fee market | `compareMempoolPriority`, `suggestedTransferFee`, metrics |
| Prune / storage | `ChainStore`, `trimChainWindow`, env `CHAIN_WINDOW_*` |
| API route | `apps/node/src/index.ts` + OpenAPI + DocsPage при необходимости |
| Live UI | `LiveContext`, SiteLayout chips |
| i18n строка | `apps/web/src/i18n.ts` (en **и** ru) |
| P2P | `packages/p2p`, peers.json, BOOTSTRAP_PEERS |

---

## 16. Чеклист перед PR / коммитом

- [ ] `npm run typecheck` / `npm test` для затронутых пакетов
- [ ] `dist` пересобран, если менялись packages/*
- [ ] Рефералы/rewards: тесты на cut и inactive referrer
- [ ] i18n: обе локали
- [ ] Нет `data/` и секретов в diff
- [ ] README обновлён только если меняется публичный контракт/онбординг (и по просьбе)

---

*Обновлять этот файл при существенных изменениях протокола, консенсуса, API или продуктовой модели (earn/referrals/PWA).*

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
