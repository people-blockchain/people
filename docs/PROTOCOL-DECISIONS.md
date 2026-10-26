# Protocol decisions

Операционный реестр. Фазы A–C — решения того задания. Раздел учёта Growth Pool ниже повторяет уже одобренные тождества Model A и не вводит новых констант. Экономические константы отсюда не выводятся. Нет молчаливого default.

Если строка ниже расходится с прежней protocol-mechanic в `docs/growth-referral-protocol-v0.1-proposal.md`, действует эта страница. Старое правило не применяется параллельно.

## IMPLEMENTATION DECISIONS

Основатель делегировал решения ниже. Это **решения реализации**, подлежащие последующему аудиту. Они **не** были в исходной модели с первого дня. Старая формула `70×isqrt(C) + 20×isqrt(N) + 100×S` этими строками **заменена** и параллельно не считается. Кепы, claim D, FORFEIT, эпоха 201600, graph depth 2 (только L1/L2), созревание 1 эпоха, определение age и ворота L2 этой записью не меняются. Активные веса выплаты Beta (L1=70, L2=30) записаны в Settlement ниже. Settlement и Claim D новых fee-split процентов не вводят.

| Решение | Правило | Статус |
| --- | --- | --- |
| Score | `min(1000, 40×C + 14×N)`. Только целое. `S` остаётся 0 и в сумму не входит. Float нет. `isqrt` нет. При `C = 5`, `N = 6` score = 284. При `C = 4`, `N = 4` score = 216 | IMPLEMENTATION DECISION, subject to audit |
| `C` | Growth Epoch считается один раз, если у участника был хотя бы один успешный transfer в блоке с `fee > 0` контрагенту, который не self и не является единственным прямым реферером. Несколько таких transfer в одной эпохе дают +1. Validator stake, attestation, join и производство блока не считаются. Регистрация, клик и idle не считаются | IMPLEMENTATION DECISION, subject to audit |
| `N` | Growth Epoch считается один раз, если участник платит token-launch fee или curve trading fee и комиссия eligible и применена. Обычный transfer `N` не увеличивает. Те же исключения для операций валидатора. Одна эпоха не больше +1 | IMPLEMENTATION DECISION, subject to audit |
| Live fee split | Включён. `GROWTH_FEE_SPLIT_ACTIVE = true`. Обычный блок режет eligible fee как Model A: validators 30, community pool 25, treasury 20, liquidity & ecosystem 10, growth pool 15, burn 0. Целый `floor` по каждому компоненту отдельно. Остаток деления остаётся в доле валидаторов. Новые единицы не создаются. Если активных валидаторов нет, эта доля, уже включая остаток, зачисляется в treasury — тот же запасной путь, что был у `routeTradingFee` | IMPLEMENTATION DECISION, subject to audit |
| Native asset identity | Runtime id `ppl`, name People, symbol PPL. Legacy snapshot/tx alias `vls` is load- and apply-time remapped; not a second live asset | IMPLEMENTATION DECISION (owner brand decision). Does not change Growth percentages, depth, Claim D, or caps |
| EVM contracts (`contractDeploy` / `contractCall`) | Optional Solidity execution beside the built-in Token/NFT factory. Runtime is **`@ethereumjs/evm` (Shanghai, deterministic env)**. Contract code+storage is hashed in `stateRoot` (coordinated node upgrade). Gas is prepaid in PPL at consensus constant **`APPROVED_CONTRACT_GAS_PRICE_PPL` = 8.7e-7** PPL/gas (no per-node env override on validation paths). Typical ERC-20-class deploy ~1.2e6 gas ≈ **1.044** PPL. Eligible `tx.fee`, including fractional gas quotes, follows Model A in integer micro-PPL (owner-approved 2026-09-30). Website `/create/contract` and `/fees` show the approved tariff; natural-language mapping onto reviewed OpenZeppelin-based templates; freeform codegen off unless `CONTRACT_AI_FREEFORM`. No change to Growth L1=70/L2=30, depth=2, pool 15%, Claim D, caps | IMPLEMENTATION DECISION, subject to audit. **Requires coordinated node upgrade.** Owner-approved public gas tariff **2026-09-29** (see `docs/SMART-CONTRACTS-REPORT.md`) |
| Public PPL tariffs | Owner-approved **2026-09-29**: ordinary transfer default `DEFAULT_TRANSFER_FEE` **0.004875** PPL; token create minimum **1.045005**; NFT mint minimum **2.925**. Batch scales (`BATCH_FEE_BASE` 0.004875, per-extra 0.000244, cap 0.024375). Factory tariff settings are bound into the v2 genesis identity; nodes must use identical settings. Fractional eligible `tx.fee` follows Model A in integer micro-PPL (owner-approved 2026-09-30). Growth L1=70/L2=30, depth=2, pool 15%, Claim D, caps unchanged. Public UI shows PPL only | APPROVED public tariff (owner, 2026-09-29). Not a Growth split change |
| Minimal NFT mint/transfer | Tx types `nftMint` and `nftTransfer`. Unique records in `ChainState.nfts` (id, owner, creator, name, description, imageUri, optional collectionId). `tx.fee` is paid in PPL; mint minimum is `NFT_MINT_MIN_FEE`. Eligible `tx.fee` follows protocol_tx_fee Model A routing in integer micro-PPL. Separate `nftFee` amounts stay ineligible for Growth. Mint does not increment Growth `N`. Including `nfts` in `computeStateRoot` requires a coordinated node upgrade | IMPLEMENTATION DECISION, subject to audit. Not a new Growth split |
| Optional creator promo share | Token launch may set aside an extra promo share of **0 / 500 / 1000 bps** of total supply (nothing else is accepted: `CurveMath.InvalidPromoBps`). **0 is the default and is behaviour-identical to the fixed 60/15/10/10/5 split** — same numbers, same transfers, same events. The share is taken **only from the bonding-curve portion** (60% -> 55% -> 50%); the mandatory 10% Community Pool, the 15% creator allocation, the 10% liquidity reserve and the 5% ecosystem reserve are unchanged, so promotion budget is paid out of the creator's own market inventory and never out of participants' or protocol-reserved buckets. Promo tokens go to the ownerless `PromoRewardsVault`, not to the creator: only the creator may award, never to themselves or a protocol address; one recipient is capped at `PROMO_RECIPIENT_CAP_BPS` = **1000 bps of the pool** across at most 16 awards; each award unlocks 10% upfront and vests linearly over 180 days (same shape as creator vesting); awards only inside a **180-day window**, after which **anyone** may call `returnUnused` and every unawarded token is credited to that token's Community Pool — nothing returns to the creator. Implemented in the Solidity Token Factory, the website EVM launch form **and** node-side `applyTokenCreate` (PR #299), the latter behind the coordinated activation height `PROMO_SHARE_UPGRADE_HEIGHT` / `NetworkConfig.promoShareUpgrade` — see `docs/protocol-decisions/promo-share.md`. Below the height, or unset, the node keeps the fixed 60/15/10/10/5 split and **ignores** `promoBps`, so historical blocks replay byte-identically; `promoPools` is hashed in `computeStateRoot` only while non-empty and the schedule is stripped from the genesis root, so scheduling the upgrade does not move genesis. The node-side pool runs on block heights (`PROMO_VESTING_BLOCKS` = `PROMO_WINDOW_BLOCKS` = 5,184,000 blocks ≈ 180 days at 3 s/block, the creator-vesting horizon) because a state transition has no trusted wall clock; each pool stores its own duration/window. Three new tx types `promoAward` / `promoClaim` / `promoReturn` carry the existing `DEFAULT_TRANSFER_FEE` and follow Model A — no new tariff. `protocolVersion` remains **2**. **Requires a coordinated node upgrade** before any promo launch. No new PPL issuance, no change to Model A 30/25/20/10/15/0, Growth L1=70/L2=30, depth=2, pool 15%, Claim D or caps | APPROVED promo-share option (owner, **2026-10-13**). Per-recipient cap (1000 bps of pool), 16-award bound and 10% upfront + 180-day linear vesting APPROVED (owner, **2026-10-16**, PR #298; see `docs/TOKEN-ECONOMY.md` §4a) |
| AMM v0.1 constant-product pools | Tx types `ammCreatePool`, `ammAddLiquidity`, `ammRemoveLiquidity`, `ammSwap`. Token/PPL pairs only (`NATIVE_ASSET_ID` = `ppl`). Integer/bigint math, floor rounding in the pool's favour, `x * y = k` non-decreasing. Swap LP fee is existing testnet baseline `AMM_FEE_BPS = 30` (0.30%) **kept in the pool**; it is **not** Growth-eligible (`docs/ECONOMIC-MODEL-v0.1.md` §8). Protocol `tx.fee` stays `DEFAULT_TRANSFER_FEE` **0.004875** PPL and follows Model A 30/25/20/10/15/0. No new public tariffs. First mint locks `AMM_MINIMUM_LIQUIDITY = 1000` LP shares. Curve `executeMigration` still writes a locked pool **without** LP fields (historical `stateRoot`). LP accounting bootstraps on first add/remove. `AMM_ACTIVATION_HEIGHT = 0`; `protocolVersion` remains **2**. Historical blocks contain no AMM txs, so genesis replay is unchanged. **Requires coordinated node upgrade** before any AMM tx is submitted | IMPLEMENTATION DECISION, subject to audit. Reuses approved Model A routing and the existing 30 bps testnet AMM fee baseline. Final mainnet AMM fee remains `TBD` per `TOKEN-ECONOMY.md` §21 |

