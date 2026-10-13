import type { Language } from "@/lib/preferences";
import { FEE_SPLIT_PLAIN } from "./fee-split-public";
import feesAr from "./locales/surfaces/fees-ar.json" with { type: "json" };
import feesDe from "./locales/surfaces/fees-de.json" with { type: "json" };
import feesEs from "./locales/surfaces/fees-es.json" with { type: "json" };
import feesFr from "./locales/surfaces/fees-fr.json" with { type: "json" };
import feesId from "./locales/surfaces/fees-id.json" with { type: "json" };
import feesIt from "./locales/surfaces/fees-it.json" with { type: "json" };
import feesPt from "./locales/surfaces/fees-pt.json" with { type: "json" };
import feesTr from "./locales/surfaces/fees-tr.json" with { type: "json" };
import feesVi from "./locales/surfaces/fees-vi.json" with { type: "json" };
import feesZh from "./locales/surfaces/fees-zh.json" with { type: "json" };
import {
  APPROVED_CONTRACT_GAS_PRICE_PPL,
  DEFAULT_NFT_MINT_FEE_PPL,
  DEFAULT_TOKEN_CREATE_FEE_PPL,
  DEFAULT_TRANSFER_FEE_PPL,
  TYPICAL_CONTRACT_DEPLOY_FEE_PPL,
} from "@/lib/factory-fees";

export type FeesCopyContent = {
  tag: string;
  title: string;
  lead: string;
  approvedNote: string;
  table: { operation: string; amount: string; note: string }[];
  contractNote: string;
  modelANote: string;
  payOptionsNote: string;
  stableFeeNetworkNote: string;
  growthReferralTitle: string;
  growthReferralBody: string;
  tableColOperation: string;
  tableColTariff: string;
  tableColNote: string;
  createContractLink: string;
};

