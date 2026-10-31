import type { Language } from "./preferences";
import { FEE_SPLIT_PLAIN } from "./fee-split-public";
import tokenomicsAr from "./locales/surfaces/tokenomics-ar.json" with { type: "json" };
import tokenomicsDe from "./locales/surfaces/tokenomics-de.json" with { type: "json" };
import tokenomicsEs from "./locales/surfaces/tokenomics-es.json" with { type: "json" };
import tokenomicsFr from "./locales/surfaces/tokenomics-fr.json" with { type: "json" };
import tokenomicsId from "./locales/surfaces/tokenomics-id.json" with { type: "json" };
import tokenomicsIt from "./locales/surfaces/tokenomics-it.json" with { type: "json" };
import tokenomicsPt from "./locales/surfaces/tokenomics-pt.json" with { type: "json" };
import tokenomicsTr from "./locales/surfaces/tokenomics-tr.json" with { type: "json" };
import tokenomicsVi from "./locales/surfaces/tokenomics-vi.json" with { type: "json" };
import tokenomicsZh from "./locales/surfaces/tokenomics-zh.json" with { type: "json" };
import type { AllocationId } from "./tokenomics";

export type TokenomicsCopy = {
  tag: string;
  title: string;
  lead: string;
  banner: string;
  supplyTitle: string;
  supplyBody: string;
  testnetNote: string;
  allocationTitle: string;
  allocationLead: string;
  bucketLabels: Record<AllocationId, string>;
  bucketNotes: Record<AllocationId, string>;
  donutTitle: string;
  shareLabel: string;
  amountLabel: string;
  unlockChartLabel: string;
  circulatingTitle: string;
  circulatingLead: string;
  monthAxis: string;
  saleTitle: string;
  saleLead: string;
  salePayTitle: string;
  salePayBody: string;
  saleDeliveryTitle: string;
  saleDeliveryBody: string;
  curveTitle: string;
  curveLead: string;
  unsoldTitle: string;
  unsoldBody: string;
  salePublicTitle: string;
  salePublicBody: string;
  salePublicCta: string;
  saleCurveBullets: string[];
  curveTableSold: string;
  curveTablePrice: string;
  curveTableRaised: string;
  feeTitle: string;
  feeLead: string;
  feeNote: string;
  buybackTitle: string;
  buybackBody: string;
  buybackNote: string;
  curveTableUnreachable: string;
  contractsTitle: string;
  contractsLead: string;
  contractRows: { name: string; status: string }[];
  legendHint: string;
  feeSliceLabels: Record<string, string>;
  emissionTitle: string;
  emissionLead: string;
  emissionBullets: string[];
  launchOrderTitle: string;
  launchOrderBody: string;
  pplFeeTariffsLink: string;
  explorerLink: string;
  backToDocsLink: string;
};

