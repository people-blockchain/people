# Growth / Referral Protocol v0.1 — Architecture Proposal

## STATUS

**Historical proposal.** Active Beta Growth/Referral payout weights are **L1 = 70**, **L2 = 30** of the Growth reward budget. Runtime referral structure is **L1/L2 only** (`MAX_PARTICIPANT_REFERRAL_DEPTH = 2`); there are no L3–L5 graph edges and no unpaid-level weights. Current native asset is **PEOPLE / PPL** (`ppl`); `vls` / Vallis mentions below are historical audit of an older tree. See `docs/PROTOCOL-DECISIONS.md` and `docs/ECONOMIC-MODEL-v0.1.md`. Do not treat the 50/25/15/7/3 figures or depth-5 compatibility notes below as the live Beta model.

- Документ = **APPROVED / Growth / Referral Protocol v0.1** (architecture; payout weights superseded as above)
- Economic Model v0.1 = **не изменялся**. Источник параметров: `docs/ECONOMIC-MODEL-v0.1.md` на `main`
- Runtime, consensus, fees, contracts, economics = **не изменялись**
- Production protocol = **NONE**
- Код протокола этим файлом = **не меняется**
- Аудит кода: `people-node` на `main` `167746a` (предок `9214cb5`). Поведение ниже прочитано из этого дерева. Ненайденное не дописано

Правило, которого нет в Economic Model, здесь не называется approved economics. Где модель молчит, этот proposal выбирает одну protocol mechanic и помечает её: **не параметр Economic Model, нужно human review**. Пункты ниже с пометкой **OUTSIDE v0.1 / FUTURE SPECIFICATION** здесь не решаются.

## Замена C/N, age и L1 edge age

Оперативные определения — `docs/PROTOCOL-DECISIONS.md`. Они **заменяют** protocol-mechanic этого файла. Двух правил нет. Исторические формулировки ниже не применяются.

| Тема | Статус |
| --- | --- |
| `C` — число различных Growth Epoch с хотя бы одним qualifying contribution event. Несколько событий в одной эпохе дают +1. Не число tx, не число рефералов, не активность валидатора | **APPROVED** |
| `N` — число различных Growth Epoch с хотя бы одним qualifying network-activity event. То же правило +1 на эпоху | **APPROVED** |
| Каталог `C`: успешный in-block transfer с `fee > 0` контрагенту, который не self и не единственный прямой реферер. Каталог `N`: применённый token-launch fee или curve trading fee. Обычный transfer `N` не увеличивает. Validator stake, attestation, join, block production, регистрация, клик и idle не считаются | **IMPLEMENTATION DECISION**, subject to audit. Не исходный каталог модели. См. `docs/PROTOCOL-DECISIONS.md` |
| Age — число полностью завершённых Growth Epoch с регистрации участника. Не wall clock. Не maturation | **APPROVED** |
| Referral maturation — один полностью завершённый Growth Epoch после высоты включения ребра. Граница эпохи 201600 | **APPROVED** |
| Старое «L1: возраст ребра ≥ 2» | **заменено** на maturation = 1 эпоха. Это смена правила. Порог participant-age для L1 не вводится |
| L1: зарегистрирован, действительное ребро, ребро созрело, `C >= 4`, `N >= 4`, `score >= 180` | **APPROVED** |
| L2: `score >= 280`, `C >= 5`, `N >= 6`, `age >= 4`, ребро созрело. Отдельного «сначала L1» нет | **APPROVED** |
| Числовые веса score. `Score = min(1000, 40×C + 14×N)`. `S = 0` и в сумму не входит. Float и `isqrt` нет. При `C = 5`, `N = 6` score = 284. При `C = 4`, `N = 4` score = 216. Старая формула `70×isqrt(C)+20×isqrt(N)+100×S` заменена | **IMPLEMENTATION DECISION**, subject to audit. Не исходная формула модели |
| Live split eligible integer fee по Model A | **IMPLEMENTATION DECISION**, subject to audit |
| Settlement L1/L2, кепы 1% / 5% / 2%, floor, FORFEIT | **IMPLEMENTED**. Новых процентов нет |
| Claim D, возврат через 4 эпохи | **IMPLEMENTED**. Anti-Sybil, wash, S-gate и clawback не реализуются |

Строки таблиц этого файла про `C`/`N` как unique counterparties / число transfer текущей эпохи и про «возраст ≥ 2» у L1 — прежняя mechanic. Они superseded.

Веса score и каталоги `C`/`N` — implementation decision в `docs/PROTOCOL-DECISIONS.md`. Это не утверждение, что формула `40×C + 14×N` была в модели с первого дня. `isqrt` больше не считается.

---

## Scope

Внутри предложения:

- как утверждённый Growth Pool, граф глубины 5, score, бюджет `B`, выплата только L1 и L2, кепы, floor, claim D и FORFEIT садятся на текущий PEOPLE Network;
- какое состояние должно быть консенсусным, а какое может жить в indexer, UI или off-chain;
- какие куски кода уже есть и чем они не являются Growth.

Вне документа и этим PR не делается:

- патч runtime, `FeeSplitter`, `LEGACY_FEE_SPLIT`, consensus, storage, migrations;
- правка `docs/ECONOMIC-MODEL-v0.1.md`;
- тесты (план есть, файлов нет);
- активация в production;
- supply, emission, цена PPL, переименование on-chain id `vls`;
- алгоритм humanity gate и алгоритм wash-колец.

Участник (телефон, браузер, лёгкий клиент) и валидатор (консенсус) остаются разными ролями. Ребро Growth не делает участника валидатором. Существующий validator referral (`Validator.referredBy`, `referralShare`) остаётся отдельным потоком: cut из награды приглашённого валидатора, в Growth не входит.

---

## Связь с Economic Model v0.1

Рабочая модель — **Model A**. Её нельзя пересматривать в этом файле.

Approved fee split, по именам bucket из модели. Числа не сдвинуты:

| Bucket | Share |
| --- | ---: |
| Validators | 30 |
| Community Pool | 25 |
| Treasury | 20 |
| Liquidity & Ecosystem | 10 |
| Growth Pool | 15 |
| Burn | 0 |

**CURRENT RUNTIME для eligible integer fee:** Model A внутри `applyTransaction` и `routeTradingFee`. Это implementation decision, не исходное включение модели. Нецелая комиссия и явный не-legacy `feeSplit` в Growth Pool не идут. `epochBaseIssuance` не меняется.

