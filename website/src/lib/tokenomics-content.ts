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
  saleClosedTitle: string;
  saleClosedBody: string;
  feeTitle: string;
  feeLead: string;
  feeNote: string;
  buybackTitle: string;
  buybackBody: string;
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
    sale: "Community sale",
    liquidity: "Liquidity",
  },
  bucketNotes: {
    community:
      "35% genesis bucket — founders, bounties, ambassadors, airdrops and onboarding rewards only from this pool (released over 6 years).",
    validators:
      "200M PPL (20%): years 1–4 pay 6%, 5%, 5%, 4% of total supply per year (60M / 50M / 50M / 40M), plus 30% of network fees.",
    team: "15% of supply: 0% at launch, 6-month cliff, then 18 months of linear monthly unlocks (24 months total).",
    treasury: "Spent only after DAO votes; held in multisig.",
    sale: "25% at genesis on People, remainder monthly over 9 months.",
    liquidity: "PPL/USDT pool at sale close; LP tokens locked 2+ years.",
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
    "Up to 100M PPL from the sale bucket are reserved for a public bonding curve after the founders airdrop. The sale stays closed until an operating entity for the sale exists.",
  salePayTitle: "How you would pay",
  salePayBody:
    "The treasury is controlled by People's own 2-of-3 multisig contract on the People network, with published signer addresses.",
  saleDeliveryTitle: "How you receive PPL",
  saleDeliveryBody:
    "Native PPL is credited to the same 0x address on the People network at genesis, following the vesting schedule above.",
  curveTitle: "Bonding curve",
  curveLead:
    "The launch price comes from the curve's virtual reserve, not from a private round: the contract computes every trade and the whole curve runs on-chain and in public.",
  unsoldTitle: "Unsold tokens",
  unsoldBody:
    "Any PPL not purchased on the curve goes to PPL's own community pool — the 35% community & rewards bucket — not to the treasury and not burned. The same rule applies to every token launched on People: a standard launch allocates exactly 10% of supply to its community at launch.",
  saleClosedTitle: "Sale is not open yet",
  saleClosedBody:
    "There is no public PPL sale right now. No prices are published, the payment widget is switched off and no KYC flow runs on this site.",
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
    "Founders airdrop runs first. The community PPL sale opens only after 1,000 verified people are registered and sale proceeds are secured by a published multisig.",
  feeTitle: "Network fee split",
  feeLead: "Every protocol fee on People follows the approved Model A routing:",
  feeNote: FEE_SPLIT_PLAIN.en,
  buybackTitle: "Buybacks",
  buybackBody:
    "100% of token and NFT launch fees (USDC/USDT) go to public PPL buybacks. The StableFeeGateway contract is implemented and deployed on the testnet: every stablecoin launch fee goes to the public buyback recipient. 30% of network fees go to public PPL buybacks (treasury 20% + liquidity 10%). The remaining 70% of network fees go to validators (30%), the community pool (25%) and the Growth Pool (15%) — and it all ultimately goes back to participants. Bought-back PPL is then split 30/25/20/10/15 by the 2-of-3 treasury multisig — that split is a published multisig policy, not a rule enforced on-chain.",
  contractsTitle: "Contract addresses",
  contractsLead: "On-chain addresses are published when mainnet launches — not placeholders on this page.",
  contractRows: [
    {
      name: "Sale contracts (BNB Chain, Base, Ethereum, Polygon, Tron, TON, Solana)",
      status: "Published at mainnet launch",
    },
    { name: "Treasury multisig (2-of-3)", status: "Published at mainnet launch" },
    { name: "Vesting controllers", status: "Published at mainnet launch" },
    { name: "LP lock contract", status: "Published at mainnet launch" },
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
    sale: "25% при genesis в People, остальное ежемесячно 9 месяцев.",
    liquidity: "Пул PPL/USDT при закрытии продажи; LP заблокирован 2+ года.",
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
    "До 100M PPL из корзины продажи зарезервированы под публичную bonding curve после airdrop основателям. Продажа остаётся закрытой, пока не появится юрлицо-оператор продажи.",
  salePayTitle: "Как вы будете платить",
  salePayBody:
    "Казначейство управляется собственным мультисиг-контрактом People 2-из-3 в сети People, адреса подписантов публикуются.",
  saleDeliveryTitle: "Как получить PPL",
  saleDeliveryBody:
    "Нативные PPL зачисляются на тот же адрес 0x в сети People при genesis по графику vesting выше.",
  curveTitle: "Bonding curve",
  curveLead:
    "Стартовая цена задаётся виртуальным резервом кривой, а не частным раундом: каждый обмен считает контракт, вся кривая работает on-chain и публично.",
  unsoldTitle: "Непроданные токены",
  unsoldBody:
    "Любые PPL, не купленные на кривой, идут в собственный пул сообщества PPL — корзину сообщества и наград 35% — не в казну и не сжигаются. То же правило действует для каждого токена, запущенного в People: стандартный запуск выделяет ровно 10% предложения его сообществу при запуске.",
  saleClosedTitle: "Продажа пока не открыта",
  saleClosedBody:
    "Публичной продажи PPL сейчас нет. Цены не публикуются, платёжный виджет отключён, KYC на этом сайте не проводится.",
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
    "Сначала airdrop основателям. Продажа PPL сообществу открывается только после 1 000 verified people и публикации мультисига для средств с продажи.",
  feeTitle: "Деление сетевой комиссии",
  feeLead: "Каждая протокольная комиссия в People следует утверждённой Model A:",
  feeNote: FEE_SPLIT_PLAIN.ru,
  buybackTitle: "Выкуп",
  buybackBody:
    "100% комиссий за запуск токенов и NFT (USDC/USDT) идут на публичный выкуп PPL. Контракт StableFeeGateway реализован и развёрнут в тестнете: каждая комиссия в стейблкоине идёт получателю публичного выкупа. 30% сетевых комиссий идут на публичный выкуп PPL (казна 20% + ликвидность 10%). Оставшиеся 70% сетевых комиссий идут валидаторам (30%), в пул сообщества (25%) и в Growth Pool (15%) — и в итоге всё возвращается участникам. Выкупленный PPL затем делится 30/25/20/10/15 мультисигом казны 2-из-3 — это опубликованная политика мультисига, а не правило, зашитое в контракт.",
  contractsTitle: "Адреса контрактов",
  contractsLead: "On-chain адреса публикуются при запуске mainnet — на этой странице нет подставных значений.",
  contractRows: [
    {
      name: "Контракты продажи (BNB Chain, Base, Ethereum, Polygon, Tron, TON, Solana)",
      status: "Публикуется при запуске mainnet",
    },
    { name: "Мультисиг казны (2-из-3)", status: "Публикуется при запуске mainnet" },
    { name: "Контроллеры vesting", status: "Публикуется при запуске mainnet" },
    { name: "Контракт лока LP", status: "Публикуется при запуске mainnet" },
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