const en: TokenomicsCopy = {
  tag: "TOKENOMICS",
  title: "PPL supply and launch plan",
  lead:
    "How the fixed one-billion PPL supply is allocated, unlocked and sold before and after mainnet. Numbers are preliminary and subject to community governance.",
  banner: "Preliminary — subject to community governance vote.",
  supplyTitle: "Fixed supply",
  supplyBody:
    "Total supply is fixed at 1,000,000,000 PPL (one billion). In years 1–4 there is 0% inflation — no new coins beyond the unlock schedules below. From year 5, any additional emission is capped at 2% per year and only by community vote.",
  testnetNote:
    "The internal testnet used a 1M PPL premine for experiments. That balance does not carry over — mainnet accounting starts from zero.",
  allocationTitle: "Genesis allocation",
  allocationLead:
    "Six buckets at launch. Tap or hover a slice to see its share, size and unlock path.",
  bucketLabels: {
    community: "Community & rewards",
    validators: "Validators & staking",
    team: "Team & founders",
    treasury: "Ecosystem treasury (DAO)",
    sale: "Sold on the public curve on Base (PplCurveHub). PPL is credited on PEOPLE mainnet right after purchase; transfers open at the full network launch.",
    liquidity: "PPL/USDC pool at graduation; LP tokens locked for 24 months.",
  },
  bucketNotes: {
    community:
      "35% genesis bucket — founders, bounties, ambassadors, airdrops and onboarding rewards only from this pool (released over 6 years).",
    validators:
      "200M PPL (20%): years 1–4 pay 6%, 5%, 5%, 4% of total supply per year (60M / 50M / 50M / 40M), plus 30% of network fees.",
    team: "15% of supply: 0% at launch, 6-month cliff, then 18 months of linear monthly unlocks (24 months total).",
    treasury: "Spent only after DAO votes; held in multisig.",
    sale: "Sold on the public curve on Base (PplCurveHub). PPL is credited on PEOPLE mainnet right after purchase; transfers open at the full network launch.",
    liquidity: "PPL/USDC pool at graduation; LP tokens locked for 24 months.",
  },
  donutTitle: "Allocation",
  shareLabel: "Share",
  amountLabel: "Amount",
  unlockChartLabel: "Unlocked over time",
  circulatingTitle: "Circulating supply",
  circulatingLead:
    "Estimated liquid PPL in circulation by month (0–120). DAO treasury stays off-chart until voted; LP allocation counts after the 2-year lock.",
  monthAxis: "Months after genesis",
  saleTitle: "Community sale",
  saleLead:
    "Up to 100M PPL are on the curve (10% of the fixed supply). The curve closes at $4M raised — about 88.83M PPL sold, at about $0.1615 per PPL. Table rows after $4M are not reachable.",
  salePayTitle: "How you pay",
  salePayBody:
    "On Base — in USDC or USDT. From other networks — through the built-in automatic swap (LI.FI): EVM networks (Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Avalanche and others), Tron and Solana work. TON is not supported. Payouts in USDC on Base.",
  saleDeliveryTitle: "How you receive PPL",
  saleDeliveryBody:
    "PPL is credited to your address on PEOPLE mainnet right away, but you cannot send it to others until the full network launch. Sell-back is possible only for verified users, 30 days after each purchase.",
  curveTitle: "Bonding curve",
  curveLead:
    "Exponential curve: price starts at $0.005 per PPL and rises with every purchase, up to a $0.25 ceiling while the curve is open. Graduation closes the curve at $4M raised.",
  unsoldTitle: "Unsold tokens",
  unsoldBody:
    "The sale runs until it sells out (the curve closes at $4M raised) or for 24 months from opening, whichever comes first. No extensions. Unsold PPL goes to the Community Pool. No refunds: every purchase is final.",
  salePublicTitle: "Published sale parameters",
  salePublicBody:
    "Prices, limits and the curve formula are public on /buy. Purchases stay disabled until the sale hub contract is deployed; connecting a wallet does not commit you to anything.",
  salePublicCta: "Open the /buy page",
  saleCurveBullets: [
    "100,000,000 PPL on the curve (10% of supply); start $0.005, exponential rise, $0.25 cap on the curve only.",
    "The sale runs until it sells out (the curve closes at $4M raised) or for 24 months from opening, whichever comes first. No extensions. Unsold PPL goes to the Community Pool. No refunds: every purchase is final.",
    "Raise split 50% locked liquidity / 50% project multisig; LP tokens locked 24 months.",
    "Sell-back to the reserve — verified users only. Each lot can be sold back after a 30-day hold, at the curve price at the moment you sell. Total sell-backs are capped at 2% of the reserve in any rolling 24 hours for everyone and $2,000 per person in a rolling 24-hour window. Fee: 1.5%, or 3% on the part of sell-backs in that rolling 24 hours above 1% of the reserve. Closes after graduation. Payouts in USDC on Base. PPL sold back is burned on PEOPLE mainnet.",
    "$10–$500 per purchase; Up to $2,000 per person in a rolling 24-hour window; 60 s pause between purchases",
  ],
  curveTableSold: "% sold",
  curveTablePrice: "Spot price (USDC)",
  curveTableRaised: "Raised (USDC)",
  emissionTitle: "Emission and validator rewards",
  emissionLead:
    "Security rewards come from the pre-allocated validator pool and network fees — not from minting new supply in years 1–4.",
  emissionBullets: [
    "Years 1–4: 0% inflation — the one-billion cap is not increased.",
    "Validator pool: 200M PPL unlocked on a 6% / 5% / 5% / 4% of total supply schedule (60M, 50M, 50M, 40M PPL in years 1–4), plus 30% of every protocol fee.",
    "Founders, bounties, ambassadors and airdrops are funded only from the 35% community & rewards bucket.",
    "From year 5 onward, new emission is at most 2% per year and requires a community governance vote.",
  ],
  launchOrderTitle: "Launch sequence",
  launchOrderBody:
    "The PPL sale opens once the sale contract (PplCurveHub on Base) and the receiving multisig are published. Transfers and pool trading open at the full network launch, with 1,000 verified people.",
  feeTitle: "Network fee split",
  feeLead: "Every protocol fee on PEOPLE follows the approved Model A routing:",
  feeNote: FEE_SPLIT_PLAIN.en,
  buybackTitle: "Buybacks",
  buybackBody:
    "100% of token and NFT launch fees (USDC/USDT) go to public PPL buybacks. The StableFeeGateway contract is implemented and deployed on the testnet: every stablecoin launch fee goes to the public buyback recipient. 30% of network fees go to public PPL buybacks (treasury 20% + liquidity 10%). The remaining 70% of network fees go to validators (30%), the community pool (25%) and the Growth Pool (15%) — and it all ultimately goes back to participants. Bought-back PPL is then split 30/25/20/10/15 by the 2-of-3 treasury multisig — that split is a published multisig policy, not a rule enforced on-chain.",
  buybackNote: "Not the same as sell-back: in a sell-back you sell PPL to the sale reserve.",
  curveTableUnreachable: "Not reachable: the curve closes at $4M.",
  contractsTitle: "Contract addresses",
  contractsLead: "Each address is published here once the contract exists — no placeholders.",
  contractRows: [
    { name: "Sale contract (PplCurveHub, Base)", status: "Published before the sale opens" },
    { name: "Receiving multisig (project multisig)", status: "Published before the sale opens" },
    { name: "Treasury multisig (2-of-3)", status: "Published at the full network launch" },
    { name: "Vesting controllers", status: "Published at the full network launch" },
    { name: "LP lock", status: "Published at the full network launch" },
  ],
  legendHint: "Click a legend item to focus a slice.",
  feeSliceLabels: {
    validators: "Validators",
    community: "Community pool",
    treasury: "Treasury",
    liquidity: "Liquidity & ecosystem",
    growth: "Growth Pool",
    burn: "Burn",
  },
  pplFeeTariffsLink: "PPL fee tariffs",
  explorerLink: "Explorer",
  backToDocsLink: "Back to documentation",
};

