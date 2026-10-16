import type { Language } from "@/lib/preferences";
import factoryAr from "./locales/surfaces/factory-ar.json" with { type: "json" };
import factoryDe from "./locales/surfaces/factory-de.json" with { type: "json" };
import factoryEs from "./locales/surfaces/factory-es.json" with { type: "json" };
import factoryFr from "./locales/surfaces/factory-fr.json" with { type: "json" };
import factoryId from "./locales/surfaces/factory-id.json" with { type: "json" };
import factoryIt from "./locales/surfaces/factory-it.json" with { type: "json" };
import factoryPt from "./locales/surfaces/factory-pt.json" with { type: "json" };
import factoryTr from "./locales/surfaces/factory-tr.json" with { type: "json" };
import factoryVi from "./locales/surfaces/factory-vi.json" with { type: "json" };
import factoryZh from "./locales/surfaces/factory-zh.json" with { type: "json" };

export type FactoryCopyContent = {
  navLabel: string;
  tokenNav: string;
  nftNav: string;
  contractNav: string;
  contractLead: string;
  feesLink: string;
  hub: {
    tag: string;
    title: string;
    subtitle: string;
    tokenCta: string;
    nftCta: string;
    contractCta: string;
    escrowCta: string;
    crowdfundCta: string;
    lavkaCta: string;
    escrowLead: string;
    crowdfundLead: string;
    lavkaLead: string;
    statusUnavailable: string;
    statusTestnet: string;
  };
  token: {
    title: string;
    lead: string;
    steps: string[];
  };
  nft: {
    title: string;
    lead: string;
    steps: string[];
    modeSingle: string;
    modeCollection: string;
    collectionLabel: string;
  };
  form: {
    image: string;
    imageHint: string;
    imageUrl: string;
    name: string;
    description: string;
    ticker: string;
    supply: string;
    decimals: string;
    review: string;
    pay: string;
    result: string;
    next: string;
    back: string;
    submit: string;
    another: string;
    wallet: string;
    createWallet: string;
    importWallet: string;
    address: string;
    balance: string;
    nonce: string;
    privateKey: string;
    feeLabel: string;
    feeUnset: string;
    noRpc: string;
    allocation: string;
    success: string;
    assetId: string;
    nftId: string;
    txId: string;
    error: string;
    payWithLabel: string;
    payWithPpl: string;
    stableFeeLabel: string;
    stableFeeBuybackNote: string;
    stableFeeNetworkNote: string;
    approvingStable: string;
    payingStableFee: string;
    creatingAfterStableFee: string;
    leftoverTitle: string;
    leftoverHint: string;
    leftoverBurnLabel: string;
    leftoverBurnHint: string;
    leftoverPoolLabel: string;
    leftoverPoolHint: string;
    launchSummary: string;
    /** Optional creator promo share (owner decision 2026-10-13); EVM token launch only. */
    promoTitle: string;
    promoLead: string;
    promoOptionNone: string;
    promoOptionLabel: string;
    promoSource: string;
    promoRules: string;
    allocationTitle: string;
    allocationCurve: string;
    allocationCommunity: string;
    allocationCreator: string;
    allocationLiquidity: string;
    allocationEcosystem: string;
    allocationPromo: string;
  };
  iconGen: {
    button: string;
    lead: string;
    presetFlat: string;
    presetBadge: string;
    presetMascot: string;
    subjectLabel: string;
    subjectPlaceholder: string;
    remainingFree: string;
    /** M20-4: shown instead of the free counter when the wallet isn't a verified founder. */
    verifiedOnly: string;
    paidNote: string;
    generate: string;
    pickHint: string;
    busy: string;
    connectWallet: string;
    errorGeneric: string;
  };
};