`C` и `N` пишутся в применении блока, не из mempool и не из failed tx. Квалификация `isL1Eligible` / `isL2Eligible` возвращает `QUALIFIED` только когда уже утверждённые ворота проходят, включая score. Дополнительных ворот нет. Отдельного prerequisite «сначала L1» у L2 нет.

Eligible fee на живом пути: transfer fee, token launch fee, protocol `tx.fee`, curve trading fee. Не eligible: principal, stake, сумма проектного токена, NFT, AMM swap, promotion, API. Любая eligible комиссия, включая `0.004875` PPL, переводится в целые микро-PPL (1 PPL = 1 000 000 единиц) перед floor-делением Model A. Остаток зачисляется валидаторам. Это одобрено основателем 2026-09-30; прежнее исключение дробных комиссий отменено. Явный `config.feeSplit`, отличный от отсутствующего `LEGACY`, тоже не переписывается в Model A и в Growth Pool не идёт.

Эмиссия эпохи валидаторов (`epochBaseIssuance`) не меняется. Доля fee, которая раньше целиком уходила валидаторам, для классифицированной комиссии теперь режется внутри `applyTransaction` / `routeTradingFee`. Эта сумма в `feePool` повторно не кладётся. Growth Pool пополняется только этой долей уже списанной комиссии. Новые PPL для пула не минтятся. `claimedSettled`, `escrow` и `totalReturned` этот split не двигает.

