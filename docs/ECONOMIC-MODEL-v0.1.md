# Economic Model v0.1 — Network Growth Rewards

## 1. STATUS

- Документ = **APPROVED / Economic Model v0.1**
- Рабочая модель = **Model A**: Validators 30 / Community Pool 25 / Treasury 20 / Liquidity & Ecosystem 10 / Growth Pool 15 / Burn 0
- Active Beta Growth/Referral payout: **L1 = 70%**, **L2 = 30%** of the Growth reward budget. No additional paid referral levels. No new emission
- Model B (25 / 25 / 20 / 10 / 20 / 0) = посчитанная альтернатива. Рабочей моделью не является
- Production protocol parameters in this document = **APPROVED** as Model A + Beta Growth weights
- Growth Pool / Model A live fee split in code = **IMPLEMENTED** (`GROWTH_FEE_SPLIT_ACTIVE = true` in `people-node/packages/core/src/growth-pool.ts`; see `docs/PROTOCOL-DECISIONS.md`, subject to audit)
- Runtime eligible-integer fee split = **Model A** 30/25/20/10/15/0 when Growth fee split is active. `LEGACY_FEE_SPLIT` (100% validators) remains the fallback for non-eligible fees and explicit legacy `config.feeSplit` paths — it is **not** the live Model A path

Восемь решений founder закрыты в этом тексте. Новых параметров сверх уже зафиксированного набора нет. Смена механики остатка и добавление fee source — только новая версия спецификации или отдельное изменение спецификации, не правка этой таблицы.

Вариант B архитектуры не переоткрывается: отдельный Growth Pool, выплата не вычитается из приглашённого, пул ограничивает сумму, платим за квалифицированную активность. Источник устройства: People Growth Protocol v0.1, draft PR #1, ветка `cursor/people-growth-protocol-v0-1-e9eb`, коммит `0deea80`.

USD в стресс-тесте — внешний масштаб объёма комиссий, не цена PPL. Скрипт `growth-model-v0.1-stress.py` по-прежнему кодирует прежний warmup (делитель 8, эпоха 1 с `B = 0`). Этот warmup не является bootstrap C. Остаток около **4,5 × I** после прогрева скрипта — следствие того warmup.

Native asset (current): **People**, ticker **PPL**, runtime map id **`ppl`**. There is no parallel current `vls` asset. Load-time migration remaps old snapshot keys `vls` → `ppl`.

Implementation status of Growth Pool, settlement, and live Model A split is recorded in `docs/PROTOCOL-DECISIONS.md` and must match code. This document’s economic identities (Model A percentages, Beta L1=70 / L2=30) are not changed by asset rename. Where this file previously drifted from runtime (score formula, maturation, L1 age), **runtime + `docs/PROTOCOL-DECISIONS.md` win**; those rows are synced below.

---

## 2. Model A и рассчитанная альтернатива B

Одинаковая база комиссий эпохи. Low concentration, квалификация 20%, $5 на участника в месяц, эпоха 16 стресс-теста. Комиссии эпохи ≈ $1 166 667. Цифры — сценарий объёма, не константы протокола.

| | Model A, рабочая | Model B, только расчёт | Разница в сценарии |
| --- | ---: | ---: | ---: |
| Validators | 30% → $350 000 | 25% → $291 667 | A на $58 333 больше за эпоху |
| Growth Pool | 15% → $175 000 | 20% → $233 333 | B на $58 333 больше за эпоху |
| Community Pool | 25% → $291 667 | 25% → $291 667 | 0 |
| Treasury | 20% → $233 333 | 20% → $233 333 | 0 |
| Liquidity & Ecosystem | 10% → $116 667 | 10% → $116 667 | 0 |
| Burn | 0 | 0 | 0 |
| Max budget эпохи `B` после прогрева скрипта | $175 000 | $233 333 | отношение 20/15 = 4/3 |
| Max реферер, low, эпоха 16 | $1,46 | $1,94 | та же пропорция 4/3 |
| Потолок реферера в high, 2% `B` | $3 500 | $4 667 | та же пропорция 4/3 |

В low обе строки после прогрева скрипта выплачивают почти весь свой `B`. В high обе оставляют около 45% `B` выплаченными и около 55% `B` в пуле (`growth-model-v0.1-stress-results.md`, след high, эпохи 9–16). Для v0.1 действует только Model A.