const baseFactoryCopy: Record<string, FactoryCopyContent> = {
  en: {
    navLabel: "Create",
    tokenNav: "Create token",
    nftNav: "Create NFT",
    contractNav: "Create a contract",
    contractLead:
      "Describe what you need in ordinary words. We parameterize a reviewed Solidity template (OpenZeppelin patterns). Gas is paid in PPL. Token/NFT factory remains the built-in path.",
    feesLink: "Fees & pricing",
    hub: {
      tag: "NO-CODE BUILDER",
      title: "No-code builder",
      subtitle:
        "Token, NFT, escrow, crowdfunding, plain-language contracts and Lavka — wizards that already exist on the public testnet.",
      tokenCta: "Launch a token",
      nftCta: "Mint an NFT",
      contractCta: "Build a contract",
      escrowCta: "Deploy escrow",
      crowdfundCta: "Start crowdfunding",
      lavkaCta: "Open Lavka",
      escrowLead: "Sample escrow template: lock funds until a condition or deadline.",
      crowdfundLead: "Sample crowdfund template: set a goal and raise in PPL or a test stablecoin.",
      lavkaLead: "Loyalty passes and merchant escrow for local shops.",
      statusUnavailable: "Network temporarily unavailable",
      statusTestnet: "Testnet",
    },
    token: {
      title: "Create a token",
      lead: "Standard Token Factory launch: name, ticker, supply, image, then pay the PPL fee.",
      steps: ["Image", "Details", "Review", "Pay", "Done"],
    },
    nft: {
      title: "Create an NFT",
      lead: "Mint a unique item with a picture, name, and description. Optional collection name groups pieces.",
      steps: ["Image", "Details", "Review", "Pay", "Done"],
      modeSingle: "Single item",
      modeCollection: "Part of a collection",
      collectionLabel: "Collection name",
    },
    form: {
      image: "Picture",
      imageHint: "PNG, JPEG or WebP. Upload a file or paste a link to an image. You will see a preview first.",
      imageUrl: "Or paste an image URL",
      name: "Name",
      description: "Description",
      ticker: "Ticker",
      supply: "Total supply",
      decimals: "Decimals",
      review: "Check before you pay",
      pay: "Pay in PPL",
      result: "Created",
      next: "Continue",
      back: "Back",
      submit: "Sign and submit",
      another: "Create another",
      wallet: "Wallet",
      createWallet: "Create a new key",
      importWallet: "Import key",
      address: "Address",
      balance: "PPL balance",
      nonce: "Nonce",
      privateKey: "Private key (64 hex)",
      feeLabel: "PPL fee",
      feeUnset: "Fee amount is unavailable because the configured value is invalid.",
      noRpc: "Network temporarily unavailable",
      allocation: "Standard launch split (fixed by the protocol): 60% curve, 10% community, 15% creator, 10% liquidity, 5% ecosystem.",
      success: "The network accepted the signed transaction.",
      assetId: "Token id",
      nftId: "NFT id",
      txId: "Transaction id",
      error: "Could not submit",
      payWithLabel: "Pay fee with",
      payWithPpl: "PPL",
      stableFeeLabel: "Stable fee",
      stableFeeBuybackNote: "100% of token and NFT launch fees (USDC/USDT) go to public PPL buybacks.",
      stableFeeNetworkNote: "Works on the People network only for now. Paying from another chain (Ethereum, Polygon, Tron, TON, Solana) is coming later.",
      promoTitle: "Promotion budget (optional)",
      promoLead: "Set aside part of the supply to reward the referrers and partners who bring people to your token. Leave it at 0% if you do not need it.",
      promoOptionNone: "None",
      promoOptionLabel: "{{pct}}% of supply",
      promoSource: "The promotion budget comes out of your own bonding-curve supply — not out of the community, liquidity or ecosystem shares. A smaller curve means a thinner market and a steeper price, which is the cost you choose to pay for promotion.",
      promoRules: "The budget is held by a protocol contract, not by you. You can award it to referrers and partners; a single recipient can get at most {{cap}}% of the budget, each award unlocks {{upfront}}% immediately and the rest vests over {{days}} days. Anything you have not awarded within {{days}} days goes to this token's community pool — it does not come back to you.",
      allocationTitle: "Your launch split",
      allocationCurve: "Bonding curve",
      allocationCommunity: "Community pool",
      allocationCreator: "Creator (vesting)",
      allocationLiquidity: "Liquidity reserve",
      allocationEcosystem: "Ecosystem reserve",
      allocationPromo: "Promotion budget",
      approvingStable: "Approving…",
      payingStableFee: "Paying stable fee…",
      creatingAfterStableFee: "Creating…",
      leftoverTitle: "Curve leftover & 180-day unsold",
      leftoverHint: "Choose what happens to tokens still on the bonding curve when it migrates to the AMM, or if the curve does not sell out within 180 days. Never to you (the creator) and never to the protocol treasury.",
      leftoverBurnLabel: "Burn (recommended)",
      leftoverBurnHint: "Default. Leftover and unsold tokens are permanently burned.",
      leftoverPoolLabel: "To community pool",
      leftoverPoolHint: "Send leftover and unsold tokens to this token's own community pool.",
      launchSummary: "When you launch: 10% of supply goes to your token's community pool. You choose whether curve leftovers after AMM migration and unsold tokens at 180-day finalize are burned (default, recommended) or sent to that community pool — never to you or the treasury. Optional referral share: default 5% of supply (max 10%), invite bounty 5%.",
    },
    iconGen: {
      button: "Generate icon",
      lead: "Pick a style, describe your idea in a few words, and choose one of four pictures.",
      presetFlat: "Flat icon",
      presetBadge: "Badge",
      presetMascot: "Mascot",
      subjectLabel: "Subject and colors",
      subjectPlaceholder: "e.g. blue sun, gold accents",
      remainingFree: "{count} free today",
      verifiedOnly: "Free tries are only for founders verified via Telegram or Human Passport.",
      paidNote: "After free uses: {fee} PPL per try",
      generate: "Create pictures",
      pickHint: "Tap one to use as your picture",
      busy: "Creating pictures…",
      connectWallet: "Connect your wallet on the Pay step first, or open Wallet and return here.",
      errorGeneric: "Could not create pictures. Try again.",
    },
  },
  ru: {
    navLabel: "Создать",
    tokenNav: "Создать токен",
    nftNav: "Создать NFT",
    contractNav: "Создать контракт",
    contractLead:
      "Опишите задачу обычными словами. Мы параметризуем проверенный шаблон Solidity (паттерны OpenZeppelin). Газ оплачивается в PPL. Token/NFT factory остаётся встроенным путём.",
    feesLink: "Комиссии и тарифы",
    hub: {
      tag: "КОНСТРУКТОР БЕЗ КОДА",
      title: "Конструктор без кода",
      subtitle:
        "Токен, NFT, эскроу, краудфандинг, контракты простыми словами и Lavka — мастеры, которые уже есть в публичном тестнете.",
      tokenCta: "Запустить токен",
      nftCta: "Выпустить NFT",
      contractCta: "Собрать контракт",
      escrowCta: "Развернуть эскроу",
      crowdfundCta: "Запустить краудфандинг",
      lavkaCta: "Открыть Lavka",
      escrowLead: "Образец эскроу: заморозка средств до условия или срока.",
      crowdfundLead: "Образец краудфандинга: цель и сбор в PPL или тестовом стейблкоине.",
      lavkaLead: "Карты лояльности и эскроу для локальных точек.",
      statusUnavailable: "Сеть временно недоступна",
      statusTestnet: "Testnet",
    },
    token: {
      title: "Создать токен",
      lead: "Стандартный запуск Token Factory: имя, тикер, эмиссия, картинка, затем комиссия в PPL.",
      steps: ["Картинка", "Данные", "Проверка", "Оплата", "Готово"],
    },
    nft: {
      title: "Создать NFT",
      lead: "Выпуск уникального объекта с картинкой, названием и описанием. Имя коллекции необязательно.",
      steps: ["Картинка", "Данные", "Проверка", "Оплата", "Готово"],
      modeSingle: "Один объект",
      modeCollection: "Часть коллекции",
      collectionLabel: "Название коллекции",
    },
    form: {
      image: "Картинка",
      imageHint: "PNG, JPEG или WebP. Загрузите файл или вставьте ссылку на картинку. Сначала вы увидите превью.",
      imageUrl: "Или вставьте URL картинки",
      name: "Название",
      description: "Описание",
      ticker: "Тикер",
      supply: "Общая эмиссия",
      decimals: "Знаков после запятой",
      review: "Проверьте перед оплатой",
      pay: "Оплатить в PPL",
      result: "Создано",
      next: "Далее",
      back: "Назад",
      submit: "Подписать и отправить",
      another: "Создать ещё",
      wallet: "Кошелёк",
      createWallet: "Создать ключ",
      importWallet: "Импортировать ключ",
      address: "Адрес",
      balance: "Баланс PPL",
      nonce: "Nonce",
      privateKey: "Приватный ключ (64 hex)",
      feeLabel: "Комиссия PPL",
      feeUnset: "Сумма комиссии недоступна: значение в конфигурации некорректно.",
      noRpc: "Сеть временно недоступна",
      allocation: "Стандартный сплит запуска (фиксирует протокол): 60% кривая, 10% сообщество, 15% автор, 10% ликвидность, 5% экосистема.",
      success: "Сеть приняла подписанную транзакцию.",
      assetId: "Id токена",
      nftId: "Id NFT",
      txId: "Id транзакции",
      error: "Не удалось отправить",
      payWithLabel: "Оплатить комиссию в",
      payWithPpl: "PPL",
      stableFeeLabel: "Комиссия в стейблкоине",
      stableFeeBuybackNote: "100% комиссий за запуск токенов и NFT (USDC/USDT) идут на публичный выкуп PPL.",
      stableFeeNetworkNote: "Пока работает только в сети People. Оплата из другой сети (Ethereum, Polygon, Tron, TON, Solana) появится позже.",
      promoTitle: "Бюджет на продвижение (необязательно)",
      promoLead: "Отложите часть выпуска на вознаграждение тем, кто приводит людей к вашему токену: реферерам и партнёрам. Если это не нужно, оставьте 0%.",
      promoOptionNone: "Нет",
      promoOptionLabel: "{{pct}}% выпуска",
      promoSource: "Бюджет на продвижение берётся из вашей же доли на бондинг-кривой, а не из доли сообщества, ликвидности или экосистемы. Кривая становится меньше, рынок — тоньше, а цена растёт быстрее: это и есть цена продвижения, которую вы выбираете заплатить.",
      promoRules: "Бюджет держит контракт протокола, а не вы. Его можно распределять реферерам и партнёрам: один получатель — не более {{cap}}% бюджета, у каждой выплаты {{upfront}}% разблокируется сразу, остальное вестится {{days}} дней. Всё, что вы не распределили за {{days}} дней, уходит в пул сообщества этого токена и к вам не возвращается.",
      allocationTitle: "Сплит вашего запуска",
      allocationCurve: "Бондинг-кривая",
      allocationCommunity: "Пул сообщества",
      allocationCreator: "Автор (вестинг)",
      allocationLiquidity: "Резерв ликвидности",
      allocationEcosystem: "Резерв экосистемы",
      allocationPromo: "Бюджет на продвижение",
      approvingStable: "Подтверждение...",
      payingStableFee: "Оплата комиссии...",
      creatingAfterStableFee: "Создание...",
      leftoverTitle: "Остаток на кривой и нераспроданные за 180 дней",
      leftoverHint: "Выберите, что произойдет с токенами, оставшимися на кривой связывания при миграции в AMM, или если кривая не будет распродана в течение 180 дней. Никогда не вам (создателю) и никогда не в казну протокола.",
      leftoverBurnLabel: "Сжечь (рекомендуется)",
      leftoverBurnHint: "По умолчанию. Оставшиеся и нераспроданные токены сжигаются навсегда.",
      leftoverPoolLabel: "В общественный пул",
      leftoverPoolHint: "Отправить оставшиеся и нераспроданные токены в общественный пул этого токена.",
      launchSummary: "При запуске: 10% предложения поступает в общественный пул вашего токена. Вы выбираете, будут ли остатки кривой после миграции в AMM и нераспроданные токены при завершении через 180 дней сожжены (по умолчанию, рекомендуется) или отправлены в этот общественный пул — никогда вам или в казну. Опциональная реферальная доля: по умолчанию 5% предложения (макс. 10%), вознаграждение за приглашение 5%.",
    },
    iconGen: {
      button: "Создать значок",
      lead: "Выберите стиль, коротко опишите идею и выберите одну из четырёх картинок.",
      presetFlat: "Плоский значок",
      presetBadge: "Медальон",
      presetMascot: "Персонаж",
      subjectLabel: "Тема и цвета",
      subjectPlaceholder: "например, синее солнце, золотые акценты",
      remainingFree: "Бесплатно сегодня: {count}",
      verifiedOnly: "Бесплатные попытки — только для основателей с подтверждением через Telegram или Human Passport.",
      paidNote: "После лимита: {fee} PPL за попытку",
      generate: "Создать картинки",
      pickHint: "Нажмите на картинку, чтобы использовать её",
      busy: "Создаём картинки…",
      connectWallet: "Сначала подключите кошелёк (шаг «Оплата») или откройте раздел «Кошелёк».",
      errorGeneric: "Не удалось создать картинки. Попробуйте ещё раз.",
    },
  },
  es: factoryEs as FactoryCopyContent,
  pt: factoryPt as FactoryCopyContent,
  fr: factoryFr as FactoryCopyContent,
  de: factoryDe as FactoryCopyContent,
  it: factoryIt as FactoryCopyContent,
  tr: factoryTr as FactoryCopyContent,
  vi: factoryVi as FactoryCopyContent,
  id: factoryId as FactoryCopyContent,
  zh: factoryZh as FactoryCopyContent,
  ar: factoryAr as FactoryCopyContent,
};

export const factoryCopy: Record<Language, FactoryCopyContent> = new Proxy(
  baseFactoryCopy as unknown as Record<Language, FactoryCopyContent>,
  {
    get: (target, prop: string) => target[prop as keyof typeof target] ?? target.en,
  }
);