## Участник и ребро — APPROVED

| Решение | Статус |
| --- | --- |
| Регистрация — явный подписанный переход, только identity. Без fee, stake и reward | APPROVED |
| Аккаунт и валидатор сами не становятся участниками | APPROVED |
| Ребро: один родитель, оба адреса уже Participant, подпись child | APPROVED |
| Self и цикл отклоняются. Ребро immutable. Delete и replace нет | APPROVED |
| Depth > 2 отклоняется и не записывается как depth 2. Max depth = 2 (L1/L2 only) | APPROVED |
| `Validator.referredBy` и `referralShare` не читаются и не меняются этим путём | APPROVED |
| Установка ребра не создаёт награду | APPROVED |
| `linkedAtHeight` — высота блока, который включил ребро. Не growth epoch. Созревание этим полем не считается | APPROVED |

## Замена прежней механики C/N — APPROVED

**Конфликт.** Раньше protocol-mechanic в Growth proposal считала `C` и `N` по successful transfer текущей Growth Epoch: `C` — уникальные контрагенты, `N` — число таких transfer, окно сбрасывается на следующую эпоху.

**Это правило заменено.** Оно больше не действует. Не держать оба определения.

| Имя | Новое определение | Статус |
| --- | --- | --- |
| `C` | Число различных Growth Epoch, в которых был хотя бы один qualifying contribution event. Несколько событий в одной эпохе дают +1. Не число tx, не число рефералов, не активность валидатора | APPROVED |
| `N` | Число различных Growth Epoch, в которых был хотя бы один qualifying network-activity event. То же правило: +1 на эпоху | APPROVED |

Каталоги событий `C` и `N` заданы implementation decision выше. Это не исходный каталог модели. Пока событие не из этого каталога, эпоха не увеличивается.

## Возраст, созревание, пороги — APPROVED

Граница Growth Epoch = **201600** блоков. Высота 0 вне эпохи. Для высоты `h >= 1` номер эпохи `floor((h - 1) / 201600) + 1`. Эпоха `E` занимает высоты `(E - 1) * 201600 + 1 … E * 201600` включительно. Эпоха полностью завершена, когда в цепи есть её последний блок.