| Parameter | Утверждено | Здесь |
| --- | --- | --- |
| Fee split | Validators 30 / Community Pool 25 / Treasury 20 / Liquidity & Ecosystem 10 / Growth Pool 15 / Burn 0 | implementation decision: eligible integer fee в обычном блоке режется так. Остаток `floor` остаётся в доле валидаторов |
| Growth Pool | 15% eligible PPL fees, без новой эмиссии | отдельный bucket в описании |
| Growth Epoch | 201 600 блоков | не validator epoch (10 блоков) |
| `B` | `min(available, reference)` | запас `B` не поднимает |
| Bootstrap | C | формула ниже, без warmup скрипта |
| Paid levels | L1 и L2; L3–L5 payout 0 | веса 50/25/15/7/3 сохраняются |
| Знаменатель | только оплачиваемые L1 и L2 | `W3+W4+W5` бюджет не резервируют |
| Maturation | 2 / 4 / 6 / 8 / 10 | эпоха включения не платится; пауза возраст не сбрасывает. 6/8/10 выплату не включают |
| Score | `min(1000, 40×C + 14×N)`. `S` не входит. Старая строка `0`, если `C < 3` или `N < 3`, иначе `min(1000, 70×isqrt(C)+20×isqrt(N)+100×S)` | **заменена** implementation decision. Не множитель выплаты |
| `S` | бинарный +100, если gate выполнен | в v0.1 gate нет, поэтому `S = 0` |
| L1 | score ≥ 180, `C ≥ 4`, `N ≥ 4`, возраст ≥ 2 | **SUPERSEDED** в части «возраст ребра ≥ 2». Замена: maturation = 1 эпоха, без порога participant-age. См. `docs/PROTOCOL-DECISIONS.md` |
| L2 | score ≥ 280, `C ≥ 5`, `N ≥ 6`, возраст ≥ 4 | дополнительный prerequisite «ворота L1 того же участника» не часть v0.1. **L2 additional L1-gate: NOT APPROVED** |
| Кеп реферера | 5% `B` за эпоху, все уровни вместе | это не кеп уровня L1 |
| Кеп ребра | 1% `B` за эпоху | это не кеп уровня L2 |
| Окно 8 эпох | реферер ≤ 2% суммы `B` | окно с эпохи 1, пустые слоты 0. Кеп считает уже выделенное. Expired claim место не освобождает |
| Пустой пул / `B = 0` | FORFEIT | allocation не создаётся, см. раздел FORFEIT |
| Claim | D | окно 4 эпохи, не token lock |
| Remainder | остаётся в пуле | `B` не увеличивает, ceiling нет |
| Rounding | floor, хвост в пул | порядок §7 модели |
| Eligible | transfer fee, token launch fee, protocol `tx.fee`, curve trading fee | closed set |
| Not eligible | principal, stake, project-token, NFT, AMM swap, promotion, API | |
| Depth | max 5; `depth > 5` reject | silent clamp запрещён |

Вариант B архитектуры закрыт моделью: отдельный Growth Pool, выплата не вычитается из приглашённого, пул ограничивает сумму, платим за квалифицированную активность.

### Сверка чеклиста

Таблица §11 `docs/ECONOMIC-MODEL-v0.1.md` и store-копия совпадают. Модель этим proposal не правилась.

Зафиксировано, модель не правилась:

1. В `docs/ECONOMIC-MODEL-v0.1.md` §10 и в таблице §11 у L2 есть фраза «плюс ворота L1 того же участника». Это documentation inconsistency, не economic rule. **L2 additional L1-gate: NOT APPROVED.** Файл модели не редактируется. Предлагаемое удаление фразы — отдельный файл `docs/ECONOMIC-MODEL-v0.1-l2-editorial-proposal.md`, статус EDITORIAL PROPOSAL / NOT APPLIED. L2 в этом протоколе: score ≥ 280, `C ≥ 5`, `N ≥ 6`, возраст ≥ 4.
2. Черновик, где 5% назван «кепом L1», а 1% — «кепом L2», расходится с таблицей. Верно: 5% `B` — кеп реферера за эпоху на все уровни вместе; 1% `B` — кеп одного ребра за эпоху.
3. `docs/ECONOMICS.md` §6, константа `PROVISIONAL_FEE_SPLIT` (40/25/20/10/5) и ряд страниц сайта по-прежнему описывают исторический provisional split. В Model A он не рабочий. Эти тексты здесь не переписываются.
4. Скрипт `growth-model-v0.1-stress.py` кодирует старый warmup: эпоха 1 с `B = 0`, делитель 8. Это не bootstrap C.

Идентичности учёта, как в модели:

```text
totalDebited = claimedSettled + escrow + totalReturned
available = totalInflow − totalDebited + totalReturned
available + escrow + claimedSettled = totalInflow
```

Возврат claim в `totalReturned` не является новым inflow и reference не поднимает. Escrow второй раз не вычитается.

---

## Аудит

Источник: код `people-node` на `167746a`. «Compatible» = совместимость с утверждённым Growth v0.1, не оценка качества текущего devnet.