const baseFeesCopy: Record<string, FeesCopyContent> = {
  en: {
    tag: "FEES & PRICING",
    title: "Public PPL tariffs",
    lead:
      "What common actions on People's Blockchain cost. Every fee is paid in PPL, the network's own coin.",
    approvedNote:
      "These are the prices the site uses today. The wallet always shows the exact fee before you sign.",
    table: [
      {
        operation: "Ordinary transfer",
        amount: `${DEFAULT_TRANSFER_FEE_PPL} PPL`,
        note: "Sending PPL or a token to someone",
      },
      {
        operation: "Token create (minimum)",
        amount: `${DEFAULT_TOKEN_CREATE_FEE_PPL} PPL`,
        note: "Launching your own token",
      },
      {
        operation: "NFT mint (minimum)",
        amount: `${DEFAULT_NFT_MINT_FEE_PPL} PPL`,
        note: "Creating one NFT",
      },
      {
        operation: "Contract gas price",
        amount: `${APPROVED_CONTRACT_GAS_PRICE_PPL.toFixed(8)} PPL per gas unit`,
        note: "Paid in advance when you publish or use a contract",
      },
      {
        operation: "Typical contract deploy (estimate)",
        amount: `~${TYPICAL_CONTRACT_DEPLOY_FEE_PPL} PPL`,
        note: "A simple token contract (about 1,200,000 gas units)",
      },
    ],
    contractNote:
      "The exact cost depends on how large the contract is. You choose a gas limit before signing; gas you don't use is not returned.",
    modelANote: FEE_SPLIT_PLAIN.en,
    payOptionsNote:
      "Token and NFT creation fees can be paid in PPL, or in a supported testnet stablecoin (tUSDC/tUSDT) through the StableFeeGateway contract — your choice. The approved policy is 5.00 USD to launch a token and 10.00 USD to mint an NFT, payable in USDC/USDT or in PPL at a 20% TWAP discount. What is deployed today is narrower than that policy: the factory charges a fixed PPL amount (see the table above) and the StableFeeGateway charges a fixed owner-approved USD amount (5.00 USD / 10.00 USD). The PPL TWAP-discount path is approved but not deployed. 100% of every stablecoin fee goes to the public PPL buyback, and the bought-back PPL is then split 30/25/20/10/15 by the treasury multisig, same as every other buyback. Gas is always paid in PPL.",
    stableFeeNetworkNote:
      "Stablecoin payment works on the People network only for now. Paying from another chain (Ethereum, Polygon, Tron, TON, Solana) is coming later.",
    growthReferralTitle: "Growth referral (L1 / L2)",
    growthReferralBody:
      "15% of eligible protocol fees fund the Growth Pool. When Growth rewards settle, two paid referral lines share that budget: L1 at 70% and L2 at 30%. This is separate from the token's own community share and from ordinary fee routing to validators and the Community Pool.",
    tableColOperation: "Operation",
    tableColTariff: "Tariff",
    tableColNote: "Note",
    createContractLink: "Create a contract",
  },
  ru: {
    tag: "КОМИССИИ И ТАРИФЫ",
    title: "Публичные тарифы в PPL",
    lead:
      "Сколько стоят обычные действия в People's Blockchain. Все комиссии платятся в PPL — собственной монете сети.",
    approvedNote:
      "Это цены, которые сайт использует сейчас. Кошелёк всегда показывает точную комиссию перед подписью.",
    table: [
      {
        operation: "Обычный перевод",
        amount: `${DEFAULT_TRANSFER_FEE_PPL} PPL`,
        note: "Отправка PPL или токена другому человеку",
      },
      {
        operation: "Создание токена (минимум)",
        amount: `${DEFAULT_TOKEN_CREATE_FEE_PPL} PPL`,
        note: "Запуск собственного токена",
      },
      {
        operation: "Минт NFT (минимум)",
        amount: `${DEFAULT_NFT_MINT_FEE_PPL} PPL`,
        note: "Создание одного NFT",
      },
      {
        operation: "Цена газа контракта",
        amount: `${APPROVED_CONTRACT_GAS_PRICE_PPL.toFixed(8)} PPL за единицу газа`,
        note: "Оплачивается заранее, когда вы публикуете или используете контракт",
      },
      {
        operation: "Типичный деплой (оценка)",
        amount: `~${TYPICAL_CONTRACT_DEPLOY_FEE_PPL} PPL`,
        note: "Простой контракт токена (около 1 200 000 единиц газа)",
      },
    ],
    contractNote:
      "Точная стоимость зависит от размера контракта. Перед подписью вы задаёте лимит газа; неиспользованный газ не возвращается.",
    modelANote: FEE_SPLIT_PLAIN.ru,
    payOptionsNote:
      "Комиссию за создание токена или NFT можно платить в PPL, либо в поддерживаемом тестовом стейблкоине (tUSDC/tUSDT) через контракт StableFeeGateway — на ваш выбор. Утверждённая политика: 5.00 USD за запуск токена и 10.00 USD за минт NFT — в USDC/USDT либо в PPL со скидкой 20% по TWAP. Сейчас развёрнуто меньше: фабрика берёт фиксированную сумму в PPL (см. таблицу выше), а StableFeeGateway — фиксированную сумму в USD, утверждённую владельцем (5.00 USD / 10.00 USD). Оплата в PPL со скидкой по TWAP утверждена, но ещё не развёрнута. 100% каждой комиссии в стейблкоине идёт в публичный байбэк PPL, а выкупленный PPL затем делится 30/25/20/10/15 казначейским мультисигом, как и любой другой байбэк. Газ всегда оплачивается в PPL.",
    stableFeeNetworkNote:
      "Оплата в стейблкоине пока работает только в сети People. Оплата из другой сети (Ethereum, Polygon, Tron, TON, Solana) появится позже.",
    growthReferralTitle: "Growth-рефералы (L1 / L2)",
    growthReferralBody:
      "15% допустимых комиссий протокола идёт в Growth Pool. При распределении наград Growth два платных уровня делят этот бюджет: L1 — 70%, L2 — 30%. Это отдельно от доли сообщества в самом токене и от обычной маршрутизации комиссий валидаторам и Community Pool.",
    tableColOperation: "Операция",
    tableColTariff: "Тариф",
    tableColNote: "Примечание",
    createContractLink: "Создать контракт",
  },
  es: feesEs as FeesCopyContent,
  pt: feesPt as FeesCopyContent,
  fr: feesFr as FeesCopyContent,
  de: feesDe as FeesCopyContent,
  it: feesIt as FeesCopyContent,
  tr: feesTr as FeesCopyContent,
  vi: feesVi as FeesCopyContent,
  id: feesId as FeesCopyContent,
  zh: feesZh as FeesCopyContent,
  ar: feesAr as FeesCopyContent,
};

export const feesCopy: Record<Language, FeesCopyContent> = new Proxy(
  baseFeesCopy as unknown as Record<Language, FeesCopyContent>,
  {
    get: (target, prop: string) => target[prop as keyof typeof target] ?? target.en,
  }
);