| Имя | Определение | Статус |
| --- | --- | --- |
| Age | Число полностью завершённых Growth Epoch с момента регистрации участника. Не wall clock. Простой не сбрасывает. Не зависит от созревания ребра | APPROVED |
| Referral maturation | Один полностью завершённый Growth Epoch **после** `linkedAtHeight`. Считается по высоте и границе 201600. Простой не сбрасывает. Reversal в этой фазе нет | APPROVED |
| L2 | `score >= 280`, `C >= 5`, `N >= 6`, `age >= 4`, ребро созрело. Отдельного prerequisite «сначала L1» нет | APPROVED |
| L1 | Зарегистрирован, есть действительное ребро, ребро созрело по правилу 1 эпохи, `C >= 4`, `N >= 4`, `score >= 180`. Отдельного порога возраста участника нет | APPROVED, с заменой старого порога |

**Замена L1.** В старой модели у L1 было `score >= 180`, `C >= 4`, `N >= 4` и «возраст ребра ≥ 2». Новое решение переопределяет age как возраст участника и maturation как 1 эпоху. Порог «L1 edge age ≥ 2» **заменён** на maturation = 1 завершённая эпоха после высоты включения. Это смена правила, не догадка. Для L1 не вводится participant-age.

## Score — порог APPROVED, веса — IMPLEMENTATION DECISION

Score — качество эпохи, целое. Это не число tx, кликов, рефералов, validator uptime, stake или блоков.

Пороги `score >= 180` и `score >= 280` остаются утверждёнными воротами. Числовые веса `40×C + 14×N` — implementation decision выше, не исходная формула модели. Старая формула `70×isqrt(C) + 20×isqrt(N) + 100×S` в расчёт не берётся.

## Settlement — утверждённый pipeline, IMPLEMENTED

Эпоха 201600. Платятся только L1 (прямой реферал) и L2 (второй уровень). Активные веса выплаты Beta: L1 = 70, L2 = 30, знаменатель активных весов 100. Структура рефералов только L1/L2 (`MAX_PARTICIPANT_REFERRAL_DEPTH = 2`). `B = min(available, reference)`. Эпоха 1: `reference = I`. Дальше floor-среднее предыдущих завершённых inflow, максимум 8. Текущая эпоха в своё среднее не входит. Нулевые эпохи не пропускаются. `totalReturned` в reference не входит.

Порядок: budget → eligible по снимку эпохи → raw = floor(B × weight / weightSum) только для оплачиваемых L1 и L2 → кеп ребра 1% `B` → кеп реферера 5% `B` → окно 8 эпох 2% суммы `B` (expired claim место не освобождает) → равный floor внутри реферера → хвост в пул. Сортировка: referrer, referred, level. Пустой бюджет: allocation не создаётся, FORFEIT, rollover нет. Новой эмиссии нет. `amount > 0` создаёт Claimable и увеличивает escrow в том же переходе. Баланс реферера этот переход не кредитует. Повторный settlement той же эпохи отвергается.

Growth Pool по-прежнему 15% eligible network fees (Model A). Community Pool, Treasury, Validators, Liquidity/Ecosystem не дебетуются этим settlement.

## Claim D — IMPLEMENTED

Запись создаётся как Claimable сразу после settlement. Полный claim реферером переводит её в Settled: баланс увеличивается на `amount`, escrow уменьшается, `claimedSettled` увеличивается. Частичный claim нет. Повтор и replay отвергаются. Чужой адрес отвергается.

Невостребованное возвращается один раз на settlement эпохи `E+4`, до `B`: escrow уменьшается, `totalReturned` увеличивается, статус Returned. Это не новый `I`, reference не растёт, `assigned` эпохи происхождения не уменьшается. Returned и Settled terminal. Это не lock. Новой эмиссии нет.

## NOT YET APPROVED

Не кодировать как рабочее правило и не ставить молчаливый default:

- anti-Sybil;
- wash-детектор;
- S-gate;
- clawback / fraud reversal.

Веса score, каталоги `C`/`N`, включение runtime fee split, settlement и Claim D перенесены выше. Они не становятся утверждением, что так было в модели с первого дня.

## Учёт Growth Pool — APPROVED, live split — IMPLEMENTED

Числа и тождества уже заданы в `docs/ECONOMIC-MODEL-v0.1.md` и `docs/growth-referral-protocol-v0.1-proposal.md`. Эта страница их не заменяет и новых констант не вводит.

