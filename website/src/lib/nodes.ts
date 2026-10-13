import { ArchitectureNodeContent } from "./content";
import type { Language } from "./preferences";

export const ARCHITECTURE_NODES_DATA: Record<Language, Record<string, ArchitectureNodeContent>> = {
  "en": {
    "multi-asset-ledger": {
      "id": "multi-asset-ledger",
      "name": "Multi-Asset Ledger",
      "phase": "Phase 1: Core Infrastructure",
      "status": "IMPLEMENTED",
      "summary": "Native and user-issued asset accounting engine supporting multiple assets per account while maintaining backward compatibility with the legacy single-asset state.",
      "technicalDetails": [
        "Account views stay consistent for the native asset People (PPL) across balances",
        "Canonical Asset Registry tracking symbol, name, decimals, issuer, maxSupply, and active/frozen status",
        "Fixed integer base units so rounding cannot create or destroy tokens"
      ],
      "invariants": [
        "No account balance can fall below zero under any valid transaction sequence",
        "Native asset supply is conserved across transfers: balance_A' + balance_B' + fee = balance_A + balance_B"
      ]
    },
    "feesplitter": {
      "id": "feesplitter",
      "name": "FeeSplitter Engine",
      "phase": "Phase 1: Core Infrastructure",
      "status": "IMPLEMENTED",
      "summary": "Fee routing sends each protocol fee to validators, community pool, treasury, liquidity, Growth (15%), and burn (0%).",
      "technicalDetails": [
        "Exact integer conservation: sum(shares) = totalFee guaranteed on every transaction",
        "Integer floor division with deterministic remainder routing to prevent token leakage or inflation",
        "Protocol fee split: 30% Validators, 25% Community Pool, 20% Treasury, 10% Liquidity & Ecosystem, 15% Growth Pool, 0% Burn",
      ],
      "invariants": [
        "Conservation Invariant: ValidatorShare + CommunityShare + TreasuryShare + LiquidityShare + GrowthShare + Burned = TotalFee",
        "Zero token creation or destruction during fee splitting calculations"
      ]
    },
    "community-pool": {
      "id": "community-pool",
      "name": "Community Pool Registry",
      "phase": "Phase 1: Core Infrastructure",
      "status": "IMPLEMENTED",
      "summary": "Protocol-level accounting state that tracks lifetime allocations, distributions, and available balances across every asset in the ecosystem.",
      "technicalDetails": [
        "Multi-asset registry tracking allocated, distributed, and remaining balances per asset",
        "Funded from network-fee distributions and mandatory token launch allocations",
        "Participant reward distribution is part of the human network design"
      ],
      "invariants": [
        "Lifetime conservation: totalAllocated = totalDistributed + remainingBalance for all tracked assets",
        "Distributions are cryptographically authorized and capped strictly by remainingBalance"
      ]
    },
    "token-factory": {
      "id": "token-factory",
      "name": "Token Factory",
      "phase": "Phase 2: Economic Layer",
      "status": "IMPLEMENTED",
      "summary": "Protocol primitive enabling creators to launch community tokens with standardized supply allocations and anti-rug vesting schedules.",
      "technicalDetails": [
        "Deterministic 5-way supply split: 60% Bonding Curve, 10% Community Pool, 15% Creator, 10% Liquidity Reserve, 5% Ecosystem Reserve",
        "Mandatory launch fee in PPL (`TOKEN_CREATE_MIN_FEE`; default 1.045005 PPL) routed to protocol fee sinks",
        "Exact supply bounding: integer division remainders assigned to curve allocation to guarantee sum(allocations) === totalSupply"
      ],
      "invariants": [
        "Supply Invariant: Curve + CommunityPool + Creator + LiquidityReserve + EcosystemReserve = TotalSupply",
        "Initial token issuance requires valid creation transaction and launch fee payment"
      ]
    },
    "nft-factory": {
      "id": "nft-factory",
      "name": "NFT mint",
      "phase": "Phase 2: Economic Layer",
      "status": "IMPLEMENTED",
      "summary": "Minimal unique-item mint: name, description, image URI, optional collection, owner, and transfer. Not a Token Factory supply split.",
      "technicalDetails": [
        "Transaction types nftMint and nftTransfer; records live in chain state and the state root",
        "Image is stored off-chain (URL, Blob, or sha256: digest); the chain keeps the URI",
        "Mint fee is paid in PPL; the public amount is operator-configured and is not a Growth nftFee bucket"
      ],
      "invariants": [
        "Each nftId is unique; only the current owner can transfer",
        "NFTs do not allocate 10% of supply to a Community Pool"
      ]
    },
    "bonding-curve": {
      "id": "bonding-curve",
      "name": "Virtual Constant-Product Curve",
      "phase": "Phase 2: Economic Layer",
      "status": "IMPLEMENTED",
      "summary": "Autonomous on-chain market maker operating on a virtual constant-product formula (K = X * Y) providing instant algorithmic liquidity from block zero.",
      "technicalDetails": [
        "Virtual constant-product invariant K = X * Y with initial virtual native reserve Y0 = 60 PPL",
        "Integer-safe floor arithmetic with zero floating point calculations for buy and sell executions",
        "1.00% protocol trading fee automatically extracted and routed through the Phase 1 FeeSplitter engine"
      ],
      "invariants": [
        "Invariant Preservation: (X + dx) * (Y - dy) >= K on sells; (X - dx) * (Y + dy) >= K on buys",
        "Round-trip arbitrage immunity: sell returns <= original buy cost across all trade sizes"
      ]
    },
    "creator-vesting": {
      "id": "creator-vesting",
      "name": "Creator Vesting Schedule",
      "phase": "Phase 2: Economic Layer",
      "status": "IMPLEMENTED",
      "summary": "On-chain vesting engine enforcing creator alignment and mitigating sudden liquidity dumps following token launch.",
      "technicalDetails": [
        "10% upfront allocation unlocked immediately upon token creation for initial setup",
        "90% remaining allocation vests linearly over 180 days (5,184,000 blocks at 3s/block)",
        "Claimable on-demand via protocol-level creatorClaim transaction with verified block height tracking"
      ],
      "invariants": [
        "Claim Limit: totalClaimed <= upfrontUnlocked + floor((blocksElapsed * 0.9 * totalAllocation) / durationBlocks)",
        "Vesting claims strictly decrease vesting pool and increase creator liquid balance by identical quantity"
      ]
    },
    "liquidity-migration": {
      "id": "liquidity-migration",
      "name": "AMM Liquidity Migration",
      "phase": "Phase 2: Economic Layer",
      "status": "IMPLEMENTED",
      "summary": "Automatic protocol trigger that graduates a mature bonding curve to a locked AMM liquidity pool. Constant-product AMM swaps are live.",
      "technicalDetails": [
        "Trigger when curve inventory falls to <= 1/3 of initial allocation",
        "Moves native reserve and reserved tokens into a locked liquidity pair",
        "Keeps spot price continuous into the locked pool",
        "Constant-product AMM swaps, LP shares, and token/PPL pools are live"
      ],
      "invariants": [
        "Atomic transition: curve permanently shifts status to 'migrated' and disables further curve buy/sell transactions",
        "Initial AMM pool reserves match migrated balances with permanent liquidity lock"
      ]
    },
    "mobile-mining": {
      "id": "mobile-mining",
      "name": "Mobile Mining Engine · Phase 3",
      "phase": "Phase 3: Human Network",
      "status": "DESIGN",
      "summary": "Lightweight participation protocol allowing ordinary users on phones, tablets, or browsers to contribute useful activity and earn community rewards without running consensus hardware (Phase 3 design).",
      "technicalDetails": [
        "NOT Proof-of-Work: no battery-draining hash loops or computational waste",
        "Distinct from validator consensus: participants do NOT produce blocks or sign attestation quorums",
        "Session-based participation model with telemetry, activity check-ins, and network health monitoring (Design stage)"
      ],
      "invariants": [
        "Role Separation: Participant state cannot directly compromise validator consensus safety",
        "Inactivity penalizes session reward accrual but never slashes validator staking collateral"
      ]
    },
    "proof-of-humanity": {
      "id": "proof-of-humanity",
      "name": "Proof of Humanity · Phase 3",
      "phase": "Phase 3: Human Network",
      "status": "DESIGN",
      "summary": "Multi-signal human verification without storing biometric identity on the chain.",
      "technicalDetails": [
        "Multi-layered identity signals under research: account age, device continuity, behavioral consistency, and social attestations",
        "Zero biometric storage: avoids centralized or dystopian biometric databases",
        "Tiered verification: easy entry, stronger checks for higher reward tiers"
      ],
      "invariants": [
        "Integer-bounded score scaling; no floating-point influence scores",
        "Privacy preservation: no personally identifiable information (PII) recorded in ledger state"
      ]
    },
    "anti-sybil": {
      "id": "anti-sybil",
      "name": "Anti-Sybil Architecture · Phase 3",
      "phase": "Phase 3: Human Network",
      "status": "DESIGN",
      "summary": "Behavioral signals and graph analysis to resist coordinated bot farms.",
      "technicalDetails": [
        "Network graph clustering analysis to detect coordinated referral rings and synthetic node clusters",
        "Statistical checks on participation patterns",
        "Attack cost is designed to exceed expected reward"
      ],
      "invariants": [
        "Collusion Resistance: Coordinated clusters cannot artificially amplify aggregate reward share",
        "False positives stay reviewable so honest people are not locked out"
      ]
    },
    "participation-power": {
      "id": "participation-power",
      "name": "Participation Power",
      "phase": "Phase 3: Human Network",
      "status": "DESIGN",
      "summary": "Non-transferable protocol metric determining an individual participant's relative proportion of future epoch community rewards (Phase 3 conceptual framework).",
      "technicalDetails": [
        "Power grows from base, activity, reputation, and contribution — with diminishing returns and a hard ceiling. Humanity is a gate, not a multiplier.",
        "Non-tokenized and non-transferable: prevents markets from buying synthetic influence",
        "Exact coefficients stay bounded by those safeguards rather than published as a farmable formula"
      ],
      "invariants": [
        "Every participant's power stays between zero and a protocol ceiling",
        "A participant's reward share follows their power relative to everyone eligible"
      ]
    }
  },
  "ru": {
    "multi-asset-ledger": {
      "id": "multi-asset-ledger",
      "name": "Мультиактивный реестр",
      "phase": "Фаза 1: Базовая инфраструктура",
      "status": "IMPLEMENTED",
      "summary": "Движок учета нативных и пользовательских активов, поддерживающий несколько балансов на аккаунт при сохранении обратной совместимости с исходным состоянием сети.",
      "technicalDetails": [
        "Синхронизация видов счёта для нативного актива People (PPL)",
        "Канонический Asset Registry для символов, имен, точности (decimals), эмитентов, maxSupply и статуса активности",
        "Фиксированные целочисленные базовые единицы исключают ошибки округления"
      ],
      "invariants": [
        "Ни один баланс счета не может стать отрицательным при любой валидной последовательности транзакций",
        "Предложение нативного актива сохраняется при переводах: balance_A' + balance_B' + fee = balance_A + balance_B"
      ]
    },
    "feesplitter": {
      "id": "feesplitter",
      "name": "Движок FeeSplitter",
      "phase": "Фаза 1: Базовая инфраструктура",
      "status": "IMPLEMENTED",
      "summary": "Маршрутизация комиссий: 30% валидаторам, 25% пулу сообщества, 20% казне, 10% ликвидности, 15% Growth, 0% сжигание.",
      "technicalDetails": [
        "Точное целочисленное сохранение: sum(shares) = totalFee гарантируется на каждой транзакции",
        "Целочисленный floor с детерминированным направлением остатка валидаторам исключает утечки и инфляцию",
        "Доли комиссии протокола: 30% валидаторы, 25% пул сообщества, 20% казна, 10% ликвидность и экосистема, 15% Growth Pool, 0% сжигание",
      ],
      "invariants": [
        "Инвариант сохранения: ValidatorShare + CommunityShare + TreasuryShare + LiquidityShare + GrowthShare + Burned = TotalFee",
        "Ноль создания или уничтожения токенов при расчетах долей комиссий"
      ]
    },
    "community-pool": {
      "id": "community-pool",
      "name": "Реестр Пула сообщества",
      "phase": "Фаза 1: Базовая инфраструктура",
      "status": "IMPLEMENTED",
      "summary": "Состояние реестра на уровне протокола, отслеживающее пожизненные начисления, распределения и доступные остатки по каждому активу в экосистеме.",
      "technicalDetails": [
        "Мультиактивный реестр: выделено, распределено и остаток по каждому активу",
        "Пополнение от распределения комиссий и отчислений при запуске токенов",
        "Выплаты участникам — часть дизайна сети людей"
      ],
      "invariants": [
        "Пожизненное сохранение: totalAllocated = totalDistributed + remainingBalance для всех активов",
        "Выплаты криптографически авторизованы и строго ограничены доступным remainingBalance"
      ]
    },
    "token-factory": {
      "id": "token-factory",
      "name": "Фабрика токенов (Token Factory)",
      "phase": "Фаза 2: Экономический слой",
      "status": "IMPLEMENTED",
      "summary": "Протокольный примитив, позволяющий авторам запускать токены сообществ со стандартизированным разделением предложения и анти-сливным вестингом.",
      "technicalDetails": [
        "Детерминированное 5-стороннее разделение: 60% Кривая, 10% Пул сообщества, 15% Автор, 10% Резерв ликвидности, 5% Резерв экосистемы",
        "Обязательный сбор за запуск в PPL (`TOKEN_CREATE_MIN_FEE`; по умолчанию 1.045005 PPL) направляется в пулы протокола",
        "Точное ограничение предложения: остатки целочисленного деления отдаются кривой (sum === totalSupply)"
      ],
      "invariants": [
        "Инвариант предложения: Curve + CommunityPool + Creator + LiquidityReserve + EcosystemReserve = TotalSupply",
        "Эмиссия требует валидной транзакции создания и оплаты комиссии за запуск"
      ]
    },
    "nft-factory": {
      "id": "nft-factory",
      "name": "Выпуск NFT",
      "phase": "Фаза 2: Экономический слой",
      "status": "IMPLEMENTED",
      "summary": "Минимальный выпуск уникального объекта: имя, описание, URI картинки, необязательная коллекция, владелец и перевод. Это не сплит Token Factory.",
      "technicalDetails": [
        "Типы транзакций nftMint и nftTransfer; записи входят в состояние цепи и в stateRoot",
        "Картинка хранится вне цепи (URL, Blob или дайджест sha256:); в цепи остаётся URI",
        "Комиссия за выпуск в PPL; публичная сумма задаётся оператором и не является отдельным nftFee в Growth"
      ],
      "invariants": [
        "nftId уникален; перевести может только текущий владелец",
        "NFT не отчисляют 10% предложения в Community Pool"
      ]
    },
    "bonding-curve": {
      "id": "bonding-curve",
      "name": "Виртуальная Bonding Curve",
      "phase": "Фаза 2: Экономический слой",
      "status": "IMPLEMENTED",
      "summary": "Автономный ончейн-маркетмейкер постоянного произведения (K = X * Y), обеспечивающий алгоритмическую ликвидность и торги с первого блока.",
      "technicalDetails": [
        "Виртуальный инвариант K = X * Y при начальном виртуальном нативном резерве Y0 = 60 PPL",
        "Целочисленная арифметика BigInt floor без вычислений с плавающей запятой для покупок и продаж",
        "Комиссия за торги 1.00% автоматически направляется в движок FeeSplitter Фазы 1"
      ],
      "invariants": [
        "Сохранение инварианта: (X + dx) * (Y - dy) >= K при продаже; (X - dx) * (Y + dy) >= K при покупке",
        "Иммунитет к арбитражу: выручка от продажи <= исходная стоимость покупки на любом объеме"
      ]
    },
    "creator-vesting": {
      "id": "creator-vesting",
      "name": "Вестинг автора",
      "phase": "Фаза 2: Экономический слой",
      "status": "IMPLEMENTED",
      "summary": "Ончейн-движок линейного вестинга, защищающий сообщество от сброса монет автором сразу после запуска.",
      "technicalDetails": [
        "10% доли автора разблокируется мгновенно при создании токена на стартовые расходы",
        "90% остатка распределяется строго линейно за 180 дней (5,184,000 блоков при 3 сек/блок)",
        "Востребование через протокольную транзакцию creatorClaim с проверкой высоты блоков"
      ],
      "invariants": [
        "Лимит разблокировки: totalClaimed <= upfront + floor((blocksElapsed * 0.9 * totalAllocation) / duration)",
        "Транзакция строго списывает баланс пула вестинга и начисляет эквивалент на ликвидный адрес создателя"
      ]
    },
    "liquidity-migration": {
      "id": "liquidity-migration",
      "name": "Миграция ликвидности (AMM)",
      "phase": "Фаза 2: Экономический слой",
      "status": "IMPLEMENTED",
      "summary": "Автоматический протокольный триггер выпуска зрелой кривой в заблокированный пул автоматического маркетмейкера AMM Обмен AMM с постоянным произведением уже работает.",
      "technicalDetails": [
        "Срабатывание: остаток токенов на кривой падает до <= 1/3 начальной доли на кривой",
        "Переносит резерв PPL и токены ликвидности в залоченную пару",
        "Непрерывность цены в залоченный пул",
        "Более широкая торговля в пуле — следующий рыночный шаг"
      ],
      "invariants": [
        "Атомарный переход: кривая навсегда переходит в статус 'migrated', операции buy/sell на ней отключаются",
        "Резервы созданного AMM-пула строго соответствуют мигрированным объемам с пожизненным локом"
      ]
    },
    "mobile-mining": {
      "id": "mobile-mining",
      "name": "Мобильный майнинг · Фаза 3",
      "phase": "Фаза 3: Сеть людей",
      "status": "DESIGN",
      "summary": "Легковесный протокол участия, позволяющий обычным людям со смартфонов или планшетов приносить пользу сети без валидаторского оборудования (В РАЗРАБОТКЕ — Фаза 3).",
      "technicalDetails": [
        "НЕ Proof-of-Work: никаких энергозатратных хэш-циклов или перегрева батареи",
        "Отделен от валидации: участники НЕ создают блоки и НЕ подписывают кворумы аттестаций",
        "Сессионная модель участия с проверкой присутствия, телеметрией и оценкой полезности (стадия проектирования)"
      ],
      "invariants": [
        "Разделение ролей: состояние участника не может нарушить безопасность консенсуса валидаторов",
        "Неактивность снижает текущую награду, но никогда не сжигает стейкинг валидаторов"
      ]
    },
    "proof-of-humanity": {
      "id": "proof-of-humanity",
      "name": "Proof of Humanity · Фаза 3",
      "phase": "Фаза 3: Сеть людей",
      "status": "DESIGN",
      "summary": "Многофакторное подтверждение человеческого участия без хранения биометрии в цепи.",
      "technicalDetails": [
        "Многослойные сигналы подлинности: возраст счета, непрерывность устройства, ритмика и социальные связи (исследуется)",
        "Ноль хранения биометрии: протокол принципиально отвергает сбор отпечатков или сканирование радужки",
        "Многоуровневая верификация: простой вход и более сильные проверки для больших лимитов"
      ],
      "invariants": [
        "Целочисленное масштабирование оценки без чисел с плавающей точкой",
        "Принцип приватности: персональные данные (PII) никогда не записываются в блокчейн"
      ]
    },
    "anti-sybil": {
      "id": "anti-sybil",
      "name": "Защита Anti-Sybil · Фаза 3",
      "phase": "Фаза 3: Сеть людей",
      "status": "DESIGN",
      "summary": "Поведенческое обнаружение аномалий и анализ кластеров графа — концептуальная модель.",
      "technicalDetails": [
        "Анализ кластеров графа сети для выявления скоординированных реферальных колец и синтетических узлов",
        "Статистическое выявление поведенческих аномалий активности (концептуальная модель)",
        "Экономический барьер: затраты на атаку выше ожидаемой выгоды"
      ],
      "invariants": [
        "Устойчивость к сговору: скоординированные фермы не могут искусственно раздувать суммарную долю наград",
        "Ложные срабатывания можно оспорить, чтобы честных людей не отсекали"
      ]
    },
    "participation-power": {
      "id": "participation-power",
      "name": "Сила Участия",
      "phase": "Фаза 3: Сеть людей",
      "status": "DESIGN",
      "summary": "Неотчуждаемый показатель Силы Участия, определяющий относительную долю участника в будущих эпохальных наградах из пула сообщества (концептуальный фреймворк Фазы 3).",
      "technicalDetails": [
        "Сила растёт от базы, активности, репутации и вклада — с убывающей отдачей и жёстким потолком. Человечность — допуск, не множитель.",
        "Неотчуждаемый показатель Силы Участия: предотвращает покупку фальшивого веса крупным капиталом",
        "Точные коэффициенты ограничены этими защитами, а не публикуются как формула для накрутки"
      ],
      "invariants": [
        "Сила каждого участника остаётся между нулём и протокольным потолком",
        "Награда участника i = CommunityRewardEpoch * (Power_i / TotalNetworkPower) (Концепция)"
      ]
    }
  },
  "es": {
    "multi-asset-ledger": {
      "id": "multi-asset-ledger",
      "name": "Libro Mayor Multi-Activo",
      "phase": "Fase 1: Infraestructura Central",
      "status": "IMPLEMENTED",
      "summary": "Motor de contabilidad de activos nativos y emitidos por usuarios que admite múltiples activos por cuenta, manteniendo compatibilidad hacia atrás con el estado heredado de un solo activo.",
      "technicalDetails": [
        "Las vistas de cuenta se mantienen consistentes para el activo nativo People (PPL) en todos los saldos",
        "Registro Canónico de Activos que rastrea símbolo, nombre, decimales, emisor, maxSupply y estado activo/congelado",
        "Unidades base de enteros fijos (6 decimales por defecto) para eliminar el no determinismo de punto flotante IEEE-754"
      ],
      "invariants": [
        "Ningún saldo de cuenta puede caer por debajo de cero bajo ninguna secuencia válida de transacciones",
        "El suministro de activos nativos se conserva a través de transferencias: balance_A' + balance_B' + fee = balance_A + balance_B"
      ]
    },
    "feesplitter": {
      "id": "feesplitter",
      "name": "Motor FeeSplitter",
      "phase": "Fase 1: Infraestructura Central",
      "status": "IMPLEMENTED",
      "summary": "Mecanismo matemáticamente conservador de enrutamiento de tarifas que distribuye las comisiones de transacción y negociación entre validadores, fondo comunitario, tesorería, reserva de liquidez y quema de protocolo.",
      "technicalDetails": [
        "Conservación exacta de enteros: sum(shares) = totalFee garantizado en cada transacción",
        "División entera hacia abajo con enrutamiento determinista del residuo para evitar fugas de tokens o inflación",
        "Reparto de comisión de protocolo: 30% Validadores, 25% Community Pool, 20% Tesorería, 10% Liquidez y Ecosistema, 15% Growth Pool, 0% Quema"
      ],
      "invariants": [
        "Invariante de Conservación: ValidatorShare + CommunityShare + TreasuryShare + LiquidityShare + GrowthShare + Burned = TotalFee",
        "Cero creación o destrucción de tokens durante los cálculos de división de tarifas"
      ]
    },
    "community-pool": {
      "id": "community-pool",
      "name": "Registro del Community Pool",
      "phase": "Fase 1: Infraestructura Central",
      "status": "IMPLEMENTED",
      "summary": "Estado contable a nivel de protocolo que rastrea las asignaciones históricas, distribuciones y saldos disponibles en cada activo del ecosistema.",
      "technicalDetails": [
        "IMPLEMENTADO: Estructura de registro multi-activo que rastrea totalAllocated, totalDistributed y remainingBalance por ID de activo",
        "IMPLEMENTADO: Financiado directamente desde las distribuciones de tarifas de transacción y asignaciones obligatorias de lanzamiento de tokens",
        "DESIGN (Fase 3): Reserva de tesorería que respaldará futuras distribuciones de recompensas por Minería Móvil y participación humana"
      ],
      "invariants": [
        "Conservación histórica: totalAllocated = totalDistributed + remainingBalance para todos los activos rastreados",
        "Las distribuciones están autorizadas criptográficamente y estrictamente limitadas por remainingBalance"
      ]
    },
    "token-factory": {
      "id": "token-factory",
      "name": "Fábrica de Tokens (Token Factory)",
      "phase": "Fase 2: Capa Económica",
      "status": "IMPLEMENTED",
      "summary": "Primitiva de protocolo que permite a los creadores lanzar tokens comunitarios con asignaciones de suministro estandarizadas y cronogramas de vesting anti-rug.",
      "technicalDetails": [
        "División determinista de suministro en 5 vías: 60% Curva de Vinculación (Bonding Curve), 10% Community Pool, 15% Creador, 10% Reserva de Liquidez, 5% Reserva del Ecosistema",
        "Tarifa mínima obligatoria de lanzamiento (1 PPL) dirigida a los sumideros de tarifas del protocolo para prevenir spam",
        "Delimitación exacta del suministro: los residuos de división entera se asignan a la curva para garantizar que sum(allocations) === totalSupply"
      ],
      "invariants": [
        "Invariante de Suministro: Curve + CommunityPool + Creator + LiquidityReserve + EcosystemReserve = TotalSupply",
        "La emisión inicial de tokens requiere una transacción de creación válida y el pago de la tarifa de lanzamiento"
      ]
    },
    "nft-factory": {
      "id": "nft-factory",
      "name": "Emisión de NFT",
      "phase": "Fase 2: Capa económica",
      "status": "IMPLEMENTED",
      "summary": "Emisión mínima de elemento único: nombre, descripción, URI de imagen, colección opcional, propietario y transferencia. No es una división de suministro de Token Factory.",
      "technicalDetails": [
        "Tipos de transacción nftMint y nftTransfer; los registros residen en el estado de la cadena y en stateRoot",
        "La imagen se almacena fuera de la cadena (URL, Blob o resumen sha256:); la cadena conserva el URI",
        "La tarifa de emisión se paga en PPL; el importe público lo configura el operador y no es un depósito nftFee en Growth"
      ],
      "invariants": [
        "Cada nftId es único; solo el propietario actual puede transferir",
        "Los NFT no asignan el 10% del suministro al Fondo Comunitario"
      ]
    },
    "bonding-curve": {
      "id": "bonding-curve",
      "name": "Curva Virtual de Producto Constante",
      "phase": "Fase 2: Capa Económica",
      "status": "IMPLEMENTED",
      "summary": "Creador de mercado autónomo en cadena que opera con una fórmula virtual de producto constante (K = X * Y), proporcionando liquidez algorítmica instantánea desde el bloque cero.",
      "technicalDetails": [
        "Invariante virtual de producto constante K = X * Y con reserva nativa virtual inicial Y0 = 60 PPL",
        "Aritmética de redondeo hacia abajo segura para enteros con cero cálculos de punto flotante para ejecuciones de compra y venta",
        "Tarifa de negociación del protocolo del 1.00% extraída automáticamente y enrutada a través del motor FeeSplitter de la Fase 1"
      ],
      "invariants": [
        "Preservación de Invariante: (X + dx) * (Y - dy) >= K en ventas; (X - dx) * (Y + dy) >= K en compras",
        "Inmunidad al arbitraje de ida y vuelta: retornos de venta <= costo de compra original en todos los tamaños de operación"
      ]
    },
    "creator-vesting": {
      "id": "creator-vesting",
      "name": "Cronograma de Vesting del Creador",
      "phase": "Fase 2: Capa Económica",
      "status": "IMPLEMENTED",
      "summary": "Motor de vesting en cadena que garantiza la alineación del creador y mitiga ventas masivas repentinas de liquidez tras el lanzamiento del token.",
      "technicalDetails": [
        "Asignación inicial del 10% desbloqueada de inmediato al crear el token para la configuración inicial",
        "El 90% restante de la asignación se consolida linealmente durante 180 días (5,184,000 bloques a 3 s/bloque)",
        "Reclamable bajo demanda mediante transacción a nivel de protocolo creatorClaim con seguimiento verificado de altura de bloque"
      ],
      "invariants": [
        "Límite de Reclamo: totalClaimed <= upfrontUnlocked + floor((blocksElapsed * 0.9 * totalAllocation) / durationBlocks)",
        "Los reclamos de vesting disminuyen estrictamente el fondo de vesting y aumentan el saldo líquido del creador en una cantidad idéntica"
      ]
    },
    "liquidity-migration": {
      "id": "liquidity-migration",
      "name": "Migración de Liquidez AMM",
      "phase": "Fase 2: Capa Económica",
      "status": "IMPLEMENTED",
      "summary": "Disparador automático de protocolo que gradúa una curva de vinculación madura a un fondo de liquidez AMM bloqueado Los swaps AMM de producto constante están en funcionamiento.",
      "technicalDetails": [
        "IMPLEMENTADO: La condición de activación se dispara cuando la reserva de tokens de la curva cae a <= 1/3 de la asignación inicial de la curva",
        "IMPLEMENTADO: Migra la reserva nativa real acumulada y los tokens de liquidez reservados a un par AMM bloqueado",
        "IMPLEMENTADO: Garantiza la continuidad de precios: el precio spot inicial del AMM coincide con el precio spot final de la curva",
        "IMPLEMENTADO: Swaps AMM de producto constante, tokens LP y pools token/PPL"
      ],
      "invariants": [
        "Transición atómica: la curva cambia permanentemente su estado a 'migrated' y desactiva transacciones adicionales de compra/venta en la curva",
        "Las reservas iniciales del fondo AMM coinciden con los saldos migrados con bloqueo permanente de liquidez"
      ]
    },
    "mobile-mining": {
      "id": "mobile-mining",
      "name": "Motor de Minería Móvil · Fase 3 (design)",
      "phase": "Fase 3: Red Humana",
      "status": "DESIGN",
      "summary": "Protocolo de participación liviano que permite a usuarios comunes en teléfonos, tabletas o navegadores contribuir con actividad útil y ganar recompensas comunitarias sin operar hardware de consenso (DESIGN — Fase 3).",
      "technicalDetails": [
        "NO es Proof-of-Work: sin bucles de hash que agoten la batería ni desperdicio computacional",
        "Diferenciado del consenso de validadores: los participantes NO producen bloques ni firman quórums de atestación",
        "Modelo de participación basado en sesiones con telemetría, verificaciones de actividad y monitoreo de salud de la red (Etapa de diseño)"
      ],
      "invariants": [
        "Separación de Roles: El estado del participante no puede comprometer directamente la seguridad del consenso de validadores",
        "La inactividad penaliza la acumulación de recompensas de la sesión pero nunca recorta (slash) la garantía de staking de los validadores"
      ]
    },
    "proof-of-humanity": {
      "id": "proof-of-humanity",
      "name": "Prueba de Humanidad (Proof of Humanity) · Fase 3 (design)",
      "phase": "Fase 3: Red Humana",
      "status": "DESIGN",
      "summary": "Marco de verificación humana de múltiples señales. El modelo exacto de identidad está sujeto a futuras investigaciones y simulaciones.",
      "technicalDetails": [
        "Señales de identidad multicapa bajo investigación: antigüedad de cuenta, continuidad del dispositivo, consistencia de comportamiento y atestaciones sociales",
        "Cero almacenamiento biométrico: evita bases de datos biométricas centralizadas o distópicas",
        "Niveles de verificación escalonados: participación básica con baja fricción mientras se desbloquean niveles más altos de recompensa (Sujeto a simulación)"
      ],
      "invariants": [
        "Escalado de puntuación delimitado por enteros (Representación exacta TBD; punto flotante prohibido por invariante)",
        "Preservación de la privacidad: ninguna información de identificación personal (PII) registrada en el estado del libro mayor"
      ]
    },
    "anti-sybil": {
      "id": "anti-sybil",
      "name": "Arquitectura Anti-Sybil · Fase 3 (design)",
      "phase": "Fase 3: Red Humana",
      "status": "DESIGN",
      "summary": "Detección de anomalías de comportamiento y análisis de clústeres basado en grafos — Conceptual.",
      "technicalDetails": [
        "Análisis de agrupamiento de grafos de red para detectar anillos de referencia coordinados y clústeres de nodos sintéticos",
        "Detección estadística de anomalías de comportamiento en patrones de participación (Conceptual)",
        "Desincentivos económicos: diseñar los costos de ataque para que superen el rendimiento esperado de recompensa (Requiere simulación)"
      ],
      "invariants": [
        "Resistencia a la Colusión: Los clústeres coordinados no pueden amplificar artificialmente la cuota acumulada de recompensas",
        "Aislamiento de Fallos: Minimización de falsos positivos con mecanismos de revisión de desafíos (TBD)"
      ]
    },
    "participation-power": {
      "id": "participation-power",
      "name": "Poder de Participación",
      "phase": "Fase 3: Red Humana",
      "status": "DESIGN",
      "summary": "Métrica de protocolo no transferible que determina la proporción relativa de un participante individual en las recompensas comunitarias de épocas futuras (marco conceptual de Fase 3).",
      "technicalDetails": [
        "Arquitectura Conceptual: Power ∝ Base × Actividad × Reputación × Contribución (rendimientos decrecientes y PowerCap estricto; Humanidad funciona como capa de Elegibilidad / Confianza / Límites; parámetros TBD)",
        "No tokenizado y no transferible: evita que los mercados de capital compren influencia sintética",
        "Parámetros, coeficientes y límites: TBD — sujetos a simulaciones económicas y análisis anti-Sybil"
      ],
      "invariants": [
        "Delimitación estricta: 0 <= ParticipationPower <= MaxProtocolCap para cada participante (Límites exactos TBD)",
        "Distribución de recompensa al participante i = CommunityRewardEpoch * (Power_i / TotalNetworkPower) (Conceptual)"
      ]
    }
  },
  "pt": {
    "multi-asset-ledger": {
      "id": "multi-asset-ledger",
      "name": "Livro-Razão Multi-Ativos",
      "phase": "Fase 1: Infraestrutura Central",
      "status": "IMPLEMENTED",
      "summary": "Mecanismo de contabilidade de ativos nativos e emitidos por usuários que suporta múltiplos ativos por conta, mantendo compatibilidade retroativa com o estado legado de ativo único.",
      "technicalDetails": [
        "As visualizações de conta permanecem consistentes para o ativo nativo People (PPL) em todos os saldos",
        "Registro Canônico de Ativos rastreando símbolo, nome, decimais, emissor, maxSupply e status ativo/congelado",
        "Unidades base de inteiros fixos (padrão de 6 decimais) para eliminar o não-determinismo de ponto flutuante IEEE-754"
      ],
      "invariants": [
        "Nenhum saldo de conta pode ficar abaixo de zero sob qualquer sequência válida de transações",
        "O fornecimento de ativos nativos é conservado entre transferências: balance_A' + balance_B' + fee = balance_A + balance_B"
      ]
    },
    "feesplitter": {
      "id": "feesplitter",
      "name": "Motor FeeSplitter",
      "phase": "Fase 1: Infraestrutura Central",
      "status": "IMPLEMENTED",
      "summary": "Mecanismo matematicamente conservador de roteamento de taxas que distribui taxas de transação e negociação entre validadores, pool comunitária, tesouraria, reserva de liquidez e queima de protocolo.",
      "technicalDetails": [
        "Conservação exata de inteiros: sum(shares) = totalFee garantido em cada transação",
        "Divisão inteira para baixo com roteamento determinístico de resto para evitar vazamento de tokens ou inflação",
        "Divisão de taxas de protocolo: 30% Validadores, 25% Community Pool, 20% Tesouraria, 10% Liquidez e Ecossistema, 15% Growth Pool, 0% Queima"
      ],
      "invariants": [
        "Invariante de Conservação: ValidatorShare + CommunityShare + TreasuryShare + LiquidityShare + GrowthShare + Burned = TotalFee",
        "Zero criação ou destruição de tokens durante os cálculos de divisão de taxas"
      ]
    },
    "community-pool": {
      "id": "community-pool",
      "name": "Registro da Community Pool",
      "phase": "Fase 1: Infraestrutura Central",
      "status": "IMPLEMENTED",
      "summary": "Estado contábil em nível de protocolo que rastreia alocações históricas, distribuições e saldos disponíveis em cada ativo do ecossistema.",
      "technicalDetails": [
        "IMPLEMENTADO: Estrutura de registro multi-ativos rastreando totalAllocated, totalDistributed e remainingBalance por ID de ativo",
        "IMPLEMENTADO: Financiado diretamente por distribuições de taxas de transação e alocações obrigatórias de lançamento de tokens",
        "DESIGN (Fase 3): Reserva de tesouraria que apoiará futuras distribuições de recompensas de Mineração Móvel e participação humana"
      ],
      "invariants": [
        "Conservação vitalícia: totalAllocated = totalDistributed + remainingBalance para todos os ativos rastreados",
        "Distribuições são criptograficamente autorizadas e estritamente limitadas por remainingBalance"
      ]
    },
    "token-factory": {
      "id": "token-factory",
      "name": "Fábrica de Tokens (Token Factory)",
      "phase": "Fase 2: Camada Econômica",
      "status": "IMPLEMENTED",
      "summary": "Primitiva de protocolo que permite a criadores lançar tokens comunitários com alocações de fornecimento padronizadas e cronogramas de vesting anti-rug.",
      "technicalDetails": [
        "Divisão determinística de fornecimento em 5 partes: 60% Curva de Vinculação (Bonding Curve), 10% Community Pool, 15% Criador, 10% Reserva de Liquidez, 5% Reserva do Ecossistema",
        "Taxa mínima obrigatória de lançamento (1 PPL) roteada para sumidouros de taxas de protocolo para evitar spam",
        "Delimitação exata de fornecimento: restos de divisão inteira atribuídos à curva para garantir que sum(allocations) === totalSupply"
      ],
      "invariants": [
        "Invariante de Fornecimento: Curve + CommunityPool + Creator + LiquidityReserve + EcosystemReserve = TotalSupply",
        "A emissão inicial de tokens requer uma transação de criação válida e o pagamento da taxa de lançamento"
      ]
    },
    "nft-factory": {
      "id": "nft-factory",
      "name": "Criação de NFT",
      "phase": "Fase 2: Camada Econômica",
      "status": "IMPLEMENTED",
      "summary": "Criação mínima de item exclusivo: nome, descrição, URI da imagem, coleção opcional, proprietário e transferência. Não é uma divisão de fornecimento da Token Factory.",
      "technicalDetails": [
        "Tipos de transação nftMint e nftTransfer; os registros residem no estado da cadeia e na stateRoot",
        "A imagem é armazenada fora da cadeia (URL, Blob ou resumo sha256:); a cadeia mantém a URI",
        "A taxa de emissão é paga em PPL; o valor público é configurado pelo operador e não é um bucket nftFee do Growth"
      ],
      "invariants": [
        "Cada nftId é exclusivo; apenas o proprietário atual pode transferir",
        "Os NFTs não alocam 10% do fornecimento para o Pool Comunitário"
      ]
    },
    "bonding-curve": {
      "id": "bonding-curve",
      "name": "Curva Virtual de Produto Constante",
      "phase": "Fase 2: Camada Econômica",
      "status": "IMPLEMENTED",
      "summary": "Market maker autônomo on-chain operando em uma fórmula virtual de produto constante (K = X * Y), fornecendo liquidez algorítmica instantânea a partir do bloco zero.",
      "technicalDetails": [
        "Invariante virtual de produto constante K = X * Y com reserva nativa virtual inicial Y0 = 60 PPL",
        "Aritmética inteira segura de arredondamento para baixo, sem cálculos de ponto flutuante para execuções de compra e venda",
        "Taxa de negociação de protocolo de 1.00% extraída automaticamente e roteada através do motor FeeSplitter da Fase 1"
      ],
      "invariants": [
        "Preservação do Invariante: (X + dx) * (Y - dy) >= K em vendas; (X - dx) * (Y + dy) >= K em compras",
        "Imunidade à arbitragem de ida e volta: retornos de venda <= custo original de compra em todos os volumes operados"
      ]
    },
    "creator-vesting": {
      "id": "creator-vesting",
      "name": "Cronograma de Vesting do Criador",
      "phase": "Fase 2: Camada Econômica",
      "status": "IMPLEMENTED",
      "summary": "Mecanismo de vesting on-chain que garante o alinhamento do criador e mitiga despejos repentinos de liquidez após o lançamento do token.",
      "technicalDetails": [
        "Alocação inicial de 10% desbloqueada imediatamente na criação do token para configuração inicial",
        "90% restante da alocação tem vesting linear ao longo de 180 dias (5.184.000 blocos a 3s/bloco)",
        "Resgatável sob demanda via transação em nível de protocolo creatorClaim com rastreamento verificado da altura do bloco"
      ],
      "invariants": [
        "Limite de Resgate: totalClaimed <= upfrontUnlocked + floor((blocksElapsed * 0.9 * totalAllocation) / durationBlocks)",
        "Resgates de vesting diminuem estritamente o pool de vesting e aumentam o saldo líquido do criador em quantidade idêntica"
      ]
    },
    "liquidity-migration": {
      "id": "liquidity-migration",
      "name": "Migração de Liquidez AMM",
      "phase": "Fase 2: Camada Econômica",
      "status": "IMPLEMENTED",
      "summary": "Gatilho automático de protocolo que gradua uma curva de vinculação madura para um pool de liquidez AMM bloqueado Os swaps AMM de produto constante estão ativos.",
      "technicalDetails": [
        "IMPLEMENTADO: Condição de disparo ativa quando a reserva de tokens da curva cai para <= 1/3 da alocação inicial da curva",
        "IMPLEMENTADO: Migra a reserva nativa real acumulada e os tokens de liquidez reservados para um par AMM bloqueado",
        "IMPLEMENTADO: Garante continuidade de preço: o preço à vista inicial do AMM coincide com o preço à vista final da curva",
        "IMPLEMENTADO: Swaps AMM de produto constante, tokens LP e pools token/PPL"
      ],
      "invariants": [
        "Transição atômica: a curva muda permanentemente o status para 'migrated' e desativa transações adicionais de compra/venda na curva",
        "Reservas iniciais do pool AMM coincidem com os saldos migrados com bloqueio permanente de liquidez"
      ]
    },
    "mobile-mining": {
      "id": "mobile-mining",
      "name": "Motor de Mineração Móvel · Fase 3 (design)",
      "phase": "Fase 3: Rede Humana",
      "status": "DESIGN",
      "summary": "Protocolo leve de participação permitindo que usuários comuns em celulares, tablets ou navegadores contribuam com atividades úteis e ganhem recompensas comunitárias sem operar hardware de consenso (DESIGN — Fase 3).",
      "technicalDetails": [
        "NÃO é Proof-of-Work: sem loops de hash que drenam a bateria ou desperdício computacional",
        "Distinto do consenso de validadores: participantes NÃO produzem blocos nem assinam quóruns de atestação",
        "Modelo de participação baseado em sessões com telemetria, confirmações de atividade e monitoramento da saúde da rede (Fase de design)"
      ],
      "invariants": [
        "Separação de Papéis: O estado do participante não pode comprometer diretamente a segurança do consenso dos validadores",
        "Inatividade penaliza o acúmulo de recompensas da sessão, mas nunca executa corte (slash) do colateral de staking dos validadores"
      ]
    },
    "proof-of-humanity": {
      "id": "proof-of-humanity",
      "name": "Prova de Humanidade (Proof of Humanity) · Fase 3 (design)",
      "phase": "Fase 3: Rede Humana",
      "status": "DESIGN",
      "summary": "Estrutura de verificação humana baseada em múltiplos sinais. O modelo exato de identidade está sujeito a pesquisas e simulações futuras.",
      "technicalDetails": [
        "Sinais de identidade em camadas sob pesquisa: idade da conta, continuidade do dispositivo, consistência comportamental e atestações sociais",
        "Zero armazenamento biométrico: evita bancos de dados biométricos centralizados ou distópicos",
        "Níveis de verificação graduais: participação básica com baixa fricção, desbloqueando níveis mais altos de recompensa (Sujeito a simulação)"
      ],
      "invariants": [
        "Escala de pontuação limitada por inteiros (Representação exata TBD; ponto flutuante proibido por invariante)",
        "Preservação da privacidade: nenhuma informação de identificação pessoal (PII) gravada no estado do livro-razão"
      ]
    },
    "anti-sybil": {
      "id": "anti-sybil",
      "name": "Arquitetura Anti-Sybil · Fase 3 (design)",
      "phase": "Fase 3: Rede Humana",
      "status": "DESIGN",
      "summary": "Detecção de anomalias comportamentais e análise de clusters baseada em grafos — Conceitual.",
      "technicalDetails": [
        "Análise de agrupamento de grafos de rede para detectar anéis de indicação coordenados e clusters sintéticos de nós",
        "Detecção estatística de anomalias comportamentais em padrões de participação (Conceitual)",
        "Desincentivos econômicos: projetar custos de ataque para exceder o rendimento esperado de recompensas (Simulação necessária)"
      ],
      "invariants": [
        "Resistência à Colusão: Clusters coordenados não podem inflar artificialmente a fatia agregada de recompensas",
        "Isolamento de Falhas: Minimização de falsos positivos com mecanismos de contestação e revisão (TBD)"
      ]
    },
    "participation-power": {
      "id": "participation-power",
      "name": "Poder de Participação",
      "phase": "Fase 3: Rede Humana",
      "status": "DESIGN",
      "summary": "Métrica de protocolo intransferível que determina a proporção relativa de um participante individual nas recompensas comunitárias de épocas futuras (estrutura conceitual da Fase 3).",
      "technicalDetails": [
        "Arquitetura Conceitual: Power ∝ Base × Atividade × Reputação × Contribuição (retornos decrescentes e PowerCap rígido; Humanidade atua como camada de Elegibilidade / Confiança / Limites; parâmetros TBD)",
        "Não-tokenizado e intransferível: impede que mercados de capitais comprem influência sintética",
        "Parâmetros, coeficientes e limites: TBD — sujeitos a simulações econômicas e análise anti-Sybil"
      ],
      "invariants": [
        "Delimitação rigorosa: 0 <= ParticipationPower <= MaxProtocolCap para cada participante (Limites exatos TBD)",
        "Distribuição de recompensa ao participante i = CommunityRewardEpoch * (Power_i / TotalNetworkPower) (Conceitual)"
      ]
    }
  },
  "fr": {
    "multi-asset-ledger": {
      "id": "multi-asset-ledger",
      "name": "Registre multi-actifs",
      "phase": "Phase 1 : Infrastructure de base",
      "status": "IMPLEMENTED",
      "summary": "Moteur de comptabilité d'actifs natifs et émis par les utilisateurs, prenant en charge plusieurs actifs par compte tout en maintenant la rétrocompatibilité avec l'état mono-actif hérité.",
      "technicalDetails": [
        "Les vues de compte restent cohérentes pour l'actif natif People (PPL) entre les soldes",
        "Registre canonique des actifs (Canonical Asset Registry) suivant le symbole, le nom, les décimales, l'émetteur, le maxSupply et le statut actif/gelé",
        "Unités de base entières fixes (6 décimales par défaut) pour éliminer le non-déterminisme des calculs à virgule flottante IEEE-754"
      ],
      "invariants": [
        "Aucun solde de compte ne peut devenir négatif sous aucune séquence de transactions valide",
        "L'offre d'actifs natifs est conservée lors des transferts : balance_A' + balance_B' + fee = balance_A + balance_B"
      ]
    },
    "feesplitter": {
      "id": "feesplitter",
      "name": "Moteur FeeSplitter",
      "phase": "Phase 1 : Infrastructure de base",
      "status": "IMPLEMENTED",
      "summary": "Mécanisme mathématiquement conservateur d'acheminement des frais distribuant les frais de transaction et d'échange entre validateurs, pool communautaire, trésorerie, réserve de liquidité et combustion (burn) du protocole.",
      "technicalDetails": [
        "Exact integer conservation: sum(shares) = totalFee guaranteed on every transaction",
        "Division entière par troncature (floor) avec acheminement déterministe du reste pour éviter toute fuite ou inflation de jetons",
        "Répartition des frais de protocole : 30 % Validateurs, 25 % Pool communautaire, 20 % Trésorerie, 10 % Liquidité et Écosystème, 15 % Growth Pool, 0 % Combustion"
      ],
      "invariants": [
        "Conservation Invariant: ValidatorShare + CommunityShare + TreasuryShare + LiquidityShare + GrowthShare + Burned = TotalFee",
        "Zéro création ou destruction de jetons lors des calculs de répartition des frais"
      ]
    },
    "community-pool": {
      "id": "community-pool",
      "name": "Registre du Community Pool",
      "phase": "Phase 1 : Infrastructure de base",
      "status": "IMPLEMENTED",
      "summary": "État comptable au niveau du protocole qui suit les allocations cumulées, les distributions et les soldes disponibles pour chaque actif de l'écosystème.",
      "technicalDetails": [
        "IMPLÉMENTÉ : Structure de registre multi-actifs suivant totalAllocated, totalDistributed et remainingBalance par identifiant d'actif",
        "IMPLÉMENTÉ : Financé directement par les distributions de frais de transaction et les allocations obligatoires lors du lancement de jetons",
        "DESIGN (Phase 3): Réserve de trésorerie garantissant les futures distributions de récompenses pour le minage mobile et la participation humaine"
      ],
      "invariants": [
        "Conservation à vie : totalAllocated = totalDistributed + remainingBalance pour tous les actifs suivis",
        "Les distributions sont cryptographiquement autorisées et strictement plafonnées par remainingBalance"
      ]
    },
    "token-factory": {
      "id": "token-factory",
      "name": "Token Factory",
      "phase": "Phase 2 : Couche économique",
      "status": "IMPLEMENTED",
      "summary": "Primitive du protocole permettant aux créateurs de lancer des jetons communautaires avec des allocations d'offre standardisées et des calendriers de vesting anti-rug.",
      "technicalDetails": [
        "Répartition déterministe en 5 volets : 60 % Courbe de liaison (Bonding Curve), 10 % Pool communautaire, 15 % Créateur, 10 % Réserve de liquidité, 5 % Réserve de l'écosystème",
        "Frais de lancement minimaux obligatoires (1 PPL) acheminés vers les puits de frais du protocole pour empêcher le spam",
        "Délimitation exacte de l'offre : les restes de division entière sont affectés à la courbe pour garantir sum(allocations) === totalSupply"
      ],
      "invariants": [
        "Supply Invariant: Curve + CommunityPool + Creator + LiquidityReserve + EcosystemReserve = TotalSupply",
        "L'émission initiale de jetons requiert une transaction de création valide et le paiement des frais de lancement"
      ]
    },
    "nft-factory": {
      "id": "nft-factory",
      "name": "Émission de NFT",
      "phase": "Phase 2 : Couche économique",
      "status": "IMPLEMENTED",
      "summary": "Création minimale d'élément unique : nom, description, URI d'image, collection facultative, propriétaire et transfert. Pas une répartition d'offre Token Factory.",
      "technicalDetails": [
        "Types de transaction nftMint et nftTransfer ; les enregistrements résident dans l'état de la chaîne et dans stateRoot",
        "L'image est stockée hors chaîne (URL, Blob ou empreinte sha256:) ; la chaîne conserve l'URI",
        "Les frais d'émission sont payés en PPL ; le montant public est configuré par l'opérateur et n'est pas un compartiment nftFee dans Growth"
      ],
      "invariants": [
        "Chaque nftId est unique ; seul le propriétaire actuel peut effectuer le transfert",
        "Les NFT n'allouent pas 10 % de l'offre au pool communautaire"
      ]
    },
    "bonding-curve": {
      "id": "bonding-curve",
      "name": "Courbe virtuelle à produit constant",
      "phase": "Phase 2 : Couche économique",
      "status": "IMPLEMENTED",
      "summary": "Teneur de marché autonome on-chain fonctionnant sur une formule virtuelle à produit constant (K = X * Y) offrant une liquidité algorithmique instantanée dès le bloc zéro.",
      "technicalDetails": [
        "Virtual constant-product invariant K = X * Y with initial virtual native reserve Y0 = 60 PPL",
        "Arithmétique entière par troncature (floor) sécurisée sans aucun calcul à virgule flottante pour l'exécution des achats et ventes",
        "Frais de négociation de protocole de 1.00% automatiquement prélevés et acheminés par le moteur FeeSplitter de Phase 1"
      ],
      "invariants": [
        "Invariant Preservation: (X + dx) * (Y - dy) >= K on sells; (X - dx) * (Y + dy) >= K on buys",
        "Immunité contre l'arbitrage d'aller-retour : le rendement de vente <= coût d'achat initial pour toutes tailles de transaction"
      ]
    },
    "creator-vesting": {
      "id": "creator-vesting",
      "name": "Calendrier de vesting du créateur",
      "phase": "Phase 2 : Couche économique",
      "status": "IMPLEMENTED",
      "summary": "Moteur de vesting on-chain garantissant l'alignement des créateurs et limitant les ventes massives soudaines de liquidité après le lancement d'un jeton.",
      "technicalDetails": [
        "Allocation initiale de 10 % débloquée immédiatement lors de la création du jeton pour la configuration initiale",
        "Allocation restante de 90 % acquise linéairement sur 180 jours (5 184 000 blocs à 3 s/bloc)",
        "Réclamable à la demande via une transaction creatorClaim au niveau du protocole avec suivi vérifié de la hauteur de bloc"
      ],
      "invariants": [
        "Claim Limit: totalClaimed <= upfrontUnlocked + floor((blocksElapsed * 0.9 * totalAllocation) / durationBlocks)",
        "Les réclamations de vesting réduisent strictement le pool de vesting et augmentent le solde liquide du créateur d'une quantité identique"
      ]
    },
    "liquidity-migration": {
      "id": "liquidity-migration",
      "name": "Migration de liquidité AMM",
      "phase": "Phase 2 : Couche économique",
      "status": "IMPLEMENTED",
      "summary": "Déclencheur automatique de protocole qui fait évoluer une courbe de liaison parvenue à maturité vers un pool de liquidité AMM verrouillé Les swaps AMM à produit constant sont en service.",
      "technicalDetails": [
        "IMPLÉMENTÉ : La condition de déclenchement s'active lorsque la réserve de jetons de la courbe tombe à <= 1/3 de l'allocation initiale de la courbe",
        "IMPLÉMENTÉ : Migre la réserve native réelle accumulée et les jetons de liquidité réservés vers une paire AMM verrouillée",
        "IMPLÉMENTÉ : Garantit la continuité des prix : le prix spot initial de l'AMM correspond au prix spot final de la courbe",
        "IMPLÉMENTÉ : swaps AMM à produit constant, jetons LP et pools jeton/PPL"
      ],
      "invariants": [
        "Transition atomique : la courbe passe de façon permanente au statut 'migrated' et désactive tout nouvel achat/vente sur la courbe",
        "Les réserves initiales du pool AMM correspondent aux soldes migrés avec un verrouillage permanent de la liquidité"
      ]
    },
    "mobile-mining": {
      "id": "mobile-mining",
      "name": "Moteur de Mobile Mining · Phase 3 (design)",
      "phase": "Phase 3 : Réseau humain",
      "status": "DESIGN",
      "summary": "Protocole de participation léger permettant aux utilisateurs ordinaires sur téléphones, tablettes ou navigateurs de contribuer à une activité utile et de gagner des récompenses communautaires sans exécuter de matériel de consensus (Phase 3 design).",
      "technicalDetails": [
        "NOT Proof-of-Work: no battery-draining hash loops or computational waste",
        "Distinct du consensus des validateurs : les participants ne produisent PAS de blocs et ne signent PAS de quorum d'attestation",
        "Modèle de participation par sessions avec télémétrie, pointages d'activité et surveillance de l'état du réseau (en phase de conception)"
      ],
      "invariants": [
        "Séparation des rôles : l'état des participants ne peut pas compromettre directement la sécurité du consensus des validateurs",
        "L'inactivité pénalise l'accumulation des récompenses de session mais ne soumet jamais le collatéral de staking des validateurs au slashing"
      ]
    },
    "proof-of-humanity": {
      "id": "proof-of-humanity",
      "name": "Proof of Humanity · Phase 3 (design)",
      "phase": "Phase 3 : Réseau humain",
      "status": "DESIGN",
      "summary": "Cadre de vérification humaine multi-signaux. Le modèle d'identité exact fait l'objet de recherches et de simulations futures.",
      "technicalDetails": [
        "Signaux d'identité multicouches en cours d'étude : ancienneté du compte, continuité de l'appareil, cohérence comportementale et attestations sociales",
        "Zéro stockage biométrique : évite les bases de données biométriques centralisées ou dystopiques",
        "Niveaux de vérification échelonnés : participation de base fluide tout en débloquant des paliers de récompense plus élevés (soumis à simulation)"
      ],
      "invariants": [
        "Mise à l'échelle des scores limitée à des entiers (représentation exacte TBD ; virgule flottante interdite par invariant)",
        "Préservation de la confidentialité : aucune information personnelle identifiable (PII) enregistrée dans l'état du registre"
      ]
    },
    "anti-sybil": {
      "id": "anti-sybil",
      "name": "Architecture anti-Sybil · Phase 3 (design)e",
      "phase": "Phase 3 : Réseau humain",
      "status": "DESIGN",
      "summary": "Détection d'anomalies comportementales et analyse de grappes basée sur les graphes — Conceptuel.",
      "technicalDetails": [
        "Analyse du partitionnement de graphes de réseau pour détecter les boucles de parrainage coordonnées et les grappes de nœuds synthétiques",
        "Détection statistique d'anomalies comportementales sur les modèles de participation (Conceptuel)",
        "Dissuasion économique : concevoir des coûts d'attaque supérieurs au rendement attendu des récompenses (Simulation requise)"
      ],
      "invariants": [
        "Résistance à la collusion : les grappes coordonnées ne peuvent pas amplifier artificiellement leur part globale de récompenses",
        "Isolation des défaillances : minimisation des faux positifs grâce à des mécanismes de contestation et de révision (TBD)"
      ]
    },
    "participation-power": {
      "id": "participation-power",
      "name": "Participation Power",
      "phase": "Phase 3 : Réseau humain",
      "status": "DESIGN",
      "summary": "Métrique de protocole non transférable déterminant la part relative d'un participant individuel dans les futures récompenses communautaires d'époque (cadre conceptuel de Phase 3).",
      "technicalDetails": [
        "Architecture conceptuelle : Power ∝ Base × Activity × Reputation × Contribution (rendements décroissants & PowerCap strict ; l'humanité fait office de couche d'éligibilité / confiance / limite ; paramètres TBD)",
        "Non tokenisée et non transférable : empêche les marchés de capitaux d'acheter une influence synthétique",
        "Paramètres, coefficients et plafonds : TBD — sous réserve de simulations économiques et d'analyses anti-Sybil"
      ],
      "invariants": [
        "Strict boundedness: 0 <= ParticipationPower <= MaxProtocolCap for every participant (Exact bounds TBD)",
        "Distribution des récompenses au participant i = CommunityRewardEpoch * (Power_i / TotalNetworkPower) (Conceptuel)"
      ]
    }
  },
  "de": {
    "multi-asset-ledger": {
      "id": "multi-asset-ledger",
      "name": "Multi-Asset-Ledger",
      "phase": "Phase 1: Kerninfrastruktur",
      "status": "IMPLEMENTED",
      "summary": "Buchungs-Engine für native und nutzergenerierte Vermögenswerte, die mehrere Assets pro Konto unterstützt und gleichzeitig die Abwärtskompatibilität mit dem bestehenden Single-Asset-Zustand wahrt.",
      "technicalDetails": [
        "Kontoansichten bleiben für das native Asset People (PPL) über alle Guthaben hinweg konsistent",
        "Kanonisches Asset-Register zur Nachverfolgung von Symbol, Name, Dezimalstellen, Emittent, maxSupply sowie Aktiv-/Eingefroren-Status",
        "Feste ganzzahlige Basiseinheiten (standardmäßig 6 Dezimalstellen) zur Eliminierung von Nichtdeterminismus durch IEEE-754-Gleitkommazahlen"
      ],
      "invariants": [
        "Kein Kontostand darf unter einer gültigen Transaktionssequenz unter null fallen",
        "Natives Asset-Angebot bleibt bei Übertragungen erhalten: balance_A' + balance_B' + fee = balance_A + balance_B"
      ]
    },
    "feesplitter": {
      "id": "feesplitter",
      "name": "FeeSplitter-Engine",
      "phase": "Phase 1: Kerninfrastruktur",
      "status": "IMPLEMENTED",
      "summary": "Mathematisch konservativer Gebühren-Routing-Mechanismus, der Transaktions- und Handelsgebühren auf Validatoren, Community-Pool, Treasury, Liquiditätsreserve und Protokoll-Burn verteilt.",
      "technicalDetails": [
        "Exakte ganzzahlige Erhaltung: sum(shares) = totalFee wird bei jeder Transaktion garantiert",
        "Ganzzahlige Abrundungsdivision (Floor Division) mit deterministischem Restwert-Routing zur Verhinderung von Token-Verlust oder Inflation",
        "Protokollgebührenaufteilung: 30% Validatoren, 25% Community Pool, 20% Treasury, 10% Liquidität & Ökosystem, 15% Growth Pool, 0% Burn"
      ],
      "invariants": [
        "Erhaltungs-Invariante: ValidatorShare + CommunityShare + TreasuryShare + LiquidityShare + GrowthShare + Burned = TotalFee",
        "Null Token-Erzeugung oder -Zerstörung während der Gebührenverteilungsberechnungen"
      ]
    },
    "community-pool": {
      "id": "community-pool",
      "name": "Community-Pool-Register",
      "phase": "Phase 1: Kerninfrastruktur",
      "status": "IMPLEMENTED",
      "summary": "Buchungszustand auf Protokollebene, der lebenslange Zuweisungen, Ausschüttungen und verfügbare Guthaben für jedes Asset im Ökosystem erfasst.",
      "technicalDetails": [
        "IMPLEMENTIERT: Multi-Asset-Registerstruktur zur Erfassung von totalAllocated, totalDistributed und remainingBalance pro Asset-ID",
        "IMPLEMENTIERT: Direkt finanziert aus Transaktionsgebühren-Ausschüttungen und obligatorischen Zuweisungen beim Token-Launch",
        "DESIGN (Phase 3): Treasury-Reserve zur Absicherung zukünftiger Belohnungsausschüttungen für Mobile Mining und menschliche Partizipation"
      ],
      "invariants": [
        "Lebenslange Erhaltung: totalAllocated = totalDistributed + remainingBalance für alle erfassten Vermögenswerte",
        "Ausschüttungen sind kryptografisch autorisiert und streng durch remainingBalance begrenzt"
      ]
    },
    "token-factory": {
      "id": "token-factory",
      "name": "Token-Factory",
      "phase": "Phase 2: Ökonomische Schicht",
      "status": "IMPLEMENTED",
      "summary": "Protokoll-Primitiv, das es Creators ermöglicht, Community-Token mit standardisierten Angebotsverteilungen und Anti-Rug-Vesting-Plänen zu starten.",
      "technicalDetails": [
        "Deterministische 5-Wege-Angebotsaufteilung: 60% Bonding-Kurve, 10% Community-Pool, 15% Creator, 10% Liquiditätsreserve, 5% Ökosystem-Reserve",
        "Obligatorische Mindeststartgebühr (1 PPL), die an Protokollgebührensenken weitergeleitet wird, um Spam zu verhindern",
        "Exakte Angebotsbegrenzung: Reste der ganzzahligen Division werden der Kurvenallokation zugewiesen, um sum(allocations) === totalSupply zu garantieren"
      ],
      "invariants": [
        "Angebotsinvariante: Curve + CommunityPool + Creator + LiquidityReserve + EcosystemReserve = TotalSupply",
        "Die anfängliche Token-Ausgabe erfordert eine gültige Erstellungstransaktion und die Zahlung der Startgebühr"
      ]
    },
    "nft-factory": {
      "id": "nft-factory",
      "name": "NFT-Prägung",
      "phase": "Phase 2: Ökonomische Schicht",
      "status": "IMPLEMENTED",
      "summary": "Minimale Prägung einzigartiger Objekte: Name, Beschreibung, Bild-URI, optionale Kollektion, Eigentümer und Übertragung. Keine Angebotsaufteilung über die Token Factory.",
      "technicalDetails": [
        "Transaktionstypen nftMint und nftTransfer; Einträge verbleiben im Chain-Zustand und in der stateRoot",
        "Bild wird Off-Chain gespeichert (URL, Blob oder sha256:-Digest); die Chain behält die URI",
        "Prägegebühr wird in PPL bezahlt; der öffentliche Betrag wird vom Betreiber konfiguriert und ist kein nftFee-Topf in Growth"
      ],
      "invariants": [
        "Jede nftId ist eindeutig; nur der aktuelle Eigentümer kann übertragen",
        "NFTs weisen dem Community-Pool keine 10% des Angebots zu"
      ]
    },
    "bonding-curve": {
      "id": "bonding-curve",
      "name": "Virtuelle Konstant-Produkt-Kurve",
      "phase": "Phase 2: Ökonomische Schicht",
      "status": "IMPLEMENTED",
      "summary": "Autonomer On-Chain-Market-Maker basierend auf einer virtuellen Konstant-Produkt-Formel (K = X * Y), der sofortige algorithmische Liquidität ab Block null bereitstellt.",
      "technicalDetails": [
        "Virtuelle Konstant-Produkt-Invariante K = X * Y mit initialer virtueller nativer Reserve Y0 = 60 PPL",
        "Ganzzahlsichere Abrundungsarithmetik ohne Gleitkommaberechnungen für Kauf- und Verkaufsaufträge",
        "1,00% Protokollhandelsgebühr wird automatisch erhoben und über die FeeSplitter-Engine aus Phase 1 geroutet"
      ],
      "invariants": [
        "Invariantenerhaltung: (X + dx) * (Y - dy) >= K bei Verkäufen; (X - dx) * (Y + dy) >= K bei Käufen",
        "Immunität gegen Round-Trip-Arbitrage: Verkaufserlöse sind bei allen Handelsgrößen <= ursprüngliche Kaufkosten"
      ]
    },
    "creator-vesting": {
      "id": "creator-vesting",
      "name": "Creator-Vesting-Zeitplan",
      "phase": "Phase 2: Ökonomische Schicht",
      "status": "IMPLEMENTED",
      "summary": "On-Chain-Vesting-Engine, die die Interessen der Creator langfristig ausrichtet und abrupte Liquiditätsabverkäufe nach dem Token-Launch verhindert.",
      "technicalDetails": [
        "10% Sofortzuteilung wird bei der Token-Erstellung unmittelbar für das initiale Setup freigeschaltet",
        "Die verbleibenden 90% werden linear über 180 Tage freigegeben (5.184.000 Blöcke bei 3s/Block)",
        "Bei Bedarf über eine creatorClaim-Transaktion auf Protokollebene mit verifizierter Blockhöhenerfassung abrufbar"
      ],
      "invariants": [
        "Ausschüttungslimit: totalClaimed <= upfrontUnlocked + floor((blocksElapsed * 0.9 * totalAllocation) / durationBlocks)",
        "Vesting-Ansprüche verringern den Vesting-Pool und erhöhen das liquide Guthaben des Creators um genau dieselbe Menge"
      ]
    },
    "liquidity-migration": {
      "id": "liquidity-migration",
      "name": "AMM-Liquiditätsmigration",
      "phase": "Phase 2: Ökonomische Schicht",
      "status": "IMPLEMENTED",
      "summary": "Automatischer Protokoll-Trigger, der eine ausgereifte Bonding-Kurve in einen gesperrten AMM-Liquiditätspool überführt Konstantprodukt-AMM-Swaps sind live.",
      "technicalDetails": [
        "IMPLEMENTIERT: Auslösebedingung greift, sobald die Kurven-Token-Reserve auf <= 1/3 der anfänglichen Kurvenzuteilung sinkt",
        "IMPLEMENTIERT: Migriert die akkumulierte tatsächliche native Reserve und die reservierten Liquiditäts-Token in ein gesperrtes AMM-Handelspaar",
        "IMPLEMENTIERT: Garantiert Preiskontinuität: Der anfängliche AMM-Kassapreis entspricht dem finalen Kurven-Kassapreis",
        "IMPLEMENTIERT: Konstantprodukt-AMM-Swaps, LP-Token und Token/PPL-Pools"
      ],
      "invariants": [
        "Atomarer Übergang: Die Kurve wechselt dauerhaft in den Status 'migrated' und deaktiviert weitere Kurvenkäufe/-verkäufe",
        "Anfängliche AMM-Poolreserven entsprechen den migrierten Guthaben mit permanenter Liquiditätssperre"
      ]
    },
    "mobile-mining": {
      "id": "mobile-mining",
      "name": "Mobile-Mining-Engine · Phase 3 (design)",
      "phase": "Phase 3: Menschliches Netzwerk",
      "status": "DESIGN",
      "summary": "Leichtgewichtiges Partizipationsprotokoll, das es normalen Nutzern auf Smartphones, Tablets oder Browsern ermöglicht, nützliche Aktivitäten beizutragen und Community-Belohnungen zu verdienen, ohne Konsens-Hardware zu betreiben (DESIGN — Phase 3).",
      "technicalDetails": [
        "KEIN Proof-of-Work: Keine akkuintensiven Hash-Schleifen oder Rechenverschwendung",
        "Getrennt vom Validator-Konsens: Teilnehmer erstellen KEINE Blöcke und signieren keine Quorum-Attestierungen",
        "Sitzungsbasiertes Partizipationsmodell mit Telemetrie, Aktivitäts-Check-ins und Überwachung der Netzwerkintegrität (Designphase)"
      ],
      "invariants": [
        "Rollentrennung: Der Teilnehmerstatus kann die Sicherheit des Validator-Konsenses niemals direkt gefährden",
        "Inaktivität verringert das Anwachsen von Sitzungsbelohnungen, führt jedoch niemals zum Slashing von Validator-Staking-Sicherheiten"
      ]
    },
    "proof-of-humanity": {
      "id": "proof-of-humanity",
      "name": "Proof of Humanity · Phase 3 (design)",
      "phase": "Phase 3: Menschliches Netzwerk",
      "status": "DESIGN",
      "summary": "Mehrschichtiges Rahmenwerk zur menschlichen Verifikation. Das exakte Identitätsmodell unterliegt künftiger Forschung und Simulation.",
      "technicalDetails": [
        "Mehrschichtige Identitätssignale in der Erforschung: Kontoalter, Gerätekontinuität, Verhaltenskonsistenz und soziale Bestätigungen",
        "Keine Speicherung biometrischer Daten: Vermeidet zentralisierte oder dystopische biometrische Datenbanken",
        "Abgestufte Verifikationsstufen: Reibungsarme Basispartizipation bei gleichzeitiger Freischaltung höherer Belohnungsstufen (Vorbehaltlich Simulation)"
      ],
      "invariants": [
        "Ganzzahlig begrenzte Punkte-Skalierung (Genaue Darstellung TBD; Gleitkommazahlen durch Invariante untersagt)",
        "Wahrung der Privatsphäre: Keine personenbezogenen Daten (PII) im Ledger-Zustand gespeichert"
      ]
    },
    "anti-sybil": {
      "id": "anti-sybil",
      "name": "Anti-Sybil-Architektur · Phase 3 (design)",
      "phase": "Phase 3: Menschliches Netzwerk",
      "status": "DESIGN",
      "summary": "Verhaltensanomalie-Erkennung und graphbasierte Clusteranalyse — Konzeptionell.",
      "technicalDetails": [
        "Netzwerkgraph-Clusteranalyse zur Erkennung koordinierter Empfehlungsringe und synthetischer Node-Cluster",
        "Statistische Verhaltensanomalie-Erkennung bei Partizipationsmustern (Konzeptionell)",
        "Ökonomische Fehlanreize: Gestaltung der Angriffskosten so, dass sie den erwarteten Ertrag übersteigen (Simulation erforderlich)"
      ],
      "invariants": [
        "Kollusionsresistenz: Koordinierte Cluster können ihren aggregierten Belohnungsanteil nicht künstlich verstärken",
        "Fehlerisolation: Minimierung falsch-positiver Ergebnisse durch Challenge-Review-Mechanismen (TBD)"
      ]
    },
    "participation-power": {
      "id": "participation-power",
      "name": "Participation Power",
      "phase": "Phase 3: Menschliches Netzwerk",
      "status": "DESIGN",
      "summary": "Nicht übertragbare Protokollmetrik, die den relativen Anteil eines einzelnen Teilnehmers an den zukünftigen Epochenbelohnungen des Community-Pools bestimmt (Konzeptioneller Rahmen für Phase 3).",
      "technicalDetails": [
        "Konzeptionelle Architektur: Power ∝ Base × Activity × Reputation × Contribution (abnehmende Erträge & harter PowerCap; Humanity fungiert als Berechtigungs-, Vertrauens- und Limitierungsebene; Parameter TBD)",
        "Nicht-tokenisiert und nicht übertragbar: Verhindert, dass Kapitalmärkte synthetischen Einfluss erkaufen",
        "Parameter, Koeffizienten und Obergrenzen: TBD — Vorbehaltlich ökonomischer Simulationen und Anti-Sybil-Analysen"
      ],
      "invariants": [
        "Strikte Begrenztheit: 0 <= ParticipationPower <= MaxProtocolCap für jeden Teilnehmer (Genaue Grenzen TBD)",
        "Belohnungsausschüttung an Teilnehmer i = CommunityRewardEpoch * (Power_i / TotalNetworkPower) (Konzeptionell)"
      ]
    }
  },
  "it": {
    "multi-asset-ledger": {
      "id": "multi-asset-ledger",
      "name": "Registro multi-asset",
      "phase": "Fase 1: Infrastruttura di base",
      "status": "IMPLEMENTED",
      "summary": "Motore di contabilità per asset nativi ed emessi dagli utenti, che supporta molteplici asset per account preservando la retrocompatibilità con lo stato legacy a singolo asset.",
      "technicalDetails": [
        "Le visualizzazioni del conto rimangono coerenti per l'asset nativo People (PPL) tra i saldi",
        "Registro canonico degli asset (Canonical Asset Registry) che traccia simbolo, nome, decimali, emittente, maxSupply e stato attivo/congelato",
        "Unità di base intere fisse (predefinito 6 decimali) per eliminare il non determinismo della virgola mobile IEEE-754"
      ],
      "invariants": [
        "Nessun saldo di conto può scendere sotto zero in qualsiasi sequenza di transazioni valida",
        "L'offerta dell'asset nativo è conservata nei trasferimenti: balance_A' + balance_B' + fee = balance_A + balance_B"
      ]
    },
    "feesplitter": {
      "id": "feesplitter",
      "name": "Motore FeeSplitter",
      "phase": "Fase 1: Infrastruttura di base",
      "status": "IMPLEMENTED",
      "summary": "Meccanismo matematicamente conservativo di instradamento delle commissioni che distribuisce le commissioni di transazione e di scambio tra validatori, pool della comunità, tesoreria, riserva di liquidità e burn del protocollo.",
      "technicalDetails": [
        "Exact integer conservation: sum(shares) = totalFee guaranteed on every transaction",
        "Divisione intera (floor) con instradamento deterministico del resto per prevenire dispersioni o inflazione di token",
        "Suddivisione commissioni di protocollo: 30% Validatori, 25% Community Pool, 20% Tesoreria, 10% Liquidità ed Ecosistema, 15% Growth Pool, 0% Burn"
      ],
      "invariants": [
        "Conservation Invariant: ValidatorShare + CommunityShare + TreasuryShare + LiquidityShare + GrowthShare + Burned = TotalFee",
        "Zero creazione o distruzione di token durante i calcoli di suddivisione delle commissioni"
      ]
    },
    "community-pool": {
      "id": "community-pool",
      "name": "Registro della Community Pool",
      "phase": "Fase 1: Infrastruttura di base",
      "status": "IMPLEMENTED",
      "summary": "Stato contabile a livello di protocollo che traccia allocazioni storiche, distribuzioni e saldi disponibili per ogni asset dell'ecosistema.",
      "technicalDetails": [
        "IMPLEMENTATO: Struttura di registro multi-asset che traccia totalAllocated, totalDistributed e remainingBalance per ID asset",
        "IMPLEMENTATO: Finanziato direttamente dalle distribuzioni delle commissioni di transazione e dalle allocazioni obbligatorie al lancio dei token",
        "DESIGN (Fase 3): Riserva di tesoreria a supporto delle future distribuzioni di ricompense per Mobile Mining e partecipazione umana"
      ],
      "invariants": [
        "Conservazione storica: totalAllocated = totalDistributed + remainingBalance per tutti gli asset tracciati",
        "Le distribuzioni sono autorizzate crittograficamente e rigorosamente limitate da remainingBalance"
      ]
    },
    "token-factory": {
      "id": "token-factory",
      "name": "Token Factory",
      "phase": "Fase 2: Livello economico",
      "status": "IMPLEMENTED",
      "summary": "Primitiva di protocollo che consente ai creator di lanciare token di comunità con allocazioni di fornitura standardizzate e piani di vesting anti-rug.",
      "technicalDetails": [
        "Suddivisione deterministica della fornitura a 5 vie: 60% Bonding Curve, 10% Community Pool, 15% Creator, 10% Riserva di liquidità, 5% Riserva dell'ecosistema",
        "Commissione di lancio minima obbligatoria (1 PPL) instradata verso i sink di commissioni del protocollo per prevenire lo spam",
        "Delimitazione esatta della fornitura: i resti della divisione intera sono assegnati alla curva per garantire sum(allocations) === totalSupply"
      ],
      "invariants": [
        "Supply Invariant: Curve + CommunityPool + Creator + LiquidityReserve + EcosystemReserve = TotalSupply",
        "L'emissione iniziale di token richiede una transazione di creazione valida e il pagamento della commissione di lancio"
      ]
    },
    "nft-factory": {
      "id": "nft-factory",
      "name": "Conio NFT",
      "phase": "Fase 2: Livello economico",
      "status": "IMPLEMENTED",
      "summary": "Conio minimale di elemento univoco: nome, descrizione, URI dell'immagine, collezione facoltativa, proprietario e trasferimento. Non è una suddivisione dell'offerta di Token Factory.",
      "technicalDetails": [
        "Tipi di transazione nftMint e nftTransfer; i record risiedono nello stato della catena e nello stateRoot",
        "L'immagine è memorizzata fuori catena (URL, Blob o digest sha256:); la catena conserva l'URI",
        "La commissione di conio è pagata in PPL; l'importo pubblico è configurato dall'operatore e non è un bucket nftFee in Growth"
      ],
      "invariants": [
        "Ogni nftId è univoco; solo l'attuale proprietario può trasferire",
        "Gli NFT non allocano il 10% dell'offerta a un Community Pool"
      ]
    },
    "bonding-curve": {
      "id": "bonding-curve",
      "name": "Curva virtuale a prodotto costante",
      "phase": "Fase 2: Livello economico",
      "status": "IMPLEMENTED",
      "summary": "Market maker autonomo on-chain basato su una formula virtuale a prodotto costante (K = X * Y) che fornisce liquidità algoritmica istantanea fin dal blocco zero.",
      "technicalDetails": [
        "Virtual constant-product invariant K = X * Y with initial virtual native reserve Y0 = 60 PPL",
        "Aritmetica intera sicura con arrotondamento per difetto (floor) e zero calcoli in virgola mobile per l'esecuzione di acquisti e vendite",
        "Commissione di trading di protocollo dell'1.00% estratta automaticamente e instradata attraverso il motore FeeSplitter della Fase 1"
      ],
      "invariants": [
        "Invariant Preservation: (X + dx) * (Y - dy) >= K on sells; (X - dx) * (Y + dy) >= K on buys",
        "Immunità all'arbitraggio round-trip: i proventi di vendita <= costo di acquisto originale per qualsiasi dimensione di operazione"
      ]
    },
    "creator-vesting": {
      "id": "creator-vesting",
      "name": "Piano di vesting del creator",
      "phase": "Fase 2: Livello economico",
      "status": "IMPLEMENTED",
      "summary": "Motore di vesting on-chain che garantisce l'allineamento dei creator e mitiga improvvisi dump di liquidità dopo il lancio del token.",
      "technicalDetails": [
        "Allocazione iniziale del 10% sbloccata immediatamente alla creazione del token per la configurazione di partenza",
        "Il restante 90% dell'allocazione matura linearmente nell'arco di 180 giorni (5.184.000 blocchi a 3s/blocco)",
        "Riscattabile su richiesta tramite transazione a livello di protocollo creatorClaim con tracciamento verificato dell'altezza del blocco"
      ],
      "invariants": [
        "Claim Limit: totalClaimed <= upfrontUnlocked + floor((blocksElapsed * 0.9 * totalAllocation) / durationBlocks)",
        "I riscatti di vesting riducono rigorosamente il pool di vesting e aumentano il saldo liquido del creator di una quantità identica"
      ]
    },
    "liquidity-migration": {
      "id": "liquidity-migration",
      "name": "Migrazione della liquidità AMM",
      "phase": "Fase 2: Livello economico",
      "status": "IMPLEMENTED",
      "summary": "Trigger automatico di protocollo che fa evolvere una bonding curve matura in un pool di liquidità AMM bloccato Gli swap AMM a prodotto costante sono attivi.",
      "technicalDetails": [
        "IMPLEMENTATO: La condizione di attivazione scatta quando la riserva di token della curva scende a <= 1/3 dell'allocazione iniziale della curva",
        "IMPLEMENTATO: Migra la riserva nativa effettiva accumulata e i token di liquidità riservati in una coppia AMM bloccata",
        "IMPLEMENTATO: Garantisce la continuità dei prezzi: il prezzo spot iniziale dell'AMM corrisponde al prezzo spot finale della curva",
        "IMPLEMENTATO: swap AMM a prodotto costante, token LP e pool token/PPL"
      ],
      "invariants": [
        "Transizione atomica: la curva passa permanentemente allo stato 'migrated' e disabilita ulteriori acquisti/vendite sulla curva",
        "Le riserve iniziali del pool AMM corrispondono ai saldi migrati con blocco permanente della liquidità"
      ]
    },
    "mobile-mining": {
      "id": "mobile-mining",
      "name": "Motore di Mobile Mining · Fase 3 (design)",
      "phase": "Fase 3: Rete umana",
      "status": "DESIGN",
      "summary": "Protocollo di partecipazione leggero che consente a utenti comuni su smartphone, tablet o browser di contribuire con attività utile e guadagnare ricompense comunitarie senza disporre di hardware di consenso (DESIGN — Fase 3).",
      "technicalDetails": [
        "NOT Proof-of-Work: no battery-draining hash loops or computational waste",
        "Distinto dal consenso dei validatori: i partecipanti NON producono blocchi e NON firmano quorum di attestazione",
        "Modello di partecipazione basato su sessioni con telemetria, check-in di attività e monitoraggio della salute della rete (Fase di progettazione)"
      ],
      "invariants": [
        "Separazione dei ruoli: lo stato dei partecipanti non può compromettere direttamente la sicurezza del consenso dei validatori",
        "L'inattività penalizza l'accumulo delle ricompense di sessione ma non applica mai lo slashing al collaterale di staking dei validatori"
      ]
    },
    "proof-of-humanity": {
      "id": "proof-of-humanity",
      "name": "Proof of Humanity · Fase 3 (design)",
      "phase": "Fase 3: Rete umana",
      "status": "DESIGN",
      "summary": "Framework di verifica umana multi-segnale. Il modello esatto di identità è soggetto a future ricerche e simulazioni.",
      "technicalDetails": [
        "Segnali di identità multistrato in fase di ricerca: età dell'account, continuità del dispositivo, coerenza comportamentale e attestazioni sociali",
        "Nessuna archiviazione biometrica: evita database biometrici centralizzati o distopici",
        "Livelli di verifica graduali: partecipazione di base con basso attrito, sbloccando al contempo fasce di ricompensa superiori (Soggetto a simulazione)"
      ],
      "invariants": [
        "Scalabilità del punteggio limitata a valori interi (Rappresentazione esatta TBD; virgola mobile vietata per invariante)",
        "Preservazione della privacy: nessuna informazione di identificazione personale (PII) registrata nello stato del ledger"
      ]
    },
    "anti-sybil": {
      "id": "anti-sybil",
      "name": "Architettura anti-Sybil · Fase 3 (design)",
      "phase": "Fase 3: Rete umana",
      "status": "DESIGN",
      "summary": "Rilevamento di anomalie comportamentali e analisi di cluster basata su grafi — Concettuale.",
      "technicalDetails": [
        "Analisi di clustering su grafo di rete per rilevare cerchie di referral coordinate e cluster di nodi sintetici",
        "Rilevamento statistico di anomalie comportamentali sui pattern di partecipazione (Concettuale)",
        "Disincentivi economici: progettare i costi di attacco in modo che superino il rendimento atteso delle ricompense (Richiesta simulazione)"
      ],
      "invariants": [
        "Resistenza alla collusione: i cluster coordinati non possono amplificare artificialmente la quota complessiva di ricompense",
        "Isolamento dei guasti: minimizzazione dei falsi positivi mediante meccanismi di revisione e contestazione (TBD)"
      ]
    },
    "participation-power": {
      "id": "participation-power",
      "name": "Participation Power",
      "phase": "Fase 3: Rete umana",
      "status": "DESIGN",
      "summary": "Metrica di protocollo non trasferibile che determina la proporzione relativa di un singolo partecipante nelle ricompense comunitarie delle future epoche (framework concettuale della Fase 3).",
      "technicalDetails": [
        "Architettura concettuale: Power ∝ Base × Activity × Reputation × Contribution (rendimenti decrescenti & rigido PowerCap; la Proof of Humanity funge da livello di Idoneità / Fiducia / Limite; parametri TBD)",
        "Non tokenizzato e non trasferibile: impedisce ai mercati di capitali di acquistare influenza sintetica",
        "Parametri, coefficienti e massimali: TBD — soggetti a simulazioni economiche e analisi anti-Sybil"
      ],
      "invariants": [
        "Strict boundedness: 0 <= ParticipationPower <= MaxProtocolCap for every participant (Exact bounds TBD)",
        "Distribuzione delle ricompense al partecipante i = CommunityRewardEpoch * (Power_i / TotalNetworkPower) (Concettuale)"
      ]
    }
  },
  "tr": {
    "multi-asset-ledger": {
      "id": "multi-asset-ledger",
      "name": "Çok Varlıklı Kayıt Defteri",
      "phase": "Aşama 1: Temel Altyapı",
      "status": "IMPLEMENTED",
      "summary": "Eski tek varlıklı durumla geriye dönük uyumluluğu korurken hesap başına birden fazla varlığı destekleyen yerel ve kullanıcı tarafından basılan varlık muhasebe motoru.",
      "technicalDetails": [
        "Hesap görünümleri, bakiyeler arasında yerel varlık People (PPL) için tutarlı kalır",
        "Sembol, ad, ondalık basamak (decimals), ihraççı, maxSupply ve aktif/donmuş durumunu takip eden Kanonik Varlık Kaydı",
        "IEEE-754 kayan nokta belirsizliğini ortadan kaldırmak için sabit tam sayı temel birimleri (varsayılan 6 ondalık basamak)"
      ],
      "invariants": [
        "Geçerli hiçbir işlem dizisinde hiçbir hesap bakiyesi sıfırın altına düşemez",
        "Yerel varlık arzı transferler boyunca korunur: balance_A' + balance_B' + fee = balance_A + balance_B"
      ]
    },
    "feesplitter": {
      "id": "feesplitter",
      "name": "FeeSplitter Motoru",
      "phase": "Aşama 1: Temel Altyapı",
      "status": "IMPLEMENTED",
      "summary": "İşlem ve takas ücretlerini doğrulayıcılar, topluluk havuzu, hazine, likidite rezervi ve protokol yakımı arasında dağıtan matematiksel olarak korunumlu ücret yönlendirme mekanizması.",
      "technicalDetails": [
        "Kesin tam sayı korunumu: her işlemde sum(shares) = totalFee garanti edilir",
        "Token sızıntısını veya enflasyonunu önlemek için deterministik kalan yönlendirmesiyle tam sayı taban bölmesi (floor division)",
        "Protokol ücret dağılımı: %30 Doğrulayıcılar, %25 Topluluk Havuzu, %20 Hazine, %10 Likidite ve Ekosistem, %15 Growth Pool, %0 Yakım"
      ],
      "invariants": [
        "Korunum Değişmezi: ValidatorShare + CommunityShare + TreasuryShare + LiquidityShare + GrowthShare + Burned = TotalFee",
        "Ücret bölme hesaplamaları sırasında sıfır token oluşturma veya yok etme"
      ]
    },
    "community-pool": {
      "id": "community-pool",
      "name": "Topluluk Havuzu Kaydı",
      "phase": "Aşama 1: Temel Altyapı",
      "status": "IMPLEMENTED",
      "summary": "Ekosistemdeki her varlık için toplam tahsisatları, dağıtımları ve kullanılabilir bakiyeleri izleyen protokol düzeyinde muhasebe durumu.",
      "technicalDetails": [
        "UYGULANDI: Varlık kimliği başına totalAllocated, totalDistributed ve remainingBalance'ı izleyen çok varlıklı kayıt yapısı",
        "UYGULANDI: İşlem ücreti dağıtımlarından ve zorunlu token çıkarma tahsisatlarından doğrudan fonlanır",
        "DESIGN (Aşama 3): Gelecekteki Mobil Madencilik ve insan katılımı ödül dağıtımlarını destekleyen hazine rezervi"
      ],
      "invariants": [
        "Ömür boyu korunum: izlenen tüm varlıklar için totalAllocated = totalDistributed + remainingBalance",
        "Dağıtımlar kriptografik olarak yetkilendirilir ve kesinlikle remainingBalance ile sınırlandırılır"
      ]
    },
    "token-factory": {
      "id": "token-factory",
      "name": "Token Fabrikası",
      "phase": "Aşama 2: Ekonomik Katman",
      "status": "IMPLEMENTED",
      "summary": "İçerik üreticilerinin standartlaştırılmış arz tahsisatları ve hile önleyici (anti-rug) hakediş takvimleriyle topluluk tokenları çıkarmasını sağlayan protokol ilkesi.",
      "technicalDetails": [
        "Deterministik 5 yönlü arz dağılımı: %60 Bağlanma Eğrisi, %10 Topluluk Havuzu, %15 Üretici, %10 Likidite Rezervi, %5 Ekosistem Rezervi",
        "Spamı önlemek için doğrudan protokol ücret havuzlarına yönlendirilen zorunlu minimum çıkarma ücreti (1 PPL)",
        "Kesin arz sınırlandırması: sum(allocations) === totalSupply eşitliğini garanti etmek için tam sayı bölme kalanları eğri tahsisatına atanır"
      ],
      "invariants": [
        "Arz Değişmezi: Curve + CommunityPool + Creator + LiquidityReserve + EcosystemReserve = TotalSupply",
        "İlk token ihracı geçerli bir oluşturma işlemi ve çıkarma ücreti ödemesi gerektirir"
      ]
    },
    "nft-factory": {
      "id": "nft-factory",
      "name": "NFT Basımı",
      "phase": "Faz 2: Ekonomik Katman",
      "status": "IMPLEMENTED",
      "summary": "Minimal benzersiz öğe basımı: ad, açıklama, görsel URI, isteğe bağlı koleksiyon, sahip ve transfer. Token Factory arz bölüşümü değildir.",
      "technicalDetails": [
        "nftMint ve nftTransfer işlem türleri; kayıtlar zincir durumunda ve stateRoot içinde yer alır",
        "Görsel zincir dışında saklanır (URL, Blob veya sha256: özeti); zincir URI'yi tutar",
        "Basım ücreti PPL cinsinden ödenir; genel tutar operatör tarafından yapılandırılır ve Growth nftFee havuzu değildir"
      ],
      "invariants": [
        "Her nftId benzersizdir; yalnızca mevcut sahip transfer edebilir",
        "NFT'ler arzın %10'unu Topluluk Havuzuna tahsis etmez"
      ]
    },
    "bonding-curve": {
      "id": "bonding-curve",
      "name": "Sanal Sabit Çarpım Eğrisi",
      "phase": "Aşama 2: Ekonomik Katman",
      "status": "IMPLEMENTED",
      "summary": "Sanal sabit çarpım formülü (K = X * Y) üzerinde çalışan ve sıfırıncı bloktan itibaren anında algoritmik likidite sağlayan otonom zincir üstü piyasa yapıcı.",
      "technicalDetails": [
        "Başlangıç sanal yerel rezervi Y0 = 60 PPL olan sanal sabit çarpım değişmezi K = X * Y",
        "Alım ve satım işlemleri için kayan nokta hesabı içermeyen tam sayı güvenli taban aritmetiği",
        "Otomatik olarak tahsil edilen ve Aşama 1 FeeSplitter motoru aracılığıyla yönlendirilen %1.00 protokol işlem ücreti"
      ],
      "invariants": [
        "Değişmez Korunumu: Satışlarda (X + dx) * (Y - dy) >= K; Alımlarda (X - dx) * (Y + dy) >= K",
        "Çift yönlü arbitraj bağışıklığı: tüm işlem büyüklüklerinde satış getirisi <= orijinal alım maliyeti"
      ]
    },
    "creator-vesting": {
      "id": "creator-vesting",
      "name": "Üretici Hakediş Takvimi",
      "phase": "Aşama 2: Ekonomik Katman",
      "status": "IMPLEMENTED",
      "summary": "Üreticinin ekosistemle uyumunu zorunlu kılan ve token ihracının ardından ani likidite satışlarını engelleyen zincir üstü hakediş motoru.",
      "technicalDetails": [
        "İlk kurulum harcamaları için token oluşturma anında hemen açılan %10 ön kilit açılımı",
        "Kalan %90'lık tahsisat 180 gün boyunca doğrusal olarak açılır (3 sn/blok referansıyla 5.184.000 blok)",
        "Doğrulanmış blok yüksekliği takibi ile protokol düzeyinde creatorClaim işlemi üzerinden talep edilebilir"
      ],
      "invariants": [
        "Talep Limiti: totalClaimed <= upfrontUnlocked + floor((blocksElapsed * 0.9 * totalAllocation) / durationBlocks)",
        "Hakediş talepleri, hakediş havuzunu kesin olarak azaltır ve üreticinin likit bakiyesini tam olarak aynı miktarda artırır"
      ]
    },
    "liquidity-migration": {
      "id": "liquidity-migration",
      "name": "AMM Likidite Geçişi",
      "phase": "Aşama 2: Ekonomik Katman",
      "status": "IMPLEMENTED",
      "summary": "Olgunlaşan bir bağlanma eğrisini kilitli bir AMM likidite havuzuna geçiren otomatik protokol tetikleyicisi Sabit çarpım AMM takasları canlıdır.",
      "technicalDetails": [
        "UYGULANDI: Eğri token rezervi, başlangıçtaki eğri tahsisatının <= 1/3'üne düştüğünde tetikleme koşulu etkinleşir",
        "UYGULANDI: Biriken gerçek yerel rezervi ve ayrılmış likidite tokenlarını kilitli bir AMM çiftine taşır",
        "UYGULANDI: Fiyat sürekliliğini garanti eder: ilk AMM spot fiyatı, son eğri spot fiyatıyla tam olarak eşleşir",
        "UYGULANDI: Sabit çarpım AMM takasları, LP tokenları ve token/PPL havuzları"
      ],
      "invariants": [
        "Atomik geçiş: eğri kalıcı olarak 'migrated' durumuna geçer ve daha fazla eğri alım/satım işlemini devre dışı bırakır",
        "İlk AMM havuz rezervleri, kalıcı likidite kilidi ile taşınan bakiyelerle birebir eşleşir"
      ]
    },
    "mobile-mining": {
      "id": "mobile-mining",
      "name": "Mobil Madencilik Motoru · Aşama 3 (design)",
      "phase": "Aşama 3: İnsan Ağı",
      "status": "DESIGN",
      "summary": "Telefon, tablet veya tarayıcılardaki sıradan kullanıcıların konsensüs donanımı çalıştırmadan faydalı aktiviteye katkıda bulunmalarını ve topluluk ödülleri kazanmalarını sağlayan hafif katılım protokolü (DESIGN — Aşama 3).",
      "technicalDetails": [
        "İş Kanıtı (Proof-of-Work) DEĞİLDİR: pil tüketen karma döngüleri veya hesaplama israfı yoktur",
        "Doğrulayıcı konsensüsünden ayrıdır: katılımcılar blok ÜRETMEZ ve onay kitlelerini İMZALAMAZ",
        "Telemetri, etkinlik kontrolleri ve ağ sağlığı izleme özelliklerine sahip oturum tabanlı katılım modeli (Tasarım spesifikasyonunda)"
      ],
      "invariants": [
        "Rol Ayrımı: Katılımcı durumu doğrudan doğrulayıcı konsensüs güvenliğini tehlikeye atamaz",
        "Hareketsizlik oturum ödülü birikimini cezalandırır ancak asla doğrulayıcı hisse teminatını (slashing) kesmez"
      ]
    },
    "proof-of-humanity": {
      "id": "proof-of-humanity",
      "name": "İnsanlık Kanıtı · Aşama 3 (design)",
      "phase": "Aşama 3: İnsan Ağı",
      "status": "DESIGN",
      "summary": "Çok sinyalli insan doğrulama çerçevesi. Kesin kimlik modeli gelecekteki araştırma ve simülasyonlara tabidir.",
      "technicalDetails": [
        "Araştırılmakta olan çok katmanlı kimlik sinyalleri: hesap yaşı, cihaz sürekliliği, davranışsal tutarlılık ve sosyal tasdikler",
        "Sıfır biyometrik depolama: merkezi veya distopik biyometrik veri tabanlarından kaçınır",
        "Kademeli doğrulama seviyeleri: daha yüksek ödül kademelerinin kilidini açarken düşük sürtünmeli temel katılım sağlar (Simülasyona tabidir)"
      ],
      "invariants": [
        "Tam sayı ile sınırlandırılmış puan ölçeklendirmesi (Kesin gösterim TBD; kayan nokta değişmez tarafından yasaklanmıştır)",
        "Gizlilik koruması: defter durumuna hiçbir kişisel tanımlayıcı bilgi (PII) kaydedilmez"
      ]
    },
    "anti-sybil": {
      "id": "anti-sybil",
      "name": "Sybil Karşıtı Mimari · Aşama 3 (design)",
      "phase": "Aşama 3: İnsan Ağı",
      "status": "DESIGN",
      "summary": "Davranışsal anormallik tespiti ve grafik tabanlı küme analizi — Kavramsal.",
      "technicalDetails": [
        "Koordineli yönlendirme halkalarını ve sentetik düğüm kümelerini tespit etmek için ağ grafiği kümeleme analizi",
        "Katılım modellerinde istatistiksel davranışsal anormallik tespiti (Kavramsal)",
        "Ekonomik caydırıcılık: saldırı maliyetlerini beklenen ödül getirisini aşacak şekilde tasarlama (Simülasyon gereklidir)"
      ],
      "invariants": [
        "Gizli Anlaşma Direnci: Koordineli kümeler toplam ödül payını yapay olarak artıramaz",
        "Hata İzolasyonu: İtiraz inceleme mekanizmalarıyla yanlış pozitifleri en aza indirme (TBD)"
      ]
    },
    "participation-power": {
      "id": "participation-power",
      "name": "Katılım Gücü",
      "phase": "Aşama 3: İnsan Ağı",
      "status": "DESIGN",
      "summary": "Bireysel bir katılımcının gelecekteki dönem topluluk ödüllerindeki göreceli payını belirleyen devredilemez protokol metriği (Aşama 3 kavramsal çerçevesi).",
      "technicalDetails": [
        "Kavramsal Mimari: Power ∝ Base × Activity × Reputation × Contribution (diminishing returns & hard PowerCap; Humanity functions as Eligibility / Trust / Limit layer; parameters TBD)",
        "Tokenleştirilmemiş ve devredilemez: sermaye piyasalarının sentetik etki satın almasını engeller",
        "Parametreler, katsayılar ve limitler: TBD — ekonomik simülasyonlara ve Sybil karşıtı analizlere tabidir"
      ],
      "invariants": [
        "Katı sınırlılık: her katılımcı için 0 <= ParticipationPower <= MaxProtocolCap (Kesin sınırlar TBD)",
        "Katılımcı i için ödül dağıtımı = CommunityRewardEpoch * (Power_i / TotalNetworkPower) (Kavramsal)"
      ]
    }
  },
  "vi": {
    "multi-asset-ledger": {
      "id": "multi-asset-ledger",
      "name": "Sổ cái Đa Tài sản",
      "phase": "Giai đoạn 1: Cơ sở hạ tầng cốt lõi",
      "status": "IMPLEMENTED",
      "summary": "Cơ chế kế toán tài sản gốc và do người dùng phát hành, hỗ trợ nhiều tài sản trên mỗi tài khoản trong khi vẫn duy trì khả năng tương thích ngược với trạng thái tài sản đơn lẻ trước đây.",
      "technicalDetails": [
        "Chế độ xem tài khoản luôn nhất quán cho tài sản gốc People (PPL) trên các số dư",
        "Sổ đăng ký Tài sản Chuẩn hóa (Canonical Asset Registry) theo dõi biểu tượng (symbol), tên gọi, số chữ số thập phân (decimals), đơn vị phát hành, maxSupply và trạng thái hoạt động/đóng băng",
        "Đơn vị cơ sở số nguyên cố định (mặc định 6 chữ số thập phân) để loại bỏ tính bất định của số thực dấu phẩy động IEEE-754"
      ],
      "invariants": [
        "Không có số dư tài khoản nào có thể giảm xuống dưới 0 dưới bất kỳ chuỗi giao dịch hợp lệ nào",
        "Nguồn cung tài sản gốc được bảo toàn qua các lần chuyển khoản: balance_A' + balance_B' + fee = balance_A + balance_B"
      ]
    },
    "feesplitter": {
      "id": "feesplitter",
      "name": "Cơ chế Phân bổ Phí (FeeSplitter)",
      "phase": "Giai đoạn 1: Cơ sở hạ tầng cốt lõi",
      "status": "IMPLEMENTED",
      "summary": "Cơ chế định tuyến phí bảo toàn toán học nghiêm ngặt, phân bổ phí giao dịch và giao dịch hoán đổi giữa các validator, quỹ cộng đồng, kho bạc, quỹ dự trữ thanh khoản và cơ chế đốt giao thức.",
      "technicalDetails": [
        "Bảo toàn số nguyên chính xác: đảm bảo sum(shares) = totalFee trên mọi giao dịch",
        "Phép chia lấy phần nguyên (floor division) với việc định tuyến phần dư có tính tất định để ngăn chặn rò rỉ token hoặc lạm phát",
        "Phân chia phí giao thức: 30% Validator, 25% Quỹ Cộng đồng, 20% Kho bạc, 10% Thanh khoản & Hệ sinh thái, 15% Growth Pool, 0% Đốt"
      ],
      "invariants": [
        "Bất biến bảo toàn: ValidatorShare + CommunityShare + TreasuryShare + LiquidityShare + GrowthShare + Burned = TotalFee",
        "Không có token nào được tạo ra hoặc bị phá hủy trong các phép tính phân chia phí"
      ]
    },
    "community-pool": {
      "id": "community-pool",
      "name": "Sổ đăng ký Quỹ Cộng đồng",
      "phase": "Giai đoạn 1: Cơ sở hạ tầng cốt lõi",
      "status": "IMPLEMENTED",
      "summary": "Trạng thái kế toán cấp giao thức theo dõi tổng phân bổ trọn đời, các khoản phân phối và số dư khả dụng trên mọi tài sản trong hệ sinh thái.",
      "technicalDetails": [
        "ĐÃ TRIỂN KHAI: Cấu trúc sổ đăng ký đa tài sản theo dõi totalAllocated, totalDistributed và remainingBalance cho từng mã tài sản",
        "ĐÃ TRIỂN KHAI: Được cấp vốn trực tiếp từ việc phân bổ phí giao dịch và các khoản trích bắt buộc khi ra mắt token",
        "LẬP KẾ HOẠCH (Giai đoạn 3): Quỹ dự trữ kho bạc hỗ trợ phần thưởng Khai thác Di động và sự tham gia của con người trong tương lai"
      ],
      "invariants": [
        "Bảo toàn trọn đời: totalAllocated = totalDistributed + remainingBalance cho tất cả tài sản được theo dõi",
        "Các đợt phân phối được cấp quyền bằng mật mã học và bị giới hạn nghiêm ngặt bởi remainingBalance"
      ]
    },
    "token-factory": {
      "id": "token-factory",
      "name": "Xưởng Tạo Token (Token Factory)",
      "phase": "Giai đoạn 2: Lớp Kinh tế",
      "status": "IMPLEMENTED",
      "summary": "Nguyên hàm giao thức cho phép các nhà sáng tạo phát hành token cộng đồng với các phân bổ nguồn cung chuẩn hóa và lịch trình vesting chống xả hàng (anti-rug).",
      "technicalDetails": [
        "Chia nguồn cung tất định theo 5 phần: 60% Đường cong Bonding, 10% Quỹ cộng đồng, 15% Nhà sáng tạo, 10% Dự trữ thanh khoản, 5% Dự trữ hệ sinh thái",
        "Phí phát hành tối thiểu bắt buộc (1 PPL) được chuyển trực tiếp vào các bể thu phí giao thức để chống spam",
        "Ràng buộc nguồn cung chính xác: phần dư của phép chia số nguyên được phân bổ vào đường cong để đảm bảo sum(allocations) === totalSupply"
      ],
      "invariants": [
        "Bất biến nguồn cung: Curve + CommunityPool + Creator + LiquidityReserve + EcosystemReserve = TotalSupply",
        "Việc phát hành token ban đầu yêu cầu giao dịch tạo hợp lệ và thanh toán phí phát hành"
      ]
    },
    "nft-factory": {
      "id": "nft-factory",
      "name": "Đúc NFT",
      "phase": "Giai đoạn 2: Lớp kinh tế",
      "status": "IMPLEMENTED",
      "summary": "Đúc vật phẩm độc bản tối giản: tên, mô tả, URI hình ảnh, bộ sưu tập tùy chọn, chủ sở hữu và chuyển nhượng. Không phải phân chia nguồn cung Token Factory.",
      "technicalDetails": [
        "Các loại giao dịch nftMint và nftTransfer; bản ghi nằm trong trạng thái chuỗi và stateRoot",
        "Hình ảnh được lưu trữ ngoài chuỗi (URL, Blob hoặc mã sha256:); chuỗi lưu giữ URI",
        "Phí đúc được thanh toán bằng PPL; số lượng công khai do nhà vận hành cấu hình và không phải nhóm nftFee trong Growth"
      ],
      "invariants": [
        "Mỗi nftId là duy nhất; chỉ chủ sở hữu hiện tại mới có thể chuyển nhượng",
        "NFT không phân bổ 10% nguồn cung cho Quỹ cộng đồng"
      ]
    },
    "bonding-curve": {
      "id": "bonding-curve",
      "name": "Đường cong Tích số Không đổi Ảo",
      "phase": "Giai đoạn 2: Lớp Kinh tế",
      "status": "IMPLEMENTED",
      "summary": "Nhà tạo lập thị trường tự trị trên chuỗi hoạt động dựa trên công thức tích số không đổi ảo (K = X * Y), cung cấp thanh khoản thuật toán tức thì ngay từ khối số không.",
      "technicalDetails": [
        "Bất biến tích số không đổi ảo K = X * Y với lượng dự trữ ảo gốc ban đầu Y0 = 60 PPL",
        "Số học lấy phần nguyên an toàn không sử dụng số thực dấu phẩy động cho các lệnh mua và bán",
        "Phí giao dịch giao thức 1.00% được tự động trích xuất và chuyển qua động cơ FeeSplitter của Giai đoạn 1"
      ],
      "invariants": [
        "Bảo toàn bất biến: (X + dx) * (Y - dy) >= K khi bán; (X - dx) * (Y + dy) >= K khi mua",
        "Miễn nhiễm với kinh doanh chênh lệch giá hai chiều: tiền thu về khi bán <= chi phí mua ban đầu trên mọi quy mô giao dịch"
      ]
    },
    "creator-vesting": {
      "id": "creator-vesting",
      "name": "Lịch trình Vesting của Nhà sáng tạo",
      "phase": "Giai đoạn 2: Lớp Kinh tế",
      "status": "IMPLEMENTED",
      "summary": "Động cơ vesting trên chuỗi ràng buộc lợi ích lâu dài của nhà sáng tạo và giảm thiểu rủi ro bán tháo đột ngột thanh khoản sau khi ra mắt token.",
      "technicalDetails": [
        "10% phân bổ ban đầu được mở khóa ngay khi tạo token để phục vụ thiết lập ban đầu",
        "90% phân bổ còn lại được mở khóa tuyến tính trong 180 ngày (5.184.000 khối với chuẩn 3 giây/khối)",
        "Có thể nhận theo yêu cầu qua giao dịch creatorClaim ở cấp giao thức với việc theo dõi chiều cao khối đã được xác minh"
      ],
      "invariants": [
        "Giới hạn nhận token: totalClaimed <= upfrontUnlocked + floor((blocksElapsed * 0.9 * totalAllocation) / durationBlocks)",
        "Lệnh nhận vesting giảm nghiêm ngặt số dư quỹ vesting và tăng số dư khả dụng của nhà sáng tạo đúng bằng lượng đó"
      ]
    },
    "liquidity-migration": {
      "id": "liquidity-migration",
      "name": "Di chuyển Thanh khoản AMM",
      "phase": "Giai đoạn 2: Lớp Kinh tế",
      "status": "IMPLEMENTED",
      "summary": "Bộ kích hoạt giao thức tự động chuyển đổi một đường cong bonding hoàn thiện sang nhóm thanh khoản AMM bị khóa Hoán đổi AMM tích số không đổi đã hoạt động.",
      "technicalDetails": [
        "ĐÃ TRIỂN KHAI: Điều kiện kích hoạt khi lượng token dự trữ trên đường cong giảm xuống <= 1/3 phân bổ đường cong ban đầu",
        "ĐÃ TRIỂN KHAI: Chuyển toàn bộ dự trữ PPL thực tế tích lũy và lượng token thanh khoản dự trữ vào một cặp AMM bị khóa",
        "ĐÃ TRIỂN KHAI: Đảm bảo tính liên tục của giá: giá giao ngay AMM ban đầu khớp chính xác với giá giao ngay cuối cùng của đường cong",
        "ĐÃ TRIỂN KHAI: Hoán đổi AMM tích số không đổi, token LP và nhóm token/PPL"
      ],
      "invariants": [
        "Chuyển đổi nguyên tử: đường cong chuyển vĩnh viễn sang trạng thái 'migrated' và vô hiệu hóa các giao dịch mua/bán tiếp theo trên đường cong",
        "Dự trữ nhóm AMM ban đầu khớp chính xác với số dư đã di chuyển và bị khóa vĩnh viễn thanh khoản"
      ]
    },
    "mobile-mining": {
      "id": "mobile-mining",
      "name": "Động cơ Khai thác Di động — Lập kế hoạch",
      "phase": "Giai đoạn 3: Mạng lưới Con người",
      "status": "DESIGN",
      "summary": "Giao thức tham gia tinh gọn cho phép người dùng thông thường trên điện thoại, máy tính bảng hoặc trình duyệt đóng góp hoạt động hữu ích và nhận phần thưởng cộng đồng mà không cần vận hành phần cứng đồng thuận (LẬP KẾ HOẠCH — Giai đoạn 3).",
      "technicalDetails": [
        "KHÔNG PHẢI Proof-of-Work: không có các vòng lặp băm làm hao pin hay lãng phí tài nguyên tính toán",
        "Tách biệt khỏi sự đồng thuận của validator: người tham gia KHÔNG tạo khối và KHÔNG ký các biểu quyết xác thực",
        "Mô hình tham gia dựa trên phiên làm việc với đo kiểm từ xa, điểm danh hoạt động và theo dõi sức khỏe mạng lưới (Giai đoạn thiết kế)"
      ],
      "invariants": [
        "Phân tách vai trò: Trạng thái của người tham gia không thể trực tiếp làm tổn hại đến sự an toàn của đồng thuận validator",
        "Việc không hoạt động làm giảm tích lũy phần thưởng trong phiên nhưng không bao giờ làm mất tiền ký quỹ (slashing) của validator"
      ]
    },
    "proof-of-humanity": {
      "id": "proof-of-humanity",
      "name": "Bằng chứng Nhân tính — Lập kế hoạch",
      "phase": "Giai đoạn 3: Mạng lưới Con người",
      "status": "DESIGN",
      "summary": "Khung xác thực con người đa tín hiệu. Mô hình định danh chính xác sẽ được nghiên cứu và mô phỏng chi tiết trong tương lai.",
      "technicalDetails": [
        "Nhiều lớp tín hiệu định danh đang được nghiên cứu: tuổi tài khoản, tính liên tục của thiết bị, tính nhất quán về hành vi và chứng thực xã hội",
        "Không lưu trữ sinh trắc học: tránh các cơ sở dữ liệu sinh trắc học tập trung hoặc xâm phạm quyền riêng tư",
        "Các cấp độ xác minh phân tầng: tham gia cơ bản không rào cản trong khi mở khóa các bậc phần thưởng cao hơn (Phụ thuộc vào mô phỏng)"
      ],
      "invariants": [
        "Thang điểm giới hạn bằng số nguyên (Định dạng chính xác TBD; số thực dấu phẩy động bị nghiêm cấm bởi bất biến)",
        "Bảo vệ quyền riêng tư: không có thông tin nhận dạng cá nhân (PII) nào được ghi vào trạng thái sổ cái"
      ]
    },
    "anti-sybil": {
      "id": "anti-sybil",
      "name": "Kiến trúc Chống Sybil — Lập kế hoạch",
      "phase": "Giai đoạn 3: Mạng lưới Con người",
      "status": "DESIGN",
      "summary": "Phát hiện bất thường về hành vi và phân tích cụm dựa trên đồ thị — Khung khái niệm.",
      "technicalDetails": [
        "Phân tích cụm đồ thị mạng lưới để phát hiện các vòng giới thiệu phối hợp và các cụm nút giả lập",
        "Phát hiện thống kê các bất thường hành vi trong các mô hình tham gia (Khái niệm)",
        "Rào cản kinh tế: thiết kế chi phí tấn công vượt quá lợi nhuận phần thưởng kỳ vọng (Cần mô phỏng)"
      ],
      "invariants": [
        "Kháng thông đồng: Các cụm phối hợp không thể khuếch đại nhân tạo tổng tỷ lệ phần thưởng",
        "Cách ly lỗi: Giảm thiểu các kết quả dương tính giả bằng các cơ chế kháng nghị thử thách (TBD)"
      ]
    },
    "participation-power": {
      "id": "participation-power",
      "name": "Sức mạnh Tham gia",
      "phase": "Giai đoạn 3: Mạng lưới Con người",
      "status": "DESIGN",
      "summary": "Chỉ số giao thức không thể chuyển nhượng, xác định tỷ lệ phần trăm tương đối của từng người tham gia trong các phần thưởng cộng đồng ở các kỷ nguyên tương lai (Khung khái niệm Giai đoạn 3).",
      "technicalDetails": [
        "Kiến trúc khái niệm: Power ∝ Base × Activity × Reputation × Contribution (diminishing returns & hard PowerCap; Humanity functions as Eligibility / Trust / Limit layer; parameters TBD)",
        "Không token hóa và không thể chuyển nhượng: ngăn thị trường vốn mua sức ảnh hưởng nhân tạo",
        "Các tham số, hệ số và mức trần: TBD — phụ thuộc vào các mô phỏng kinh tế và phân tích chống Sybil"
      ],
      "invariants": [
        "Giới hạn nghiêm ngặt: 0 <= ParticipationPower <= MaxProtocolCap cho mọi người tham gia (Giới hạn chính xác TBD)",
        "Phân bổ phần thưởng cho người tham gia i = CommunityRewardEpoch * (Power_i / TotalNetworkPower) (Khái niệm)"
      ]
    }
  },
  "id": {
    "multi-asset-ledger": {
      "id": "multi-asset-ledger",
      "name": "Buku Besar Multi-Aset",
      "phase": "Fase 1: Infrastruktur Inti",
      "status": "IMPLEMENTED",
      "summary": "Mesin akuntansi aset bawaan (native) dan aset terbitan pengguna yang mendukung banyak aset per akun dengan tetap mempertahankan kompatibilitas penuh terhadap kondisi aset tunggal sebelumnya.",
      "technicalDetails": [
        "Tampilan akun tetap konsisten untuk aset asli People (PPL) di seluruh saldo",
        "Canonical Asset Registry yang melacak simbol, nama, desimal, penerbit, maxSupply, dan status aktif/beku",
        "Satuan dasar bilangan bulat tetap (standar 6 desimal) untuk menghilangkan nondeterminisme floating-point IEEE-754"
      ],
      "invariants": [
        "Tidak ada saldo akun yang boleh jatuh di bawah nol dalam urutan transaksi valid apa pun",
        "Pasokan aset native dikonservasi di seluruh transfer: balance_A' + balance_B' + fee = balance_A + balance_B"
      ]
    },
    "feesplitter": {
      "id": "feesplitter",
      "name": "Mesin FeeSplitter",
      "phase": "Fase 1: Infrastruktur Inti",
      "status": "IMPLEMENTED",
      "summary": "Mekanisme perutean biaya yang konservatif secara matematis untuk mendistribusikan biaya transaksi dan perdagangan ke validator, kolam komunitas, perbendaharaan, cadangan likuiditas, dan pembakaran protokol.",
      "technicalDetails": [
        "Konservasi bilangan bulat eksak: sum(shares) = totalFee terjamin pada setiap transaksi",
        "Pembagian bulat ke bawah (floor division) dengan perutean sisa yang deterministik guna mencegah kebocoran atau inflasi token",
        "Pembagian biaya protokol: 30% Validator, 25% Kolam Komunitas, 20% Perbendaharaan, 10% Likuiditas & Ekosistem, 15% Growth Pool, 0% Pembakaran"
      ],
      "invariants": [
        "Invarian Konservasi: ValidatorShare + CommunityShare + TreasuryShare + LiquidityShare + GrowthShare + Burned = TotalFee",
        "Nol penciptaan atau pemusnahan token selama perhitungan pembagian biaya"
      ]
    },
    "community-pool": {
      "id": "community-pool",
      "name": "Registri Kolam Komunitas",
      "phase": "Fase 1: Infrastruktur Inti",
      "status": "IMPLEMENTED",
      "summary": "Status akuntansi tingkat protokol yang melacak alokasi kumulatif, distribusi, dan saldo yang tersedia di setiap aset dalam ekosistem.",
      "technicalDetails": [
        "TERIMPLEMENTASI (IMPLEMENTED): Struktur registri multi-aset yang melacak totalAllocated, totalDistributed, dan remainingBalance per ID aset",
        "TERIMPLEMENTASI (IMPLEMENTED): Didanai langsung dari distribusi biaya transaksi dan alokasi wajib peluncuran token",
        "DESIGN (Fase 3): Cadangan perbendaharaan yang mendukung distribusi imbalan Mobile Mining dan partisipasi manusia di masa mendatang"
      ],
      "invariants": [
        "Konservasi seumur hidup: totalAllocated = totalDistributed + remainingBalance untuk semua aset yang dilacak",
        "Distribusi diotorisasi secara kriptografis dan dibatasi secara ketat oleh remainingBalance"
      ]
    },
    "token-factory": {
      "id": "token-factory",
      "name": "Pabrik Token (Token Factory)",
      "phase": "Fase 2: Lapisan Ekonomi",
      "status": "IMPLEMENTED",
      "summary": "Primitif protokol yang memungkinkan kreator meluncurkan token komunitas dengan alokasi pasokan terstandarisasi dan jadwal vesting pencegah penipuan (anti-rug).",
      "technicalDetails": [
        "Pembagian pasokan 5 arah yang deterministik: 60% Kurva Ikatan (Bonding Curve), 10% Kolam Komunitas, 15% Kreator, 10% Cadangan Likuiditas, 5% Cadangan Ekosistem",
        "Biaya peluncuran minimum wajib (1 PPL) yang diarahkan ke penampung biaya protokol untuk mencegah spam",
        "Pembatasan pasokan eksak: sisa pembagian bilangan bulat dialokasikan ke porsi kurva untuk menjamin sum(allocations) === totalSupply"
      ],
      "invariants": [
        "Invarian Pasokan: Curve + CommunityPool + Creator + LiquidityReserve + EcosystemReserve = TotalSupply",
        "Penerbitan token awal memerlukan transaksi pembuatan yang valid dan pembayaran biaya peluncuran"
      ]
    },
    "nft-factory": {
      "id": "nft-factory",
      "name": "Pencetakan NFT",
      "phase": "Fase 2: Lapisan Ekonomi",
      "status": "IMPLEMENTED",
      "summary": "Pencetakan item unik minimal: nama, deskripsi, URI gambar, koleksi opsional, pemilik, dan transfer. Bukan pembagian pasokan Token Factory.",
      "technicalDetails": [
        "Jenis transaksi nftMint dan nftTransfer; rekaman berada di status rantai dan stateRoot",
        "Gambar disimpan di luar rantai (URL, Blob, atau hash sha256:); rantai menyimpan URI",
        "Biaya pencetakan dibayar dalam PPL; jumlah publik dikonfigurasi oleh operator dan bukan wadah nftFee di Growth"
      ],
      "invariants": [
        "Setiap nftId bersifat unik; hanya pemilik saat ini yang dapat mentransfer",
        "NFT tidak mengalokasikan 10% pasokan ke Community Pool"
      ]
    },
    "bonding-curve": {
      "id": "bonding-curve",
      "name": "Kurva Produk-Konstan Virtual",
      "phase": "Fase 2: Lapisan Ekonomi",
      "status": "IMPLEMENTED",
      "summary": "Market maker on-chain otonom yang beroperasi dengan formula produk konstan virtual (K = X * Y) untuk menyediakan likuiditas algoritmik instan sejak blok nol.",
      "technicalDetails": [
        "Invarian produk konstan virtual K = X * Y dengan cadangan native virtual awal Y0 = 60 PPL",
        "Aritmetika floor BigInt yang aman tanpa kalkulasi floating-point untuk eksekusi beli dan jual",
        "Biaya perdagangan protokol 1.00% diekstrak secara otomatis dan disalurkan melalui mesin FeeSplitter Fase 1"
      ],
      "invariants": [
        "Pemeliharaan Invarian: (X + dx) * (Y - dy) >= K pada penjualan; (X - dx) * (Y + dy) >= K pada pembelian",
        "Kekebalan arbitrase bolak-balik: hasil jual <= biaya beli awal di seluruh ukuran perdagangan"
      ]
    },
    "creator-vesting": {
      "id": "creator-vesting",
      "name": "Jadwal Vesting Kreator",
      "phase": "Fase 2: Lapisan Ekonomi",
      "status": "IMPLEMENTED",
      "summary": "Mesin vesting on-chain yang menegakkan keselarasan kreator dan mencegah pelepasan likuiditas mendadak (dump) setelah peluncuran token.",
      "technicalDetails": [
        "Alokasi awal 10% langsung dibuka saat pembuatan token untuk penyiapan awal",
        "90% sisa alokasi di-vesting secara linear selama 180 hari (5.184.000 blok dengan durasi 3 detik/blok)",
        "Dapat diklaim sesuai permintaan melalui transaksi creatorClaim tingkat protokol dengan pelacakan tinggi blok terverifikasi"
      ],
      "invariants": [
        "Batas Klaim: totalClaimed <= upfrontUnlocked + floor((blocksElapsed * 0.9 * totalAllocation) / durationBlocks)",
        "Klaim vesting secara ketat mengurangi kolam vesting dan meningkatkan saldo likuid kreator dalam jumlah yang sama persis"
      ]
    },
    "liquidity-migration": {
      "id": "liquidity-migration",
      "name": "Migrasi Likuiditas AMM",
      "phase": "Fase 2: Lapisan Ekonomi",
      "status": "IMPLEMENTED",
      "summary": "Pemicu protokol otomatis yang meluluskan bonding curve matang ke kolam likuiditas AMM terkunci Swap AMM hasil kali konstan sudah aktif.",
      "technicalDetails": [
        "TERIMPLEMENTASI (IMPLEMENTED): Kondisi pemicu aktif saat cadangan token kurva turun menjadi <= 1/3 dari alokasi kurva awal",
        "TERIMPLEMENTASI (IMPLEMENTED): Memigrasikan akumulasi cadangan native riil dan token likuiditas cadangan ke pasangan AMM terkunci",
        "TERIMPLEMENTASI (IMPLEMENTED): Menjamin kontinuitas harga: harga spot AMM awal sama persis dengan harga spot kurva akhir",
        "TERIMPLEMENTASI: Swap AMM hasil kali konstan, token LP, dan kolam token/PPL"
      ],
      "invariants": [
        "Transisi atomik: kurva beralih secara permanen ke status 'migrated' dan menonaktifkan transaksi beli/jual kurva lebih lanjut",
        "Cadangan kolam AMM awal cocok persis dengan saldo yang dimigrasikan dengan penguncian likuiditas permanen"
      ]
    },
    "mobile-mining": {
      "id": "mobile-mining",
      "name": "Mesin Mobile Mining · Fase 3 (design)",
      "phase": "Fase 3: Jaringan Manusia",
      "status": "DESIGN",
      "summary": "Protokol partisipasi ringan yang memungkinkan pengguna biasa di ponsel, tablet, atau peramban menyumbangkan aktivitas bermanfaat dan memperoleh imbalan komunitas tanpa menjalankan perangkat keras konsensus (DESIGN — Fase 3).",
      "technicalDetails": [
        "BUKAN Proof-of-Work: tidak ada loop hash yang menguras baterai atau pemborosan komputasi",
        "Terpisah dari konsensus validator: peserta TIDAK memproduksi blok atau menandatangani kuorum atestasi",
        "Model partisipasi berbasis sesi dengan telemetri, check-in aktivitas, dan pemantauan kesehatan jaringan (Tahap perancangan)"
      ],
      "invariants": [
        "Pemisahan Peran: Status peserta tidak dapat secara langsung membahayakan keamanan konsensus validator",
        "Ketidakaktifan mengurangi akrual imbalan sesi tetapi tidak pernah memotong (slash) agunan staking validator"
      ]
    },
    "proof-of-humanity": {
      "id": "proof-of-humanity",
      "name": "Proof of Humanity · Fase 3 (design)",
      "phase": "Fase 3: Jaringan Manusia",
      "status": "DESIGN",
      "summary": "Kerangka kerja verifikasi manusia multi-sinyal. Model identitas eksak tunduk pada penelitian dan simulasi di masa mendatang.",
      "technicalDetails": [
        "Sinyal identitas berlapis dalam penelitian: usia akun, kontinuitas perangkat, konsistensi perilaku, dan atestasi sosial",
        "Nol penyimpanan biometrik: menghindari basis data biometrik terpusat atau distopia",
        "Tingkat verifikasi berjenjang: partisipasi dasar dengan hambatan rendah sambil membuka tingkat imbalan yang lebih tinggi (Tunduk pada simulasi)"
      ],
      "invariants": [
        "Penskalaan skor terikat bilangan bulat (Representasi eksak TBD; floating-point dilarang oleh invarian)",
        "Pelestarian privasi: tidak ada informasi identitas pribadi (PII) yang dicatat dalam status buku besar"
      ]
    },
    "anti-sybil": {
      "id": "anti-sybil",
      "name": "Arsitektur Anti-Sybil · Fase 3 (design)",
      "phase": "Fase 3: Jaringan Manusia",
      "status": "DESIGN",
      "summary": "Deteksi anomali perilaku dan analisis klaster berbasis grafik jaringan — Konseptual.",
      "technicalDetails": [
        "Analisis klaster grafik jaringan untuk mendeteksi lingkaran rujukan terkoordinasi dan klaster node sintetis",
        "Deteksi anomali perilaku statistik pada pola partisipasi (Konseptual)",
        "Disinsentif ekonomi: merancang biaya serangan agar melebihi proyeksi imbalan yang diharapkan (Memerlukan simulasi)"
      ],
      "invariants": [
        "Ketahanan Kolusi: Klaster terkoordinasi tidak dapat memperbesar pangsa imbalan agregat secara artifisial",
        "Isolasi Kesalahan: Meminimalkan positif palsu dengan mekanisme tinjauan sanggahan (TBD)"
      ]
    },
    "participation-power": {
      "id": "participation-power",
      "name": "Daya Partisipasi (Participation Power)",
      "phase": "Fase 3: Jaringan Manusia",
      "status": "DESIGN",
      "summary": "Metrik protokol non-transferabel yang menentukan proporsi relatif peserta individu dari imbalan komunitas epoch masa depan (kerangka kerja konseptual Fase 3).",
      "technicalDetails": [
        "Arsitektur Konseptual: Power ∝ Base × Activity × Reputation × Contribution (imbal hasil yang menurun & batas keras PowerCap; Kemanusiaan berfungsi sebagai lapisan Kelayakan / Kepercayaan / Batas; parameter TBD)",
        "Non-token dan tidak dapat dialihkan: mencegah pasar modal membeli pengaruh sintetis",
        "Parameter, koefisien, dan batas: TBD — tunduk pada simulasi ekonomi dan analisis anti-Sybil"
      ],
      "invariants": [
        "Keterikatan ketat: 0 <= ParticipationPower <= MaxProtocolCap untuk setiap peserta (Batas eksak TBD)",
        "Distribusi imbalan untuk peserta i = CommunityRewardEpoch * (Power_i / TotalNetworkPower) (Konseptual)"
      ]
    }
  },
  "zh": {
    "multi-asset-ledger": {
      "id": "multi-asset-ledger",
      "name": "多资产账本",
      "phase": "阶段 1：核心基础设施",
      "status": "IMPLEMENTED",
      "summary": "原生及用户发行的资产记账引擎，支持每个账户持有多种资产，同时保持与早期单资产状态的向后兼容性。",
      "technicalDetails": [
        "在各个余额中，原生资产 People (PPL) 的账户视图均保持一致",
        "标准资产注册表（Canonical Asset Registry），追踪符号、名称、精度（decimals）、发行人、最大供应量（maxSupply）及激活/冻结状态",
        "定点整数基础单位（默认 6 位小数），彻底消除 IEEE-754 浮点运算的不确定性"
      ],
      "invariants": [
        "在任何有效交易序列下，任何账户余额均不得降至零以下",
        "原生资产供应量在转账中守恒：balance_A' + balance_B' + fee = balance_A + balance_B"
      ]
    },
    "feesplitter": {
      "id": "feesplitter",
      "name": "费用分流引擎",
      "phase": "阶段 1：核心基础设施",
      "status": "IMPLEMENTED",
      "summary": "数学上保守的费用路由机制，将交易手续费与交易规费精确分配至验证节点、社区资金池、国库、流动性储备及协议销毁。",
      "technicalDetails": [
        "精确整数守恒：每笔交易均严格保证 sum(shares) = totalFee",
        "向下取整的整数除法及确定性余数路由，杜绝代币泄漏或通胀",
        "协议费用分配：30% 验证节点、25% 社区资金池、20% 国库、10% 流动性与生态、15% Growth Pool、0% 销毁"
      ],
      "invariants": [
        "守恒不变量：ValidatorShare + CommunityShare + TreasuryShare + LiquidityShare + GrowthShare + Burned = TotalFee",
        "费用分流计算过程中零代币增发或凭空销毁"
      ]
    },
    "community-pool": {
      "id": "community-pool",
      "name": "社区资金池注册表",
      "phase": "阶段 1：核心基础设施",
      "status": "IMPLEMENTED",
      "summary": "协议级会计状态，用于追踪生态系统中每种资产的累计分配、已发放总额及当前可用余额。",
      "technicalDetails": [
        "已实现：多资产注册表结构，按资产 ID 记录 totalAllocated、totalDistributed 和 remainingBalance",
        "已实现：资金直接来源于交易手续费分成以及代币发行的强制注资分配",
        "计划中（阶段 3）：作为国库储备，支持未来的移动端挖矿及人类参与奖励分发"
      ],
      "invariants": [
        "全生命周期守恒：对所有追踪资产严格满足 totalAllocated = totalDistributed + remainingBalance",
        "奖励发放须经密码学授权，且严格受限于 remainingBalance 上限"
      ]
    },
    "token-factory": {
      "id": "token-factory",
      "name": "代币工厂",
      "phase": "阶段 2：经济层",
      "status": "IMPLEMENTED",
      "summary": "协议基础原语，允许创作者发行具备标准化供应分配与防跑路（anti-rug）归属时间表的社区代币。",
      "technicalDetails": [
        "确定性五路供应分配：60% 联合曲线（Bonding Curve）、10% 社区资金池、15% 创作者、10% 流动性储备、5% 生态储备",
        "强制最低发行费（1 PPL）直接注入协议费用池，有效防范垃圾交易",
        "严格供应量约束：整数除法余数分配至联合曲线，确保 sum(allocations) === totalSupply"
      ],
      "invariants": [
        "供应量不变量：Curve + CommunityPool + Creator + LiquidityReserve + EcosystemReserve = TotalSupply",
        "初始代币铸造必须包含有效的创建交易并完成发行费支付"
      ]
    },
    "nft-factory": {
      "id": "nft-factory",
      "name": "NFT 铸造",
      "phase": "阶段 2：经济层",
      "status": "IMPLEMENTED",
      "summary": "极简独立物品铸造：名称、描述、图像 URI、可选集合、所有者及转移。非 Token Factory 供应量分配。",
      "technicalDetails": [
        "交易类型 nftMint 与 nftTransfer；记录存在于链上状态及 stateRoot",
        "图像存储于链下（URL、Blob 或 sha256: 摘要）；链仅保留 URI",
        "铸造费以 PPL 支付；公开数额由运营节点配置，不属于 Growth nftFee 资金池"
      ],
      "invariants": [
        "每个 nftId 全局唯一；仅当前所有者可发起转移",
        "NFT 不会将 10% 的供应量分配给社区池"
      ]
    },
    "bonding-curve": {
      "id": "bonding-curve",
      "name": "虚拟恒定乘积曲线",
      "phase": "阶段 2：经济层",
      "status": "IMPLEMENTED",
      "summary": "运行于虚拟恒定乘积公式（K = X * Y）之上的链上自主做市商，从创世区块起提供即时算法流动性。",
      "technicalDetails": [
        "虚拟恒定乘积不变量 K = X * Y，初始原生虚拟储备 Y0 = 60 PPL",
        "买卖执行采用安全的整数向下取整算术，杜绝任何浮点数计算",
        "自动提取 1.00% 协议交易费，并通过阶段 1 的 FeeSplitter 引擎进行分流"
      ],
      "invariants": [
        "不变量维持：卖出时 (X + dx) * (Y - dy) >= K；买入时 (X - dx) * (Y + dy) >= K",
        "往返套利免疫：在任何交易规模下，卖出所得均 <= 初始买入成本"
      ]
    },
    "creator-vesting": {
      "id": "creator-vesting",
      "name": "创作者归属计划",
      "phase": "阶段 2：经济层",
      "status": "IMPLEMENTED",
      "summary": "链上锁仓归属引擎，深度绑定创作者利益，防止代币发行后发生突然的大规模抛售。",
      "technicalDetails": [
        "代币创建时立即解锁 10% 初始配额，用于早期生态搭建",
        "剩余 90% 配额在 180 天内线性解锁（以每块 3 秒计，共 5,184,000 个区块）",
        "创作者可通过协议级 creatorClaim 交易按需提取，区块高度受到严格核验"
      ],
      "invariants": [
        "提取限额：totalClaimed <= upfrontUnlocked + floor((blocksElapsed * 0.9 * totalAllocation) / durationBlocks)",
        "归属提取严格等量减少锁仓池并增加创作者的可用流动余额"
      ]
    },
    "liquidity-migration": {
      "id": "liquidity-migration",
      "name": "AMM 流动性迁移",
      "phase": "阶段 2：经济层",
      "status": "IMPLEMENTED",
      "summary": "协议自动触发机制，将成熟的联合曲线资金池升级为锁定的 AMM 流动性池恒定乘积 AMM 兑换已经上线。",
      "technicalDetails": [
        "已实现：当联合曲线代币储备降至初始曲线配额的 <= 1/3 时触发迁移",
        "已实现：将累积的实际原生储备与预留的流动性代币迁移至锁定的 AMM 交易对中",
        "已实现：保证价格连续性：初始 AMM 现货价格精确吻合联合曲线最终现货价格",
        "已实现：恒定乘积 AMM 兑换、LP 代币和代币/PPL 资金池"
      ],
      "invariants": [
        "原子化状态转换：曲线状态永久切换为 'migrated' 并永久停用后续曲线买卖交易",
        "初始 AMM 池储备与迁移余额完全一致，且流动性实施永久锁定"
      ]
    },
    "mobile-mining": {
      "id": "mobile-mining",
      "name": "移动端挖矿引擎 — 规划中",
      "phase": "阶段 3：人类网络",
      "status": "DESIGN",
      "summary": "轻量级参与协议，允许普通用户在手机、平板或浏览器上贡献有益网络活动并赚取社区奖励，无需运行重度共识硬件（计划中 — 阶段 3）。",
      "technicalDetails": [
        "非工作量证明（NOT Proof-of-Work）：无耗尽电池的哈希循环或计算资源浪费",
        "与验证节点共识明确分离：参与者不生产区块，亦不参与签名法定人数认证",
        "基于会话的参与模型，包含遥测、活跃度签到及网络健康度监控（设计阶段）"
      ],
      "invariants": [
        "角色分离：参与者状态绝不能直接危及验证节点共识的安全性",
        "不活跃行为会惩罚会话奖励累积，但绝不会罚没验证节点质押抵押品"
      ]
    },
    "proof-of-humanity": {
      "id": "proof-of-humanity",
      "name": "人类证明 — 规划中",
      "phase": "阶段 3：人类网络",
      "status": "DESIGN",
      "summary": "多信号人类身份验证框架。确切的身份模型尚待未来的深入研究与模拟验证。",
      "technicalDetails": [
        "研究中的多层次身份信号：账户年限、设备连续性、行为一致性及社交认证",
        "零生物特征存储：彻底杜绝中心化或反乌托邦式的生物识别数据库",
        "分层验证级别：以极低摩擦实现基础参与，逐步解锁更高层级的奖励（待模拟确定）"
      ],
      "invariants": [
        "基于整数范围的评分缩放（具体表现形式待定；不变量禁止使用浮点数）",
        "隐私保护：账本状态中不记录任何个人身份信息 (PII)"
      ]
    },
    "anti-sybil": {
      "id": "anti-sybil",
      "name": "反女巫架构 — 规划中",
      "phase": "阶段 3：人类网络",
      "status": "DESIGN",
      "summary": "行为异常检测与基于图拓扑的集群分析 — 概念阶段。",
      "technicalDetails": [
        "网络图聚类分析，精准识别协同推荐环（referral rings）与虚假合成节点集群",
        "针对网络参与模式的统计学行为异常检测（概念阶段）",
        "经济博弈反制：设计攻击成本以使其显著超出预期奖励收益（需经模拟验证）"
      ],
      "invariants": [
        "抗合谋性：协同集群无法人为放大其在全网的综合奖励份额",
        "故障隔离：通过挑战复核机制（TBD）将误报率降至最低"
      ]
    },
    "participation-power": {
      "id": "participation-power",
      "name": "参与权重",
      "phase": "阶段 3：人类网络",
      "status": "DESIGN",
      "summary": "不可转让的协议原生指标，决定单个参与者在未来纪元社区总奖励中所占的相对比例（阶段 3 概念框架）。",
      "technicalDetails": [
        "概念架构：Power ∝ Base × Activity × Reputation × Contribution（边际递减效应与硬性 PowerCap；Humanity 作为资格/信任/限额层；参数 TBD）",
        "非代币化且不可转让：杜绝资本市场通过购买代币获取虚假的协议影响力",
        "参数、系数与上限：TBD — 需经经济模拟及反女巫实证分析确定"
      ],
      "invariants": [
        "严格有界性：每位参与者均满足 0 <= ParticipationPower <= MaxProtocolCap（具体上下限 TBD）",
        "参与者 i 的奖励分配 = CommunityRewardEpoch * (Power_i / TotalNetworkPower)（概念模型）"
      ]
    }
  },
  "ar": {
    "multi-asset-ledger": {
      "id": "multi-asset-ledger",
      "name": "دفتر الأستاذ متعدد الأصول",
      "phase": "المرحلة 1: البنية التحتية الأساسية",
      "status": "IMPLEMENTED",
      "summary": "محرك محاسبي للأصول الأصلية والأصول الصادرة من المستخدمين، يدعم أصولاً متعددة لكل حساب مع الحفاظ على التوافق الرجعي الكامل مع حالة الأصل الفردي السابقة.",
      "technicalDetails": [
        "تظل طرق عرض الحساب متسقة مع الأصل الأصلي People (PPL) عبر جميع الأرصدة",
        "سجل الأصول القياسي (Canonical Asset Registry) الذي يتتبع الرمز، والاسم، والكسور العشرية (decimals)، والجهة المصدرة، والحد الأقصى للإمداد (maxSupply)، وحالة التفعيل أو التجميد",
        "وحدات أساسية صحيحة ثابتة (افتراضياً 6 خانات عشرية) للقضاء نهائياً على عدم الحتمية الناتجة عن الفاصلة العائمة في معيار IEEE-754"
      ],
      "invariants": [
        "لا يمكن لأي رصيد حساب أن ينخفض إلى ما دون الصفر تحت أي تسلسل صالح للمعاملات",
        "يتم الحفاظ على إمداد الأصل الأصلي عبر التحويلات: balance_A' + balance_B' + fee = balance_A + balance_B"
      ]
    },
    "feesplitter": {
      "id": "feesplitter",
      "name": "محرك تقسيم الرسوم (FeeSplitter)",
      "phase": "المرحلة 1: البنية التحتية الأساسية",
      "status": "IMPLEMENTED",
      "summary": "آلية محافظة رياضياً لتوجيه الرسوم، تعمل على توزيع رسوم المعاملات والتداول عبر المدققين، ومجمع المجتمع، والخزانة، واحتياطي السيولة، والحرق البروتوكولي.",
      "technicalDetails": [
        "حفظ حسابي دقيق للأعداد الصحيحة: ضمان أن sum(shares) = totalFee في كل معاملة",
        "قسمة صحيحة للأسفل (floor division) مع توجيه حتمي للباقي لمنع أي تسرب للرموز أو حدوث تضخم",
        "تقسيم رسوم البروتوكول: 30% للمدققين، 25% لمجمع المجتمع، 20% للخزانة، 10% للسيولة والنظام البيئي، 15% Growth Pool، 0% للحرق"
      ],
      "invariants": [
        "ثابت الحفظ: ValidatorShare + CommunityShare + TreasuryShare + LiquidityShare + GrowthShare + Burned = TotalFee",
        "انعدام إنشاء أو تدمير أي رمز مميز أثناء حسابات تقسيم الرسوم"
      ]
    },
    "community-pool": {
      "id": "community-pool",
      "name": "سجل مجمع المجتمع (Community Pool)",
      "phase": "المرحلة 1: البنية التحتية الأساسية",
      "status": "IMPLEMENTED",
      "summary": "حالة محاسبية على مستوى البروتوكول تتتبع المخصصات التراكمية، والتوزيعات، والأرصدة المتاحة لكل أصل عبر النظام البيئي بأكمله.",
      "technicalDetails": [
        "منفّذ (IMPLEMENTED): هيكل سجل متعدد الأصول يتتبع totalAllocated و totalDistributed و remainingBalance لكل معرّف أصل",
        "منفّذ (IMPLEMENTED): يتم تمويله مباشرة من توزيعات رسوم المعاملات والمخصصات الإلزامية عند إطلاق الرموز",
        "مخطط له (المرحلة 3): احتياطي خزانة يدعم مكافآت التعدين عبر الهاتف المحمول ومكافآت المشاركة البشرية المستقبلية"
      ],
      "invariants": [
        "حفظ تراكمي مدى الحياة: totalAllocated = totalDistributed + remainingBalance لجميع الأصول المتتبعة",
        "التوزيعات مفوضة مشفرة ومقيدة بصرامة برصيد remainingBalance"
      ]
    },
    "token-factory": {
      "id": "token-factory",
      "name": "مصنع الرموز المميزة (Token Factory)",
      "phase": "المرحلة 2: الطبقة الاقتصادية",
      "status": "IMPLEMENTED",
      "summary": "أداة بروتوكولية بدائية تمكّن المبتكرين من إطلاق رموز المجتمع بتوزيعات إمداد موحدة وجداول استحقاق تمنع عمليات الاحتيال والسحب المفاجئ (anti-rug).",
      "technicalDetails": [
        "تقسيم إمداد خماسي حتمي: 60% لمنحنى الربط (Bonding Curve)، 10% لمجمع المجتمع، 15% للمبتكر، 10% لاحتياطي السيولة، 5% لاحتياطي النظام البيئي",
        "رسوم إطلاق إلزامية كحد أدنى (1 PPL) يتم توجيهها إلى مصارف رسوم البروتوكول لمنع الرسائل غير المرغوب فيها (spam)",
        "تحديد دقيق للإمداد: يتم تخصيص بواقي القسمة الصحيحة لحصة المنحنى لضمان تحقيق المعادلة sum(allocations) === totalSupply"
      ],
      "invariants": [
        "ثابت الإمداد: Curve + CommunityPool + Creator + LiquidityReserve + EcosystemReserve = TotalSupply",
        "يتطلب الإصدار الأولي للرمز معاملة إنشاء صالحة وسداد رسوم الإطلاق"
      ]
    },
    "nft-factory": {
      "id": "nft-factory",
      "name": "سك رموز NFT",
      "phase": "المرحلة 2: الطبقة الاقتصادية",
      "status": "IMPLEMENTED",
      "summary": "سك بسيط لعنصر فريد: الاسم والوصف ورابط URI للصورة ومجموعة اختيارية والمالك والتحويل. ليس تقسيماً لمعروض Token Factory.",
      "technicalDetails": [
        "نوعا المعاملات nftMint و nftTransfer؛ تُحفظ السجلات في حالة السلسلة وجذر الحالة stateRoot",
        "تُخزن الصورة خارج السلسلة (رابط أو Blob أو ملخص sha256:)؛ وتحتفظ السلسلة برابط URI",
        "تُدفع رسوم السك بعملة PPL؛ المبلغ العام يحدده المشغل وليس فئة nftFee في Growth"
      ],
      "invariants": [
        "كل معرف nftId فريد؛ المالك الحالي فقط يمكنه التحويل",
        "لا تخصص رموز NFT نسبة 10% من المعروض لمجمع المجتمع"
      ]
    },
    "bonding-curve": {
      "id": "bonding-curve",
      "name": "منحنى الجداء الثابت الافتراضي (Bonding Curve)",
      "phase": "المرحلة 2: الطبقة الاقتصادية",
      "status": "IMPLEMENTED",
      "summary": "صانع سوق ذاتي على السلسلة يعمل بصيغة الجداء الثابت الافتراضي (K = X * Y) ليوفر سيولة خوارزمية فورية بدءاً من الكتلة صفر.",
      "technicalDetails": [
        "ثابت الجداء الثابت الافتراضي K = X * Y مع احتياطي افتراضي أولي للأصل الأصلي Y0 = 60 PPL",
        "حسابات BigInt floor صحيحة وآمنة بدون حسابات فاصلة عائمة لتنفيذ عمليات الشراء والبيع",
        "رسوم تداول بروتوكولية بنسبة 1.00% يتم استقطاعها وتوجيهها تلقائياً عبر محرك FeeSplitter في المرحلة 1"
      ],
      "invariants": [
        "الحفاظ على الثابت: (X + dx) * (Y - dy) >= K عند البيع؛ (X - dx) * (Y + dy) >= K عند الشراء",
        "حصانة كاملة ضد مراجحة الذهاب والإياب: عائدات البيع <= تكلفة الشراء الأصلية لجميع أحجام التداول"
      ]
    },
    "creator-vesting": {
      "id": "creator-vesting",
      "name": "جدول استحقاق المبتكر (Creator Vesting)",
      "phase": "المرحلة 2: الطبقة الاقتصادية",
      "status": "IMPLEMENTED",
      "summary": "محرك استحقاق على السلسلة يضمن توافق مصالح المبتكر مع المجتمع ويمنع التخلص المفاجئ من السيولة بعد إطلاق الرمز.",
      "technicalDetails": [
        "فتح فوري لنسبة 10% كحصة مسبقة عند إنشاء الرمز لتغطية الإعداد الأولي",
        "استحقاق خطي لنسبة 90% المتبقية على مدار 180 يوماً (5,184,000 كتلة بمعدل 3 ثوانٍ/كتلة)",
        "إمكانية المطالبة عند الطلب عبر معاملة creatorClaim على مستوى البروتوكول مع تتبع موثق لارتفاع الكتلة"
      ],
      "invariants": [
        "حد المطالبة: totalClaimed <= upfrontUnlocked + floor((blocksElapsed * 0.9 * totalAllocation) / durationBlocks)",
        "مطالبات الاستحقاق تخصم بدقة من مجمع الاستحقاق وتزيد الرصيد السائل للمبتكر بنفس المقدار تماماً"
      ]
    },
    "liquidity-migration": {
      "id": "liquidity-migration",
      "name": "ترحيل السيولة إلى صانع السوق الآلي (AMM)",
      "phase": "المرحلة 2: الطبقة الاقتصادية",
      "status": "IMPLEMENTED",
      "summary": "مُحفِّز بروتوكولي تلقائي ينقل منحنى الربط الناضج إلى مجمع سيولة AMM مقفل. مقايضات AMM ذات الحاصل الثابت تعمل الآن.",
      "technicalDetails": [
        "منفّذ (IMPLEMENTED): يتم تفعيل شرط النقل عندما ينخفض احتياطي رموز المنحنى إلى <= 1/3 من المخصص الأولي للمنحنى",
        "منفّذ (IMPLEMENTED): يقوم بترحيل الاحتياطي الفعلي المتراكم من الأصل الأصلي ورموز السيولة المحجوزة إلى زوج AMM مقفل",
        "منفّذ (IMPLEMENTED): يضمن استمرارية السعر: سعر السوق الفوري الأولي لـ AMM يطابق بدقة السعر الفوري النهائي للمنحنى",
        "منفّذ (IMPLEMENTED): مقايضات AMM ذات الحاصل الثابت، وحصص LP، ومجمعات الرمز/PPL تعمل الآن"
      ],
      "invariants": [
        "تحول ذري: يتحول المنحنى بشكل دائم إلى الحالة 'migrated' وتتعطل أي معاملات شراء/بيع لاحقة عليه",
        "احتياطيات مجمع AMM الأولي تتطابق بدقة مع الأرصدة المرحلة مع قفل دائم للسيولة"
      ]
    },
    "mobile-mining": {
      "id": "mobile-mining",
      "name": "محرك التعدين عبر الهاتف المحمول — مخطط له",
      "phase": "المرحلة 3: الشبكة البشرية",
      "status": "DESIGN",
      "summary": "بروتوكول مشاركة خفيف الوزن يتيح للمستخدمين العاديين على الهواتف أو الأجهزة اللوحية أو المتصفحات المساهمة بنشاط مفيد وكسب مكافآت المجتمع دون الحاجة لتشغيل أجهزة تحقق وإجماع (مخطط له — المرحلة 3).",
      "technicalDetails": [
        "ليس إثبات عمل (NOT Proof-of-Work): لا توجد حلقات تجزئة تستنزف البطارية أو تستهلك طاقة حوسبية دون جدوى",
        "منفصل تماماً عن إجماع المدققين: المشاركون لا يُنتجون كتلًا ولا يوقّعون على كتل نصاب الإثبات",
        "نموذج مشاركة قائم على الجلسات مع القياس عن بُعد، وتسجيل الحضور بالنشاط، ومراقبة صحة الشبكة (قيد التصميم)"
      ],
      "invariants": [
        "فصل الأدوار: لا يمكن لحالة المشارك أن تؤثر سلباً أو تعرّض أمان إجماع المدققين للخطر",
        "عدم النشاط يعاقب تراكم مكافآت الجلسة فقط، ولا يؤدي أبداً إلى خصم أو مصادرة رهانات المدققين"
      ]
    },
    "proof-of-humanity": {
      "id": "proof-of-humanity",
      "name": "إثبات الإنسانية (Proof of Humanity) — مخطط له",
      "phase": "المرحلة 3: الشبكة البشرية",
      "status": "DESIGN",
      "summary": "إطار تحقق بشري متعدد الإشارات. يخضع نموذج الهوية الدقيق للبحث والمحاكاة المستقبلية.",
      "technicalDetails": [
        "إشارات هوية متعددة الطبقات قيد البحث: عمر الحساب، واستمرارية الجهاز، والاتساق السلوكي، والتصديقات الاجتماعية",
        "انعدام تخزين البيانات البيومترية: يتجنب قواعد البيانات البيومترية المركزية أو الشمولية",
        "مستويات تحقق متدرجة: مشاركة أساسية بحد أدنى من الاحتكاك مع إمكانية فتح مستويات مكافآت أعلى (تخضع للمحاكاة)"
      ],
      "invariants": [
        "تدرج درجات صحيح مقيد (التمثيل الدقيق TBD؛ مع منع الفاصلة العائمة بموجب الثوابت)",
        "الحفاظ على الخصوصية: لا يتم تسجيل أي معلومات تعريف شخصية (PII) في حالة دفتر الأستاذ"
      ]
    },
    "anti-sybil": {
      "id": "anti-sybil",
      "name": "بنية مكافحة هجمات سيبيل (Anti-Sybil) — مخطط لها",
      "phase": "المرحلة 3: الشبكة البشرية",
      "status": "DESIGN",
      "summary": "كشف الشذوذ السلوكي وتحليل المجموعات القائم على الرسم البياني للشبكة — نموذج مفاهيمي.",
      "technicalDetails": [
        "تحليل تجمعات الرسم البياني للشبكة لكشف حلقات الإحالة المنسقة ومجموعات العقد الاصطناعية",
        "اكتشاف إحصائي للشذوذ السلوكي في أنماط المشاركة (نموذج مفاهيمي)",
        "مثبطات اقتصادية: تصميم تكاليف الهجوم بحيث تتجاوز العائد المتوقع من المكافآت (يتطلب محاكاة)"
      ],
      "invariants": [
        "مقاومة التواطؤ: لا يمكن للمجموعات المنسقة تضخيم حصتها الإجمالية من المكافآت بشكل مصطنع",
        "عزل الأخطاء: تقليل النتائج الإيجابية الزائفة باستخدام آليات تحدٍ ومراجعة (TBD)"
      ]
    },
    "participation-power": {
      "id": "participation-power",
      "name": "قوة المشاركة (Participation Power)",
      "phase": "المرحلة 3: الشبكة البشرية",
      "status": "DESIGN",
      "summary": "مقياس بروتوكولي غير قابل للتحويل يحدد النسبة النسبية للمشارك الفردي من مكافآت المجتمع للحقبة المستقبلية (إطار مفاهيمي للمرحلة 3).",
      "technicalDetails": [
        "بنية مفاهيمية: Power ∝ Base × Activity × Reputation × Contribution (مع عوائد متناقصة وحد أقصى صارم PowerCap؛ وتعمل الإنسانية كطبقة أهلية / ثقة / حدود؛ والمعلمات TBD)",
        "غير قابلة للترميز وغير قابلة للنقل: تمنع أسواق رأس المال من شراء نفوذ اصطناعي",
        "المعلمات والمعاملات والحدود القصوى: TBD — تخضع لمحاكاة اقتصادية وتحليل مكافحة سيبيل"
      ],
      "invariants": [
        "تقييد صارم: 0 <= ParticipationPower <= MaxProtocolCap لكل مشارك (الحدود الدقيقة TBD)",
        "توزيع المكافأة للمشارك i = CommunityRewardEpoch * (Power_i / TotalNetworkPower) (مفاهيمي)"
      ]
    }
  }
};