| Component | Exists | Location | Current behavior | Compatible | Gap |
| --- | --- | --- | --- | --- | --- |
| Типы tx | да | `packages/protocol/src/index.ts` `TxType` | `transfer`, `joinValidator`, `leaveValidator`, `unstake`, `attestation`, `slashEvidence`, `proposal`, `vote`, `tokenCreate`, `curveBuy`, `curveSell`, `creatorClaim`. У каждой tx есть `fee` | частично | нет tx ребра Growth и нет tx claim Growth |
| Аккаунт | да | `AccountState` в `packages/core/src/index.ts` | `balance`, `balances`, `nonce`. Родителя нет | частично | нет ребра, score, claim, escrow |
| Transfer fee | да | `applyTransaction`, ветка transfer | Списываются `amount + fee` в native или только `fee` в native при чужом asset. Principal уходит получателю. Внутри `applyTransaction` fee не режется по долям | частично | principal не eligible; fee eligible по модели, сейчас не в Growth |
| Token launch fee | да | `applyTokenCreate` | Порог `tx.fee >= 1`. Списывается весь `tx.fee`. Отдельного поля launch fee нет. `FeeSplitter` внутри функции не вызывается. 60/10/15/10/5 — это доли **токена проекта**, не PPL | частично | launch fee и `tx.fee` — одна величина. В базу её можно положить один раз, не два |
| Protocol `tx.fee` | да | поле `Transaction.fee`; debit не везде | Fee списывается у `joinValidator`, `proposal`, `tokenCreate`, `curveBuy`, `curveSell`, `creatorClaim`, transfer. Не списывается у `leaveValidator`, `unstake`, `attestation`, `slashEvidence`, `vote` | нет | см. `feePool`: счётчик ноды растёт на `tx.fee` при приёме в mempool даже если apply fee не дебетует |
| `feePool` | да | `NodeService.feePool`; `PersistedSnapshot.feePool` | Не поле `ChainState`. Не входит в `computeStateRoot`. `submitTransaction` и `handleRemoteTx` делают `feePool += tx.fee`. На высоте `% 10 === 0` proposer в `tick()` вызывает `distributeEpochRewards` и при `paid > 0` обнуляет пул. Удалённый `tryApplyRemoteBlock` награды не начисляет | нет | учёт комиссий не общий для нод и не покрыт state root. Growth так копировать нельзя |
| `FeeSplitter` | да | класс `FeeSplitter` | Пять долей, сумма ровно 100. Для целого fee: community, treasury, liquidity, burn через целое деление; остаток — `validatorAmount`. Default аргумента — `LEGACY_FEE_SPLIT` | нет | шестого bucket Growth нет. Model A в эту структуру не ложится |
| Runtime split | да | `LEGACY_FEE_SPLIT`; `DEFAULT_CONFIG` без `feeSplit` | 100 / 0 / 0 / 0 / 0. Путь `config.feeSplit ?? LEGACY_FEE_SPLIT` | нет | это и есть зафиксированный gap. Код не меняется |
| Provisional split | да | `PROVISIONAL_FEE_SPLIT` | 40 / 25 / 20 / 10 / 5. В default не подставлен | нет | не Model A |
| Liquidity share | считается | `liquidityAmount` / `feeDistribution.liquidityFees` | В `routeTradingFee` и `distributeEpochRewards` на баланс, treasury, burn или резерв **не** зачисляется. При LEGACY доля 0, поэтому runtime это не проявляет | нет | при ненулевой доле единицы есть в отчёте и нет в состоянии |
| Treasury / burn | да | `state.treasury`, `state.burned` | Кредитуются, только если доля > 0. В `computeStateRoot` этих полей нет | частично | при LEGACY нули. Burn в коде — счётчик, не уменьшение `totalSupply` |
| Community Pool | да | `CommunityPoolState`, `allocateToCommunityPool`, `distributeFromCommunityPool` | Учёт по `assetId`: `totalAllocated`, `totalDistributed`, `remainingBalance`. Нативный inflow из fee split только при `communityAmount > 0` (при LEGACY нет). `tokenCreate` кладёт 10% supply **проектного** токена. `distributeFromCommunityPool` из протокола не вызывается, только из теста | частично | это не Growth Pool. Project-token amount не eligible PPL fee |
| Curve trading fee | да | `CURVE_FEE_BPS = 100` в `packages/core/src/curve.ts`; `routeTradingFee` | Buy: fee = `floor(nativeIn × 100 / 10000)` от входа, не от `tx.fee`. Sell: fee = `floor(grossNativeOut × 100 / 10000)`. Сразу `FeeSplitter`. При LEGACY 100% активным валидаторам поровну, остаток целочисленного деления — первому в переборе; если активных нет — в treasury. Principal остаётся в резерве кривой | частично | fee eligible, путь есть, назначение не Growth. `tx.fee` той же tx — другая сумма и идёт в `feePool` |
| Bonding curve | да | `BondingCurveEngine`, `applyCurveBuy`, `applyCurveSell` | Целая арифметика на `BigInt`, инвариант `K`, миграция при остатке инвентаря ≤ threshold | частично | шаблон 60/10/15/10/5 не является fee split PPL |
| AMM | заготовка | `executeMigration`, `AMM_FEE_BPS = 30`, `LiquidityPoolState` | При миграции создаётся пул `pool-vls-<asset>`, `locked: true`, `feeBps: 30`. Типа tx swap нет, исполнения swap нет | да как not eligible | AMM swap fee в v0.1 не база. Поведения swap в коде нет, оно здесь не додумано |
| NFT fee | нет | — | типа tx нет | да как not eligible | не вводить источник |
| Promotion fee | нет | — | типа tx нет | да как not eligible | не вводить источник |
| API fee | нет | `MetricsResponse.apiRequestCount` | счётчик HTTP, не списание PPL | да как not eligible | не вводить источник |
| Stake / principal | да | `joinValidator` | `amount` → `validator.stake`. Fee, если он есть, отдельно. Unstake возвращает stake на баланс | да как not eligible | в Growth эти суммы не входят |
| Validator epoch | да | `buildBlock` / `tryApplyRemoteBlock`, `height % 10 === 0` | `state.epoch += 1` **после** расчёта `stateRoot`. Интервал блока `DEFAULT_BLOCK_INTERVAL_MS = 3000`. Эпоха валидатора ≈ 30 с | нет как Growth Epoch | 10 ≠ 201 600. Settlement Growth внутри этой эпохи запрещён моделью |
| Growth Epoch | нет | — | в коде нет | нет | 201 600 только в спецификации |
| `Validator.referredBy` | да | `joinValidator` | Опциональный `payload.referrer`. Self-referral отклоняется. Реферер должен уже быть `joining` или `active` валидатором. Поле пишется один раз. Глубины, цикла кроме self, смены ребра нет | нет | одно звено валидатор→валидатор, не лес участников |
| `referralShare` | да | `distributeEpochRewards` | `clamp` в `[0, 0.2]`, default `0.05`. Cut = `rawReward × share` **из награды приглашённого**, float, сразу `balance +=`. Если реферер не `active`, cut не берётся. Поле `RewardDistribution.referralPayouts` | нет | другой экономический поток. В Growth выплата из пула, не из награды приглашённого |
| Web referral | да | `apps/web/src/referral.ts` | `?ref=` → `sessionStorage`, bind в `localStorage`, first wins, в `joinValidator` как payload. Цепь от этого не меняется, пока нет join | нет как состояние | модель: link и QR — не состояние. On-chain ребра участника всё равно нет |
| Эмиссия валидаторам | да | `epochBaseIssuance = 50` | каждый validator epoch добавляется к validator fee reward. Genesis faucet `1_000_000` на id `vls`, decimals 6, имя в коде Vallis | не Growth | supply и emission PPL не утверждены. Growth новую эмиссию не добавляет. Id `vls` этот proposal не переименовывает |
| State root | да | `computeStateRoot` | Хеш `JSON.stringify` полей: accounts, validators, epoch, proposals, finalizedHeight, assets, communityPool, curves, vesting, три резерва, liquidityPools | частично | нет treasury, burned, feePool, mempool, attestation votes. Growth в корне нет |
| Окно цепи | да | `CHAIN_WINDOW_BLOCKS`, default 500 | в RAM хранится короткий хвост блоков. `countOutgoingTransactions` сканирует этот хвост | нет для `C`/`N` | 500 блоков меньше одной Growth Epoch. Счётчики нельзя восстановить сканом `state.chain` |
| Score, кепы, claim, depth, Growth Pool | нет | — | нет структур, нет событий, нет settlement | нет | весь протокол Growth |

