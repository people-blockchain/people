import type { Language } from "@/lib/preferences";

export type FoundingDrawerRouteKey =
  | "docs"
  | "roadmap"
  | "create"
  | "explorer"
  | "wallet"
  | "bounty"
  | "home"
  | "default";

export type FoundingCopy = {
  stickyBar: {
    badge: string;
    messageFull: string;
    messageCompact: string;
    messageMobile?: string;
    cta: string;
    ctaShort?: string;
    daysShort: string;
    hoursShort: string;
    minutesShort: string;
  };
  drawer: {
    eyebrow: string;
    cta: string;
    dismissAria: string;
    byRoute: Record<FoundingDrawerRouteKey, { title: string; body: string }>;
  };
  modal: {
    eyebrow: string;
    title: string;
    lead: string;
    rewardNote: string;
    sealedFraming: string;
    primaryTgCta: string;
    primaryTgSub: string;
    orDivider: string;
    emailLabel: string;
    emailPlaceholder: string;
    emailSubmit: string;
    emailSubmitting: string;
    emailError: string;
    emailSuccessTitle: string;
    emailSuccessBody: string;
    qrScanHint: string;
    closeAria: string;
  };
  progress: {
    badgePrefix: string;
    title: string;
    sealedNote: string;
    step1Title: string;
    step1Status: string;
    step1Detail: string;
    step1Cta: string;
    step2Title: string;
    step2Status: string;
    step2Detail: string;
    step2Cta: string;
    step3Title: string;
    step3Status: string;
    step3Detail: string;
    step3Cta: string;
    referralReadyLabel: string;
    copyReferral: string;
    copiedReferral: string;
    expandAria: string;
    collapseAria: string;
    step1Short?: string;
    step1ShortMobile?: string;
    step2Short?: string;
    step3Short?: string;
    detailsToggle?: string;
    verifyShort?: string;
    vaultUnlockLead?: string;
  };
  simulator: {
    eyebrow: string;
    title: string;
    slogan: string;
    curveSliderLabel: string;
    curveStartTag: string;
    curveEndTag: string;
    priceIndexLabel: string;
    relativePplLabel: string;
    illustrativeNote: string;
    poolSectionTitle: string;
    poolFormulaLabel: string;
    yourPointsLabel: string;
    totalPointsLabel: string;
    estimatedShareLabel: string;
    poolDisclaimer: string;
    ctaLockSeat: string;
  };
};

const EN_COPY: FoundingCopy = {
  stickyBar: {
    badge: "Founding 1,000 Vault",
    messageFull:
      "PEOPLE Mainnet Beta · Opens Dec 1 · Founding 1,000 Vault sealed until 1,000 wallets lock in",
    messageCompact: "PEOPLE Mainnet Beta · Dec 1 · Founding 1,000 Vault sealed until 1,000 wallets lock in",
    messageMobile: "Founding 1,000 Vault · Dec 1",
    cta: "Claim Seat (60s)",
    ctaShort: "Claim Seat",
    daysShort: "d",
    hoursShort: "h",
    minutesShort: "m",
  },
  drawer: {
    eyebrow: "Founding 1,000 Vault",
    cta: "Claim Seat (60s)",
    dismissAria: "Dismiss Founding 1,000 drawer",
    byRoute: {
      docs: {
        title: "Reading the architecture? Lock your Founding 1,000 seat.",
        body: "Verify in Telegram in 20 seconds (no wallet needed yet). Roster & order stay sealed until 1,000 verified wallets lock in before PEOPLE Mainnet Beta on Dec 1.",
      },
      roadmap: {
        title: "PEOPLE Mainnet Beta opens Dec 1 — join the Founding 1,000.",
        body: "Start with a 20-second Telegram check to reserve a pending seat and get your 7% USDC referral link while the roster is still sealed.",
      },
      create: {
        title: "Planning a community token or NFT? Claim your Founding 1,000 seat.",
        body: "Creators who verify before 1,000 wallets lock in enter the Founding 1,000 PPL Bounty Draw and activate 7% USDC partner referrals from purchase one.",
      },
      explorer: {
        title: "Exploring the chain? Reserve a seat in the Founding 1,000 Vault.",
        body: "Roster & order stay sealed until 1,000 verified wallets lock in, unlocking peer transfers and the Founding 1,000 Bounty Draw.",
      },
      wallet: {
        title: "Bind your wallet to the Founding 1,000 Vault.",
        body: "Step 1 takes 20 seconds in Telegram; Step 2 seals your wallet into the Founding 1,000 roster for the Season 1 Bounty Draw.",
      },
      bounty: {
        title: "Enter the Founding 1,000 PPL Bounty Draw before Dec 1.",
        body: "Verify in Telegram in 20 seconds without a wallet, then connect your wallet to seal your seat and activate 50%–100% Season 1 points.",
      },
      home: {
        title: "Founding 1,000 Vault is open ahead of PEOPLE Mainnet Beta (Dec 1).",
        body: "Roster & order stay sealed until 1,000 verified wallets lock in. Verify in Telegram in 20 seconds to claim your pending seat.",
      },
      default: {
        title: "Claim a free seat in the Founding 1,000 Vault before Dec 1.",
        body: "Roster & order stay sealed until 1,000 verified wallets lock in. Start in Telegram in 20 seconds — no wallet required for Step 1.",
      },
    },
  },
  modal: {
    eyebrow: "Founding 1,000 Vault · PEOPLE Mainnet Beta (Dec 1)",
    title: "Claim a free seat in the Founding 1,000 Vault before Dec 1",
    lead: "Enter the Founding 1,000 Bounty Draw for bonus PPL from the Season 1 pool and unlock your 7% USDC referral link from the first purchase.",
    rewardNote: "Bounty pool reward, not financial yield.",
    sealedFraming:
      "Roster & order stay sealed until 1,000 verified wallets lock in — unlocking transfers and the Founding 1,000 PPL Bounty Draw.",
    primaryTgCta: "Verify in Telegram (20s)",
    primaryTgSub: "Instant cold-start via @PeopleVerifyBot — no wallet needed for Step 1 (1 phone = 1 human).",
    orDivider: "or join the email waitlist",
    emailLabel: "Email waitlist",
    emailPlaceholder: "you@example.com",
    emailSubmit: "Join Waitlist",
    emailSubmitting: "Saving…",
    emailError: "Enter a valid email address.",
    emailSuccessTitle: "You are on the Founding 1,000 waitlist.",
    emailSuccessBody:
      "Now complete the 20-second @PeopleVerifyBot check in Telegram to earn extra Season 1 points and lock your pending Founding 1,000 seat:",
    qrScanHint: "Scan with your phone camera or tap the button above to open @PeopleVerifyBot.",
    closeAria: "Close Founding 1,000 modal",
  },
  progress: {
    badgePrefix: "Founder",
    title: "Founding 1,000 Verification Progress",
    sealedNote: "Roster & order stay sealed until 1,000 verified wallets lock in.",
    step1Title: "Step 1 · Telegram Verify (20s, no wallet)",
    step1Status: "Pending in Founding 1,000",
    step1Detail: "Instant 7% USDC referral link (no minimum volume) + Season 1 points.",
    step1Cta: "Verify in Telegram (20s)",
    step2Title: "Step 2 · Create or Connect Wallet (required for 1,000 count + draw ticket)",
    step2Status: "Sealed in Founding 1,000 · Bounty Draw Ticket Active (50% Season 1 points)",
    step2Detail: "Use a local browser wallet or MetaMask / Trust / WalletConnect to seal your seat.",
    step2Cta: "Create or Connect Wallet",
    step3Title: "Step 3 · Human Passport",
    step3Status: "100% Season 1 points + Free Founder NFT + bonus draw weight",
    step3Detail: "Complete proof-of-humanity on /founders#verify for full Season 1 weight.",
    step3Cta: "Open Human Passport",
    referralReadyLabel: "Your 7% USDC referral link:",
    copyReferral: "Copy link",
    copiedReferral: "Copied",
    expandAria: "Open Founder 0/3 progress",
    collapseAria: "Collapse Founder progress",
    step1Short: "Step 1: Verify in Telegram (20s)",
    step1ShortMobile: "Step 1 (20s)",
    step2Short: "Step 2: Create or Connect Wallet",
    step3Short: "Step 3: Human Passport",
    detailsToggle: "Details",
    verifyShort: "Verify",
    vaultUnlockLead: "The first 1,000 verified wallets unlock transfers and the Founding 1,000 Bounty Draw.",
  },
  simulator: {
    eyebrow: "Bonding-Curve & Season 1 Pool-Share Simulator",
    title: "See how curve entry position and Season 1 points work",
    slogan: "The earlier you buy, the lower the price. Every purchase moves the curve up.",
    curveSliderLabel: "At which point of the curve you enter",
    curveStartTag: "0% (Curve open)",
    curveEndTag: "100% (Full curve supply)",
    priceIndexLabel: "Illustrative curve price index vs start",
    relativePplLabel: "Relative PPL per unit vs curve start",
    illustrativeNote:
      "Illustrative bonding-curve index from the protocol curve formula — not a fixed price or return forecast. Early curve sell-backs within 30 days carry a sell-back fee.",
    poolSectionTitle: "Honest Season 1 Bounty Pool Share (6,000,000 PPL)",
    poolFormulaLabel: "Formula: your points / total points × 6,000,000 PPL",
    yourPointsLabel: "Your estimated Season 1 points",
    totalPointsLabel: "Assumed total Season 1 points (all verified participants)",
    estimatedShareLabel: "Your illustrative Season 1 pool share",
    poolDisclaimer:
      "Bounty pool reward from the fixed 6,000,000 PPL Season 1 pool, not financial yield or promised income. Actual share depends on verified activity and total community points.",
    ctaLockSeat: "Lock Seat Before 1,000 Closes",
  },
};