Security budget сети в Model A — строка validators, 30%. Growth incentive — строка Growth Pool, 15%, и потолки, которые считаются от её `B`. Treasury 20% — не автоматический referral budget. Liquidity & Ecosystem 10% — не гарантированная поддержка цены. Burn = 0: supply, emission и объём комиссий как протокол не утверждены; возврат burn — отдельное решение, не эта версия.

Историческая таблица 40/25/20/10/5 — provisional reference (`docs/ECONOMICS.md` §6, константа `PROVISIONAL_FEE_SPLIT`). В v0.1 она не рабочая. Живой eligible-integer путь — Model A при `GROWTH_FEE_SPLIT_ACTIVE = true` (`docs/PROTOCOL-DECISIONS.md`). `LEGACY_FEE_SPLIT` остаётся запасным путём для не-eligible / явного legacy `feeSplit`, не текущей публичной Model A.

---

## 3. Bootstrap C

`I` — внешний inflow эпохи в Growth Pool. Запас пула reference не поднимает.

```text
если завершённых эпох нет:
    reference = I этой эпохи          # один раз
иначе:
    reference = floor(сумма inflow предыдущих завершённых эпох / их число)
    берутся только последние завершённые, максимум 8
B = min(available, reference)
```

Первая эпоха с inflow получает ненулевой `B`, и этот `B` не выше этого inflow. Со второй эпохи текущий inflow в reference не входит. Возврат невостребованного claim в `totalReturned` reference не увеличивает.

Правила A (первые 8 эпох `B = 0`) и B (пока история короче 8, среднее всех прошлых, эпоха 1 остаётся 0) в v0.1 не используются.

---

## 4. Score (current runtime)

Источник: `people-node/packages/core/src/growth-qualification.ts` и `docs/PROTOCOL-DECISIONS.md`. Это **implementation decision, subject to audit**, не исходная isqrt-формула модели.

```text
Score = min(1000, 40×C + 14×N)
```

Только целое. `S` остаётся 0 и **в сумму не входит**. `isqrt` нет. `C` и `N` — число различных Growth Epoch с qualifying contribution / network-activity событием (каталог в PROTOCOL-DECISIONS), не «уникальные контрагенты / число tx за текущую эпоху».

Проверка границ (runtime):

| (C, N) | Score | Ворота score |
| --- | ---: | --- |
| (4, 4) | 216 | L1 `score ≥ 180` проходит |
| (5, 6) | 284 | L2 `score ≥ 280` проходит |

**Superseded in this file (do not use as live rule):** `min(1000, 70×isqrt(C)+20×isqrt(N)+100×S)` with `C`/`N` as unique counterparties / tx count. That formula is historical model text; runtime does not compute it.

`docs/MOBILE-MINING.md` отделяет humanity от формулы награды. На выплату score не умножает: после порога вес кортежа равен `W1` или `W2`.

---

## 5. Claim D

Pending → Claimable сразу после settlement. Claimable → Settled после claim: тогда PPL зачисляется рефереру. Через 4 Growth Epoch невостребованное возвращается в Growth Pool (`totalReturned`). Это claim window, не token lock. Anti-sell-pressure в v0.1 нет.

Невостребованное не сжигается и в ту же эпоху другим не раздаётся. Возврат не является новым inflow и reference для `B` не поднимает.

---

## 6. Remainder

Неиспользованный остаток остаётся в Growth Pool. Он не увеличивает `B`. Ceiling нет. Automatic sweep, redistribution и decay нет. Накопление само по себе не forfeit.

Forfeit относится только к эпохе с `B = 0` или к кортежу, который floor и кепы сводят к 0: квалификация наблюдаема, payout 0, личного долга нет, задней доплаты нет, новых PPL нет.

Смена механики остатка — только новая версия спецификации.

Следствие, уже видимое в стресс-тесте high при ровном inflow: с эпохи, где кепы держат выплату, paid ≈ 45% `B`, и около 55% `B` остаётся в пуле. `available` при этом растёт без верхней границы. Это не эмиссия и не долг участникам. В v0.1 граница на этот запас не вводится.

---

## 7. Rounding

Только целые базовые единицы нативного актива. Float в settlement нет.