| Решение | Статус |
| --- | --- |
| Отдельный bucket. Не Community Pool, не treasury, не validator reward, не burn | APPROVED |
| `totalDebited = claimedSettled + escrow + totalReturned`. `available = totalInflow − totalDebited + totalReturned`. Escrow входит один раз. Возврат не является новым inflow | APPROVED |
| Новой эмиссии нет. Деление только `floor` | APPROVED |
| Eligible: transfer fee, token launch fee, protocol `tx.fee`, curve trading fee. Not eligible: principal, stake, project-token, NFT, AMM, promotion, API | APPROVED |
| Model A: Validators 30 / Community Pool 25 / Treasury 20 / Liquidity & Ecosystem 10 / Growth Pool 15 / Burn 0 | APPROVED как спецификация |
| Включение этого split для eligible fee in integer micro-PPL в обычном блоке | IMPLEMENTATION DECISION, subject to audit. `GROWTH_FEE_SPLIT_ACTIVE = true` |
| Settlement L1/L2, веса 70/30, кепы 1% / 5% / 2%, floor, FORFEIT | IMPLEMENTED. Model A 30/25/20/10/15/0 не менялся. Subject to audit |
| Claim D и возврат через 4 эпохи | IMPLEMENTED. Новых процентов нет. Subject to audit |
| Clawback / fraud reversal | NOT YET APPROVED |


## Исправления безопасности — APPROVED 2026-09-30

Основатель одобрил отдельный bootstrap-ключ и единое распределение дробных комиссий.
Протокол v2 требует подписанного блока от выбранного валидатора; пока активных
валидаторов нет, подпись проверяется по закреплённому `BOOTSTRAP_ADDRESS`.
`BOOTSTRAP_PRIVATE_KEY` хранится только на seed. Подпись транзакции включает `chainId`.
Genesis детерминирован и привязан к конфигурации сети и faucet identity.

Growth ledger (`growthPool`, epoch inflow/budget, assigned, claims), а также
`feeLiquidityEcosystem` хранят **целые микро-PPL**. Счета, API `tx.amount` и `tx.fee`,
Community Pool и Treasury по-прежнему используют PPL. Claim принимает полную сумму
в PPL, сравнивает её с allocation в микро-PPL и конвертирует при кредитовании счёта.
Проценты, веса L1/L2, сроки и кепы не меняются. Пример 4875 микро-PPL:
validators 1464, community 1218, treasury 975, liquidity 487, growth 731, burn 0.

Состояние v1 не совместимо: старые snapshots не мигрируются автоматически.
Перезапуск существующей серверной цепочки, миграция или сброс требуют отдельного
решения и согласованного обновления всех нод. Эта ветка не является Mainnet-ready.

**Original Growth v0.1 text vs live v2 (do not fork the live chain).**
`docs/ECONOMIC-MODEL-v0.1.md` §8 (CLOSED SET) and the public-tariff appendix still
say non-integer fees skip Growth Pool. The running public chain
`people-public-testnet-v2-2026-09-30` (`protocolVersion` 2) splits eligible
fractional `tx.fee` (including transfer `0.004875` PPL and prepaid gas) with
Model A in integer micro-PPL, as in this file (2026-09-30). Integration **keeps
that live rule** so block format and `stateRoot` stay compatible with the archive
seed. Changing routing back to the appendix would desync every node. Amending
the Economic Model identities themselves still needs a founder spec version.
Unchanged: L1=70 / L2=30, depth 2, Growth 15%, Claim D, caps, fee amounts, gas
`8.7e-7` PPL/gas, 10% of standard token supply to the community pool, native PPL.


### Недоступный производитель — APPROVED 2026-09-30

Основатель отдельно одобрил безопасную остановку: локальные wall-clock таймеры
не исключают валидаторов и не меняют их рейтинг/консенсусное состояние.
Если выбранный валидатор недоступен, блоки не выпускаются. Bootstrap не подменяет
активного валидатора. Автоматическая смена производителя требует отдельного
согласованного протокола и в эту реализацию не входит (TBD).

### NFT transfer fractional-fee validation — owner-approved 2026-10-01

`applyNftTransfer` accepts finite nonnegative PPL fees rather than integers only,
consistent with the approved **0.004875 PPL** transfer tariff. Fee routing,
ownership, nonce and balance checks remain unchanged. Negative and non-finite
fees are rejected; regression tests cover fee deduction and ownership updates.
This source change is **not evidence of a deployed node upgrade**. Upgrade all
participating nodes to the reviewed compatible SHA before sending fractional-fee
NFT transfers. Website sending is disabled by default; set server environment
`NFT_TRANSFERS_ENABLED=1` only after that upgrade. Existing data and `CHAIN_ID`
must be preserved. No economic parameters or other transaction rules changed.

### Public node onboarding — APPROVED 2026-09-30

