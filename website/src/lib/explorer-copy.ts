import type { Language } from "@/lib/preferences";
import explorerAr from "./locales/surfaces/explorer-ar.json" with { type: "json" };
import explorerDe from "./locales/surfaces/explorer-de.json" with { type: "json" };
import explorerEs from "./locales/surfaces/explorer-es.json" with { type: "json" };
import explorerFr from "./locales/surfaces/explorer-fr.json" with { type: "json" };
import explorerId from "./locales/surfaces/explorer-id.json" with { type: "json" };
import explorerIt from "./locales/surfaces/explorer-it.json" with { type: "json" };
import explorerPt from "./locales/surfaces/explorer-pt.json" with { type: "json" };
import explorerTr from "./locales/surfaces/explorer-tr.json" with { type: "json" };
import explorerVi from "./locales/surfaces/explorer-vi.json" with { type: "json" };
import explorerZh from "./locales/surfaces/explorer-zh.json" with { type: "json" };

export type ExplorerCopyContent = {
  title: string;
  lead: string;
  search: string;
  searchHint: string;
  blocks: string;
  transactions: string;
  recentTransactionsEmpty?: string;
  tokens: string;
  nfts: string;
  contracts: string;
  address: string;
  height: string;
  hash: string;
  proposer: string;
  type: string;
  from: string;
  to: string;
  amount: string;
  fee: string;
  memo: string;
  status: string;
  time: string;
  gas: string;
  messages: string;
  success: string;
  failed: string;
  empty: string;
  networkUnavailable: string;
  testnet: string;
  notFound: string;
  owner: string;
  creator: string;
  collection: string;
  tokenId: string;
  minted: string;
  totalSupply: string;
  mintPrice: string;
  pplBalance: string;
  contractTitle: string;
  contractCodeSize: string;
  contractSource: string;
  contractCalls: string;
  contractNotFound: string;
  contractReceiptEmpty: string;
  contractReceiptMeta: string;
  technicalDetails: string;
  contractBytecode: string;
};

const baseExplorerCopy: Record<string, ExplorerCopyContent> = {
  en: {
    title: "Explorer",
    lead: "Blocks, transactions, addresses, tokens, and NFTs on the public testnet.",
    search: "Search",
    searchHint: "Address, transaction id, or block height",
    blocks: "Blocks",
    transactions: "Transactions",
    recentTransactionsEmpty: "No transactions in the latest 40 blocks.",
    tokens: "Tokens",
    nfts: "NFTs",
    contracts: "Contracts",
    address: "Address",
    height: "Height",
    hash: "Hash",
    proposer: "Proposer",
    type: "Type",
    from: "From",
    to: "To",
    amount: "Amount",
    fee: "Fee",
    memo: "Memo",
    status: "Status",
    time: "Time",
    gas: "Gas",
    messages: "Messages",
    success: "Success",
    failed: "Failed",
    empty: "Nothing to show yet.",
    networkUnavailable: "Network temporarily unavailable",
    testnet: "Testnet",
    notFound: "Not found on this node (history may be pruned).",
    owner: "Owner",
    creator: "Creator",
    collection: "Collection",
    tokenId: "Token ID",
    minted: "Minted",
    totalSupply: "Total supply",
    mintPrice: "Mint price",
    pplBalance: "PPL balance",
    contractTitle: "Contract",
    contractCodeSize: "On-chain code, {size} bytes",
    contractSource: "Source from deployment (when provided)",
    contractCalls: "Calls and events",
    contractNotFound: "Contract not found on this node.",
    contractReceiptEmpty: "No recent receipts in the local window.",
    contractReceiptMeta: "Status {status} · gas {gas} · {logs} log entries",
    technicalDetails: "Technical details",
    contractBytecode: "Bytecode",
  },
  ru: {
    title: "Сканер",
    lead: "Блоки, транзакции, адреса, токены и NFT в публичном testnet.",
    search: "Поиск",
    searchHint: "Адрес, id транзакции или высота блока",
    blocks: "Блоки",
    transactions: "Транзакции",
    recentTransactionsEmpty: "В последних 40 блоках нет транзакций.",
    tokens: "Токены",
    nfts: "NFT",
    contracts: "Контракты",
    address: "Адрес",
    height: "Высота",
    hash: "Хеш",
    proposer: "Продюсер",
    type: "Тип",
    from: "От",
    to: "Кому",
    amount: "Сумма",
    fee: "Комиссия",
    memo: "Мемо",
    status: "Статус",
    time: "Время",
    gas: "Газ",
    messages: "Сообщения",
    success: "Успешно",
    failed: "Ошибка",
    empty: "Пока нечего показать.",
    networkUnavailable: "Сеть временно недоступна",
    testnet: "Testnet",
    notFound: "На этой ноде не найдено (история могла быть обрезана).",
    owner: "Владелец",
    creator: "Автор",
    collection: "Коллекция",
    tokenId: "ID токена",
    minted: "Наминчено",
    totalSupply: "Всего выпущено",
    mintPrice: "Цена минта",
    pplBalance: "Баланс PPL",
    contractTitle: "Контракт",
    contractCodeSize: "Код в сети, {size} байт",
    contractSource: "Исходник из деплоя (если был передан)",
    contractCalls: "Вызовы и события",
    contractNotFound: "Контракт на этой ноде не найден.",
    contractReceiptEmpty: "В локальном окне нет свежих квитанций.",
    contractReceiptMeta: "Статус {status} · gas {gas} · {logs} записей в журнале",
    technicalDetails: "Технические детали",
    contractBytecode: "Байткод",
  },
  es: explorerEs as ExplorerCopyContent,
  pt: explorerPt as ExplorerCopyContent,
  fr: explorerFr as ExplorerCopyContent,
  de: explorerDe as ExplorerCopyContent,
  it: explorerIt as ExplorerCopyContent,
  tr: explorerTr as ExplorerCopyContent,
  vi: explorerVi as ExplorerCopyContent,
  id: explorerId as ExplorerCopyContent,
  zh: explorerZh as ExplorerCopyContent,
  ar: explorerAr as ExplorerCopyContent,
};

export const explorerCopy: Record<Language, ExplorerCopyContent> = new Proxy(
  baseExplorerCopy as unknown as Record<Language, ExplorerCopyContent>,
  {
    get: (target, prop: string) => target[prop as keyof typeof target] ?? target.en,
  }
);