1. Inflow эпохи — целое. `reference` — целое частное (`floor`).
2. `B = min(available, reference)`.
3. Порядок кортежей: байты адреса реферера → байты адреса приглашённого → уровень по возрастанию.
4. `raw = floor(B × weight / weightSum)` для кортежей Growth Referral: только L1 и L2. `weightSum` — сумма их весов. Активные веса Beta: L1 = 70, L2 = 30. Additional paid referral levels are not part of this model.
5. Кеп ребра `floor(B × 1 / 100)`, кеп реферера `floor(B × 5 / 100)`, окно `floor(sum(B окна) × 2 / 100)`. Режется в этом порядке, по тому же каноническому списку. Окно — не больше 8 последних бюджетов, считается с эпохи 1; недостающие слоты — 0.
6. Внутри одного реферера сумма делится поровну, тоже `floor`. Остаток от деления не отдаётся первым адресам.
7. Хвост остаётся в Growth Pool. Новых единиц нет и уничтожения нет.

`epochAllocations` хранит `B` и фактически списанное. Хвост никому не записывается как право.

При `B < 100` кеп ребра `floor(B / 100) = 0`: все рёбра получают 0, хотя `B > 0`. Это следствие floor, отдельного исключения нет.

---

## 8. Eligible Fee Base

CLOSED SET. Статус **APPROVED**. 15% считается только от перечисленных ниже protocol fees в PPL.

**Eligible:**

- transfer fee
- token launch fee
- protocol `tx.fee`
- curve trading fee (`CURVE_FEE_BPS = 100`, путь `routeTradingFee`; это не эпохальный `feePool`, но в базу входит)

**Not eligible in v0.1:**

- principal
- stake
- project-token amounts
- NFT fees
- AMM swap fees
- promotion fees
- API fees

Новые fee sources — только отдельным изменением спецификации.

Исключение из базы не равно исключению из qualifying tx. Комиссия transfer может входить в 15% и одновременно не считаться qualifying tx.

---

## 9. Canonical flow

```text
Network fee
  → Eligible Fee Base
  → 15% Growth Pool
  → B
  → qualified L1 и L2
  → weights 70/30 + caps
  → Pending
  → Claimable
  → Settled
  → PPL на баланс реферера
```

Невостребованный Claimable через 4 эпохи возвращается в Growth Pool.

На этом пути обычная награда приглашённого не меняется. Supply PPL не растёт. Community Pool, Treasury и validator reward этим settlement не дебетуются и не пополняются из Growth. Существующий validator referral остаётся отдельным: `referralShare` 0,05, clamp 0–0,2, cut из награды приглашённого валидатора. В этот поток он не входит.

Шаблон запуска проекта 60/10/15/10/5 не меняется. Обязательные 10% project Community Pool не трогаются. Процент project referral в v0.1 не задан.

Учёт:

```text
totalDebited = claimedSettled + escrow + totalReturned
available = totalInflow − totalDebited + totalReturned
available + escrow + claimedSettled = totalInflow
```

Escrow не вычитается второй раз, если он уже внутри `totalDebited`.

---

## 10. Qualification, глубина, пустой бюджет

Граф: лес, один родитель, без self и без циклов. Ребро неизменно, кроме fraud/reversal. Link и QR — не состояние.

Max depth = 2 (L1/L2 only). Ребро, которое дало бы depth > 2, отклоняется. Silent clamp и отображение depth > 2 в depth 2 запрещены.

Growth Referral has exactly two levels: L1 (direct referral) and L2 (second level). Active Beta weights: `W1 = 70`, `W2 = 30`. No additional paid referral levels. Historical weights 50/25/15/7/3 are not used for payout.

Созревание ребра (runtime `REFERRAL_MATURATION_EPOCHS = 1`): один полностью завершённый Growth Epoch **после** `linkedAtHeight`. Эпоха включения не завершает созревание. Пауза возраст не сбрасывает. У L1 **нет** порога возраста участника. У L2 есть `age >= 4` (завершённые Growth Epoch с регистрации).

Ворота (runtime + PROTOCOL-DECISIONS):

- L1: зарегистрирован, действительное ребро, ребро созрело (1 эпоха), `C ≥ 4`, `N ≥ 4`, `score ≥ 180`
- L2: `score ≥ 280`, `C ≥ 5`, `N ≥ 6`, `age ≥ 4`, ребро созрело. Отдельного prerequisite «сначала L1» нет

Кепы, избыток остаётся в пуле и не перераздаётся:

- реферер: 5% `B` за эпоху, все уровни вместе
- ребро: 1% `B` за эпоху
- окно до 8 эпох: один реферер ≤ 2% суммы `B` этих эпох, окно с эпохи 1

Пустой пул и `B = 0`: FORFEIT. Квалификация наблюдаема, payout 0, долга нет, ретроактивного claim нет, новых PPL нет.

Qualifying tx — не любая paid tx. В `C` и `N` не входят: self-transfer; tx с нулевой комиссией; validator join, stake, attestation, block production; перевод, чей единственный контрагент — прямой реферер. Детектор колец разных адресов в коде отсутствует. Это implementation prerequisite, не параметр v0.1 и не работающая защита.

Growth Epoch = 201 600 блоков ≈ 7 суток при интервале блока 3 с. Это не validator epoch (каждые 10 блоков). Settlement не выполняется внутри validator epoch.

---

## 11. Финальная таблица

| Parameter | Value | Status |
| --- | --- | --- |
| Fee Split | Validators 30 / Community Pool 25 / Treasury 20 / Liquidity & Ecosystem 10 / Growth Pool 15 / Burn 0 | APPROVED |
| Native asset | People / ticker PPL / runtime id `ppl` (legacy snapshot key `vls` migrated on load) | CURRENT runtime |
| Growth Pool | 15% eligible PPL fees, отдельный bucket; новой эмиссии нет; не CP, не treasury, не validator reward, не liquidity, не burn | APPROVED |
| Growth Epoch | 201 600 блоков ≈ 7 суток при 3 с; не validator epoch | APPROVED |
| Budget `B` | `B = min(available, reference)`; запас `B` не поднимает | APPROVED |
| Bootstrap | C: нет завершённых эпох → reference первой эпохи один раз = её inflow; далее floor-среднее предыдущих завершённых, максимум 8; `B` первой эпохи с inflow ненулевой и не выше этого inflow | APPROVED |
| Paid Levels | L1 = 70%, L2 = 30%; no additional paid referral levels | APPROVED |
| W1–W2 | Beta: 70 / 30 (`weightSum` = 100) | APPROVED |
| Maturation | 1 completed Growth Epoch after `linkedAtHeight`; L1 has no participant-age gate; L2 `age ≥ 4` | CURRENT (runtime / PROTOCOL-DECISIONS) |
| Activity Score | `min(1000, 40×C + 14×N)`; `S = 0` not in sum; not a payout multiplier | IMPLEMENTATION DECISION, subject to audit |
| `S` | remains 0; not added into score in runtime | PROTOCOL-DECISIONS |
| L1 threshold | score ≥ 180, `C ≥ 4`, `N ≥ 4`, matured edge; no participant age | CURRENT |
| L2 threshold | score ≥ 280, `C ≥ 5`, `N ≥ 6`, `age ≥ 4`, matured edge | CURRENT |
| Referrer cap | 5% `B` за эпоху | APPROVED |
| Edge cap | 1% `B` за эпоху | APPROVED |
| 8-epoch cap | ≤ 2% суммы `B` окна до 8 эпох, окно с эпохи 1; избыток в пуле, без перераздачи | APPROVED |
| Empty Pool | FORFEIT: payout 0, долга нет, задней доплаты нет, новых PPL нет | APPROVED |
| Claim | D: Pending → Claimable сразу после settlement; Claimable → Settled после claim; через 4 эпохи невостребованное в Growth Pool; это claim window, не token lock | APPROVED |
| Remainder | остаётся в Growth Pool; `B` не увеличивает; ceiling нет; automatic sweep / redistribution / decay нет; накопление само по себе не forfeit; смена механики — только новая версия спецификации | APPROVED |
| Rounding | `floor`; хвост в Growth Pool; порядок: адрес реферера → адрес приглашённого → уровень | APPROVED |
| Eligible Fee Base | CLOSED SET. Eligible: transfer fee, token launch fee, protocol `tx.fee`, curve trading fee. Not eligible: principal, stake, project-token amounts, NFT fees, AMM swap fees, promotion fees, API fees. Новый source — отдельное изменение спецификации | APPROVED |
| Depth | max depth = 2 (L1/L2 only); depth > 2 отклоняется; silent clamp и mapping depth > 2 в depth 2 запрещены | APPROVED |
| Conservation | `available = totalInflow − totalDebited + totalReturned`; `totalDebited = claimedSettled + escrow + totalReturned`; `available + escrow + claimedSettled = totalInflow`; возврат claim — не новый inflow | APPROVED |