const ru: TokenomicsCopy = {
  tag: "ТОКЕНОМИКА",
  title: "Выпуск PPL и план запуска",
  lead:
    "Как распределяется фиксированный миллиард PPL, как разблокируется и продаётся до и после mainnet. Цифры предварительные и подлежат голосованию сообщества.",
  banner: "Предварительно, утверждается голосованием сообщества.",
  supplyTitle: "Фиксированный выпуск",
  supplyBody:
    "Общий выпуск фиксирован: 1 000 000 000 PPL (один миллиард). В годы 1–4 инфляция 0% — новых монет сверх графиков разблокировки нет. С 5-го года дополнительная эмиссия — не более 2% в год и только по голосованию сообщества.",
  testnetNote:
    "Во внутренней тестовой сети использовался премайн 1M PPL для экспериментов. Он не переносится — учёт mainnet начинается с нуля.",
  allocationTitle: "Распределение genesis",
  allocationLead:
    "Шесть корзин при запуске. Наведите или нажмите на сектор, чтобы увидеть долю, объём и график разблокировки.",
  bucketLabels: {
    community: "Сообщество и награды",
    validators: "Валидаторы и стейкинг",
    team: "Команда и основатели",
    treasury: "Казна экосистемы (DAO)",
    sale: "Продажа сообществу",
    liquidity: "Ликвидность",
  },
  bucketNotes: {
    community:
      "35% genesis — основатели, гранты, амбассадоры, аирдропы и онбординг только из этого пула (разблокировка за 6 лет).",
    validators:
      "200M PPL (20%): в годы 1–4 выплаты 6%, 5%, 5%, 4% от total supply в год (60M / 50M / 50M / 40M PPL) плюс 30% сетевых комиссий.",
    team: "15% эмиссии: 0% при запуске, клифф 6 месяцев, затем линейная ежемесячная разблокировка 18 месяцев (всего 24 месяца).",
    treasury: "Тратится только после голосования DAO; хранится в мультисиге.",
    sale: "Продаётся на публичной кривой в сети Base (PplCurveHub). PPL зачисляются в PEOPLE mainnet сразу после покупки; переводы — с полного запуска сети.",
    liquidity: "Пул PPL/USDC при закрытии продажи; LP заблокирован на 24 месяца.",
  },
  donutTitle: "Распределение",
  shareLabel: "Доля",
  amountLabel: "Объём",
  unlockChartLabel: "Разблокировка во времени",
  circulatingTitle: "Обращающееся предложение",
  circulatingLead:
    "Оценка ликвидных PPL по месяцам (0–120). Казна DAO не учитывается до голосования; ликвидность — после 2-летнего лока.",
  monthAxis: "Месяцы после genesis",
  saleTitle: "Продажа сообществу",
  saleLead:
    "На кривой до 100M PPL (10% фиксированной эмиссии). Кривая закрывается при сборе $4M — около 88,83M проданных PPL, по цене около $0,1615 за PPL. Строки таблицы после $4M недостижимы.",
  salePayTitle: "Как платить",
  salePayBody:
    "В сети Base — USDC или USDT. Из других сетей — через встроенный автоматический обмен (LI.FI): работают EVM-сети (Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Avalanche и другие), Tron и Solana. TON не поддерживается. Выплата — в USDC в сети Base.",
  saleDeliveryTitle: "Как получить PPL",
  saleDeliveryBody:
    "PPL зачисляются на ваш адрес в PEOPLE mainnet сразу, но отправить их другим людям можно только после полного запуска сети. Продать обратно могут только верифицированные пользователи, через 30 дней после каждой покупки.",
  curveTitle: "Bonding curve",
  curveLead:
    "Экспоненциальная кривая: цена стартует с $0.005 за PPL и растёт с каждой покупкой, до потолка $0.25, пока кривая открыта. Выпуск закрывается при сборе $4M.",
  unsoldTitle: "Непроданные токены",
  unsoldBody:
    "Продажа идёт до распродажи (кривая закрывается при сборе $4M) или 24 месяца с момента открытия — что наступит раньше. Продлений нет. Непроданные PPL уходят в Community Pool. Возвратов нет: каждая покупка окончательна.",
  salePublicTitle: "Опубликованные параметры продажи",
  salePublicBody:
    "Цены, лимиты и формула кривой публичны на /buy. Покупка отключена, пока не развёрнут hub-контракт продажи; подключение кошелька ни к чему не обязывает.",
  salePublicCta: "Открыть страницу /buy",
  saleCurveBullets: [
    "100 000 000 PPL на кривой (10% эмиссии); старт $0.005, экспоненциальный рост, потолок $0.25 только на кривой.",
    "Продажа идёт до распродажи (кривая закрывается при сборе $4M) или 24 месяца с момента открытия — что наступит раньше. Продлений нет. Непроданные PPL уходят в Community Pool. Возвратов нет: каждая покупка окончательна.",
    "Сбор 50% в заблокированную ликвидность / 50% в мультисиг проекта; LP заблокированы на 24 месяца.",
    "Продажа обратно в резерв — только для верифицированных пользователей. Каждую партию можно продать после 30 дней удержания по цене кривой на момент продажи. Общий лимит — 2% резерва за любые скользящие 24 часа на всех и $2 000 на человека за скользящие 24 часа. Комиссия 1,5%; 3% — только на часть выкупа за эти 24 часа сверх 1% резерва. Закрывается после выпуска в пул (graduation). Выплата — в USDC в сети Base. Проданные обратно PPL сжигаются в PEOPLE mainnet.",
    "$10–$500 за покупку; До $2 000 на человека за скользящие 24 часа; Пауза 60 с между покупками",
  ],
  curveTableSold: "% продано",
  curveTablePrice: "Спот-цена (USDC)",
  curveTableRaised: "Собрано (USDC)",
  emissionTitle: "Эмиссия и награды валидаторам",
  emissionLead:
    "Награды за безопасность сеть получает из пула валидаторов и комиссий — без дополнительного выпуска в годы 1–4.",
  emissionBullets: [
    "Годы 1–4: инфляция 0% — потолок в один миллиард не увеличивается.",
    "Пул валидаторов: 200M PPL по графику 6% / 5% / 5% / 4% от total supply в год (60M, 50M, 50M, 40M PPL в годы 1–4) плюс 30% каждой протокольной комиссии.",
    "Награды основателям, гранты, амбассадоры и аирдропы — только из корзины сообщества 35%.",
    "С 5-го года новая эмиссия — не более 2% в год и только по голосованию сообщества.",
  ],
  launchOrderTitle: "Порядок запуска",
  launchOrderBody:
    "Продажа PPL открывается после публикации контракта продажи (PplCurveHub в сети Base) и мультисига-получателя. Переводы и торговля в пуле — с полного запуска сети, при 1 000 верифицированных людей.",
  feeTitle: "Деление сетевой комиссии",
  feeLead: "Каждая протокольная комиссия в PEOPLE следует утверждённой Model A:",
  feeNote: FEE_SPLIT_PLAIN.ru,
  buybackTitle: "Выкуп",
  buybackBody:
    "100% комиссий за запуск токенов и NFT (USDC/USDT) идут на публичный выкуп PPL. Контракт StableFeeGateway реализован и развёрнут в тестнете: каждая комиссия в стейблкоине идёт получателю публичного выкупа. 30% сетевых комиссий идут на публичный выкуп PPL (казна 20% + ликвидность 10%). Оставшиеся 70% сетевых комиссий идут валидаторам (30%), в пул сообщества (25%) и в Growth Pool (15%) — и в итоге всё возвращается участникам. Выкупленный PPL затем делится 30/25/20/10/15 мультисигом казны 2-из-3 — это опубликованная политика мультисига, а не правило, зашитое в контракт.",
  buybackNote: "Это не то же самое, что продажа обратно в резерв: там вы сами продаёте PPL в резерв продажи.",
  curveTableUnreachable: "Недостижимо: кривая закрывается на $4M.",
  contractsTitle: "Адреса контрактов",
  contractsLead: "Каждый адрес публикуется здесь, как только контракт существует, — без заглушек.",
  contractRows: [
    { name: "Контракт продажи (PplCurveHub, Base)", status: "Публикуется до открытия продажи" },
    { name: "Мультисиг-получатель (мультисиг проекта)", status: "Публикуется до открытия продажи" },
    { name: "Мультисиг казны (2-из-3)", status: "Публикуется при полном запуске сети" },
    { name: "Контроллеры vesting", status: "Публикуется при полном запуске сети" },
    { name: "Блокировка LP", status: "Публикуется при полном запуске сети" },
  ],
  legendHint: "Нажмите пункт легенды, чтобы выделить сектор.",
  feeSliceLabels: {
    validators: "Валидаторы",
    community: "Пул сообщества",
    treasury: "Казна",
    liquidity: "Ликвидность и экосистема",
    growth: "Growth Pool",
    burn: "Сжигание",
  },
  pplFeeTariffsLink: "Тарифы в PPL",
  explorerLink: "Проводник (explorer)",
  backToDocsLink: "Вернуться к документации",
};

const base: Record<string, TokenomicsCopy> = {
  en,
  ru,
  es: tokenomicsEs as TokenomicsCopy,
  pt: tokenomicsPt as TokenomicsCopy,
  fr: tokenomicsFr as TokenomicsCopy,
  de: tokenomicsDe as TokenomicsCopy,
  it: tokenomicsIt as TokenomicsCopy,
  tr: tokenomicsTr as TokenomicsCopy,
  vi: tokenomicsVi as TokenomicsCopy,
  id: tokenomicsId as TokenomicsCopy,
  zh: tokenomicsZh as TokenomicsCopy,
  ar: tokenomicsAr as TokenomicsCopy,
};

export const tokenomicsCopy: Record<Language, TokenomicsCopy> = new Proxy(
  base as unknown as Record<Language, TokenomicsCopy>,
  {
    get: (target, prop: string) => target[prop as keyof typeof target] ?? target.en,
  }
);