Owner approved public Docker distribution without opening the source repository,
public-only `GENESIS_FAUCET_ADDRESS` for followers, an archive seed retaining blocks
from genesis, and a separate v2 testnet preserving v1 data. Same faucet address
preserves genesis balances/hash. Existing validation, validator selection and economics
remain unchanged. See [public node onboarding](PUBLIC-NODE-ONBOARDING.md) for release
gates, actual implementation and limitations. Approval is not evidence of deployment.

### AMM v0.1 — fee choice, activation, VPS upgrade

**Fee choice (implementation, not a new Model A identity).**
`docs/ECONOMIC-MODEL-v0.1.md` §8 lists AMM swap fees as **not eligible** for Growth.
`docs/TOKEN-ECONOMY.md` §21 already records the testnet AMM fee baseline **30 bps**.
AMM v0.1 therefore:

- keeps **30 bps** of each exact-in swap in the pool as LP fee (`AMM_FEE_BPS`);
- does **not** send that LP fee through Growth or Model A;
- charges the ordinary protocol `tx.fee` = `DEFAULT_TRANSFER_FEE` **0.004875** PPL on AMM txs, routed with the live Model A split **30 / 25 / 20 / 10 / 15 / 0** in integer micro-PPL.

Unchanged: token create **1.045005**, NFT mint **2.925**, transfer **0.004875**, gas **8.7e-7** PPL/gas, Growth L1=70 / L2=30, depth 2, Growth Pool 15%, Claim D, caps.

**Activation / compatibility.** `protocolVersion` stays **2**. `AMM_ACTIVATION_HEIGHT = 0`.
Historical blocks on `people-public-testnet-v2-2026-09-30` contain no AMM txs, so replay of the existing archive is unchanged. Optional LP fields (`totalLpSupply`, `lockedLpSupply`, `lpBalances`) are omitted on load and on `executeMigration`; they appear only after the first add/remove on a pool. Do not inject those fields at snapshot load.

**Mixed versions fork.** An old binary rejects AMM types (`Unsupported transaction type`). All nodes that follow the public testnet head must run the same upgraded SHA **before** any AMM tx is submitted.

**VPS node upgrade (same `DATA_DIR`, no prune, no volume wipe):**

1. Do not submit `ammCreatePool` / `ammAddLiquidity` / `ammRemoveLiquidity` / `ammSwap` until every peer is upgraded.
2. After this change is merged to `main`, on the operator host: `git fetch` and check out the **approved merged SHA** (do not develop on the server).
3. `cd people-node && npm ci && npm run build`.
4. Restart the node process or Compose stack with the same `DATA_DIR`, `CHAIN_ID=people-public-testnet-v2-2026-09-30`, and existing secrets. Do **not** `docker compose down -v`.
5. Confirm `GET /health`, then `GET /liquidity-pools` (empty list is valid). Website `/swap` uses `/api/network/liquidity-pools` and `POST /api/network/tx`.
6. Only then may wallets submit AMM txs. Rollback is the previous approved SHA plus a compatible `DATA_DIR`; there is no hot-reload.

### Critical audit restrictions — APPROVED 2026-10-01

The founder explicitly approved: a testnet validator allowlist (empty by default),
continued safe halt for an unavailable selected producer, block production time
`max(now, prev+1)` and a 15-second future-block acceptance bound, disabling new
validator issuance and governance changes to `epochBaseIssuance` while retaining
fee rewards, and integer micro-PPL curve calculations with rounding against the
trader and the existing 1% fee rounded up to micro-PPL. No arbitrary minimum trade
was approved or introduced.

Implementation uses a common scheduled activation height; historical execution
before it retains legacy economic rules. The public seed upgrade was verified on 2026-10-01 from merged main
`d9c9e36ab2492074fbe88bbb24b05afd3b1960b8`, with activation height **25492**
and an empty validator allowlist. Chain ID, data, genesis and archive were retained. Content-derived transaction IDs and fractional
activity accounting also activate at that height. Native reserves remain PPL in
API/state fields, with atomic curve/migrated-pool calculations recorded by
`nativeScale`; this does not establish a fully integer account ledger.

See [critical audit remediation](AUDIT-CRITICAL-FIXES.md) for implementation scope,
compatibility, validation commands and unresolved C-06/C-08/C-09 design decisions.

### EVM address policy and JSON-RPC (stage 0–1) — APPROVED 2026-10-02

