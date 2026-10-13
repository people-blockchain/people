/**
 * Compact homepage (ecosystem hub) copy. Existing long-form strings in
 * `content.ts` remain the source for expandable / technical panels.
 */
import type { Language } from "./preferences";
import { FEE_SPLIT_PLAIN } from "./fee-split-public";
import hubAr from "./locales/surfaces/hub-ar.json" with { type: "json" };
import hubDe from "./locales/surfaces/hub-de.json" with { type: "json" };
import hubEs from "./locales/surfaces/hub-es.json" with { type: "json" };
import hubFr from "./locales/surfaces/hub-fr.json" with { type: "json" };
import hubId from "./locales/surfaces/hub-id.json" with { type: "json" };
import hubIt from "./locales/surfaces/hub-it.json" with { type: "json" };
import hubPt from "./locales/surfaces/hub-pt.json" with { type: "json" };
import hubTr from "./locales/surfaces/hub-tr.json" with { type: "json" };
import hubVi from "./locales/surfaces/hub-vi.json" with { type: "json" };
import hubZh from "./locales/surfaces/hub-zh.json" with { type: "json" };

const rawHub = {
  en: {
    hero: {
      tag: "PEOPLE'S BLOCKCHAIN",
      headlineMain: "PEOPLE'S",
      headlineAccent: "BLOCKCHAIN",
      headlineSecondary: "",
      slogan: "Created by people. For the community.",
      valueLine: "Community participates in the value created by the network.",
      lead:
        "Built by the community. Shared by the community. Ordinary people take part in issuance, network-fee routing, and Growth referral — while dedicated validators secure consensus. Participants are not validators.",
      unlike:
        "On a typical blockchain, users mostly pay fees. Here, community participation is designed into the economy.",
      ctaJoin: "Join",
      ctaHow: "How it works",
      ctaCreate: "Create a token",
      pillars: [
        {
          id: "allocation",
          value: "10%",
          title: "10% to the community pool",
          note: "Of every new token's supply goes to the community pool.",
        },
        {
          id: "fees",
          value: "Fees",
          title: "Network fees",
          note: "Routed through the network economy.",
        },
        {
          id: "partner",
          value: "70/30",
          title: "Growth referral",
          note: "Two paid lines: L1 70% · L2 30% of the Growth reward budget.",
        },
      ],
      flowAria: "How community value moves through the network",
      flowPause: "Pause animation",
      flowPlay: "Play animation",
      flowSteps: [
        { id: "created", label: "Token created", sub: "A project launches on the network" },
        {
          id: "community",
          label: "10% community + network fee",
          sub: "Part of the new token and the protocol fee stay separate",
        },
        {
          id: "economy",
          label: "Network economy + Growth Pool",
          sub: "Value is routed, not vanished",
        },
        { id: "lines", label: "L1 70% → L2 30%", sub: "Two paid Growth referral lines" },
      ],
    },
    value: {
      id: "community-value",
      tag: "WHY PARTICIPATE",
      title: "Three distinct ways the community takes part",
      subtitle:
        "Token issuance, network fees, and Growth referral are three separate mechanisms. They are never merged into one personal payout.",
      cards: [
        {
          id: "allocation",
          kicker: "TOKEN FACTORY",
          title: "10% of every new token goes to the community pool",
          body: "Every standard token launched through the network sends 10% of its initial supply to that token’s Community Pool — then to the community. Not a personal payout, and not 10% of every fee.",
          href: "/create/token",
          cta: "Create a token",
        },
        {
          id: "fees",
          kicker: "NETWORK ECONOMY",
          title: "Fees don’t disappear — they are routed",
          body: `${FEE_SPLIT_PLAIN.en} This is network-economy routing, not a promise that every participant is paid from every fee.`,
          href: "#economics",
          cta: "Fee routing",
        },
        {
          id: "partner",
          kicker: "GROWTH REFERRAL",
          title: "L1 70% · L2 30% of the Growth reward budget",
          body: "Growth Pool (15% of eligible fees) funds two paid referral lines: L1 at 70% and L2 at 30% of the Growth reward budget. Distinct from Token Factory supply and from the network fee split.",
          href: "#partner",
          cta: "Growth referral",
        },
      ],
    },
    partner: {
      id: "partner",
      tag: "GROWTH REFERRAL",
      title: "You → L1 → L2",
      subtitle:
        "Active Beta Growth payout: L1 70% · L2 30% of the Growth reward budget. Growth Pool is 15% of eligible fees. Distinct from network fee destinations and from the 10% of each new token that goes to the community pool.",
      you: "You",
      budgetNote:
        "Percentages are shares of the Growth reward budget after 15% of each protocol fee goes to the Growth Pool — not shares of every network fee.",
      detailsTitle: "How Growth referral works",
      details: [
        {
          title: "Two paid lines",
          body: "L1 (direct referral) receives 70% and L2 (second level) receives 30% of the active Growth reward budget.",
        },
        {
          title: "Separate from fees and tokens",
          body: "L1/L2 Growth weights are not the network fee split and not the 10% of each new token for the community pool. Growth Pool receives 15% of each protocol fee with its own settlement rules.",
        },
        {
          title: "This site",
          body: "There is no referral login or dashboard on this public website. Growth referral lives with network participation.",
        },
      ],
    },
    join: {
      id: "join",
      tag: "JOIN",
      title: "How to participate",
      subtitle:
        "Join People’s Blockchain as a community participant — from a phone, tablet, or browser.",
      steps: [
        {
          num: "01",
          title: "Start here",
          body: "Use a phone, tablet, or browser. You join as a participant — not as a consensus validator.",
          href: "#join",
          cta: "",
        },
        {
          num: "02",
          title: "Create a non-custodial wallet",
          body: "Generate a 12-word phrase in the browser and encrypt it with a password, or sign in with Google for a synced wallet. With the 12-word wallet, keys never leave this device.",
          href: "/wallet",
          cta: "Open wallet",
        },
        {
          num: "03",
          title: "See assets on the explorer",
          body: "Look up blocks, transactions, addresses, tokens, and NFTs on the public scanner.",
          href: "/explorer",
          cta: "Open explorer",
        },
        {
          num: "04",
          title: "Take part in the economy",
          body: "Pay Token Factory and NFT mint fees from the same wallet. The 10% community-pool share on new tokens, network fees, and Growth referral stay three separate mechanisms.",
          href: "/create",
          cta: "Create",
        },
      ],
      ctaJoin: "Join People’s Blockchain",
      ctaHow: "How it works",
    },
    whatIs: {
      id: "what-is",
      tag: "WHAT",
      title: "What is People's Blockchain?",
      summary:
        "People's Blockchain is community infrastructure: ordinary devices for participation, protocol-level creation of tokens and projects, and Proof-of-Stake validators for block production. Participants are not validators.",
      items: [
        {
          id: "consensus",
          title: "Consensus",
          summary: "PoS validators propose and attest blocks. Mobile participation never votes in quorum.",
        },
        {
          id: "economics",
          title: "Economics",
          summary: `${FEE_SPLIT_PLAIN.en} User-token markets are a separate pipeline.`,
        },
        {
          id: "participation",
          title: "Participation",
          summary: "Phones, tablets, and browsers. Participants are not validators.",
        },
        {
          id: "technology",
          title: "Technology",
          summary: "Integer-safe multi-asset ledger, a peer network, and tools to explore the chain.",
        },
      ],
      whyTitle: "Why it exists",
      learnMore: "Learn more",
    },
    whatCanIDo: {
      id: "what-can-i-do",
      tag: "ROLES",
      title: "What can I do?",
      subtitle: "Pick a role. Details stay one click away.",
      cards: [
        {
          id: "build",
          title: "BUILD",
          summary: "Launch tokens, projects, and community economies with protocol rules.",
          href: "/create",
        },
        {
          id: "validate",
          title: "VALIDATE",
          summary: "Run infrastructure that proposes, attests, and finalizes blocks.",
          href: "#network",
        },
        {
          id: "participate",
          title: "PARTICIPATE",
          summary: "Join from everyday devices. Not a consensus validator role.",
          href: "/wallet",
        },
        {
          id: "grow",
          title: "GROW",
          summary: "Growth Pool receives 15% of each protocol fee — not guaranteed or passive income.",
          href: "#economics",
        },
        {
          id: "explore",
          title: "EXPLORE",
          summary: "Look up blocks, transactions, tokens, and NFTs.",
          href: "/explorer",
        },
      ],
    },
    flow: {
      id: "how-the-network-works",
      tag: "HOW",
      title: "How it works",
      subtitle: "One path through the network. Open a step for the exact mechanic.",
      steps: [
        {
          id: "user",
          title: "USER",
          summary: "A person with a wallet on a phone, tablet, or browser.",
          detail:
            "Start with a non-custodial account on a phone, tablet, or browser. You join as a person in the community — not as a validator.",
        },
        {
          id: "transaction",
          title: "TRANSACTION",
          summary: "Transfers, launches, curve trades, and other signed operations.",
          detail:
            "Eligible operations pay a protocol fee in PPL. Every action is signed and checked before it is accepted.",
        },
        {
          id: "validator",
          title: "VALIDATOR",
          summary: "Stake-backed nodes that propose and attest.",
          detail:
            "Validators are dedicated infrastructure. Phones and browsers do not produce blocks.",
        },
        {
          id: "block",
          title: "BLOCK",
          summary: "Ordered, integer-safe state transition.",
          detail:
            "Validators assemble signed operations into blocks. Everyday devices do not sit in that process.",
        },
        {
          id: "network",
          title: "NETWORK",
          summary: "Shared chain among validator nodes.",
          detail:
            "Validator nodes share blocks with each other so the network stays in one state.",
        },
        {
          id: "community",
          title: "COMMUNITY",
          summary: "Network fees and each token's community share stay in separate pipelines.",
          detail:
            `${FEE_SPLIT_PLAIN.en} Standard user-created tokens send 10% of that token's supply to its own community pool — that is not a network fee.`,
        },
      ],
      storyCta: "Full visual story",
    },
    ppl: {
      id: "ppl",
      tag: "NATIVE ASSET",
      title: "People (PPL)",
      summary:
        "People is the native asset of People's Blockchain. Ticker: PPL.",
      cards: [
        {
          title: "UTILITY",
          body: "Settlement asset for network operations: fees, token creation, and protocol services described in the specs.",
        },
        {
          title: "NETWORK",
          body: "Denominates eligible protocol fees that the live fee splitter routes with the 30/25/20/10/15/0 split.",
        },
        {
          title: "FEES",
          body: "Paid in PPL on eligible operations. Exact fee schedules remain protocol/config — this page does not invent rates.",
        },
        {
          title: "PARTICIPATION",
          body: "Used in network-economy accounting. Participation Power is not a transferable token and is not validator voting power.",
        },
      ],
      notMarket:
        "This site does not publish price, market cap, listings, ROI, APY, liquidity depth, or future price.",
    },
    network: {
      id: "network",
      tag: "NETWORK",
      title: "Network & validators",
      summary:
        "Consensus is Proof-of-Stake with a leader and an attestation quorum. Phones are participants, not validators.",
      facts: [
        {
          label: "Role",
          value: "Validators secure the chain; participants never sit in quorum.",
        },
        {
          label: "Who runs what",
          value: "Dedicated nodes propose and attest blocks. Phones, tablets, and browsers join as participants.",
        },
        {
          label: "Public network",
          value: "Public testnet v2 is running. This is not Mainnet.",
        },
      ],
      caveat: "",
    },
    economics: {
      id: "economics",
      tag: "NETWORK FEES",
      title: "Network fee economics",
      summary: FEE_SPLIT_PLAIN.en,
      splits: [
        { label: "Validators", pct: 30, tone: "brand" as const },
        { label: "Community Pool", pct: 25, tone: "value" as const },
        { label: "Treasury", pct: 20, tone: "violet" as const },
        { label: "Liquidity & Ecosystem", pct: 10, tone: "warm" as const },
        { label: "Growth Pool", pct: 15, tone: "brand" as const },
        { label: "Burn", pct: 0, tone: "neutral" as const },
      ],
      growthNote:
        "Growth Pool receives 15% of eligible fees. It is not guaranteed income, not a passive return, and not an investment product.",
      detailsTitle: "How fee routing works",
      detailsBody:
        `${FEE_SPLIT_PLAIN.en} After whole-number division, any remainder stays with validators. The 10% of each new token that goes to the community pool is a different path — not a network fee.`,
      storyLink: "How rewards are explained",
    },
    tokenMarket: {
      id: "token-market",
      tag: "TOKEN MARKET",
      title: "Create → Launch → Discover → Trade",
      subtitle:
        "Create a token, launch it with built-in pricing, let others find it, and trade on the launch curve.",
      steps: [
        { title: "Create", body: "Use the Token Factory form: image, name, ticker, supply, then pay in PPL." },
        { title: "Launch", body: "A virtual bonding curve provides continuous pricing from the first block." },
        { title: "Discover", body: "Assets appear in the network registry so communities can find them." },
        {
          title: "Trade",
          body: "Buy and sell on the launch curve, then swap in the live token/PPL AMM pool.",
        },
      ],
      expandTitle: "Launch curve, liquidity, vesting",
      expandItems: [
        "Launch pricing uses a constant-product curve with exact integer math.",
        "A protocol trading fee on the curve is routed through network fee economics.",
        "Standard launch split includes a mandatory 10% of that token's supply to its own community pool (not a PPL network fee).",
        "Creator vesting keeps most of the creator's share unlocking over time, so the community is not dumped on day one.",
      ],
      createCta: "Open Token Factory",
      nftCta: "Create an NFT",
      swapCta: "Open swap",
    },
    technology: {
      id: "technology",
      tag: "TECHNOLOGY",
      title: "Technology",
      subtitle: "What the stack is. Open a card for the user-facing idea.",
      cards: [
        {
          title: "Consensus",
          summary: "Proof-of-Stake validators propose and attest blocks. Phones do not vote.",
        },
        {
          title: "State",
          summary: "Exact integer balances across native PPL and user-created tokens.",
        },
        {
          title: "Network",
          summary: "Validator nodes share blocks so the chain stays in one state.",
        },
        {
          title: "Persistence",
          summary: "Each validator keeps the live network state it needs to keep going.",
        },
        {
          title: "Security",
          summary: "Signed actions, role separation, and no shortcuts around checks.",
        },
        {
          title: "Tools",
          summary: "HTTP API and explorer so people can read the network.",
        },
      ],
      archTitle: "Interactive architecture",
      invTitle: "Mathematical invariants",
    },
    roadmap: {
      id: "roadmap",
      tag: "ROADMAP",
      title: "Where the network is",
      subtitle: "Product stages. No launch date is announced here.",
      columns: [
        {
          id: "current",
          title: "CURRENT",
          items: [
            "Ledger, community accounting, and network-fee routing.",
            "Token creation and launch-curve markets.",
            "Community participation in issuance, fees, and Growth referral.",
          ],
        },
        {
          id: "testnet",
          title: "TESTNET",
          items: [
            "A public testnet is running.",
            "This is not Mainnet and not a promise of live public trading of value.",
          ],
        },
        {
          id: "beta",
          title: "BETA",
          items: ["Wider public access is the next community stage."],
        },
        {
          id: "future",
          title: "FUTURE",
          items: [
            "Human network: mobile participation, proof of humanity, and anti-farming.",
            "Public launch date is not announced on this site.",
          ],
        },
      ],
    },
    documentation: {
      id: "documentation",
      tag: "DOCS",
      title: "Documentation",
      summary: "Wallets, participation and your own node — start with the practical guide.",
      links: [
        { href: "/docs", label: "Read the guide", hint: "First steps, rewards and node setup" },
        {
          href: "#economics",
          label: "Network fees",
          hint: "30/25/20/10/15/0 routing of PPL fees",
        },
      ],
    },
  },
  ru: {
    hero: {
      tag: "СЕТЬ ДЛЯ СООБЩЕСТВА",
      headlineMain: "БЛОКЧЕЙН",
      headlineAccent: "ДЛЯ СООБЩЕСТВА",
      headlineSecondary: "",
      slogan: "Создано людьми. Для сообщества.",
      valueLine: "Сообщество участвует в ценности, которую создаёт сеть.",
      lead:
        "Создано сообществом. Разделяется сообществом. Обычные люди участвуют в эмиссии, маршрутизации сетевых комиссий и Growth-рефералах — а консенсус обеспечивают отдельные валидаторы. Участники не являются валидаторами.",
      unlike:
        "В обычном блокчейне пользователь в основном платит комиссии. Здесь участие сообщества заложено в экономику.",
      ctaJoin: "Стать участником",
      ctaHow: "Как это работает",
      ctaCreate: "Создать токен",
      pillars: [
        {
          id: "allocation",
          value: "10%",
          title: "10% — в пул сообщества",
          note: "От каждого нового токена идёт в пул сообщества.",
        },
        {
          id: "fees",
          value: "Fees",
          title: "Сетевые комиссии",
          note: "Идут через экономику сети.",
        },
        {
          id: "partner",
          value: "70/30",
          title: "Growth-реферал",
          note: "Две оплачиваемые линии: L1 70% · L2 30% бюджета награды Growth.",
        },
      ],
      flowAria: "Как ценность сообщества движется по сети",
      flowPause: "Пауза анимации",
      flowPlay: "Запустить анимацию",
      flowSteps: [
        { id: "created", label: "Токен создан", sub: "Проект запускается в сети" },
        {
          id: "community",
          label: "10% сообществу + сетевая комиссия",
          sub: "Доля нового токена и комиссия протокола разделены",
        },
        {
          id: "economy",
          label: "Экономика сети + Growth Pool",
          sub: "Ценность маршрутизируется, а не исчезает",
        },
        { id: "lines", label: "L1 70% → L2 30%", sub: "Две оплачиваемые линии Growth-реферала" },
      ],
    },
    value: {
      id: "community-value",
      tag: "ЗАЧЕМ УЧАСТВОВАТЬ",
      title: "Три разных способа участия сообщества",
      subtitle:
        "Эмиссия токенов, сетевые комиссии и Growth-реферал — три отдельных механизма. Они не сливаются в одну личную выплату.",
      cards: [
        {
          id: "allocation",
          kicker: "TOKEN FACTORY",
          title: "10% каждого нового токена — в пул сообщества",
          body: "Каждый стандартный токен, выпущенный через сеть, направляет 10% начального предложения в Community Pool этого токена — затем сообществу. Не личная выплата и не 10% с каждой комиссии.",
          href: "/create/token",
          cta: "Создать токен",
        },
        {
          id: "fees",
          kicker: "ЭКОНОМИКА СЕТИ",
          title: "Комиссии не исчезают — они маршрутизируются",
          body: `${FEE_SPLIT_PLAIN.ru} Это маршрутизация экономики сети, а не обещание, что каждый участник получает долю с каждой комиссии.`,
          href: "#economics",
          cta: "Маршрутизация комиссий",
        },
        {
          id: "partner",
          kicker: "GROWTH-РЕФЕРАЛ",
          title: "L1 70% · L2 30% бюджета награды Growth",
          body: "Growth Pool (15% допустимых комиссий) финансирует две оплачиваемые реферальные линии: L1 — 70% и L2 — 30% бюджета награды Growth. Это отдельно от доли Token Factory для сообщества и от сплита сетевых комиссий.",
          href: "#partner",
          cta: "Growth-реферал",
        },
      ],
    },
    partner: {
      id: "partner",
      tag: "GROWTH-РЕФЕРАЛ",
      title: "Вы → L1 → L2",
      subtitle:
        "Активная Beta-выплата Growth: L1 70% · L2 30% бюджета награды Growth. Growth Pool — 15% допустимых комиссий. Это отдельно от направлений сетевых комиссий и от 10% каждого нового токена в пул сообщества.",
      you: "Вы",
      budgetNote:
        "Проценты — доли бюджета награды Growth после того, как 15% каждой комиссии протокола идёт в Growth Pool, а не доли каждой сетевой комиссии.",
      detailsTitle: "Как работает Growth-реферал",
      details: [
        {
          title: "Две оплачиваемые линии",
          body: "L1 (прямой реферал) получает 70%, L2 (второй уровень) — 30% активного бюджета награды Growth.",
        },
        {
          title: "Отдельно от комиссий и токенов",
          body: "Веса L1/L2 Growth — не сплит сетевых комиссий и не 10% каждого нового токена в пул сообщества. Growth Pool — 15% от комиссии протокола со своими правилами settlement.",
        },
        {
          title: "Этот сайт",
          body: "На этом публичном сайте нет реферального входа и дашборда. Growth-реферал живёт вместе с участием в сети.",
        },
      ],
    },
    join: {
      id: "join",
      tag: "JOIN",
      title: "Как участвовать",
      subtitle:
        "Присоединяйтесь к блокчейну для сообщества как участник — со смартфона, планшета или из браузера.",
      steps: [
        {
          num: "01",
          title: "Начните здесь",
          body: "Телефон, планшет или браузер. Вы входите как участник — не как валидатор консенсуса.",
          href: "#join",
          cta: "",
        },
        {
          num: "02",
          title: "Создайте некастодиальный кошелёк",
          body: "Сгенерируйте фразу из 12 слов в браузере и зашифруйте её паролем, либо войдите через Google для синхронизированного кошелька. У кошелька с фразой ключи не покидают устройство.",
          href: "/wallet",
          cta: "Открыть кошелёк",
        },
        {
          num: "03",
          title: "Посмотрите активы в сети",
          body: "Блоки, транзакции, адреса, токены и NFT в публичном сканере.",
          href: "/explorer",
          cta: "Открыть сканер",
        },
        {
          num: "04",
          title: "Участвуйте в экономике",
          body: "Комиссии Token Factory и минта NFT оплачиваются из того же кошелька. 10% новых токенов в пул сообщества, сетевые комиссии и Growth-реферал — три отдельных механизма.",
          href: "/create",
          cta: "Создать",
        },
      ],
      ctaJoin: "Присоединиться к блокчейну для сообщества",
      ctaHow: "Как это работает",
    },
    whatIs: {
      id: "what-is",
      tag: "ЧТО ЭТО",
      title: "Что такое блокчейн для сообщества?",
      summary:
        "Блокчейн для сообщества — инфраструктура, где обычные устройства для участия, протокольное создание токенов и проектов и PoS-валидаторы для блоков работают вместе. Участники не являются валидаторами.",
      items: [
        {
          id: "consensus",
          title: "Консенсус",
          summary: "Валидаторы предлагают и аттестуют блоки. Мобильное участие не голосует в кворуме.",
        },
        {
          id: "economics",
          title: "Экономика",
          summary: `${FEE_SPLIT_PLAIN.ru} Рынок пользовательских токенов — отдельный контур.`,
        },
        {
          id: "participation",
          title: "Участие",
          summary: "Телефон, планшет, браузер. Участники не являются валидаторами.",
        },
        {
          id: "technology",
          title: "Технология",
          summary: "Целочисленный мультиактивный реестр, сеть узлов и инструменты, чтобы читать цепь.",
        },
      ],
      whyTitle: "Зачем это существует",
      learnMore: "Подробнее",
    },
    whatCanIDo: {
      id: "what-can-i-do",
      tag: "РОЛИ",
      title: "Что я могу делать?",
      subtitle: "Выберите роль. Подробности — по запросу.",
      cards: [
        {
          id: "build",
          title: "BUILD",
          summary: "Запускать токены, проекты и экономики сообществ по правилам протокола.",
          href: "/create",
        },
        {
          id: "validate",
          title: "VALIDATE",
          summary: "Держать инфраструктуру, которая предлагает, аттестует и финализирует блоки.",
          href: "#network",
        },
        {
          id: "participate",
          title: "PARTICIPATE",
          summary: "Подключаться с обычных устройств. Это не роль валидатора консенсуса.",
          href: "/wallet",
        },
        {
          id: "grow",
          title: "GROW",
          summary: "Growth Pool — 15% от комиссии протокола, не гарантированный и не пассивный доход.",
          href: "#economics",
        },
        {
          id: "explore",
          title: "EXPLORE",
          summary: "Смотреть блоки, транзакции, токены и NFT.",
          href: "/explorer",
        },
      ],
    },
    flow: {
      id: "how-the-network-works",
      tag: "КАК",
      title: "Как это работает",
      subtitle: "Один путь по сети. Откройте шаг, чтобы увидеть механику.",
      steps: [
        {
          id: "user",
          title: "USER",
          summary: "Человек с кошельком на телефоне, планшете или в браузере.",
          detail:
            "Старт — некастодиальный аккаунт на телефоне, планшете или в браузере. Вы входите как человек в сообществе — не как валидатор.",
        },
        {
          id: "transaction",
          title: "TRANSACTION",
          summary: "Переводы, запуски, сделки на кривой и другие подписанные операции.",
          detail:
            "Допустимая операция платит комиссию протокола в PPL. Каждое действие подписывается и проверяется до принятия.",
        },
        {
          id: "validator",
          title: "VALIDATOR",
          summary: "Узлы со стейком: предлагают и аттестуют.",
          detail:
            "Валидаторы — выделенная инфраструктура. Телефоны и браузеры блоки не производят.",
        },
        {
          id: "block",
          title: "BLOCK",
          summary: "Упорядоченный целочисленный переход состояния.",
          detail:
            "Валидаторы собирают подписанные операции в блоки. Обычные устройства в этом процессе не участвуют.",
        },
        {
          id: "network",
          title: "NETWORK",
          summary: "Общая цепь между узлами валидаторов.",
          detail:
            "Узлы валидаторов обмениваются блоками, чтобы сеть оставалась в одном состоянии.",
        },
        {
          id: "community",
          title: "COMMUNITY",
          summary: "Сетевые комиссии и доля каждого токена для сообщества учитываются раздельно.",
          detail:
            `${FEE_SPLIT_PLAIN.ru} Стандартный пользовательский токен направляет 10% своего предложения в собственный пул сообщества — это не сетевая комиссия.`,
        },
      ],
      storyCta: "Полная визуальная история",
    },
    ppl: {
      id: "ppl",
      tag: "NATIVE ASSET",
      title: "People (PPL)",
      summary:
        "People — нативный актив блокчейна для сообщества. Тикер: PPL.",
      cards: [
        {
          title: "UTILITY",
          body: "Расчётный актив операций сети: комиссии, создание токенов и сервисы протокола, описанные в спецификациях.",
        },
        {
          title: "NETWORK",
          body: "Номинирует допустимые комиссии протокола, которые живой сплиттер делит по правилу 30/25/20/10/15/0.",
        },
        {
          title: "FEES",
          body: "На допустимых операциях платятся в PPL. Ставки на этой странице не выдумываются.",
        },
        {
          title: "PARTICIPATION",
          body: "Участвует в учёте экономики сети. Сила Участия — не передаваемый токен и не голос валидатора.",
        },
      ],
      notMarket:
        "На этом сайте нет цены, капитализации, листингов, ROI, APY, глубины ликвидности и прогноза цены.",
    },
    network: {
      id: "network",
      tag: "СЕТЬ",
      title: "Сеть и валидаторы",
      summary:
        "Консенсус — Proof-of-Stake с лидером и кворумом аттестаций. Телефоны — участники, не валидаторы.",
      facts: [
        {
          label: "Роль",
          value: "Валидаторы защищают цепь; участники в кворум не входят.",
        },
        {
          label: "Кто что запускает",
          value: "Выделенные узлы предлагают и аттестуют блоки. Телефоны, планшеты и браузеры входят как участники.",
        },
        {
          label: "Публичная сеть",
          value: "Публичный testnet v2 работает. Это не Mainnet.",
        },
      ],
      caveat: "",
    },
    economics: {
      id: "economics",
      tag: "СЕТЕВЫЕ КОМИССИИ",
      title: "Экономика сетевых комиссий",
      summary: FEE_SPLIT_PLAIN.ru,
      splits: [
        { label: "Валидаторы", pct: 30, tone: "brand" as const },
        { label: "Пул сообщества", pct: 25, tone: "value" as const },
        { label: "Казна", pct: 20, tone: "violet" as const },
        { label: "Ликвидность и экосистема", pct: 10, tone: "warm" as const },
        { label: "Growth Pool", pct: 15, tone: "brand" as const },
        { label: "Сжигание", pct: 0, tone: "neutral" as const },
      ],
      growthNote:
        "Growth Pool получает 15% допустимых комиссий. Это не гарантированный доход, не пассивная доходность и не инвестиционный продукт.",
      detailsTitle: "Как устроена маршрутизация комиссий",
      detailsBody:
        `${FEE_SPLIT_PLAIN.ru} После целочисленного деления остаток остаётся у валидаторов. 10% каждого нового токена в пул сообщества — другой контур, не сетевая комиссия.`,
      storyLink: "Как объясняются награды",
    },
    tokenMarket: {
      id: "token-market",
      tag: "РЫНОК ТОКЕНОВ",
      title: "Создать → Запустить → Найти → Торговать",
      subtitle:
        "Создайте токен, запустите его с встроенной ценой, дайте другим его найти и торгуйте на кривой запуска.",
      steps: [
        { title: "Создать", body: "Откройте «Создать»: картинка, имя, тикер, эмиссия, затем комиссия в PPL из конфигурации." },
        { title: "Запустить", body: "Виртуальная кривая даёт непрерывную цену с первого блока." },
        { title: "Найти", body: "Активы видны в реестре сети, чтобы сообщества могли их найти." },
        {
          title: "Торговать",
          body: "Покупка и продажа на кривой запуска, затем обмен в действующем AMM-пуле токен/PPL.",
        },
      ],
      expandTitle: "Кривая запуска, ликвидность, вестинг",
      expandItems: [
        "Цена запуска считается по кривой постоянного произведения с точной целочисленной математикой.",
        "Протокольная комиссия кривой идёт через экономику сетевых комиссий.",
        "Стандартный запуск включает обязательные 10% предложения этого токена в его собственный пул (это не сетевая комиссия PPL).",
        "Вестинг автора разблокирует большую часть его доли со временем, чтобы сообщество не получило сброс в первый день.",
      ],
      createCta: "Открыть фабрику токенов",
      nftCta: "Создать NFT",
      swapCta: "Открыть обмен",
    },
    technology: {
      id: "technology",
      tag: "ТЕХНОЛОГИЯ",
      title: "Технология",
      subtitle: "Что это за стек. Откройте карточку, чтобы увидеть пользовательский смысл.",
      cards: [
        {
          title: "Консенсус",
          summary: "Валидаторы Proof-of-Stake предлагают и аттестуют блоки. Телефоны не голосуют.",
        },
        {
          title: "Состояние",
          summary: "Точные целочисленные балансы для нативного PPL и пользовательских токенов.",
        },
        {
          title: "Сеть",
          summary: "Узлы валидаторов обмениваются блоками, чтобы цепь оставалась одной.",
        },
        {
          title: "Сохранность",
          summary: "Каждый валидатор хранит живое состояние сети, которое нужно, чтобы продолжать работу.",
        },
        {
          title: "Безопасность",
          summary: "Подписанные действия, разделение ролей и никаких обходов проверок.",
        },
        {
          title: "Инструменты",
          summary: "HTTP API и эксплорер, чтобы люди могли читать сеть.",
        },
      ],
      archTitle: "Интерактивная архитектура",
      invTitle: "Математические инварианты",
    },
    roadmap: {
      id: "roadmap",
      tag: "ДОРОЖНАЯ КАРТА",
      title: "Где сейчас сеть",
      subtitle: "Продуктовые этапы. Даты запуска здесь нет.",
      columns: [
        {
          id: "current",
          title: "CURRENT",
          items: [
            "Реестр, учёт сообщества и маршрутизация сетевых комиссий.",
            "Создание токенов и рынки кривой запуска.",
            "Участие сообщества в эмиссии, комиссиях и Growth-реферале.",
          ],
        },
        {
          id: "testnet",
          title: "TESTNET",
          items: [
            "Публичный testnet работает.",
            "Это не Mainnet и не обещание живой публичной торговли ценностью.",
          ],
        },
        {
          id: "beta",
          title: "BETA",
          items: ["Более широкий публичный доступ — следующий этап сообщества."],
        },
        {
          id: "future",
          title: "FUTURE",
          items: [
            "Сеть людей: мобильное участие, подтверждение человечности и защита от накрутки.",
            "Даты публичного запуска на этом сайте нет.",
          ],
        },
      ],
    },
    documentation: {
      id: "documentation",
      tag: "ДОКУМЕНТЫ",
      title: "Документация",
      summary: "Кошелёк, участие и своя нода — начните с практического руководства.",
      links: [
        { href: "/docs", label: "Открыть руководство", hint: "Первые шаги, награды и запуск ноды" },
        {
          href: "#economics",
          label: "Сетевые комиссии",
          hint: "Маршрутизация комиссий PPL 30/25/20/10/15/0",
        },
      ],
    },
  },
  es: hubEs,
  pt: hubPt,
  fr: hubFr,
  de: hubDe,
  it: hubIt,
  tr: hubTr,
  vi: hubVi,
  id: hubId,
  zh: hubZh,
  ar: hubAr,
} as const;

export type HubLocale = typeof rawHub.en;

export const hub: Record<Language, HubLocale> = new Proxy(rawHub as unknown as Record<Language, HubLocale>, {
  get: (target, prop: string) => target[prop as Language] ?? target.en,
});