Отдельно, как наблюдение учёта, не как новое правило: `feePool += tx.fee` происходит при приёме в mempool. Если tx позже выброшена из блока, вычитания из `feePool` в прочитанном коде нет. Это ещё одна причина не использовать `feePool` как inflow Growth.

---

## Архитектура

Предлагаемая форма, **не включённая в код**.

Один pipeline. Он расписан в разделе Reward calculation. Короткий порядок и §7 модели сведены туда, второго порядка нет. Кратко: budget → eligible L1/L2 → raw по весам (знаменатель только L1+L2) → кеп ребра 1% → кеп реферера 5% → окно 2% → равный floor внутри реферера с повторным кепом ребра → хвост в пул. Сортировка: referrer → referred → level. Обход узлов в памяти результат не меняет.

5% — кеп реферера за эпоху. 1% — кеп ребра. 2% — окно 8 эпох. Это не кепы уровней.

`W3–W5` в `weightSum` не входят. L3–L5 могут иметь ребро и возраст 6/8/10; payout = 0. Созревание этих уровней выплату не включает.

Живой split пишет 15% eligible integer fee в `I` эпохи включения. Нецелый fee и явный non-legacy split в `I` не входят. Пустая эпоха — FORFEIT, не скрытый бюджет и не долг.

Settlement выполняется внутри применения блока, до state root. Не в `NodeService.tick()`. Claim D — отдельный переход `growthClaim`.

Три слоя не склеиваются: `Validator.referredBy` + `referralShare`; Community Pool; Growth Pool. Growth не дебетует награду приглашённого, CP, treasury и validator reward.

---

## Integer arithmetic

Экономический выход формул не меняется. Float запрещён. Минимальная единица целочисленного пути PEOPLE Network — `1`.

Фактический целочисленный путь в коде:

- Кривая, `calculateBuy` / `calculateSell`: `feeBig = (amountBig * 100n) / 10000n`. Сначала умножение, потом деление `BigInt`. Деление целых отбрасывает остаток.
- `FeeSplitter.split`, если `Number.isSafeInteger(totalFee)`: `(feeInt * BigInt(share)) / 100n` для community, treasury, liquidity, burn. Остаток этого деления в сегодняшнем пятидольном split попадает в `validatorAmount`. Growth этот остаток не переназначает: runtime split не меняется.
- `BondingCurveEngine.toSafeInteger`: значение `< 0` или `> Number.MAX_SAFE_INTEGER` (`2^53 - 1`) отвергается, а не обрезается.
- Минимальная положительная единица этого пути — `1`. Порог launch fee в `applyTokenCreate` — `1`. `calculateBuy` требует positive safe integer.
- Поле `NATIVE_ASSET.decimals = 6` — метаданные. Целочисленный путь кривой и `FeeSplitter` не умножает сумму на `10^6`.
- Float-ветка существует и в settlement Growth не входит: `DEFAULT_TRANSFER_FEE = 0.1`, и в `FeeSplitter` ветка `Math.floor(... * 1e6) / 1e6`, если fee не safe integer. `referralShare` тоже умножает float. Новый коэффициент перевода `0.1` в целые единицы здесь не вводится.

Формулы Growth на том же порядке mul/div, в `BigInt`, затем проверка `toSafeInteger`:

```text
reference = sum(window) / count(window)
raw       = (B * weight) / weightSum
edgeCap   = (B * 1) / 100
refCap    = (B * 5) / 100
winCap    = (sumB * 2) / 100
share     = T / K
score     = min(1000, 40*C + 14*N)   # S = 0, в сумму не входит; isqrt заменён
```

Делить до умножения нельзя: `(B / weightSum) * weight` даёт другой floor. Остаток каждого деления остаётся в пуле и первому кортежу не пишется. Отрицательных величин нет. Если произведение или результат не проходит `toSafeInteger`, переход отвергается и новых единиц не создаёт. Для значений внутри safe integer выход совпадает с `floor` модели.

`I = (eligible * 15) / 100` — та же схема. Сейчас строка не исполняется: CURRENT RUNTIME = 100% validators. Момент включения runtime split = **OUTSIDE v0.1 / FUTURE SPECIFICATION**. Критерий и срок не выбираются.

Float в settlement Growth запрещён. Используется только целочисленная ветка выше. Коэффициент перевода `0.1` в целые единицы не вводится. Economic output формул `floor` не меняется: для safe integer результат совпадает с делением модели.

---

## State model

Хранится мало. Производное не дублируется.

Consensus-critical, хранится:

| Поле | Зачем |
| --- | --- |
| `parent[child] = parent` | одно ребро. Нет родителя — корня нет в этой map |
| `linkEpoch[child]` | **SUPERSEDED.** Возраст ребра по эпохе включения больше не правило. Хранится высота включения `linkedAtHeight`. Age — возраст участника, см. `docs/PROTOCOL-DECISIONS.md` |
| `pool.totalInflow` | сумма `I` |
| `pool.totalReturned` | возврат невостребованного claim |
| `pool.claimedSettled` | уже зачислено рефереру |
| `pool.escrow` | сумма записей Claimable |
| `epochInflow[e]` | последние inflow. Для reference хватает 8 предыдущих; старше можно не держать |
| `epochBudget[e]` | `B` эпохи, последние 8, для окна 2% |
| `assigned[e][referrer]` | сумма, назначенная рефереру в эпохе `e`, последние 8. Это allocated. Claim, expiry и return её не уменьшают |
| `claimable[epoch, referrer, referred, level] = amount` | только живые Claimable, `amount > 0` |
| `consumed[epoch, referrer, referred, level]` | Settled или Returned. Повтор и claim после срока упираются сюда |
| `settledEpoch[e]` | эпоха уже прошла settlement. Второй settlement той же эпохи отвергается |
| `activity[account]` текущей эпохи | **SUPERSEDED.** Прежняя mechanic: контрагенты и счётчик transfer этой эпохи. Заменена: `C` и `N` — число различных эпох с qualifying event, не окно текущей эпохи и не raw tx count |

Derived, не хранится:

- `depth` — обход родителей, не больше 5 шагов;
- `age = E - linkEpoch` — **SUPERSEDED.** Age считается завершёнными эпохами с регистрации участника;
- `C = |множество контрагентов|`, `N` из счётчика transfer — **SUPERSEDED.** См. замену в начале файла;
- `S` в v0.1 константа 0, поля нет;
- `reference`, `available`, `totalDebited`, `weightSum`, `raw`.

`available` отдельным балансом не пишется. Иначе запас можно было бы пополнить в обход `I`.

Indexer/UI хранит ссылки, QR, ленту и CSV. Эти копии state root не определяют.

---

## Events

В коде событий Growth нет. Indexer может проецировать журнал из состояния. Консенсус indexer не читает.