export const FOUNDING_COPY: Record<Language, FoundingCopy> = {
  en: EN_COPY,
  ru: {
    stickyBar: {
      badge: "Хранилище первой тысячи",
      messageFull:
        "PEOPLE Mainnet Beta · 1 дек · список первой тысячи скрыт, пока не зафиксируются 1 000 кошельков",
      messageCompact: "PEOPLE Mainnet Beta · 1 дек · список первой тысячи скрыт до 1 000 кошельков",
      messageMobile: "Хранилище первой тысячи · 1 дек",
      cta: "Занять место (60 с)",
      ctaShort: "Занять место",
      daysShort: "д",
      hoursShort: "ч",
      minutesShort: "м",
    },
    drawer: {
      eyebrow: "Хранилище первой тысячи",
      cta: "Занять место (60 с)",
      dismissAria: "Закрыть панель первой тысячи",
      byRoute: {
        docs: {
          title: "Читаешь архитектуру? Займи место в первой тысяче.",
          body: "Проверься в Telegram за 20 секунд (кошелёк пока не нужен). Список и порядок закрыты, пока 1 000 проверенных кошельков не зафиксируются до PEOPLE Mainnet Beta 1 декабря.",
        },
        roadmap: {
          title: "PEOPLE Mainnet Beta открывается 1 декабря — присоединяйся к первой тысяче.",
          body: "Начни с проверки в Telegram за 20 секунд: зарезервируешь место и получишь реферальную ссылку 7% USDC, пока список ещё закрыт.",
        },
        create: {
          title: "Планируешь токен сообщества или NFT? Займи место в первой тысяче.",
          body: "Кто проверится, пока не зафиксируются 1 000 кошельков, попадает в розыгрыш PPL первой тысячи и включает партнёрские 7% USDC с первой покупки.",
        },
        explorer: {
          title: "Смотришь сеть? Зарезервируй место в Хранилище первой тысячи.",
          body: "Список и порядок закрыты, пока не зафиксируются 1 000 проверенных кошельков — тогда откроются переводы и розыгрыш первой тысячи.",
        },
        wallet: {
          title: "Привяжи кошелёк к Хранилищу первой тысячи.",
          body: "Шаг 1 занимает 20 секунд в Telegram; шаг 2 фиксирует кошелёк в списке первой тысячи для розыгрыша Сезона 1.",
        },
        bounty: {
          title: "Успей в розыгрыш PPL первой тысячи до 1 декабря.",
          body: "Проверься в Telegram за 20 секунд без кошелька, затем подключи кошелёк, чтобы зафиксировать место и получить 50%–100% очков Сезона 1.",
        },
        home: {
          title: "Хранилище первой тысячи открыто до PEOPLE Mainnet Beta (1 дек).",
          body: "Список и порядок закрыты, пока не зафиксируются 1 000 проверенных кошельков. Проверься в Telegram за 20 секунд и займи место.",
        },
        default: {
          title: "Займи бесплатное место в Хранилище первой тысячи до 1 декабря.",
          body: "Список и порядок закрыты, пока не зафиксируются 1 000 проверенных кошельков. Начни в Telegram за 20 секунд — для шага 1 кошелёк не нужен.",
        },
      },
    },
    modal: {
      eyebrow: "Хранилище первой тысячи · PEOPLE Mainnet Beta (1 дек)",
      title: "Займи бесплатное место в Хранилище первой тысячи до 1 декабря",
      lead: "Участвуй в розыгрыше первой тысячи: бонусные PPL из пула Сезона 1 и реферальная ссылка 7% USDC с первой покупки.",
      rewardNote: "Награда из пула, не финансовая доходность.",
      sealedFraming:
        "Список и порядок закрыты, пока не зафиксируются 1 000 проверенных кошельков — тогда откроются переводы и розыгрыш PPL первой тысячи.",
      primaryTgCta: "Проверить в Telegram (20 с)",
      primaryTgSub: "Мгновенный старт через @PeopleVerifyBot — для шага 1 кошелёк не нужен (1 телефон = 1 человек).",
      orDivider: "или в лист ожидания по почте",
      emailLabel: "Лист ожидания по почте",
      emailPlaceholder: "ty@example.com",
      emailSubmit: "Встать в лист",
      emailSubmitting: "Сохраняю…",
      emailError: "Введи корректный email.",
      emailSuccessTitle: "Ты в листе ожидания первой тысячи.",
      emailSuccessBody:
        "Теперь пройди 20-секундную проверку @PeopleVerifyBot в Telegram — получишь дополнительные очки Сезона 1 и зафиксируешь место:",
      qrScanHint: "Отсканируй камерой телефона или нажми кнопку выше, чтобы открыть @PeopleVerifyBot.",
      closeAria: "Закрыть окно первой тысячи",
    },
    progress: {
      badgePrefix: "Основатель",
      title: "Прогресс проверки первой тысячи",
      sealedNote: "Список и порядок закрыты, пока не зафиксируются 1 000 проверенных кошельков.",
      step1Title: "Шаг 1 · проверка в Telegram (20 с, без кошелька)",
      step1Status: "Ожидание в первой тысяче",
      step1Detail: "Сразу реферальная ссылка 7% USDC (без минимального объёма) + очки Сезона 1.",
      step1Cta: "Проверить в Telegram (20 с)",
      step2Title: "Шаг 2 · создать или подключить кошелёк (нужно для счёта 1 000 и билета розыгрыша)",
      step2Status: "Зафиксирован в первой тысяче · билет розыгрыша активен (50% очков Сезона 1)",
      step2Detail: "Локальный кошелёк в браузере или MetaMask / Trust / WalletConnect — так место фиксируется.",
      step2Cta: "Создать или подключить кошелёк",
      step3Title: "Шаг 3 · Human Passport",
      step3Status: "100% очков Сезона 1 + бесплатный NFT основателя + дополнительный вес в розыгрыше",
      step3Detail: "Пройди проверку человека на /founders#verify, чтобы получить полный вес Сезона 1.",
      step3Cta: "Открыть Human Passport",
      referralReadyLabel: "Твоя реферальная ссылка 7% USDC:",
      copyReferral: "Скопировать ссылку",
      copiedReferral: "Скопировано",
      expandAria: "Открыть прогресс основателя 0/3",
      collapseAria: "Свернуть прогресс основателя",
      step1Short: "Шаг 1: проверка в Telegram (20 с)",
      step1ShortMobile: "Шаг 1 (20 с)",
      step2Short: "Шаг 2: создать или подключить кошелёк",
      step3Short: "Шаг 3: Human Passport",
      detailsToggle: "Подробнее",
      verifyShort: "Проверить",
      vaultUnlockLead: "Первые 1 000 проверенных кошельков открывают переводы и розыгрыш первой тысячи.",
    },
    simulator: {
      eyebrow: "Симулятор кривой и доли пула Сезона 1",
      title: "Как работают точка входа на кривой и очки Сезона 1",
      slogan: "Чем раньше покупаешь, тем ниже цена. Каждая покупка двигает кривую вверх.",
      curveSliderLabel: "В какой точке кривой ты входишь",
      curveStartTag: "0% (кривая открыта)",
      curveEndTag: "100% (весь запас кривой)",
      priceIndexLabel: "Иллюстративный индекс цены кривой к старту",
      relativePplLabel: "Относительные PPL за единицу к старту кривой",
      illustrativeNote:
        "Иллюстративный индекс по формуле кривой протокола — не фиксированная цена и не прогноз доходности. Обратная продажа на кривой в первые 30 дней берёт комиссию.",
      poolSectionTitle: "Честная доля пула Сезона 1 (6 000 000 PPL)",
      poolFormulaLabel: "Формула: твои очки / все очки × 6 000 000 PPL",
      yourPointsLabel: "Твои примерные очки Сезона 1",
      totalPointsLabel: "Предполагаемые очки Сезона 1 всех проверенных участников",
      estimatedShareLabel: "Твоя иллюстративная доля пула Сезона 1",
      poolDisclaimer:
        "Награда из фиксированного пула 6 000 000 PPL Сезона 1, не финансовая доходность и не обещание дохода. Фактическая доля зависит от проверенной активности и общих очков сообщества.",
      ctaLockSeat: "Занять место, пока тысяча не закрыта",
    },
  },
  es: {
    stickyBar: {
      badge: "Bóveda de los 1.000",
      messageFull:
        "PEOPLE Mainnet Beta · Abre el 1 dic · Bóveda de los 1.000 sellado hasta 1,000 billeteras",
      messageCompact: "PEOPLE Mainnet Beta · 1 dic · Bóveda de los 1.000 sellado hasta 1,000 billeteras",
      cta: "Reclamar asiento (60s)",
      daysShort: "d",
      hoursShort: "h",
      minutesShort: "m",
      messageMobile: "Bóveda de los 1.000 · 1 dic",
      ctaShort: "Reclamar asiento",
    },
    drawer: {
      eyebrow: "Bóveda de los 1.000",
      cta: "Reclamar asiento (60s)",
      dismissAria: "Cerrar aviso de Founding 1,000",
      byRoute: {
        docs: {
          title: "¿Revisando la arquitectura? Asegura tu asiento en Founding 1,000.",
          body: "Verifícate en Telegram en 20 segundos (sin billetera aún). La lista y el orden permanecen sellados hasta que 1,000 billeteras verificadas se bloqueen antes de PEOPLE Mainnet Beta el 1 de diciembre.",
        },
        roadmap: {
          title: "PEOPLE Mainnet Beta abre el 1 de diciembre — únete a Founding 1,000.",
          body: "Completa la verificación de 20 segundos en Telegram para reservar tu asiento pendiente y activar tu enlace de referido del 7% en USDC.",
        },
        create: {
          title: "¿Vas a lanzar un token o NFT? Reclama tu asiento en Founding 1,000.",
          body: "Los creadores verificados antes de las 1,000 billeteras entran al sorteo Founding 1,000 PPL y ganan 7% USDC desde la primera compra referida.",
        },
        explorer: {
          title: "¿Explorando la red? Reserva tu lugar en Bóveda de los 1.000.",
          body: "La lista y el orden permanecen sellados hasta que 1,000 billeteras verificadas se bloqueen.",
        },
        wallet: {
          title: "Vincula tu billetera al Bóveda de los 1.000.",
          body: "El Paso 1 toma 20 segundos en Telegram; el Paso 2 sella tu billetera en la lista Founding 1,000.",
        },
        bounty: {
          title: "Entra al sorteo Founding 1,000 PPL Bounty Draw antes del 1 dic.",
          body: "Verifica en Telegram en 20 segundos sin billetera y luego conecta tu billetera para sellar tu asiento.",
        },
        home: {
          title: "Bóveda de los 1.000 abierto antes de PEOPLE Mainnet Beta (1 dic).",
          body: "La lista y el orden permanecen sellados hasta que 1,000 billeteras verificadas se bloqueen. Verifica en Telegram en 20 segundos.",
        },
        default: {
          title: "Reclama un asiento gratis en Bóveda de los 1.000 antes del 1 dic.",
          body: "La lista y el orden permanecen sellados hasta llegar a 1,000 billeteras verificadas. Empieza en Telegram en 20 segundos.",
        },
      },
    },
    modal: {
      eyebrow: "Bóveda de los 1.000 · PEOPLE Mainnet Beta (1 dic)",
      title: "Reclama un asiento gratis en Bóveda de los 1.000 antes del 1 dic",
      lead: "Participa en el sorteo Founding 1,000 Bounty Draw por PPL adicionales del fondo de la Temporada 1 y activa tu enlace de referido del 7% en USDC.",
      rewardNote: "Recompensa del fondo de bounty, no rendimiento financiero.",
      sealedFraming:
        "La lista y el orden permanecen sellados hasta que 1,000 billeteras verificadas se bloqueen — desbloqueando transferencias y el sorteo Founding 1,000 PPL.",
      primaryTgCta: "Verificar en Telegram (20s)",
      primaryTgSub: "Inicio directo en @PeopleVerifyBot — sin billetera para el Paso 1 (1 teléfono = 1 humano).",
      orDivider: "o únete a la lista de espera por correo",
      emailLabel: "Lista de espera por correo",
      emailPlaceholder: "tu@ejemplo.com",
      emailSubmit: "Unirme a la lista",
      emailSubmitting: "Guardando…",
      emailError: "Introduce un correo electrónico válido.",
      emailSuccessTitle: "Ya estás en la lista de espera de Founding 1,000.",
      emailSuccessBody:
        "Ahora completa la verificación de 20 segundos con @PeopleVerifyBot en Telegram para sumar puntos de Temporada 1 y bloquear tu asiento:",
      qrScanHint: "Escanea con la cámara de tu móvil o pulsa el botón de arriba para abrir @PeopleVerifyBot.",
      closeAria: "Cerrar ventana de Founding 1,000",
    },
    progress: {
      badgePrefix: "Fundador",
      title: "Progreso de verificación Founding 1,000",
      sealedNote: "La lista y el orden permanecen sellados hasta que 1,000 billeteras verificadas se bloqueen.",
      step1Title: "Paso 1 · Verificar en Telegram (20s, sin billetera)",
      step1Status: "Pendiente en Founding 1,000",
      step1Detail: "Enlace de referido instantáneo del 7% en USDC (sin mínimo) + puntos de Temporada 1.",
      step1Cta: "Verificar en Telegram (20s)",
      step2Title: "Paso 2 · Crear o conectar billetera (requerido para el conteo de 1,000 + boleto de sorteo)",
      step2Status: "Sellado en Founding 1,000 · Boleto de sorteo activo (50% puntos Temporada 1)",
      step2Detail: "Usa una billetera local del navegador o MetaMask / Trust / WalletConnect para sellar tu asiento.",
      step2Cta: "Crear o conectar billetera",
      step3Title: "Paso 3 · Human Passport",
      step3Status: "100% puntos Temporada 1 + Founder NFT gratis + peso extra en el sorteo",
      step3Detail: "Completa la prueba de humanidad en /founders#verify para obtener el 100% de peso.",
      step3Cta: "Abrir Human Passport",
      referralReadyLabel: "Tu enlace de referido (7% USDC):",
      copyReferral: "Copiar enlace",
      copiedReferral: "Copiado",
      expandAria: "Abrir progreso de Fundador",
      collapseAria: "Contraer progreso de Fundador",
      step1Short: "Paso 1: Verificar en Telegram (20s)",
      step1ShortMobile: "Paso 1 (20s)",
      step2Short: "Paso 2: Crear o conectar billetera",
      step3Short: "Paso 3: Human Passport",
      detailsToggle: "Detalles",
      verifyShort: "Verificar",
      vaultUnlockLead: "Las primeras 1,000 billeteras verificadas desbloquean las transferencias y el sorteo Founding 1,000.",
    },
    simulator: {
      eyebrow: "Simulador de curva de vinculación y fondo de Temporada 1",
      title: "Calcula tu punto de entrada en la curva y tu proporción del fondo",
      slogan: "Cuanto antes compras, menor es el precio. Cada compra mueve la curva hacia arriba.",
      curveSliderLabel: "En qué punto de la curva entras",
      curveStartTag: "0% (Inicio de curva)",
      curveEndTag: "100% (Oferta total en curva)",
      priceIndexLabel: "Índice ilustrativo de precio en la curva vs inicio",
      relativePplLabel: "PPL relativos por unidad vs inicio de curva",
      illustrativeNote:
        "Índice ilustrativo de la fórmula de la curva — no es un precio fijo ni promesa de retorno. Las recompras dentro de 30 días tienen comisión de salida.",
      poolSectionTitle: "Cálculo honesto del fondo Temporada 1 (6,000,000 PPL)",
      poolFormulaLabel: "Fórmula: tus puntos / puntos totales × 6,000,000 PPL",
      yourPointsLabel: "Tus puntos estimados de Temporada 1",
      totalPointsLabel: "Puntos totales asumidos de Temporada 1 (todos los verificados)",
      estimatedShareLabel: "Tu parte ilustrativa del fondo de Temporada 1",
      poolDisclaimer:
        "Recompensa del fondo fijo de 6,000,000 PPL de la Temporada 1, no rendimiento financiero ni ingreso garantizado.",
      ctaLockSeat: "Bloquear asiento antes de cerrar los 1,000",
    },
  },
  pt: {
    stickyBar: {
      badge: "Cofre dos 1.000",
      messageFull:
        "PEOPLE Mainnet Beta · Abre em 1 dez · Cofre dos 1.000 selado até 1.000 carteiras",
      messageCompact: "PEOPLE Mainnet Beta · 1 dez · Cofre dos 1.000 selado até 1.000 carteiras",
      cta: "Garantir lugar (60s)",
      daysShort: "d",
      hoursShort: "h",
      minutesShort: "m",
      messageMobile: "Cofre dos 1.000 · 1 dez",
      ctaShort: "Garantir lugar",
    },
    drawer: {
      eyebrow: "Cofre dos 1.000",
      cta: "Garantir lugar (60s)",
      dismissAria: "Fechar aviso do Founding 1,000",
      byRoute: {
        docs: {
          title: "Lendo a arquitetura? Garanta seu lugar no Founding 1,000.",
          body: "Verifique no Telegram em 20 segundos (sem precisar de carteira agora). A lista e a ordem permanecem seladas até 1.000 carteiras verificadas antes da PEOPLE Mainnet Beta em 1 dez.",
        },
        roadmap: {
          title: "A PEOPLE Mainnet Beta abre em 1 de dezembro — entre no Founding 1,000.",
          body: "Comece com a verificação de 20 segundos no Telegram para reservar seu lugar pendente e liberar seu link de 7% em USDC.",
        },
        create: {
          title: "Vai criar um token ou NFT? Garanta seu lugar no Founding 1,000.",
          body: "Criadores verificados antes de 1.000 carteiras entram no sorteio Founding 1,000 PPL e ativam 7% em USDC desde a primeira compra indicada.",
        },
        explorer: {
          title: "Explorando a rede? Reserve seu lugar no Cofre dos 1.000.",
          body: "A lista e a ordem permanecem seladas até que 1.000 carteiras verificadas confirmem.",
        },
        wallet: {
          title: "Vincule sua carteira ao Cofre dos 1.000.",
          body: "O Passo 1 leva 20 segundos no Telegram; o Passo 2 sela sua carteira na lista Founding 1,000.",
        },
        bounty: {
          title: "Participe do sorteio Founding 1,000 PPL Bounty Draw antes de 1 dez.",
          body: "Verifique no Telegram em 20 segundos sem carteira e depois conecte sua carteira para selar seu lugar.",
        },
        home: {
          title: "Cofre dos 1.000 aberto antes da PEOPLE Mainnet Beta (1 dez).",
          body: "A lista e a ordem permanecem seladas até 1.000 carteiras verificadas. Verifique no Telegram em 20 segundos.",
        },
        default: {
          title: "Garanta um lugar grátis no Cofre dos 1.000 antes de 1 dez.",
          body: "A lista e a ordem permanecem seladas até 1.000 carteiras verificadas. Comece no Telegram em 20 segundos.",
        },
      },
    },
    modal: {
      eyebrow: "Cofre dos 1.000 · PEOPLE Mainnet Beta (1 dez)",
      title: "Garanta um lugar grátis no Cofre dos 1.000 antes de 1 dez",
      lead: "Participe do sorteio Founding 1,000 Bounty Draw por PPL extras do pool da Temporada 1 e ative seu link de indicação de 7% em USDC.",
      rewardNote: "Recompensa do pool de bounty, não rendimento financeiro.",
      sealedFraming:
        "A lista e a ordem permanecem seladas até que 1.000 carteiras verificadas confirmem — desbloqueando transferências e o sorteio Founding 1,000 PPL.",
      primaryTgCta: "Verificar no Telegram (20s)",
      primaryTgSub: "Início direto no @PeopleVerifyBot — sem carteira no Passo 1 (1 telefone = 1 humano).",
      orDivider: "ou entre na lista de espera por e-mail",
      emailLabel: "Lista de espera por e-mail",
      emailPlaceholder: "voce@exemplo.com",
      emailSubmit: "Entrar na lista",
      emailSubmitting: "Salvando…",
      emailError: "Digite um endereço de e-mail válido.",
      emailSuccessTitle: "Você está na lista de espera do Founding 1,000.",
      emailSuccessBody:
        "Agora conclua a verificação de 20 segundos no @PeopleVerifyBot no Telegram para ganhar pontos extras da Temporada 1 e travar seu lugar:",
      qrScanHint: "Escaneie com a câmera do celular ou toque no botão acima para abrir o @PeopleVerifyBot.",
      closeAria: "Fechar modal do Founding 1,000",
    },
    progress: {
      badgePrefix: "Fundador",
      title: "Progresso de verificação Founding 1,000",
      sealedNote: "A lista e a ordem permanecem seladas até que 1.000 carteiras verificadas confirmem.",
      step1Title: "Passo 1 · Verificar no Telegram (20s, sem carteira)",
      step1Status: "Pendente no Founding 1,000",
      step1Detail: "Link instantâneo de indicação de 7% em USDC (sem mínimo) + pontos da Temporada 1.",
      step1Cta: "Verificar no Telegram (20s)",
      step2Title: "Passo 2 · Criar ou conectar carteira (necessário para a contagem de 1.000 + bilhete do sorteio)",
      step2Status: "Selado no Founding 1,000 · Bilhete do sorteio ativo (50% dos pontos da Temporada 1)",
      step2Detail: "Use uma carteira local no navegador ou MetaMask / Trust / WalletConnect para selar seu lugar.",
      step2Cta: "Criar ou conectar carteira",
      step3Title: "Passo 3 · Human Passport",
      step3Status: "100% dos pontos da Temporada 1 + Founder NFT grátis + peso bônus no sorteio",
      step3Detail: "Conclua a prova de humanidade em /founders#verify para peso total na Temporada 1.",
      step3Cta: "Abrir Human Passport",
      referralReadyLabel: "Seu link de indicação (7% USDC):",
      copyReferral: "Copiar link",
      copiedReferral: "Copiado",
      expandAria: "Abrir progresso de Fundador",
      collapseAria: "Recolher progresso de Fundador",
      step1Short: "Passo 1: Verificar no Telegram (20s)",
      step1ShortMobile: "Passo 1 (20s)",
      step2Short: "Passo 2: Criar ou conectar carteira",
      step3Short: "Passo 3: Human Passport",
      detailsToggle: "Detalhes",
      verifyShort: "Verificar",
      vaultUnlockLead: "As primeiras 1.000 carteiras verificadas desbloqueiam transferências e o sorteio Founding 1,000.",
    },
    simulator: {
      eyebrow: "Simulador de curva de oferta e participação no pool da Temporada 1",
      title: "Veja como funcionam a posição na curva e os pontos da Temporada 1",
      slogan: "Quanto mais cedo você compra, menor o preço. Cada compra move a curva para cima.",
      curveSliderLabel: "Em qual ponto da curva você entra",
      curveStartTag: "0% (Início da curva)",
      curveEndTag: "100% (Oferta total da curva)",
      priceIndexLabel: "Índice ilustrativo de preço na curva vs início",
      relativePplLabel: "PPL relativos por unidade vs início da curva",
      illustrativeNote:
        "Índice ilustrativo da fórmula da curva — não é preço fixo nem promessa de lucro. Revendas na curva em até 30 dias possuem taxa de saída.",
      poolSectionTitle: "Cálculo transparente do pool da Temporada 1 (6.000.000 PPL)",
      poolFormulaLabel: "Fórmula: seus pontos / total de pontos × 6.000.000 PPL",
      yourPointsLabel: "Seus pontos estimados na Temporada 1",
      totalPointsLabel: "Total estimado de pontos na Temporada 1 (todos os verificados)",
      estimatedShareLabel: "Sua fatia ilustrativa do pool da Temporada 1",
      poolDisclaimer:
        "Recompensa do pool fixo de 6.000.000 PPL da Temporada 1, não rendimento financeiro nem promessa de renda.",
      ctaLockSeat: "Travar lugar antes que os 1.000 fechem",
    },
  },
  fr: {
    stickyBar: {
      badge: "Coffre des 1 000",
      messageFull:
        "PEOPLE Mainnet Beta · Ouvre le 1er déc · Coffre des 1 000 scellé jusqu'à 1 000 portefeuilles",
      messageCompact: "PEOPLE Mainnet Beta · 1er déc · Coffre des 1 000 scellé jusqu'à 1 000 portefeuilles",
      cta: "Réserver ma place (60s)",
      daysShort: "j",
      hoursShort: "h",
      minutesShort: "m",
      messageMobile: "Coffre des 1 000 · 1er déc",
      ctaShort: "Réserver ma place",
    },
    drawer: {
      eyebrow: "Coffre des 1 000",
      cta: "Réserver ma place (60s)",
      dismissAria: "Fermer le tiroir Founding 1,000",
      byRoute: {
        docs: {
          title: "Vous lisez l'architecture ? Scellez votre place Founding 1,000.",
          body: "Vérifiez-vous sur Telegram en 20 secondes (sans portefeuille). La liste et l'ordre restent scellés jusqu'à 1 000 portefeuilles vérifiés avant PEOPLE Mainnet Beta le 1er déc.",
        },
        roadmap: {
          title: "PEOPLE Mainnet Beta ouvre le 1er décembre — rejoignez Founding 1,000.",
          body: "Vérifiez-vous en 20 secondes sur Telegram pour réserver votre place en attente et obtenir votre lien de parrainage à 7 % USDC.",
        },
        create: {
          title: "Vous lancez un jeton ou un NFT ? Réservez votre place Founding 1,000.",
          body: "Les créateurs vérifiés avant 1 000 portefeuilles participent au tirage Founding 1,000 PPL et activent 7 % en USDC dès le premier achat parrainé.",
        },
        explorer: {
          title: "Vous explorez la chaîne ? Réservez une place dans Coffre des 1 000.",
          body: "La liste et l'ordre restent scellés jusqu'à ce que 1 000 portefeuilles vérifiés soient verrouillés.",
        },
        wallet: {
          title: "Liez votre portefeuille au Coffre des 1 000.",
          body: "L'étape 1 prend 20 secondes sur Telegram ; l'étape 2 scelle votre portefeuille dans la liste Founding 1,000.",
        },
        bounty: {
          title: "Participez au tirage Founding 1,000 PPL Bounty Draw avant le 1er déc.",
          body: "Vérifiez-vous sur Telegram en 20 secondes sans portefeuille, puis connectez votre portefeuille pour sceller votre place.",
        },
        home: {
          title: "Coffre des 1 000 ouvert avant PEOPLE Mainnet Beta (1er déc).",
          body: "La liste et l'ordre restent scellés jusqu'à 1 000 portefeuilles vérifiés. Vérifiez-vous sur Telegram en 20 secondes.",
        },
        default: {
          title: "Réservez une place gratuite dans Coffre des 1 000 avant le 1er déc.",
          body: "La liste et l'ordre restent scellés jusqu'à 1 000 portefeuilles vérifiés. Commencez sur Telegram en 20 secondes.",
        },
      },
    },
    modal: {
      eyebrow: "Coffre des 1 000 · PEOPLE Mainnet Beta (1er déc)",
      title: "Réservez une place gratuite dans Coffre des 1 000 avant le 1er déc",
      lead: "Participez au tirage Founding 1,000 Bounty Draw pour des PPL bonus de la Saison 1 et activez votre lien de parrainage à 7 % USDC.",
      rewardNote: "Récompense du pool de bounty, pas un rendement financier.",
      sealedFraming:
        "La liste et l'ordre restent scellés jusqu'à ce que 1 000 portefeuilles vérifiés soient verrouillés — débloquant les transferts et le tirage Founding 1,000 PPL.",
      primaryTgCta: "Vérifier sur Telegram (20s)",
      primaryTgSub: "Démarrage direct via @PeopleVerifyBot — aucun portefeuille requis à l'étape 1 (1 téléphone = 1 humain).",
      orDivider: "ou rejoignez la liste d'attente par e-mail",
      emailLabel: "Liste d'attente e-mail",
      emailPlaceholder: "vous@exemple.com",
      emailSubmit: "Rejoindre la liste",
      emailSubmitting: "Enregistrement…",
      emailError: "Saisissez une adresse e-mail valide.",
      emailSuccessTitle: "Vous êtes inscrit sur la liste d'attente Founding 1,000.",
      emailSuccessBody:
        "Complétez maintenant la vérification de 20 secondes avec @PeopleVerifyBot sur Telegram pour gagner des points Saison 1 et bloquer votre place :",
      qrScanHint: "Scannez avec l'appareil photo de votre téléphone ou appuyez sur le bouton ci-dessus pour ouvrir @PeopleVerifyBot.",
      closeAria: "Fermer la fenêtre Founding 1,000",
    },
    progress: {
      badgePrefix: "Fondateur",
      title: "Progression de vérification Founding 1,000",
      sealedNote: "La liste et l'ordre restent scellés jusqu'à 1 000 portefeuilles vérifiés.",
      step1Title: "Étape 1 · Vérification Telegram (20s, sans portefeuille)",
      step1Status: "En attente dans Founding 1,000",
      step1Detail: "Lien de parrainage instantané à 7 % USDC (sans minimum) + points Saison 1.",
      step1Cta: "Vérifier sur Telegram (20s)",
      step2Title: "Étape 2 · Créer ou connecter un portefeuille (requis pour le compte des 1 000 + ticket de tirage)",
      step2Status: "Scellé dans Founding 1,000 · Ticket de tirage actif (50 % des points Saison 1)",
      step2Detail: "Utilisez un portefeuille navigateur local ou MetaMask / Trust / WalletConnect pour sceller votre place.",
      step2Cta: "Créer ou connecter un portefeuille",
      step3Title: "Étape 3 · Human Passport",
      step3Status: "100 % des points Saison 1 + Founder NFT gratuit + poids bonus au tirage",
      step3Detail: "Complétez la preuve d'humanité sur /founders#verify pour 100 % des points.",
      step3Cta: "Ouvrir Human Passport",
      referralReadyLabel: "Votre lien de parrainage (7 % USDC) :",
      copyReferral: "Copier le lien",
      copiedReferral: "Copié",
      expandAria: "Ouvrir la progression Fondateur",
      collapseAria: "Réduire la progression Fondateur",
      step1Short: "Étape 1 : Vérifier sur Telegram (20s)",
      step1ShortMobile: "Étape 1 (20s)",
      step2Short: "Étape 2 : Créer ou connecter un portefeuille",
      step3Short: "Étape 3 : Human Passport",
      detailsToggle: "Détails",
      verifyShort: "Vérifier",
      vaultUnlockLead: "Les 1 000 premiers portefeuilles vérifiés débloquent les transferts et le tirage Founding 1,000.",
    },
    simulator: {
      eyebrow: "Simulateur de courbe de liaison et de part du pool Saison 1",
      title: "Visualisez votre point d'entrée sur la courbe et votre part Saison 1",
      slogan: "Plus vous achetez tôt, plus le prix est bas. Chaque achat fait monter la courbe.",
      curveSliderLabel: "À quel point de la courbe vous entrez",
      curveStartTag: "0 % (Ouverture de la courbe)",
      curveEndTag: "100 % (Offre totale de la courbe)",
      priceIndexLabel: "Indice illustratif du prix sur la courbe vs départ",
      relativePplLabel: "PPL relatifs par unité vs début de courbe",
      illustrativeNote:
        "Indice illustratif issu de la formule de la courbe — ni prix fixe ni promesse de gain. Les reventes dans les 30 jours comportent des frais de sortie.",
      poolSectionTitle: "Calcul transparent du pool Saison 1 (6 000 000 PPL)",
      poolFormulaLabel: "Formule : vos points / points totaux × 6 000 000 PPL",
      yourPointsLabel: "Vos points Saison 1 estimés",
      totalPointsLabel: "Points totaux Saison 1 supposés (tous les participants vérifiés)",
      estimatedShareLabel: "Votre part illustrative du pool Saison 1",
      poolDisclaimer:
        "Récompense du pool fixe de 6 000 000 PPL de la Saison 1, et non un rendement financier ou un revenu garanti.",
      ctaLockSeat: "Verrouiller ma place avant la clôture des 1 000",
    },
  },
  de: {
    stickyBar: {
      badge: "Tresor der 1.000",
      messageFull:
        "PEOPLE Mainnet Beta · Start am 1. Dez. · Tresor der 1.000 versiegelt bis 1.000 Wallets",
      messageCompact: "PEOPLE Mainnet Beta · 1. Dez. · Tresor der 1.000 versiegelt bis 1.000 Wallets",
      cta: "Platz sichern (60s)",
      daysShort: "T",
      hoursShort: "Std",
      minutesShort: "Min",
      messageMobile: "Tresor der 1.000 · 1. Dez.",
      ctaShort: "Platz sichern",
    },
    drawer: {
      eyebrow: "Tresor der 1.000",
      cta: "Platz sichern (60s)",
      dismissAria: "Founding 1,000 Hinweis schließen",
      byRoute: {
        docs: {
          title: "Sie lesen die Architektur? Sichern Sie Ihren Founding-1,000-Platz.",
          body: "In 20 Sekunden per Telegram verifizieren (noch keine Wallet nötig). Liste & Reihenfolge bleiben bis 1.000 verifizierte Wallets vor der PEOPLE Mainnet Beta am 1. Dez. versiegelt.",
        },
        roadmap: {
          title: "PEOPLE Mainnet Beta startet am 1. Dezember — treten Sie den Founding 1,000 bei.",
          body: "Starten Sie mit der 20-Sekunden-Prüfung in Telegram und aktivieren Sie sofort Ihren 7 % USDC Empfehlungslink.",
        },
        create: {
          title: "Token oder NFT geplant? Sichern Sie Ihren Founding-1,000-Platz.",
          body: "Verifizierte Ersteller vor 1.000 Wallets nehmen am Founding 1,000 PPL Bounty Draw teil und erhalten 7 % USDC ab dem ersten vermittelten Kauf.",
        },
        explorer: {
          title: "Sie erkunden die Chain? Reservieren Sie einen Platz im Tresor der 1.000.",
          body: "Liste & Reihenfolge bleiben versiegelt, bis 1.000 verifizierte Wallets gesichert sind.",
        },
        wallet: {
          title: "Verknüpfen Sie Ihre Wallet mit dem Tresor der 1.000.",
          body: "Schritt 1 dauert 20 Sekunden in Telegram; Schritt 2 versiegelt Ihre Wallet in der Founding-1,000-Liste.",
        },
        bounty: {
          title: "Am Founding 1,000 PPL Bounty Draw vor dem 1. Dez. teilnehmen.",
          body: "In 20 Sekunden in Telegram ohne Wallet verifizieren, dann Wallet verbinden und Platz versiegeln.",
        },
        home: {
          title: "Tresor der 1.000 ist vor der PEOPLE Mainnet Beta (1. Dez.) geöffnet.",
          body: "Liste & Reihenfolge bleiben bis 1.000 verifizierte Wallets versiegelt. Jetzt in 20 Sekunden per Telegram starten.",
        },
        default: {
          title: "Kostenlosen Platz im Tresor der 1.000 vor dem 1. Dez. sichern.",
          body: "Liste & Reihenfolge bleiben versiegelt, bis 1.000 verifizierte Wallets erreicht sind. Start in Telegram in 20 Sekunden.",
        },
      },
    },
    modal: {
      eyebrow: "Tresor der 1.000 · PEOPLE Mainnet Beta (1. Dez.)",
      title: "Kostenlosen Platz im Tresor der 1.000 vor dem 1. Dez. sichern",
      lead: "Nehmen Sie am Founding 1,000 Bounty Draw für Bonus-PPL aus dem Season-1-Pool teil und aktivieren Sie Ihren 7 % USDC Empfehlungslink.",
      rewardNote: "Bounty-Pool-Belohnung, keine finanzielle Rendite.",
      sealedFraming:
        "Liste & Reihenfolge bleiben versiegelt, bis 1.000 verifizierte Wallets gesichert sind — das schaltet Transfers und den Founding 1,000 PPL Bounty Draw frei.",
      primaryTgCta: "In Telegram verifizieren (20s)",
      primaryTgSub: "Direktstart über @PeopleVerifyBot — keine Wallet für Schritt 1 nötig (1 Telefon = 1 Mensch).",
      orDivider: "oder auf die E-Mail-Warteliste setzen",
      emailLabel: "E-Mail-Warteliste",
      emailPlaceholder: "sie@beispiel.de",
      emailSubmit: "Auf die Warteliste",
      emailSubmitting: "Wird gespeichert…",
      emailError: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
      emailSuccessTitle: "Sie stehen auf der Founding-1,000-Warteliste.",
      emailSuccessBody:
        "Schließen Sie jetzt die 20-Sekunden-Prüfung bei @PeopleVerifyBot in Telegram ab, um zusätzliche Season-1-Punkte zu erhalten und Ihren Platz zu sichern:",
      qrScanHint: "Mit der Handykamera scannen oder oben tippen, um @PeopleVerifyBot zu öffnen.",
      closeAria: "Founding 1,000 Fenster schließen",
    },
    progress: {
      badgePrefix: "Gründer",
      title: "Founding 1,000 Verifizierungsfortschritt",
      sealedNote: "Liste & Reihenfolge bleiben versiegelt, bis 1.000 verifizierte Wallets gesichert sind.",
      step1Title: "Schritt 1 · Telegram-Verifizierung (20s, ohne Wallet)",
      step1Status: "Ausstehend in Founding 1,000",
      step1Detail: "Sofortiger 7 % USDC Empfehlungslink (kein Mindestvolumen) + Season-1-Punkte.",
      step1Cta: "In Telegram verifizieren (20s)",
      step2Title: "Schritt 2 · Wallet erstellen oder verbinden (erforderlich für 1.000er-Zählung + Verlosungsticket)",
      step2Status: "Versiegelt in Founding 1,000 · Bounty-Draw-Ticket aktiv (50 % Season-1-Punkte)",
      step2Detail: "Lokale Browser-Wallet oder MetaMask / Trust / WalletConnect nutzen, um Ihren Platz zu versiegeln.",
      step2Cta: "Wallet erstellen oder verbinden",
      step3Title: "Schritt 3 · Human Passport",
      step3Status: "100 % Season-1-Punkte + kostenloses Founder NFT + Bonusgewicht bei der Verlosung",
      step3Detail: "Menschlichkeitsnachweis auf /founders#verify für volle 100 % Season-1-Gewichtung abschließen.",
      step3Cta: "Human Passport öffnen",
      referralReadyLabel: "Ihr 7 % USDC Empfehlungslink:",
      copyReferral: "Link kopieren",
      copiedReferral: "Kopiert",
      expandAria: "Gründer-Fortschritt öffnen",
      collapseAria: "Gründer-Fortschritt einklappen",
      step1Short: "Schritt 1: In Telegram verifizieren (20s)",
      step1ShortMobile: "Schritt 1 (20s)",
      step2Short: "Schritt 2: Wallet erstellen oder verbinden",
      step3Short: "Schritt 3: Human Passport",
      detailsToggle: "Einzelheiten",
      verifyShort: "Verifizieren",
      vaultUnlockLead: "Die ersten 1.000 verifizierten Wallets schalten Transfers und die Founding-1,000-Verlosung frei.",
    },
    simulator: {
      eyebrow: "Bonding-Curve- & Season-1-Pool-Simulator",
      title: "Wie Kurveneinstieg und Season-1-Punkte zusammenwirken",
      slogan: "Je früher Sie kaufen, desto niedriger der Preis. Jeder Kauf bewegt die Kurve nach oben.",
      curveSliderLabel: "An welchem Punkt der Kurve Sie einsteigen",
      curveStartTag: "0 % (Kurvenstart)",
      curveEndTag: "100 % (Gesamtes Kurvenangebot)",
      priceIndexLabel: "Illustrativer Kurvenpreis-Index vs. Start",
      relativePplLabel: "Relative PPL pro Einheit vs. Kurvenstart",
      illustrativeNote:
        "Illustrativer Index aus der Protokoll-Kurvenformel — kein Festpreis und keine Renditeprognose. Rückverkäufe innerhalb von 30 Tagen unterliegen einer Rückgabegebühr.",
      poolSectionTitle: "Ehrliche Season-1-Pool-Berechnung (6.000.000 PPL)",
      poolFormulaLabel: "Formel: Ihre Punkte / Gesamtpunkte × 6.000.000 PPL",
      yourPointsLabel: "Ihre geschätzten Season-1-Punkte",
      totalPointsLabel: "Angenommene Season-1-Gesamtpunkte (alle verifizierten Teilnehmer)",
      estimatedShareLabel: "Ihr illustrativer Anteil am Season-1-Pool",
      poolDisclaimer:
        "Bounty-Belohnung aus dem festen 6.000.000-PPL-Pool der Season 1, keine finanzielle Rendite oder Einkommenszusage.",
      ctaLockSeat: "Platz sichern, bevor die 1.000 schließen",
    },
  },
  it: {
    stickyBar: {
      badge: "Caveau dei 1.000",
      messageFull:
        "PEOPLE Mainnet Beta · Apre il 1° dic · Caveau dei 1.000 sigillato fino a 1.000 portafogli",
      messageCompact: "PEOPLE Mainnet Beta · 1° dic · Caveau dei 1.000 sigillato fino a 1.000 portafogli",
      cta: "Prenota posto (60s)",
      daysShort: "g",
      hoursShort: "h",
      minutesShort: "m",
      messageMobile: "Caveau dei 1.000 · 1° dic",
      ctaShort: "Prenota posto",
    },
    drawer: {
      eyebrow: "Caveau dei 1.000",
      cta: "Prenota posto (60s)",
      dismissAria: "Chiudi avviso Founding 1,000",
      byRoute: {
        docs: {
          title: "Stai leggendo l'architettura? Blocca il tuo posto in Founding 1,000.",
          body: "Verifica su Telegram in 20 secondi (nessun portafoglio richiesto ora). Elenco e ordine restano sigillati fino a 1.000 portafogli verificati prima di PEOPLE Mainnet Beta il 1° dic.",
        },
        roadmap: {
          title: "PEOPLE Mainnet Beta apre il 1° dicembre — entra nei Founding 1,000.",
          body: "Inizia con la verifica di 20 secondi su Telegram per prenotare il posto in attesa e ottenere il link referral al 7% in USDC.",
        },
        create: {
          title: "Vuoi lanciare un token o NFT? Prenota il tuo posto in Founding 1,000.",
          body: "I creatori verificati prima dei 1.000 portafogli partecipano all'estrazione Founding 1,000 PPL e attivano il 7% in USDC dal primo acquisto invitato.",
        },
        explorer: {
          title: "Esplori la rete? Riservati un posto nel Caveau dei 1.000.",
          body: "Elenco e ordine restano sigillati finché 1.000 portafogli verificati non sono confermati.",
        },
        wallet: {
          title: "Collega il tuo portafoglio al Caveau dei 1.000.",
          body: "Il Passo 1 richiede 20 secondi su Telegram; il Passo 2 sigilla il tuo portafoglio nell'elenco Founding 1,000.",
        },
        bounty: {
          title: "Partecipa al Founding 1,000 PPL Bounty Draw prima del 1° dic.",
          body: "Verifica su Telegram in 20 secondi senza portafoglio, poi collega il portafoglio per sigillare il tuo posto.",
        },
        home: {
          title: "Caveau dei 1.000 aperto prima di PEOPLE Mainnet Beta (1° dic).",
          body: "Elenco e ordine restano sigillati fino a 1.000 portafogli verificati. Verifica su Telegram in 20 secondi.",
        },
        default: {
          title: "Prenota un posto gratuito nel Caveau dei 1.000 prima del 1° dic.",
          body: "Elenco e ordine restano sigillati fino a 1.000 portafogli verificati. Inizia su Telegram in 20 secondi.",
        },
      },
    },
    modal: {
      eyebrow: "Caveau dei 1.000 · PEOPLE Mainnet Beta (1° dic)",
      title: "Prenota un posto gratuito nel Caveau dei 1.000 prima del 1° dic",
      lead: "Partecipa all'estrazione Founding 1,000 Bounty Draw per PPL bonus dal pool della Stagione 1 e attiva il tuo link referral al 7% in USDC.",
      rewardNote: "Ricompensa del pool bounty, non rendimento finanziario.",
      sealedFraming:
        "Elenco e ordine restano sigillati finché 1.000 portafogli verificati non sono bloccati — sbloccando i trasferimenti e il Founding 1,000 PPL Bounty Draw.",
      primaryTgCta: "Verifica su Telegram (20s)",
      primaryTgSub: "Avvio rapido su @PeopleVerifyBot — nessun portafoglio richiesto per il Passo 1 (1 telefono = 1 umano).",
      orDivider: "oppure iscriviti alla lista d'attesa email",
      emailLabel: "Lista d'attesa email",
      emailPlaceholder: "tu@esempio.it",
      emailSubmit: "Unisciti alla lista",
      emailSubmitting: "Salvataggio…",
      emailError: "Inserisci un indirizzo email valido.",
      emailSuccessTitle: "Sei nella lista d'attesa Founding 1,000.",
      emailSuccessBody:
        "Ora completa la verifica di 20 secondi con @PeopleVerifyBot su Telegram per ottenere punti extra della Stagione 1 e bloccare il tuo posto:",
      qrScanHint: "Scansiona con la fotocamera del telefono o tocca il pulsante sopra per aprire @PeopleVerifyBot.",
      closeAria: "Chiudi finestra Founding 1,000",
    },
    progress: {
      badgePrefix: "Fondatore",
      title: "Progresso di verifica Founding 1,000",
      sealedNote: "Elenco e ordine restano sigillati finché 1.000 portafogli verificati non sono bloccati.",
      step1Title: "Passo 1 · Verifica Telegram (20s, senza portafoglio)",
      step1Status: "In attesa in Founding 1,000",
      step1Detail: "Link referral istantaneo al 7% in USDC (nessun minimo) + punti Stagione 1.",
      step1Cta: "Verifica su Telegram (20s)",
      step2Title: "Passo 2 · Crea o collega portafoglio (richiesto per il conteggio dei 1.000 + biglietto estrazione)",
      step2Status: "Sigillato in Founding 1,000 · Biglietto estrazione attivo (50% punti Stagione 1)",
      step2Detail: "Usa un portafoglio locale del browser o MetaMask / Trust / WalletConnect per sigillare il tuo posto.",
      step2Cta: "Crea o collega portafoglio",
      step3Title: "Passo 3 · Human Passport",
      step3Status: "100% punti Stagione 1 + Founder NFT gratuito + peso bonus nell'estrazione",
      step3Detail: "Completa la prova di umanità su /founders#verify per il 100% del peso nella Stagione 1.",
      step3Cta: "Apri Human Passport",
      referralReadyLabel: "Il tuo link referral (7% USDC):",
      copyReferral: "Copia link",
      copiedReferral: "Copiato",
      expandAria: "Apri progresso Fondatore",
      collapseAria: "Comprimi progresso Fondatore",
      step1Short: "Passo 1: Verifica su Telegram (20s)",
      step1ShortMobile: "Passo 1 (20s)",
      step2Short: "Passo 2: Crea o collega portafoglio",
      step3Short: "Passo 3: Human Passport",
      detailsToggle: "Dettagli",
      verifyShort: "Verifica",
      vaultUnlockLead: "I primi 1.000 portafogli verificati sbloccano i trasferimenti e l'estrazione Founding 1,000.",
    },
    simulator: {
      eyebrow: "Simulatore di curva di bonding e quota pool Stagione 1",
      title: "Scopri come funzionano la posizione sulla curva e i punti Stagione 1",
      slogan: "Prima acquisti, più basso è il prezzo. Ogni acquisto spinge la curva verso l'alto.",
      curveSliderLabel: "In quale punto della curva entri",
      curveStartTag: "0% (Apertura curva)",
      curveEndTag: "100% (Offerta totale curva)",
      priceIndexLabel: "Indice illustrativo del prezzo sulla curva vs inizio",
      relativePplLabel: "PPL relativi per unità vs inizio curva",
      illustrativeNote:
        "Indice illustrativo basato sulla formula della curva — non è un prezzo fisso né una previsione di rendimento.Le rivendite entro 30 giorni prevedono una commissione di uscita.",
      poolSectionTitle: "Calcolo trasparente del pool Stagione 1 (6.000.000 PPL)",
      poolFormulaLabel: "Formula: i tuoi punti / punti totali × 6.000.000 PPL",
      yourPointsLabel: "I tuoi punti Stagione 1 stimati",
      totalPointsLabel: "Punti totali Stagione 1 ipotizzati (tutti i partecipanti verificati)",
      estimatedShareLabel: "La tua quota illustrativa del pool Stagione 1",
      poolDisclaimer:
        "Ricompensa dal pool fisso di 6.000.000 PPL della Stagione 1, non rendimento finanziario o reddito garantito.",
      ctaLockSeat: "Blocca il posto prima della chiusura dei 1.000",
    },
  },
  tr: {
    stickyBar: {
      badge: "İlk 1.000 Kasası",
      messageFull:
        "PEOPLE Mainnet Beta · 1 Aralık'ta açılır · İlk 1.000 Kasası 1.000 cüzdana kadar mühürlü",
      messageCompact: "PEOPLE Mainnet Beta · 1 Ara · İlk 1.000 Kasası 1.000 cüzdana kadar mühürlü",
      cta: "Koltuk Ayır (60sn)",
      daysShort: "g",
      hoursShort: "s",
      minutesShort: "dk",
      messageMobile: "İlk 1.000 Kasası · 1 Ara",
      ctaShort: "Koltuk Ayır",
    },
    drawer: {
      eyebrow: "İlk 1.000 Kasası",
      cta: "Koltuk Ayır (60sn)",
      dismissAria: "Founding 1,000 penceresini kapat",
      byRoute: {
        docs: {
          title: "Mimariyi mi inceliyorsunuz? Founding 1,000 koltuğunuzu kilitleyin.",
          body: "Telegram'da 20 saniyede doğrulayın (henüz cüzdan gerekmez). 1 Aralık'taki PEOPLE Mainnet Beta öncesinde 1.000 doğrulanmış cüzdan tamamlanana kadar liste mühürlü kalır.",
        },
        roadmap: {
          title: "PEOPLE Mainnet Beta 1 Aralık'ta açılıyor — Founding 1,000'e katılın.",
          body: "Bekleyen koltuğunuzu ayırmak ve %7 USDC referans bağlantınızı almak için 20 saniyelik Telegram doğrulamasıyla başlayın.",
        },
        create: {
          title: "Topluluk tokenı veya NFT mi oluşturacaksınız? Founding 1,000 koltuğunuzu alın.",
          body: "1.000 cüzdan dolmadan doğrulanan üreticiler Founding 1,000 PPL çekilişine katılır ve ilk satıştan itibaren %7 USDC kazanır.",
        },
        explorer: {
          title: "Ağı mı inceliyorsunuz? İlk 1.000 Kasası içinde yerinizi ayırın.",
          body: "1.000 doğrulanmış cüzdan kilitlenene kadar liste ve sıra mühürlü kalır.",
        },
        wallet: {
          title: "Cüzdanınızı İlk 1.000 Kasası'a bağlayın.",
          body: "1. Adım Telegram'da 20 saniye sürer; 2. Adım cüzdanınızı Founding 1,000 listesine mühürler.",
        },
        bounty: {
          title: "1 Aralık'tan önce Founding 1,000 PPL Ödül Çekilişine katılın.",
          body: "Cüzdan olmadan 20 saniyede Telegram'da doğrulayın, ardından cüzdanınızı bağlayarak koltuğunuzu mühürleyin.",
        },
        home: {
          title: "PEOPLE Mainnet Beta (1 Aralık) öncesinde İlk 1.000 Kasası açık.",
          body: "1.000 doğrulanmış cüzdan kilitlenene kadar liste ve sıra mühürlü kalır. Telegram'da 20 saniyede doğrulayın.",
        },
        default: {
          title: "1 Aralık'tan önce İlk 1.000 Kasası'ta ücretsiz koltuk ayırın.",
          body: "1.000 doğrulanmış cüzdan kilitlenene kadar liste ve sıra mühürlü kalır. Telegram'da 20 saniyede başlayın.",
        },
      },
    },
    modal: {
      eyebrow: "İlk 1.000 Kasası · PEOPLE Mainnet Beta (1 Aralık)",
      title: "1 Aralık'tan önce İlk 1.000 Kasası'ta ücretsiz koltuk ayırın",
      lead: "Sezon 1 havuzundan bonus PPL için Founding 1,000 Ödül Çekilişine katılın ve ilk satın alımdan itibaren geçerli %7 USDC referans bağlantınızı açın.",
      rewardNote: "Ödül havuzu teşvikidir, finansal getiri vaadi değildir.",
      sealedFraming:
        "1.000 doğrulanmış cüzdan kilitlenene kadar liste ve sıra mühürlü kalır — transferleri ve Founding 1,000 PPL çekilişini açar.",
      primaryTgCta: "Telegram'da Doğrula (20sn)",
      primaryTgSub: "@PeopleVerifyBot ile anında başlangıç — 1. Adım için cüzdan gerekmez (1 telefon = 1 insan).",
      orDivider: "veya e-posta bekleme listesine katılın",
      emailLabel: "E-posta bekleme listesi",
      emailPlaceholder: "siz@ornek.com",
      emailSubmit: "Listeye Katıl",
      emailSubmitting: "Kaydediliyor…",
      emailError: "Geçerli bir e-posta adresi girin.",
      emailSuccessTitle: "Founding 1,000 bekleme listesindesiniz.",
      emailSuccessBody:
        "Şimdi ekstra Sezon 1 puanı kazanmak ve bekleyen Founding 1,000 koltuğunuzu kilitlemek için Telegram'da 20 saniyelik @PeopleVerifyBot doğrulamasını tamamlayın:",
      qrScanHint: "Telefon kameranızla tarayın veya @PeopleVerifyBot'u açmak için yukarıdaki düğmeye dokunun.",
      closeAria: "Founding 1,000 penceresini kapat",
    },
    progress: {
      badgePrefix: "Kurucu",
      title: "Founding 1,000 Doğrulama İlerlemesi",
      sealedNote: "1.000 doğrulanmış cüzdan kilitlenene kadar liste ve sıra mühürlü kalır.",
      step1Title: "1. Adım · Telegram Doğrulaması (20sn, cüzdan gerekmez)",
      step1Status: "Founding 1,000 içinde Beklemede",
      step1Detail: "Anında %7 USDC referans bağlantısı (minimum hacim yok) + Sezon 1 puanları.",
      step1Cta: "Telegram'da Doğrula (20sn)",
      step2Title: "2. Adım · Cüzdan Oluştur veya Bağla (1.000 sayımı + çekiliş bileti için gerekli)",
      step2Status: "Founding 1,000'de Mühürlendi · Çekiliş Bileti Aktif (%50 Sezon 1 puanı)",
      step2Detail: "Koltuğunuzu mühürlemek için yerel tarayıcı cüzdanı veya MetaMask / Trust / WalletConnect kullanın.",
      step2Cta: "Cüzdan Oluştur veya Bağla",
      step3Title: "3. Adım · Human Passport",
      step3Status: "%100 Sezon 1 puanı + Ücretsiz Founder NFT + bonus çekiliş ağırlığı",
      step3Detail: "Tam Sezon 1 ağırlığı için /founders#verify adresinde insanlık kanıtını tamamlayın.",
      step3Cta: "Human Passport'u Aç",
      referralReadyLabel: "%7 USDC referans bağlantınız:",
      copyReferral: "Bağlantıyı kopyala",
      copiedReferral: "Kopyalandı",
      expandAria: "Kurucu ilerlemesini aç",
      collapseAria: "Kurucu ilerlemesini daralt",
      step1Short: "1. Adım: Telegram'da Doğrula (20sn)",
      step1ShortMobile: "1. Adım (20sn)",
      step2Short: "2. Adım: Cüzdan Oluştur veya Bağla",
      step3Short: "3. Adım: Human Passport",
      detailsToggle: "Ayrıntılar",
      verifyShort: "Doğrula",
      vaultUnlockLead: "İlk 1.000 doğrulanmış cüzdan transferleri ve Founding 1,000 çekilişini açar.",
    },
    simulator: {
      eyebrow: "Bonding Eğrisi ve Sezon 1 Havuz Payı Simülatörü",
      title: "Eğriye giriş noktasının ve Sezon 1 puanlarının nasıl çalıştığını görün",
      slogan: "Ne kadar erken alırsanız, fiyat o kadar düşük olur. Her alım eğriyi yukarı taşır.",
      curveSliderLabel: "Eğrinin hangi noktasında giriş yapıyorsunuz",
      curveStartTag: "%0 (Eğri başlangıcı)",
      curveEndTag: "%100 (Toplam eğri arzı)",
      priceIndexLabel: "Başlangıca göre örnek eğri fiyat endeksi",
      relativePplLabel: "Başlangıca göre birim başına bağıl PPL",
      illustrativeNote:
        "Protokol eğri formülünden örnek endeks — sabit fiyat veya kazanç tahmini değildir. 30 gün içindeki erken geri satışlarda çıkış ücreti uygulanır.",
      poolSectionTitle: "Şeffaf Sezon 1 Ödül Havuzu Payı (6.000.000 PPL)",
      poolFormulaLabel: "Formül: puanınız / toplam puan × 6.000.000 PPL",
      yourPointsLabel: "Tahmini Sezon 1 puanınız",
      totalPointsLabel: "Varsayılan toplam Sezon 1 puanı (tüm doğrulanmış katılımcılar)",
      estimatedShareLabel: "Örnek Sezon 1 havuz payınız",
      poolDisclaimer:
        "Sabit 6.000.000 PPL Sezon 1 havuzundan ödül; finansal getiri veya gelir vaadi değildir.",
      ctaLockSeat: "1.000 Kapanmadan Koltuğu Kilitle",
    },
  },
  vi: {
    stickyBar: {
      badge: "Kho 1.000 đầu",
      messageFull:
        "PEOPLE Mainnet Beta · Mở 1/12 · Kho 1.000 đầu niêm phong đến khi đủ 1.000 ví",
      messageCompact: "PEOPLE Mainnet Beta · 1/12 · Kho 1.000 đầu niêm phong đến khi đủ 1.000 ví",
      cta: "Giữ vị trí (60 giây)",
      daysShort: "ng",
      hoursShort: "g",
      minutesShort: "p",
      messageMobile: "Kho 1.000 đầu · 1/12",
      ctaShort: "Giữ vị trí",
    },
    drawer: {
      eyebrow: "Kho 1.000 đầu",
      cta: "Giữ vị trí (60 giây)",
      dismissAria: "Đóng hộp thoại Founding 1,000",
      byRoute: {
        docs: {
          title: "Đang đọc kiến trúc? Hãy giữ sớm vị trí Founding 1,000.",
          body: "Xác minh qua Telegram trong 20 giây (chưa cần ví). Danh sách & thứ tự giữ niêm phong cho đến khi đủ 1.000 ví xác minh trước ngày 1/12.",
        },
        roadmap: {
          title: "PEOPLE Mainnet Beta mở ngày 1/12 — tham gia Founding 1,000.",
          body: "Bắt đầu với bước kiểm tra 20 giây trên Telegram để giữ chỗ chờ và nhận liên kết giới thiệu 7% USDC.",
        },
        create: {
          title: "Dự định tạo token hoặc NFT? Giữ ngay vị trí Founding 1,000.",
          body: "Nhà sáng tạo xác minh trước mốc 1.000 ví được tham gia quay thưởng Founding 1,000 PPL và nhận 7% USDC ngay từ giao dịch đầu tiên.",
        },
        explorer: {
          title: "Đang khám phá mạng lưới? Đặt chỗ trong Kho 1.000 đầu.",
          body: "Danh sách & thứ tự được niêm phong cho đến khi 1.000 ví xác minh hoàn tất.",
        },
        wallet: {
          title: "Liên kết ví của bạn với Kho 1.000 đầu.",
          body: "Bước 1 chỉ mất 20 giây trên Telegram; Bước 2 niêm phong ví của bạn vào danh sách Founding 1,000.",
        },
        bounty: {
          title: "Tham gia Quay thưởng Founding 1,000 PPL trước ngày 1/12.",
          body: "Xác minh Telegram trong 20 giây không cần ví, sau đó kết nối ví để niêm phong vị trí của bạn.",
        },
        home: {
          title: "Kho 1.000 đầu đang mở trước thềm PEOPLE Mainnet Beta (1/12).",
          body: "Danh sách & thứ tự được niêm phong cho đến khi đủ 1.000 ví xác minh. Xác minh Telegram trong 20 giây.",
        },
        default: {
          title: "Giữ vị trí miễn phí trong Kho 1.000 đầu trước ngày 1/12.",
          body: "Danh sách & thứ tự giữ niêm phong đến khi đủ 1.000 ví xác minh. Bắt đầu trên Telegram trong 20 giây.",
        },
      },
    },
    modal: {
      eyebrow: "Kho 1.000 đầu · PEOPLE Mainnet Beta (1/12)",
      title: "Giữ vị trí miễn phí trong Kho 1.000 đầu trước ngày 1/12",
      lead: "Tham gia Quay thưởng Founding 1,000 Bounty Draw để nhận PPL thưởng từ quỹ Mùa 1 và kích hoạt liên kết giới thiệu 7% USDC ngay từ giao dịch đầu tiên.",
      rewardNote: "Phần thưởng từ quỹ bounty, không phải lợi tức tài chính.",
      sealedFraming:
        "Danh sách & thứ tự được niêm phong cho đến khi đủ 1.000 ví xác minh — mở khóa chuyển khoản và Quay thưởng Founding 1,000 PPL.",
      primaryTgCta: "Xác minh qua Telegram (20 giây)",
      primaryTgSub: "Bắt đầu trực tiếp với @PeopleVerifyBot — Bước 1 chưa cần ví (1 số điện thoại = 1 người thật).",
      orDivider: "hoặc đăng ký danh sách chờ qua email",
      emailLabel: "Danh sách chờ email",
      emailPlaceholder: "ban@vidu.com",
      emailSubmit: "Đăng ký chờ",
      emailSubmitting: "Đang lưu…",
      emailError: "Vui lòng nhập địa chỉ email hợp lệ.",
      emailSuccessTitle: "Bạn đã có mặt trong danh sách chờ Founding 1,000.",
      emailSuccessBody:
        "Bây giờ hãy hoàn tất xác minh 20 giây với @PeopleVerifyBot trên Telegram để nhận thêm điểm Mùa 1 và giữ vị trí của bạn:",
      qrScanHint: "Quét bằng camera điện thoại hoặc nhấn nút phía trên để mở @PeopleVerifyBot.",
      closeAria: "Đóng cửa sổ Founding 1,000",
    },
    progress: {
      badgePrefix: "Nhà sáng lập",
      title: "Tiến trình xác minh Founding 1,000",
      sealedNote: "Danh sách & thứ tự được niêm phong cho đến khi đủ 1.000 ví xác minh.",
      step1Title: "Bước 1 · Xác minh Telegram (20 giây, chưa cần ví)",
      step1Status: "Đang chờ trong Founding 1,000",
      step1Detail: "Liên kết giới thiệu 7% USDC tức thì (không yêu cầu tối thiểu) + điểm Mùa 1.",
      step1Cta: "Xác minh qua Telegram (20 giây)",
      step2Title: "Bước 2 · Tạo hoặc kết nối ví (bắt buộc để tính vào 1.000 ví + vé quay thưởng)",
      step2Status: "Đã niêm phong trong Founding 1,000 · Vé quay thưởng đã kích hoạt (50% điểm Mùa 1)",
      step2Detail: "Dùng ví trình duyệt cục bộ hoặc MetaMask / Trust / WalletConnect để niêm phong vị trí.",
      step2Cta: "Tạo hoặc kết nối ví",
      step3Title: "Bước 3 · Human Passport",
      step3Status: "100% điểm Mùa 1 + Founder NFT miễn phí + thêm trọng số quay thưởng",
      step3Detail: "Hoàn tất chứng minh con người tại /founders#verify để nhận đủ 100% điểm Mùa 1.",
      step3Cta: "Mở Human Passport",
      referralReadyLabel: "Liên kết giới thiệu 7% USDC của bạn:",
      copyReferral: "Sao chép liên kết",
      copiedReferral: "Đã sao chép",
      expandAria: "Mở tiến trình Nhà sáng lập",
      collapseAria: "Thu gọn tiến trình Nhà sáng lập",
      step1Short: "Bước 1: Xác minh qua Telegram (20 giây)",
      step1ShortMobile: "Bước 1 (20 giây)",
      step2Short: "Bước 2: Tạo hoặc kết nối ví",
      step3Short: "Bước 3: Human Passport",
      detailsToggle: "Chi tiết",
      verifyShort: "Xác minh",
      vaultUnlockLead: "1.000 ví đã xác minh đầu tiên mở khóa chuyển tiền và quay thưởng Founding 1,000.",
    },
    simulator: {
      eyebrow: "Trình mô phỏng đường cong định giá & tỷ lệ quỹ Mùa 1",
      title: "Xem cách vị trí trên đường cong và điểm Mùa 1 hoạt động",
      slogan: "Bạn mua càng sớm, giá càng thấp. Mỗi giao dịch mua đều đẩy đường cong đi lên.",
      curveSliderLabel: "Bạn tham gia ở vị trí nào trên đường cong",
      curveStartTag: "0% (Đầu đường cong)",
      curveEndTag: "100% (Toàn bộ cung trên đường cong)",
      priceIndexLabel: "Chỉ số giá minh họa trên đường cong so với lúc mở",
      relativePplLabel: "Lượng PPL tương đối trên mỗi đơn vị so với lúc đầu",
      illustrativeNote:
        "Chỉ số minh họa từ công thức đường cong — không phải giá cố định hay cam kết lợi nhuận. Bán lại trong vòng 30 ngày chịu phí thoái vốn sớm.",
      poolSectionTitle: "Tính toán minh bạch phần thưởng quỹ Mùa 1 (6.000.000 PPL)",
      poolFormulaLabel: "Công thức: điểm của bạn / tổng điểm × 6.000.000 PPL",
      yourPointsLabel: "Số điểm Mùa 1 ước tính của bạn",
      totalPointsLabel: "Tổng điểm Mùa 1 giả định (tất cả người tham gia đã xác minh)",
      estimatedShareLabel: "Phần chia quỹ Mùa 1 minh họa của bạn",
      poolDisclaimer:
        "Phần thưởng từ quỹ cố định 6.000.000 PPL Mùa 1, không phải lợi tức tài chính hay cam kết thu nhập.",
      ctaLockSeat: "Khóa vị trí trước khi đủ 1.000 ví",
    },
  },
  id: {
    stickyBar: {
      badge: "Brankas 1.000",
      messageFull:
        "PEOPLE Mainnet Beta · Dibuka 1 Des · Brankas 1.000 tersegel hingga 1.000 dompet",
      messageCompact: "PEOPLE Mainnet Beta · 1 Des · Brankas 1.000 tersegel hingga 1.000 dompet",
      cta: "Klaim Kursi (60d)",
      daysShort: "h",
      hoursShort: "j",
      minutesShort: "m",
      messageMobile: "Brankas 1.000 · 1 Des",
      ctaShort: "Klaim Kursi",
    },
    drawer: {
      eyebrow: "Brankas 1.000",
      cta: "Klaim Kursi (60d)",
      dismissAria: "Tutup panel Founding 1,000",
      byRoute: {
        docs: {
          title: "Sedang membaca arsitektur? Kunci kursi Founding 1,000 Anda.",
          body: "Verifikasi di Telegram dalam 20 detik (belum perlu dompet). Daftar & urutan tetap tersegel hingga 1.000 dompet terverifikasi terkunci sebelum PEOPLE Mainnet Beta pada 1 Des.",
        },
        roadmap: {
          title: "PEOPLE Mainnet Beta dibuka 1 Desember — bergabunglah di Founding 1,000.",
          body: "Mulai dengan verifikasi 20 detik di Telegram untuk mengamankan kursi tertunda dan tautan referral 7% USDC Anda.",
        },
        create: {
          title: "Ingin meluncurkan token atau NFT? Klaim kursi Founding 1,000 Anda.",
          body: "Kreator yang terverifikasi sebelum 1.000 dompet terkunci masuk ke Undian Bounty Founding 1,000 PPL dan mengaktifkan komisi 7% USDC sejak pembelian pertama.",
        },
        explorer: {
          title: "Menjelajahi jaringan? Amankan kursi di Brankas 1.000.",
          body: "Daftar & urutan tetap tersegel hingga 1.000 dompet terverifikasi terkunci.",
        },
        wallet: {
          title: "Hubungkan dompet Anda ke Brankas 1.000.",
          body: "Langkah 1 hanya 20 detik di Telegram; Langkah 2 menyegel dompet Anda ke dalam daftar Founding 1,000.",
        },
        bounty: {
          title: "Ikuti Undian Bounty Founding 1,000 PPL sebelum 1 Des.",
          body: "Verifikasi di Telegram dalam 20 detik tanpa dompet, lalu hubungkan dompet Anda untuk menyegel kursi.",
        },
        home: {
          title: "Brankas 1.000 terbuka menjelang PEOPLE Mainnet Beta (1 Des).",
          body: "Daftar & urutan tetap tersegel hingga 1.000 dompet terverifikasi terkunci. Verifikasi di Telegram dalam 20 detik.",
        },
        default: {
          title: "Klaim kursi gratis di Brankas 1.000 sebelum 1 Des.",
          body: "Daftar & urutan tetap tersegel hingga 1.000 dompet terverifikasi terkunci. Mulai di Telegram dalam 20 detik.",
        },
      },
    },
    modal: {
      eyebrow: "Brankas 1.000 · PEOPLE Mainnet Beta (1 Des)",
      title: "Klaim kursi gratis di Brankas 1.000 sebelum 1 Des",
      lead: "Ikuti Undian Bounty Founding 1,000 untuk bonus PPL dari pool Musim 1 dan aktifkan tautan referral 7% USDC Anda sejak pembelian pertama.",
      rewardNote: "Hadiah pool bounty, bukan imbal hasil finansial.",
      sealedFraming:
        "Daftar & urutan tetap tersegel hingga 1.000 dompet terverifikasi terkunci — membuka transfer dan Undian Bounty Founding 1,000 PPL.",
      primaryTgCta: "Verifikasi di Telegram (20d)",
      primaryTgSub: "Mulai instan lewat @PeopleVerifyBot — belum perlu dompet untuk Langkah 1 (1 telepon = 1 manusia).",
      orDivider: "atau masuk daftar tunggu email",
      emailLabel: "Daftar tunggu email",
      emailPlaceholder: "anda@contoh.com",
      emailSubmit: "Gabung Daftar Tunggu",
      emailSubmitting: "Menyimpan…",
      emailError: "Masukkan alamat email yang valid.",
      emailSuccessTitle: "Anda sudah terdaftar di daftar tunggu Founding 1,000.",
      emailSuccessBody:
        "Sekarang selesaikan verifikasi 20 detik @PeopleVerifyBot di Telegram untuk mendapatkan poin tambahan Musim 1 dan mengunci kursi Anda:",
      qrScanHint: "Pindai dengan kamera ponsel atau ketuk tombol di atas untuk membuka @PeopleVerifyBot.",
      closeAria: "Tutup modal Founding 1,000",
    },
    progress: {
      badgePrefix: "Pendiri",
      title: "Progres Verifikasi Founding 1,000",
      sealedNote: "Daftar & urutan tetap tersegel hingga 1.000 dompet terverifikasi terkunci.",
      step1Title: "Langkah 1 · Verifikasi Telegram (20d, tanpa dompet)",
      step1Status: "Tertunda di Founding 1,000",
      step1Detail: "Tautan referral 7% USDC instan (tanpa volume minimum) + poin Musim 1.",
      step1Cta: "Verifikasi di Telegram (20d)",
      step2Title: "Langkah 2 · Buat atau Hubungkan Dompet (wajib untuk hitungan 1.000 + tiket undian)",
      step2Status: "Tersegel di Founding 1,000 · Tiket Undian Aktif (50% poin Musim 1)",
      step2Detail: "Gunakan dompet browser lokal atau MetaMask / Trust / WalletConnect untuk menyegel kursi Anda.",
      step2Cta: "Buat atau Hubungkan Dompet",
      step3Title: "Langkah 3 · Human Passport",
      step3Status: "100% poin Musim 1 + Founder NFT Gratis + bobot undian ekstra",
      step3Detail: "Selesaikan bukti kemanusiaan di /founders#verify untuk bobot penuh Musim 1.",
      step3Cta: "Buka Human Passport",
      referralReadyLabel: "Tautan referral 7% USDC Anda:",
      copyReferral: "Salin tautan",
      copiedReferral: "Tersalin",
      expandAria: "Buka progres Pendiri",
      collapseAria: "Ciutkan progres Pendiri",
      step1Short: "Langkah 1: Verifikasi di Telegram (20d)",
      step1ShortMobile: "Langkah 1 (20d)",
      step2Short: "Langkah 2: Buat atau Hubungkan Dompet",
      step3Short: "Langkah 3: Human Passport",
      detailsToggle: "Rincian",
      verifyShort: "Verifikasi",
      vaultUnlockLead: "1.000 dompet terverifikasi pertama membuka transfer dan undian Founding 1,000.",
    },
    simulator: {
      eyebrow: "Simulator Kurva Bonding & Bagian Pool Musim 1",
      title: "Lihat cara kerja posisi masuk kurva dan poin Musim 1",
      slogan: "Semakin awal Anda membeli, semakin rendah harganya. Setiap pembelian menggerakkan kurva ke atas.",
      curveSliderLabel: "Pada titik kurva mana Anda masuk",
      curveStartTag: "0% (Awal kurva)",
      curveEndTag: "100% (Total pasokan kurva)",
      priceIndexLabel: "Indeks harga kurva ilustratif vs awal",
      relativePplLabel: "PPL relatif per unit vs awal kurva",
      illustrativeNote:
        "Indeks ilustratif dari rumus kurva protokol — bukan harga tetap atau janji keuntungan. Penjualan kembali dalam 30 hari dikenakan biaya keluar.",
      poolSectionTitle: "Perhitungan Jujur Bagian Pool Musim 1 (6.000.000 PPL)",
      poolFormulaLabel: "Rumus: poin Anda / total poin × 6.000.000 PPL",
      yourPointsLabel: "Perkiraan poin Musim 1 Anda",
      totalPointsLabel: "Asumsi total poin Musim 1 (semua peserta terverifikasi)",
      estimatedShareLabel: "Perkiraan bagian pool Musim 1 Anda",
      poolDisclaimer:
        "Hadiah dari pool tetap 6.000.000 PPL Musim 1, bukan imbal hasil finansial atau janji pendapatan.",
      ctaLockSeat: "Kunci Kursi Sebelum 1.000 Ditutup",
    },
  },
  zh: {
    stickyBar: {
      badge: "首千金库",
      messageFull:
        "PEOPLE Mainnet Beta · 12月1日开启 · 首千金库 满 1,000 钱包前保持密封",
      messageCompact: "PEOPLE Mainnet Beta · 12月1日 · 首千金库 满 1,000 钱包前保持密封",
      cta: "锁定席位 (60秒)",
      daysShort: "天",
      hoursShort: "时",
      minutesShort: "分",
      messageMobile: "首千金库 · 12月1日",
      ctaShort: "锁定席位",
    },
    drawer: {
      eyebrow: "首千金库",
      cta: "锁定席位 (60秒)",
      dismissAria: "关闭 Founding 1,000 提示",
      byRoute: {
        docs: {
          title: "正在阅读架构文档？锁定您的 Founding 1,000 席位。",
          body: "在 Telegram 中 20 秒完成验证（暂无需钱包）。名单与顺序在 1,000 个验证钱包锁定前保持密封。",
        },
        roadmap: {
          title: "PEOPLE Mainnet Beta 于 12 月 1 日开启 — 加入 Founding 1,000。",
          body: "通过 20 秒 Telegram 验证预留待定席位，并立即激活首单即享的 7% USDC 邀请链接。",
        },
        create: {
          title: "准备发行社区代币或 NFT？先领 Founding 1,000 席位。",
          body: "在 1,000 个钱包满额前完成验证的创作者可参与 Founding 1,000 PPL 奖金池抽奖，并享首单起 7% USDC 邀请佣金。",
        },
        explorer: {
          title: "正在浏览区块浏览器？预留 首千金库 席位。",
          body: "名单与顺序在 1,000 个验证钱包锁定前保持密封。",
        },
        wallet: {
          title: "将您的钱包绑定至 首千金库。",
          body: "第 1 步在 Telegram 仅需 20 秒；第 2 步连接钱包即可在 Founding 1,000 名单中密封席位。",
        },
        bounty: {
          title: "在 12 月 1 日前参与 Founding 1,000 PPL 奖金池抽奖。",
          body: "无需钱包 20 秒在 Telegram 完成验证，再连接钱包锁定席位并激活第 1 季积分。",
        },
        home: {
          title: "PEOPLE Mainnet Beta（12月1日）开启前，首千金库 已开放。",
          body: "名单与顺序在 1,000 个验证钱包锁定前保持密封。20 秒在 Telegram 完成验证。",
        },
        default: {
          title: "在 12 月 1 日前免费领取 首千金库 席位。",
          body: "名单与顺序在 1,000 个验证钱包锁定前保持密封。20 秒在 Telegram 开始验证。",
        },
      },
    },
    modal: {
      eyebrow: "首千金库 · PEOPLE Mainnet Beta (12月1日)",
      title: "在 12 月 1 日前免费领取 首千金库 席位",
      lead: "参与 Founding 1,000 奖金池抽奖以获取第 1 季奖池的额外 PPL，并激活首单起即享的 7% USDC 邀请链接。",
      rewardNote: "赏金池奖励，非金融理财收益。",
      sealedFraming:
        "名单与顺序在 1,000 个验证钱包锁定前保持密封 — 满额后解锁转账与 Founding 1,000 PPL 奖金池抽奖。",
      primaryTgCta: "在 Telegram 中验证 (20秒)",
      primaryTgSub: "通过 @PeopleVerifyBot 直接启动 — 第 1 步无需钱包（1 个手机号 = 1 位真人）。",
      orDivider: "或加入邮箱候补名单",
      emailLabel: "邮箱候补名单",
      emailPlaceholder: "you@example.com",
      emailSubmit: "加入候补名单",
      emailSubmitting: "保存中…",
      emailError: "请输入有效的电子邮箱地址。",
      emailSuccessTitle: "您已加入 Founding 1,000 候补名单。",
      emailSuccessBody:
        "现在前往 Telegram 完成 20 秒 @PeopleVerifyBot 验证，以获取额外第 1 季积分并锁定您的席位：",
      qrScanHint: "使用手机相机扫码，或点击上方按钮打开 @PeopleVerifyBot。",
      closeAria: "关闭 Founding 1,000 弹窗",
    },
    progress: {
      badgePrefix: "创始人",
      title: "Founding 1,000 验证进度",
      sealedNote: "名单与顺序在 1,000 个验证钱包锁定前保持密封。",
      step1Title: "第 1 步 · Telegram 验证（20秒，无需钱包）",
      step1Status: "Founding 1,000 待定席位（Pending）",
      step1Detail: "即时获得 7% USDC 邀请链接（无最低交易量要求）+ 第 1 季积分。",
      step1Cta: "在 Telegram 中验证 (20秒)",
      step2Title: "第 2 步 · 创建或连接钱包（计入 1,000 名额及抽奖券所必需）",
      step2Status: "已密封于 Founding 1,000 · 奖金池抽奖券已激活（50% 第 1 季积分）",
      step2Detail: "使用本地浏览器钱包或 MetaMask / Trust / WalletConnect 锁定您的席位。",
      step2Cta: "创建或连接钱包",
      step3Title: "第 3 步 · Human Passport",
      step3Status: "100% 第 1 季积分 + 免费 Founder NFT + 额外抽奖权重",
      step3Detail: "在 /founders#verify 完成真人护照验证以获得 100% 第 1 季积分权重。",
      step3Cta: "打开 Human Passport",
      referralReadyLabel: "您的 7% USDC 邀请链接：",
      copyReferral: "复制链接",
      copiedReferral: "已复制",
      expandAria: "展开创始人进度",
      collapseAria: "收起创始人进度",
      step1Short: "第 1 步：在 Telegram 验证（20秒）",
      step1ShortMobile: "第 1 步（20秒）",
      step2Short: "第 2 步：创建或连接钱包",
      step3Short: "第 3 步：Human Passport",
      detailsToggle: "详情",
      verifyShort: "验证",
      vaultUnlockLead: "前 1,000 个已验证钱包将解锁转账和 Founding 1,000 抽奖。",
    },
    simulator: {
      eyebrow: "联合曲线与第 1 季奖池份额模拟器",
      title: "了解曲线进入位置与第 1 季积分如何运作",
      slogan: "买得越早，价格越低。每一笔购买都会推动曲线上升。",
      curveSliderLabel: "您在曲线的哪个位置进入",
      curveStartTag: "0%（曲线起点）",
      curveEndTag: "100%（曲线总供应量）",
      priceIndexLabel: "相对于起点的曲线价格指数（示意）",
      relativePplLabel: "相对于起点的每单位可获 PPL 比例",
      illustrativeNote:
        "基于协议联合曲线公式的示意指数 — 非固定价格或收益承诺。30 天内提前回售需支付回售手续费。",
      poolSectionTitle: "透明的第 1 季奖池份额计算（6,000,000 PPL）",
      poolFormulaLabel: "公式：您的积分 / 总积分 × 6,000,000 PPL",
      yourPointsLabel: "您的预估第 1 季积分",
      totalPointsLabel: "假设的第 1 季总积分（所有已验证参与者）",
      estimatedShareLabel: "您的第 1 季奖池示意份额",
      poolDisclaimer:
        "来自第 1 季固定 6,000,000 PPL 赏金池的奖励，非金融收益或固定收入承诺。",
      ctaLockSeat: "在 1,000 名额关闭前锁定席位",
    },
  },
  ar: {
    stickyBar: {
      badge: "خزنة الألف",
      messageFull:
        "PEOPLE Mainnet Beta · يفتح 1 ديسمبر · خزنة الألف مختوم حتى 1,000 محفظة",
      messageCompact: "PEOPLE Mainnet Beta · 1 ديسمبر · خزنة الألف مختوم حتى 1,000 محفظة",
      cta: "احجز مقعدك (60 ثانية)",
      daysShort: "ي",
      hoursShort: "س",
      minutesShort: "د",
      messageMobile: "خزنة الألف · 1 ديسمبر",
      ctaShort: "احجز مقعدك",
    },
    drawer: {
      eyebrow: "خزنة الألف",
      cta: "احجز مقعدك (60 ثانية)",
      dismissAria: "إغلاق إشعار Founding 1,000",
      byRoute: {
        docs: {
          title: "تقرأ بنية الشبكة؟ احجز مقعدك في Founding 1,000.",
          body: "تحقق عبر Telegram في 20 ثانية (دون محفظة الآن). تظل القائمة والترتيب مختومين حتى يتم قفل 1,000 محفظة موثقة قبل انطلاق PEOPLE Mainnet Beta في 1 ديسمبر.",
        },
        roadmap: {
          title: "تفتح PEOPLE Mainnet Beta في 1 ديسمبر — انضم إلى Founding 1,000.",
          body: "ابدأ بتحقق Telegram خلال 20 ثانية لحجز مقعدك المعلق وتفعيل رابط الإحالة بنسبة 7% USDC.",
        },
        create: {
          title: "تخطط لإطلاق عملة أو NFT؟ احجز مقعدك في Founding 1,000.",
          body: "المبدعون الموثقون قبل اكتمال 1,000 محفظة يدخلون سحب Founding 1,000 PPL ويحصلون على 7% USDC من أول عملية شراء.",
        },
        explorer: {
          title: "تتصفح المستكشف؟ احجز مقعداً في خزنة الألف.",
          body: "تظل القائمة والترتيب مختومين حتى يتم قفل 1,000 محفظة موثقة.",
        },
        wallet: {
          title: "اربط محفظتك بـ خزنة الألف.",
          body: "الخطوة 1 تستغرق 20 ثانية في Telegram؛ الخطوة 2 تختم محفظتك في قائمة Founding 1,000.",
        },
        bounty: {
          title: "ادخل سحب Founding 1,000 PPL Bounty Draw قبل 1 ديسمبر.",
          body: "تحقق في Telegram خلال 20 ثانية دون محفظة، ثم اربط محفظتك لختم مقعدك.",
        },
        home: {
          title: "خزنة الألف مفتوح قبل انطلاق PEOPLE Mainnet Beta (1 ديسمبر).",
          body: "تظل القائمة والترتيب مختومين حتى يتم قفل 1,000 محفظة موثقة. تحقق عبر Telegram في 20 ثانية.",
        },
        default: {
          title: "احجز مقعداً مجانياً في خزنة الألف قبل 1 ديسمبر.",
          body: "تظل القائمة والترتيب مختومين حتى اكتمال 1,000 محفظة موثقة. ابدأ عبر Telegram في 20 ثانية.",
        },
      },
    },
    modal: {
      eyebrow: "خزنة الألف · PEOPLE Mainnet Beta (1 ديسمبر)",
      title: "احجز مقعداً مجانياً في خزنة الألف قبل 1 ديسمبر",
      lead: "ادخل سحب Founding 1,000 Bounty Draw للحصول على PPL إضافية من مجمع الموسم 1 وفعّل رابط الإحالة الخاص بك بنسبة 7% USDC من أول عملية شراء.",
      rewardNote: "مكافأة من مجمع الجوائز وليست عائداً مالياً.",
      sealedFraming:
        "تظل القائمة والترتيب مختومين حتى يتم قفل 1,000 محفظة موثقة — مما يفتح التحويلات وسحب Founding 1,000 PPL.",
      primaryTgCta: "تحقق عبر Telegram (20 ثانية)",
      primaryTgSub: "بدء فوري عبر @PeopleVerifyBot — لا حاجة لمحفظة في الخطوة 1 (هاتف واحد = إنسان واحد).",
      orDivider: "أو انضم إلى قائمة الانتظار عبر البريد الإلكتروني",
      emailLabel: "قائمة انتظار البريد الإلكتروني",
      emailPlaceholder: "you@example.com",
      emailSubmit: "انضم لقائمة الانتظار",
      emailSubmitting: "جارٍ الحفظ…",
      emailError: "أدخل عنوان بريد إلكتروني صالحاً.",
      emailSuccessTitle: "أنت الآن في قائمة انتظار Founding 1,000.",
      emailSuccessBody:
        "أكمل الآن تحقق @PeopleVerifyBot خلال 20 ثانية في Telegram لكسب نقاط إضافية للموسم 1 وقفل مقعدك:",
      qrScanHint: "امسح الرمز بكاميرا هاتفك أو اضغط على الزر أعلاه لفتح @PeopleVerifyBot.",
      closeAria: "إغلاق نافذة Founding 1,000",
    },
    progress: {
      badgePrefix: "مؤسس",
      title: "تقدّم التحقق في Founding 1,000",
      sealedNote: "تظل القائمة والترتيب مختومين حتى يتم قفل 1,000 محفظة موثقة.",
      step1Title: "الخطوة 1 · التحقق عبر Telegram (20 ثانية، دون محفظة)",
      step1Status: "قيد الانتظار في Founding 1,000",
      step1Detail: "رابط إحالة فوري بنسبة 7% USDC (دون حد أدنى) + نقاط الموسم 1.",
      step1Cta: "تحقق عبر Telegram (20 ثانية)",
      step2Title: "الخطوة 2 · إنشاء أو ربط محفظة (مطلوب لعدد الـ 1,000 + تذكرة السحب)",
      step2Status: "مختوم في Founding 1,000 · تذكرة سحب الجوائز مفعّلة (50% من نقاط الموسم 1)",
      step2Detail: "استخدم محفظة متصفح محلية أو MetaMask / Trust / WalletConnect لختم مقعدك.",
      step2Cta: "إنشاء أو ربط محفظة",
      step3Title: "الخطوة 3 · Human Passport",
      step3Status: "100% من نقاط الموسم 1 + Founder NFT مجاني + وزن إضافي في السحب",
      step3Detail: "أكمل إثبات الإنسانية في /founders#verify للحصول على وزن الموسم 1 الكامل.",
      step3Cta: "فتح Human Passport",
      referralReadyLabel: "رابط الإحالة الخاص بك (7% USDC):",
      copyReferral: "نسخ الرابط",
      copiedReferral: "تم النسخ",
      expandAria: "فتح تقدّم المؤسس",
      collapseAria: "طي تقدّم المؤسس",
      step1Short: "الخطوة 1: تحقق عبر Telegram (20 ثانية)",
      step1ShortMobile: "الخطوة 1 (20 ثانية)",
      step2Short: "الخطوة 2: إنشاء أو ربط محفظة",
      step3Short: "الخطوة 3: Human Passport",
      detailsToggle: "التفاصيل",
      verifyShort: "تحقق",
      vaultUnlockLead: "أول 1,000 محفظة موثقة تفتح التحويلات وسحب Founding 1,000.",
    },
    simulator: {
      eyebrow: "محاكي منحنى التسعير وحصة مجمع الموسم 1",
      title: "تعرّف على كيفية عمل نقطة الدخول في المنحنى ونقاط الموسم 1",
      slogan: "كلما اشتريت مبكراً، كان السعر أقل. كل عملية شراء تدفع المنحنى للأعلى.",
      curveSliderLabel: "في أي نقطة من المنحنى تدخل",
      curveStartTag: "0% (بداية المنحنى)",
      curveEndTag: "100% (إجمالي معروض المنحنى)",
      priceIndexLabel: "مؤشر سعر المنحنى التوضيحي مقارنة بالبداية",
      relativePplLabel: "نسبة PPL لكل وحدة مقارنة ببداية المنحنى",
      illustrativeNote:
        "مؤشر توضيحي من معادلة منحنى البروتوكول — وليس سعراً ثابتاً أو توقعاً للعائد. عمليات إعادة البيع خلال 30 يوماً تخضع لرسوم خروج.",
      poolSectionTitle: "حساب شفاف لحصة مجمع الموسم 1 (6,000,000 PPL)",
      poolFormulaLabel: "المعادلة: نقاطك / إجمالي النقاط × 6,000,000 PPL",
      yourPointsLabel: "نقاطك المقدّرة في الموسم 1",
      totalPointsLabel: "إجمالي نقاط الموسم 1 المفترض (جميع المشاركين الموثقين)",
      estimatedShareLabel: "حصتك التوضيحية من مجمع الموسم 1",
      poolDisclaimer:
        "مكافأة من مجمع الموسم 1 الثابت البالغ 6,000,000 PPL، وليست عائداً مالياً أو وعداً بدخل.",
      ctaLockSeat: "اقفل مقعدك قبل إغلاق الـ 1,000",
    },
  },
};