Model B в эту таблицу не входит.

---

## 12. Consistency / arithmetic check

Проверено целыми на формулах этой версии. Новых параметров проверка не добавила.

Сошлось:

- Сплит Model A: `30 + 25 + 20 + 10 + 15 + 0 = 100`.
- Веса Beta Growth Referral: `70 + 30 = 100`. No additional paid referral levels.
- Score runtime: `(4,4) = 216`, `(5,6) = 284`. L1 and L2 score gates pass at those catalog minima.
- При `B = 1 000 000`: кеп ребра `10 000`, кеп реферера `50 000 = 5 × 10 000`, окно восьми равных `B` равно `160 000 = 16 × 10 000`. Три всплеска по 5% (`150 000`) в окно входят, четвёртый (`200 000`) нет. `1% < 2% < 5%`: одно ребро не заполняет ни окно, ни кеп реферера.
- Bootstrap C, inflow 100 девять эпох, полная выплата `B`: reference = 100, `B = 100`, `available` в конце эпохи 0. Эпоха 10, inflow 200: reference = 100, `B = 100`, `available` в конце 100. На каждой эпохе `B ≤ reference`. Запас reference не поднимает.
- Тождество: если `totalDebited` уже включает escrow и `totalReturned`, то `available + escrow + claimedSettled = totalInflow`. Возврат claim в reference не входит.
- Growth Referral economics and graph structure cover L1 and L2 only (`MAX_PARTICIPANT_REFERRAL_DEPTH = 2`).
- Eligible set замкнут перечислением §8 и не включает principal, stake, project-token, NFT, AMM swap, promotion, API.
- В сценарии high стресс-теста paid ≈ 45% `B`, около 55% `B` остаётся в пуле. Это следствие кепов и правила остатка. Ceiling этой версией не вводится.

Вне v0.1, параметров здесь нет:

- детали storage / migrations / consensus wiring (см. код и `docs/PROTOCOL-DECISIONS.md`);
- live Model A enablement vs `LEGACY_FEE_SPLIT` fallback paths (зарегистрировано отдельно; eligible-integer путь — Model A);
- исторический split 40/25/20/10/5;
- Model B как рабочая модель;
- механизм humanity/verification gate: до отдельной спецификации `S = 0`;
- детектор wash-колец разных адресов;
- коэффициенты Participation Power;
- genesis supply и emission;
- процент project referral;
- цена PPL и перевод USD в PPL;
- lock против продажи;
- warmup скрипта `growth-model-v0.1-stress.py` (эпоха 1 с `B = 0`, делитель 8). Его остаток около 4,5 × I не является bootstrap C.

Production protocol этим документом не изменён.

---

## Appendix — public PPL tariffs (outside Growth v0.1)

Owner-approved **2026-09-29** (Solana-aligned operator defaults; not Growth percentages):

| Operation | Default PPL | Config / constant |
| --- | ---: | --- |
| Ordinary transfer | 0.004875 | `DEFAULT_TRANSFER_FEE` in `@people/core` / `@people/sdk` |
| Token create (minimum) | 1.045005 | `TOKEN_CREATE_MIN_FEE` |
| NFT mint (minimum) | 2.925 | `NFT_MINT_MIN_FEE` |
| EVM contract gas | 8.7e-7 PPL / gas | `APPROVED_CONTRACT_GAS_PRICE_PPL` in `@people/protocol`; typical deploy ~1.2e6 gas ≈ 1.044 PPL |

Batch transfer fees scale with the transfer tariff (`BATCH_FEE_BASE` = transfer default). Non-integer fees remain ineligible for Growth Pool settlement per §8 and `docs/PROTOCOL-DECISIONS.md`. Factory wiring: `docs/TOKEN-NFT-FACTORY-REPORT.md`. Contract gas: `docs/SMART-CONTRACTS-REPORT.md`.

Operational note (does **not** change Model A percentages, L1=70 / L2=30, Claim D, or caps): the live public testnet `people-public-testnet-v2-2026-09-30` currently splits eligible non-integer protocol `tx.fee` in micro-PPL, as recorded in `docs/PROTOCOL-DECISIONS.md`. That is the running v2 chain. This appendix sentence is the v0.1 spec text. Do not silently change consensus to match one document or the other without a founder spec version.