| Событие | Когда |
| --- | --- |
| `ReferralEdgeAccepted` | ребро записано |
| `ReferralEdgeRejected` | self, цикл, duplicate, malformed, replay, `depth > 5` |
| `GrowthEpochSettled` | один раз на эпоху: `reference`, `B` |
| `RewardClaimable` | запись с `amount > 0` |
| `RewardClaimed` | Claimable → Settled |
| `RewardReturned` | невостребованное ушло в пул |
| `RewardForfeited` | `B = 0` или floor/кеп дали 0. Записи нет |

`referralPayouts` валидаторской эпохи — чужое событие.

---

## Referral graph

Утверждено: лес, один родитель, без self, без циклов. Link и QR — не состояние. Ребро в этом proposal **immutable**. Delete и replace нет.

Модель говорит «неизменно, кроме fraud/reversal». Процедуры reversal в протоколе нет, и этот документ её не добавляет. См. раздел Fraud/reversal: OUTSIDE v0.1.

Приём ребра, псевдокод, не патч:

```text
reject malformed address
reject replay (тот же nonce / та же tx уже применена)
reject parent == child
reject child уже имеет parent          # duplicate
reject цикл по предкам parent          # обход ≤ 5
depth = derivedDepth(parent) + 1
reject depth > 5                       # не записывать 5 вместо 6
записать parent и linkEpoch
```

`Validator.referredBy` в этот обход не подмешивается.

Creation timing. **Не параметр Economic Model, нужно human review** только выравнивание номера эпохи по высоте; сам факт «эпоха включения не платится» — из модели.

```text
height == 0 → не Growth Epoch
height >= 1 → growthEpoch = floor((height - 1) / 201600) + 1
```

Номер эпохи по высоте **APPROVED** (граница 201600). Строки `linkEpoch` и `age(E) = E - linkEpoch` **SUPERSEDED**. Ребро хранит `linkedAtHeight`. Maturation = один полностью завершённый Growth Epoch после этой высоты. Age — возраст участника с регистрации, не возраст ребра. «L1 проходит на `linkEpoch + 2`» **заменено** и не действует. Tx ребра подписывает child — **APPROVED**.

---

## Depth

`depth > 5` отвергается одинаково в трёх местах:

- create: ребро не пишется;
- traversal: шаг, который дал бы depth 6, не становится уровнем 5 и не создаёт кортеж;
- eligibility: кортеж с уровнем > 5 не оплачивается и не переписывается в L5.

Silent clamp нет. L1 и L2 оплачиваются. L3, L4, L5 в графе есть, их maturation 6 / 8 / 10 фиксирует возраст, payout остаётся 0, в `weightSum` они не входят.

---

## Score

**IMPLEMENTATION DECISION, subject to audit.** Это не исходная формула модели. Старая формула ниже **заменена** и не считается.

```text
Score = min(1000, 40×C + 14×N)
```

Только целое, через умножение `BigInt`. Float нет. `isqrt` нет. `S` остаётся 0 и в сумму не входит. При `C = 5`, `N = 6` score = 284. При `C = 4`, `N = 4` score = 216. Потолок 1000. Score не множитель выплаты.

Заменённый текст, не действующий расчёт:

```text
если C < 3 или N < 3: Score = 0
иначе Score = min(1000, 70×isqrt(C) + 20×isqrt(N) + 100×S)
```

При том старом `S = 0` минимум L2 `C = 5`, `N = 6` давал 180 < 280 и делал L2 по score недостижимым. Пороги L1 и L2 из-за новой формулы не сдвигаются: ворота те же, score на этих минимумах их проходит.

L1: score ≥ 180, `C ≥ 4`, `N ≥ 4`, участник, действительное ребро, ребро созрело. Порога participant-age у L1 нет. L2: score ≥ 280, `C ≥ 5`, `N >= 6`, возраст участника ≥ 4, ребро созрело. Дополнительного требования «сначала пройти L1» нет. `QUALIFIED` только когда эти ворота проходят.

`C` — число различных Growth Epoch с хотя бы одним успешным in-block transfer участника, `fee > 0`, контрагент не self и не единственный прямой реферер. Несколько таких transfer в одной эпохе дают +1.

`N` — число различных Growth Epoch, в которых участник заплатил применённый token-launch fee или curve trading fee. Обычный transfer `N` не увеличивает. Одна эпоха не больше +1.

В `C` и `N` не входят validator stake, attestation, join, block production, регистрация, клик и idle. Self-transfer и перевод, чей единственный контрагент — прямой реферер, не дают `C`. Mempool и failed tx не считаются.

**SUPERSEDED.** Абзацы ниже до границы эпохи описывают прежнюю mechanic «`C`/`N` = transfer текущей эпохи». Она заменена и больше не действует.

- Successful transfer — это `transfer`, успешно применённый в блоке. Mempool не считается. Failed tx не считается.
- Окно — только текущая Growth Epoch. Rolling нет. Lifetime нет.
- `C` — число unique counterparties этих transfer.
- Один и тот же counterparty входит в `C` один раз за эпоху.
- `N` — число таких успешных transfer.
- На следующую эпоху `C` и `N` сбрасываются.
- Фиксация детерминированна на settlement этой эпохи. До settlement score эпохи не закрыт. После фиксации поздняя tx в эту эпоху не дописывается.

Исключения берутся только из уже утверждённого списка. Новых фильтров нет. В `C` и `N` не входят:

- self-transfer;
- tx с нулевой комиссией;
- validator join, stake, attestation, block production;
- перевод, чей единственный контрагент — прямой реферер;
- регистрация, клик и idle: вклад 0.

Первые четыре строки — §10 `docs/ECONOMIC-MODEL-v0.1.md`. Регистрация, клик и idle отдельной строкой в том файле не названы. Здесь они дают 0, потому что не являются successful transfer в блоке. Это не дополнительный порог и не новый коэффициент.

Граница эпохи, к которой относится successful transfer:

```text
height == 0 → вне Growth Epoch
height >= 1 → E = (height - 1) / 201600 + 1
эпоха E = высоты (E - 1) * 201600 + 1 … E * 201600 включительно
```

Две успешные transfer с одним counterparty в одной эпохе: `N = 2`, `C = 1`. Порядок обхода узлов на эти числа не влияет.

---

## Budget

Формула bootstrap C не меняется.

```text
completed = inflow эпох строго раньше текущей
если completed пуст:
  reference = I этой эпохи
иначе:
  window = не больше 8 последних completed
  reference = sum(window) / count(window)    # целое деление
B = min(available, reference)
```

Пустая история и `I = 0`: `reference = 0`, `B = 0`, FORFEIT. Пустая история и `I > 0`: `reference = I`, `B ≤ I`.

Нулевой inflow при уже непустой истории: текущий ноль в своё среднее не входит. `reference` считается по предыдущим. Отдельного правила «пропустить нулевые эпохи» нет.