| Decision | Rule | Status |
| --- | --- | --- |
| Address policy **0a** | Ethereum-canonical addresses (`keccak256` of uncompressed secp256k1 pubkey, last 20 bytes) are canonical for new wallets, `eth_*`, and EVM execution. Legacy PEOPLE addresses (`sha256` of compressed pubkey) remain verifiable for historical txs and resolvable via REST (`legacy: true`, `canonicalAddress`). At `EVM_ADDRESS_ACTIVATION_HEIGHT` (currently `2_147_483_647` until a coordinated release sets a real height), nodes merge legacy balances into canonical keys using pubkeys observed on chain. **No** `DATA_DIR` wipe; string `CHAIN_ID` unchanged | APPROVED (owner 2026-10-02), IMPLEMENTED subject to audit |
| EIP-155 numeric chain id | **`97401`** (verified unused on [chainid.network](https://chainid.network/chains.json) 2026-10-02). `eth_chainId` and EVM `CHAINID` opcode use the same constant `EIP155_CHAIN_ID` | APPROVED (owner 2026-10-02), IMPLEMENTED subject to audit |
| JSON-RPC v1 (read-only) | `POST /` and `POST /rpc`, JSON-RPC 2.0 batch, methods: `eth_chainId`, `net_version`, `web3_clientVersion`, `eth_blockNumber`, `eth_getBalance`, `eth_call`, `eth_estimateGas`, `eth_gasPrice`, `eth_getCode`, `eth_getStorageAt`. Native balance unit: **1 wei = 1 micro-PPL** (`EVM_NATIVE_DECIMALS_RPC = 6`). No `eth_sendRawTransaction` in this stage | IMPLEMENTED subject to audit |
| MetaMask / website copy | Production marketing copy and EIP-3085 “Add network” on Vercel **not** updated in this stage | APPROVED scope boundary |

### Cosmos chain economics (M11-2 and related) — APPROVED, IMPLEMENTED subject to audit

Owner decision closing the `docs/M11-2-TREASURY-DESIGN.md` design note and the linked
`skipped: needs decision` rows in `docs/audit-remaining-small.md` (M11-2, M11-4, M11-5, M07-4,
M07-5, M11-7, M10-5). Applies to `chain/` (the Cosmos SDK / `cosmos-evm` chain, build pinned in
`chain/COSMOS_EVM_COMMIT`), `contracts/` (the EVM factory/governance contracts), and the
`people-node` JS chain's bootstrap address, which this task bundled with the others.

| Decision | Rule | Status |
| --- | --- | --- |
| Team vesting | `people_team` (15% of genesis supply) becomes a `ContinuousVestingAccount`: 10% spendable immediately at genesis, the remaining 90% linear over 24 months (`original_vesting` = 90% of the bucket; the account's actual balance is 100%, so the extra 10% is never locked). Owner still must supply the real team-controller key for this address before mainnet — this decision fixes the schedule, not custody | APPROVED (M11-2), IMPLEMENTED subject to audit |
| Treasury / liquidity custody | `people_treasury` and `people_liquidity` (15% + 5% of genesis supply, previously keyless Cosmos module accounts with no code able to move funds) are replaced by one shared 2-of-3 multisig `BaseAccount` (owner, co-founder, owner's cold address). Picked option (b) from the design note (sweep/multisig) over a new gov-gated spend module, because the task is explicit that governance control comes **later**, not now. Config placeholder: `chain/emission/allocation.json` `treasury_multisig` (threshold 2, 3 pubkeys) and the matching Go constant `peoplefees.TreasuryMultisigAddress` — both currently a reproducible **testnet-only** address derived from published seeds (`chain/scripts/derive-treasury-multisig.go`); not secure for real funds. Owner must regenerate both together, from real independently-held keys, before mainnet genesis | APPROVED (M11-2), IMPLEMENTED subject to audit |
| Treasury/liquidity/growth live-fee routing | `RouteModelAFees` sends the 20%/10%/15% Model A shares straight to the multisig account instead of into the module accounts, from height 1 on every new network. An existing (already-running) network upgrades via the `v2-treasury-multisig` gov software-upgrade proposal, which runs `evmd/upgrades.RegisterUpgradeHandler` to sweep whatever balance already piled up in `people_treasury`/`people_liquidity`/`people_growth` to the multisig once | APPROVED (M11-2), IMPLEMENTED subject to audit. **Requires a coordinated upgrade** for any network that predates this change |
| Path to on-chain governance later | Not built now, by design (per the task). The multisig can later `transferOwnership`/move funds to governance (e.g. the `PeopleTimelock` DAO on the EVM side, or `x/gov`'s community pool on the Cosmos side) via a further coordinated upgrade when the owner decides to delegate. The 25% community share already goes to `x/distribution`'s community pool, which already has a native `x/gov` `CommunityPoolSpend` path — no change needed there | APPROVED (M11-2), scope boundary |
| Validator pool payout | `people1yaf2...` (the 200M PPL / 20% validator pool) keeps its existing `PeriodicVestingAccount` genesis layout, but each year's 60M/50M/50M/40M PPL tranche is now laid out as ~365 daily periods instead of one yearly cliff. `peoplefees.StreamValidatorPool` runs every `BeginBlocker` and drains whatever `bank.SpendableCoins` reports as natively unlocked to the validators who signed the previous block — the Cosmos-SDK-native approximation of "paid out per block as a stream" (true per-block vesting would require bypassing the account's own lock check, which was tried, reproduced a chain halt at height 2, and was reverted in favor of this safer design — see the chain commit history for that regression) | APPROVED (M11-2), IMPLEMENTED subject to audit |
| Validator fee share by participation, not stake (M11-4) | The existing 30% live Model A validator share, and the validator-pool stream above, both split equally across whichever validators' votes actually signed the previous block (`cosmossdk.io/core/comet` vote info, `BlockIDFlagCommit`), not by stake. No signature information this block (or nobody signed) falls back to the community pool (fee share) or leaves funds in place (pool stream, since nothing is lost) | APPROVED (M11-4), IMPLEMENTED subject to audit |
| Mainnet genesis prep — well-known mnemonics (M11-5) | `chain/scripts/build-peopled.sh` patches upstream `testnet.go` so the 4 well-known example mnemonics are funded only when `TESTNET_SEED_WELL_KNOWN_ACCOUNTS=1` is explicitly set (default: not funded — the pre-mainnet-safe default) | APPROVED (M11-5), IMPLEMENTED subject to audit |
| Mainnet genesis prep — default commission (M11-5) | Default validator commission from `testnet init-files` is now rate 10% / max rate 20% / max daily change 1% (was 100%/100%/100%, an upstream-example default acceptable only for a throwaway testnet) | APPROVED (M11-5), IMPLEMENTED subject to audit |
| Mainnet genesis prep — bootstrap address in genesis (M10-5) | Unrelated binary (`people-node`, the JS chain), bundled into this task. A joining node now adopts `bootstrapAddress` from the persisted chain state/genesis it loads instead of requiring its own env to already match it byte-for-byte; a brand-new genesis still requires a valid env value since there is nothing to inherit yet. Closes the "two independently-configured operators could each fix a different genesis bootstrap address for the same intended network" gap | APPROVED (M10-5), IMPLEMENTED subject to audit |
| Governance token + timelock (M07-5) | `GovernanceToken`'s 1,000,000 gPPL supply mints to the `PeopleTimelock`, not the deployer; `Deploy.s.sol` has the deployer renounce the timelock's `DEFAULT_ADMIN_ROLE` once the governor's proposer/canceller roles are wired, so no EOA keeps standing control of the DAO after deploy | APPROVED (M07-5), IMPLEMENTED subject to audit |
| Community/ecosystem reserve withdrawal (M07-4) | `CommunityTokenVault` and `BondingCurveMarket`'s per-token `ecosystemReserve` (both previously had funds flow in with no code able to move them out) gain an `onlyOwner` withdraw function. Owner is a new minimal `PeopleMultisig` (2-of-3, EVM-side, independent of the Cosmos-side multisig above — different address space) deployed by `Deploy.s.sol` from `TREASURY_MULTISIG_OWNER`/`_COFOUNDER`/`_COLD` env (defaulting to the deployer on a non-mainnet deploy only). Same "governance later" shape as the Cosmos side: `Ownable.transferOwnership(address(timelock))` is the documented handoff, not built now | APPROVED (M07-4), IMPLEMENTED subject to audit |
| Module-account permission validation (M11-7) | `validate-emission-genesis.py` now asserts: `people_sale`/`people_growth` (the module accounts still present at a fresh genesis) carry no `Minter`/`Burner` permission; `people_treasury`/`people_liquidity` no longer exist as module accounts at all; the team/multisig/validator-pool account shapes above match `allocation.json` exactly | APPROVED (M11-7), IMPLEMENTED subject to audit |

Unchanged by this decision: Model A's 30/25/20/10/15/0 split itself, Growth Pool mechanics
(that pool lives in `people-node`, not `chain/`), `sale` bucket custody (still owner-pending,
out of scope here), and every EVM address / JSON-RPC / AMM / contract-gas decision recorded
above.