const STICKY_BAR_SHORT_DEFAULTS = {
  messageMobile: "Founding 1,000 Vault · Dec 1",
  ctaShort: "Claim Seat",
};

const PROGRESS_SHORT_DEFAULTS = {
  step1Short: "Step 1: Verify in Telegram (20s)",
  step1ShortMobile: "Step 1 (20s)",
  step2Short: "Step 2: Create or Connect Wallet",
  step3Short: "Step 3: Human Passport",
  detailsToggle: "Details",
  verifyShort: "Verify",
  vaultUnlockLead:
    "The first 1,000 verified wallets unlock transfers and the Founding 1,000 Bounty Draw.",
};

export function foundingCopy(lang: Language): FoundingCopy {
  const copy = FOUNDING_COPY[lang] ?? EN_COPY;
  return {
    ...copy,
    stickyBar: { ...STICKY_BAR_SHORT_DEFAULTS, ...copy.stickyBar },
    progress: { ...PROGRESS_SHORT_DEFAULTS, ...copy.progress },
  };
}

export function resolveDrawerRouteKey(pathname: string): FoundingDrawerRouteKey {
  if (pathname === "/" || pathname === "") return "home";
  if (pathname.startsWith("/docs") || pathname.startsWith("/litepaper")) return "docs";
  if (pathname.startsWith("/roadmap")) return "roadmap";
  if (pathname.startsWith("/create")) return "create";
  if (pathname.startsWith("/explorer")) return "explorer";
  if (pathname.startsWith("/wallet")) return "wallet";
  if (pathname.startsWith("/bounty")) return "bounty";
  return "default";
}