Со второй эпохи текущий `I` в reference не входит. Возврат claim в reference не входит. Запас пула reference не поднимает. Warmup «первые 8 эпох `B = 0`» не используется.

Порядок внутри эпохи, после закрытия её 201 600 блоков:

1. Зафиксировать `I` этой эпохи.
2. Посчитать `reference` по предыдущим.
3. Посчитать `available` до назначений этой эпохи.
4. `B = min(available, reference)`.
5. Дальше раздел Reward calculation.

`I` эпохи — сумма growth-доли eligible integer fee, зачисленной на её высотах. Возврат claim в этот `I` не входит.

---

## Reward calculation

Один pipeline. Короткий список review и §7 модели сведены в эту последовательность. Второй порядок не используется. §7 точнее короткого списка: после кепов там есть равное деление внутри реферера. Оно входит сюда одним шагом, не отдельной развилкой.

```text
1. budget
   I, reference, B = min(available, reference)
2. eligible recipients
   кортежи L1 и L2, прошедшие свои ворота
   L2: score ≥ 280, C ≥ 5, N ≥ 6, age ≥ 4
   L3–L5 в список не входят, payout 0
3. sort
   байты referrer → байты referred → level
4. raw allocation
   weightSum = сумма весов только этих L1 и L2
   raw = (B * weight) / weightSum
5. caps, в этом порядке
   ребро:     min(raw, (B * 1) / 100)
   реферер:   сумма его кортежей ≤ (B * 5) / 100
   8 эпох:    сумма allocated этого реферера в окне ≤ (sum(B окна) * 2) / 100
              окно — до 8 последних B, с эпохи 1, пустые слоты 0
              в числитель входит уже записанный allocated, включая текущее назначение
              expired и returned этот allocated не уменьшают
6. rounding
   внутри реферера пост-кеповая сумма T делится на K кортежей: каждому T / K
   остаток T - K * (T / K) в пул, первым адресам не отдаётся
   если T / K больше кепа ребра, кортеж режется до (B * 1) / 100, избыток в пул
7. remainder
   всё, что не назначено, остаётся в Growth Pool и в этой эпохе не перераздаётся
```

5% — кеп реферера за эпоху, все уровни вместе. 1% — кеп ребра. 2% — окно 8 эпох. Это не кепы уровней.

Шаг 6 режет повторно по кепу ребра, потому что равное деление иначе может выйти за 1% `B`. Избыток остаётся в пуле. Другим реферерам он не отдаётся. Обход узлов в памяти результат не меняет: перед шагом 4 список уже отсортирован, остаток `floor` никому не дописывается.

Назначение `amount > 0` создаёт Claimable в том же переходе. Запись с нулём не создаётся.

---

## Caps

| Кеп | Формула | На что |
| --- | --- | --- |
| Ребро | `(B * 1) / 100` | один кортеж за эпоху |
| Реферер | `(B * 5) / 100` | все уровни этого реферера за эпоху вместе |
| Окно | `(sum(B окна) * 2) / 100` | один реферер, до 8 последних `B`, с эпохи 1, пустые слоты 0 |

Окно reference и окно кепа — разные: reference берёт предыдущие inflow, кеп берёт бюджеты `B`, включая текущий. Число 2% не меняется. При `B < 100` кеп ребра равен 0.

Модель не говорит, освобождает ли expired claim место в окне. Этот proposal фиксирует protocol accounting, не новый процент.

**Не параметр Economic Model, нужно human review.** Место не освобождается. Кеп считает уже выделенное (`assigned`) в окне: allocated этой и предыдущих эпох окна. Claim, expiry и возврат в пул эту сумму не уменьшают. Возврат — деньги в `available` / `totalReturned`, не новая квота. Clawback Settled нет.

---

## Rounding

Только целые, порядок mul/div из раздела Integer arithmetic. Хвост в пуле. Порядок кортежей: байты адреса реферера, затем приглашённого, затем уровень.

Канонический адрес в коде — `0x` + 40 hex из `addressFromPublicKey`. Длина одна. Сравнение байт этой строки совпадает с порядком 20 байт payload. Это чтение «байты адреса», не новый параметр.

---

## FORFEIT

Следствие approved model для `B = 0` и для кортежа, который floor и кепы сводят к 0.

- Allocation не создаётся.
- Pending нет.
- Claimable нет.
- Rollover квалификации на следующую эпоху нет.
- Forfeiture этой эпохи terminal: заднего claim нет, долга нет, новых PPL нет.
- Квалификация может быть наблюдаема. Наблюдение не создаёт запись.

Пустой пул не обещание участнику.

---

## Claims

State machine Claim D.

```text
settlement, amount > 0:  (нет записи) → Claimable
settlement, amount = 0 или B = 0: записи нет, FORFEIT terminal
claim полного amount реферером: Claimable → Settled, баланс += amount, escrow -= amount
через 4 Growth Epoch без claim: Claimable → Returned, escrow -= amount, totalReturned += amount
```

Settled и Returned terminal. Это не lock: после Settled единицы — обычный баланс, запрета продажи нет. Возврат не сжигается и в ту же эпоху другим кортежам не раздаётся. Возврат не новый `I`.

Проверки:

| Случай | Исход |
| --- | --- |
| Double claim | второй claim Settled отвергается, баланс не меняется |
| Replay той же tx | nonce / уже потреблённая tx, состояние не меняется |
| Claim after expiry | Returned terminal, claim отвергается, повторного списания из пула нет |
| Partial claim | отвергается. Запись одна, переход один, дробной выплаты нет. **Не параметр Economic Model, нужно human review** |
| Duplicate settlement | `settledEpoch[e]` уже стоит — второй проход эпохи отвергается, второй escrow не создаётся |
| Claim не реферером | отвергается |

Returned исполняется один раз, на settlement эпохи `E+4`, до расчёта `B` этой эпохи. Деньги увеличивают `available` и `totalReturned`. `reference` они не увеличивают. Квоту 2% они не увеличивают: `assigned` эпохи происхождения остаётся. Повторный claim отвергается.

---

## S gate

Интерфейс будущего gate. Критерий не выбирается.

```text
sGate(participant, epoch) → 0 | 1
```

В v0.1 функция возвращает 0. Stake, uptime, число рефералов, глубина, объём, возраст и факт аккаунта gate не включают. `S` не дублирует `C`, `N` и возраст.

Future S gate = **OUTSIDE v0.1 / FUTURE SPECIFICATION**. Критерий не выбирается.

---

## Anti-abuse

Consensus-critical только структурные проверки ребра и claim:

- self;
- cycle;
- duplicate parent;
- replay;
- malformed;
- depth > 5.

Они не новый алгоритм детекции. Исключения из `C` и `N` — только список раздела Score: self-transfer; tx с нулевой комиссией; validator join, stake, attestation, block production; перевод, чей единственный контрагент — прямой реферер; регистрация, клик и idle дают 0. Новых фильтров нет. Это правила score, не admin-флаг.

Wash detection = **OUTSIDE v0.1 / FUTURE SPECIFICATION**. Критерий не выбирается. Алгоритма нет. Admin authority нет. Off-chain отчёт в state root не входит.

---

## Fraud/reversal

В протоколе нет reversal уже Settled наград Growth и нет снятия ребра. Модель называет fraud/reversal исключением из неизменности, процедуры не даёт.

Fraud/reversal = **OUTSIDE v0.1 / FUTURE SPECIFICATION**. Критерий не выбирается. Отдельная спецификация нужна до любой процедуры. Admin clawback не добавляется. В v0.1 ребро immutable: delete нет, replace нет.

---

## Determinism

Один state и один блок дают один результат.

- целые mul/div, без float-ветки;
- каноническая сортировка до нарезки;
- `S = 0`;
- `C` и `N` из состояния эпохи, не из обрезанной цепи и не из indexer;
- нет `Date.now()`, локального `feePool`, `localStorage`.

`distributeEpochRewards` сегодня живёт в `tick()` proposer и питается локальным `feePool`. Growth к этому пути не подключается.

---

## Security surfaces

| Поверхность | Граница v0.1 |
| --- | --- |
| Sybil | `S = 0`. Кепы режут сумму, человека не доказывают |
| Self, цикл, duplicate, replay, malformed, depth | reject |
| Wash | вне v0.1, без admin |
| Clawback / reversal Settled | вне v0.1 |
| Double claim, повтор settlement | terminal states |
| `feePool` | не источник `I` |
| Роли | ребро не даёт права подписи блока |
| FORFEIT | не долг и не задняя эмиссия |

---

## Consensus vs indexer vs UI vs off-chain

| Предмет | Класс |
| --- | --- |
| Edge | CONSENSUS-CRITICAL |
| Depth | DERIVED из edge. Проверка reject — CONSENSUS-CRITICAL. В storage отдельно не пишется |
| Growth Epoch index и `linkEpoch` | CONSENSUS-CRITICAL. Выравнивание высоты — механика proposal, human review |
| `C`, `N` | CONSENSUS-CRITICAL. Прежнее окно «текущая эпоха / transfer» **SUPERSEDED**. Действует учёт различных Growth Epoch, `docs/PROTOCOL-DECISIONS.md` |
| Score | DERIVED из `C`, `N`, `S` на settlement |
| `S` | CONSENSUS-CRITICAL константа 0. Future S gate = **OUTSIDE v0.1 / FUTURE SPECIFICATION** |
| Budget `B`, `reference`, `I` | CONSENSUS-CRITICAL. `reference` и `available` — DERIVED |
| Allocation | CONSENSUS-CRITICAL, только `amount > 0` |
| Caps | DERIVED. 5% реферер, 1% ребро, 2% окно. Числитель окна — allocated. Expired место не освобождает |
| Claims | CONSENSUS-CRITICAL |
| Expiry / Returned | CONSENSUS-CRITICAL. Settlement эпохи `E+4`, до `B`. Квоту 2% не увеличивает |
| Growth Pool accounting | CONSENSUS-CRITICAL (`totalInflow`, `totalReturned`, `claimedSettled`, `escrow`) |
| Wash | **OUTSIDE v0.1 / FUTURE SPECIFICATION** |
| Link, QR, localStorage | INDEXER-UI. Не состояние |
| История для экрана | INDEXER-UI. `B` не пересчитывает |
| `referralPayouts` валидаторов | чужой поток. В UI не подписывается как Growth |

---

## Gaps table

| Gap | Факт кода | Правило v0.1 | Этот PR |
| --- | --- | --- | --- |
| Runtime split | 100% validators | Validators 30 / Community Pool 25 / Treasury 20 / Liquidity & Ecosystem 10 / Growth Pool 15 / Burn 0 | только текст |
| Growth Pool | нет | отдельный bucket, без эмиссии | только текст |
| Growth Epoch | каждые 10 блоков | 201 600 | границу эпохи не менять |
| `feePool` | у ноды, вне state root | `I` детерминирован | не переносить в `tick()` |
| Граф | `referredBy`, глубина 1, только валидатор | лес участников, depth ≤ 5 | не писать ребро в `joinValidator` |
| `referralShare` | cut из награды валидатора, float | выплата из пула | потоки не смешивать |
| Score, claim, кепы | нет | формула, D, 5% / 1% / 2% | не включать |
| `S` | нет | значение 0 | не помечать аккаунты |
| Wash | нет | не параметр v0.1 | алгоритм не выбирать |
| Float fee | ветка `0.1` есть | settlement целый | float-ветку в Growth не подключать, новый коэффициент не вводить |
| Документы 40/25/20/10/5 | `ECONOMICS.md`, сайт, `PROVISIONAL_FEE_SPLIT` | не Model A | не править отсюда |

---

## Test plan

Тестов в этом PR нет. Векторы ниже — из модели, для будущего допуска, не для этого файла.

Бюджет: пустая история и `I = 100` → `reference = 100`. Пустая история и `I = 0` → `B = 0`, записей нет. Девять эпох по 100 при полной выплате → `available` в конце 0. Эпоха 10 с `I = 200` при предыдущих 100 → `reference = 100`, запас reference не поднимает. Текущая эпоха в своё среднее не входит. `totalReturned` в среднее не входит.

Score при `S = 0`: `(3,3)=90`, `(4,4)=180`, `(5,6)=180`, `(16,6)=320`, `(9,16)=290`. Ветка `S = 1` в рабочем проходе не включается.

L2 проверяется только своими порогами: score ≥ 280, `C ≥ 5`, `N ≥ 6`, age ≥ 4. Отдельный проход L1 не требуется. L3 с возрастом 6 даёт payout 0 и не входит в знаменатель.

Граф: self, cycle, duplicate, replay, malformed, depth 6 — reject и на create, и на traversal, и на eligibility. Depth 5 записывается. Delete и replace нет.

При `B = 1_000_000`: кеп ребра `10_000`, кеп реферера `50_000`, окно восьми равных `B` = `160_000`. Остаток равного деления первому адресу не достаётся. Два порядка вставки в map дают один результат.

FORFEIT при `B = 0`: нет allocation, нет Pending, нет rollover.

Claim: второй claim не меняет баланс; replay не меняет состояние; claim после Returned отвергается; partial отвергается; второй settlement эпохи отвергается.

`referralShare` и `LEGACY_FEE_SPLIT` будущий патч не ломает, пока runtime split не утверждён отдельно.

---

## Protocol mechanics pending human review

Это не approved economics и не смена модели.

| Механика | Что зафиксировал этот proposal |
| --- | --- |
| Successful transfer как источник `C`/`N` | **SUPERSEDED.** Каталог qualifying events **NOT YET APPROVED**. Реальный transfer сам по себе `C` и `N` не увеличивает |
| Исключения `C`/`N` | **SUPERSEDED** вместе с transfer-окном. Пока каталога нет, исключений тоже нет: `C = 0`, `N = 0` |
| `C` | **APPROVED замена:** число различных Growth Epoch с хотя бы одним qualifying contribution event |
| `N` | **APPROVED замена:** число различных Growth Epoch с хотя бы одним qualifying network-activity event |
| Окно `C`/`N` | **SUPERSEDED.** Не сброс на следующую эпоху. Несколько событий одной эпохи дают +1 |
| Фиксация `C`/`N` | Квалификация по снимку эпохи. Settlement L1/L2 и Claim D исполняются |
| Номер эпохи | `height >= 1 → floor((height - 1) / 201600) + 1`, height 0 вне эпохи |
| Целые | safe integer, единица `1`, mul затем div, float-ветка `FeeSplitter` не используется |
| Partial claim | отвергается, запись неделима |
| Место перехода | внутри применения блока, в state root, не в `tick()` |

---

## OUTSIDE v0.1 / FUTURE SPECIFICATION

Критерий здесь не выбирается. Это не открытые развилки v0.1 и не новые параметры.

| Item | Пометка |
| --- | --- |
| Future S gate | **OUTSIDE v0.1 / FUTURE SPECIFICATION** |
| Wash detection | **OUTSIDE v0.1 / FUTURE SPECIFICATION** |
| Fraud/reversal | **OUTSIDE v0.1 / FUTURE SPECIFICATION** |
| Supply / emission | **OUTSIDE v0.1 / FUTURE SPECIFICATION** |
| Production activation | **OUTSIDE v0.1 / FUTURE SPECIFICATION** |
| Runtime split activation timing | **OUTSIDE v0.1 / FUTURE SPECIFICATION** |

В v0.1 при этом уже зафиксировано: `S = 0`; wash не влияет на выплату; ребро immutable, clawback нет; supply и emission не задаются; production не включается. Eligible integer fee на живом пути режется Model A, а не 100% валидаторам.

Прежняя формулировка «`C`/`N` = successful transfer текущей эпохи» этим абзацем **больше не закрывается как действующее правило**. Она заменена. Целая арифметика и «expired claim не освобождает квоту 2%» остаются. Settlement L1/L2 и Claim D исполняются. Wash, S-gate и clawback не исполняются.

L2 additional L1-gate: **NOT APPROVED**. Это documentation inconsistency таблицы модели, не правило v0.1.

---

## Compliance

Каждый параметр approved model в этом файле unchanged. Runtime не приведён к модели.

| Parameter | Approved | Proposal |
| --- | --- | --- |
| Validators | 30 | unchanged |
| Community Pool | 25 | unchanged |
| Treasury | 20 | unchanged |
| Liquidity & Ecosystem | 10 | unchanged |
| Growth Pool | 15 | unchanged |
| Burn | 0 | unchanged |
| CURRENT RUNTIME | не параметр исходной модели | eligible integer fee режется Model A. Это implementation decision, subject to audit |
| Growth Epoch | 201 600 | unchanged |
| `B` | `min(available, reference)` | unchanged |
| Bootstrap C | первая эпоха `reference = I`; далее floor-среднее предыдущих, максимум 8; текущая не входит | unchanged |
| Paid levels | L1+L2; L3–L5 payout 0 | unchanged |
| Weights | 50/25/15/7/3; знаменатель только L1+L2 | unchanged |
| Maturation | 2/4/6/8/10; эпоха включения не платится; пауза не сбрасывает; 6/8/10 без выплаты | unchanged |
| Score | `min(1000, 40×C + 14×N)`, `S` не входит | implementation decision, subject to audit. Старый `isqrt` не считается |
| `S` | 0, пока gate не задан | unchanged |
| L1 | 180, `C≥4`, `N≥4`, age≥2 | unchanged |
| L2 | score ≥ 280, `C ≥ 5`, `N ≥ 6`, age ≥ 4 | unchanged. Фраза «плюс ворота L1» в таблице модели не применяется: documentation inconsistency, **NOT APPROVED** |
| Referrer cap | 5% `B` за эпоху | unchanged |
| Edge cap | 1% `B` за эпоху | unchanged |
| 8-epoch cap | 2% суммы `B` | unchanged. Protocol accounting: числитель = allocated, expired место не освобождает |
| Empty pool | FORFEIT | unchanged. Следствие: нет allocation, нет Pending, нет rollover, terminal |
| Claim D | Pending → Claimable → Settled; через 4 эпохи в пул; не lock | unchanged |
| Remainder | в пуле, `B` не поднимает | unchanged |
| Rounding | floor; порядок адресов | unchanged. Плюс шаг 6 равного деления из §7 |
| Eligible set | transfer, launch, `tx.fee`, curve trading | unchanged |
| Not eligible | principal, stake, project-token, NFT, AMM, promotion, API | unchanged |
| Depth | max 5, reject, без clamp | unchanged |
| Conservation | три идентичности | unchanged |
| Supply / emission | **OUTSIDE v0.1 / FUTURE SPECIFICATION** | не заданы, критерий не выбирается |
| Production activation | **OUTSIDE v0.1 / FUTURE SPECIFICATION** | не включается |
| Runtime split activation timing | **OUTSIDE v0.1 / FUTURE SPECIFICATION** | CURRENT RUNTIME не сдвигается |

---

## Фазы 0–9

Фазы не включают код и не активируют экономику.

| Фаза | Содержание | Код |
| --- | --- | --- |
| 0 | Этот документ. APPROVED / Growth / Referral Protocol v0.1 | нет |
| 1 | Human review protocol mechanics этого файла. Проценты не двигаются | нет |
| 2 | Зафиксировать хранимые поля из State model | нет |
| 3 | Функции `reference` и `B` на векторах модели | нет |
| 4 | Граф, depth reject, score при `S = 0` | нет |
| 5 | Назначение по §7, FORFEIT без записи | нет |
| 6 | Claim D и проверки double/replay/expiry/partial/duplicate | нет |
| 7 | `sGate` возвращает 0 | нет |
| 8 | Структурные проверки. Wash не включается | нет |
| 9 | Единственное место будущего патча runtime. Production только отдельным допуском | нет, пока нет нового утверждения |

Фаза 9 не начинается из слияния этого документа. До неё CURRENT RUNTIME остаётся 100% validators.
