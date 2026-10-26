#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src/lib/locales/surfaces");

const base = {
  title: "Buy PPL",
  lead: "Pay with USDT or USDC on your preferred network. PPL is credited to your PEOPLE wallet address.",
  networksList: "BNB Chain, Base, Ethereum, Polygon, Tron, TON, Solana",
  contractsRow: "Sale contracts (BNB Chain, Base, Ethereum, Polygon, Tron, TON, Solana)",
  salePayBody:
    "Stablecoins on BNB Chain, Base, Ethereum and Polygon go through the on-chain sale contract. Tron (USDT TRC-20), TON (USDT jetton) and Solana (USDT/USDC SPL) use a transfer to the project multisig with a unique amount and your PEOPLE address for matching.",
  pendingBadge: "Pending",
  network: "Network",
  stable: "Stablecoin",
  peopleAddress: "PEOPLE wallet address (0x)",
  amountUsdt: "Amount (USDT)",
  quotePpl: "Estimated PPL",
  createOrder: "Create payment",
  payTransfer: "Send exactly",
  payMemo: "Memo / comment",
  receiver: "Receiver",
  status: "Status",
  expires: "Expires",
  evmPay: "Pay with wallet",
  poll: "Checking payment…",
  delivered: "PPL delivery submitted",
  unavailable: "This network is not open yet.",
};

const locales = {
  en: base,
  ru: {
    title: "Купить PPL",
    lead: "Оплатите USDT или USDC в удобной сети. PPL зачисляются на ваш адрес в PEOPLE.",
    networksList: "BNB Chain, Base, Ethereum, Polygon, Tron, TON, Solana",
    contractsRow: "Контракты продажи (BNB Chain, Base, Ethereum, Polygon, Tron, TON, Solana)",
    salePayBody:
      "Стейблкоины в BNB Chain, Base, Ethereum и Polygon — через on-chain контракт продажи. Tron (USDT TRC-20), TON (jetton USDT) и Solana (USDT/USDC SPL) — перевод на мультисиг проекта с уникальной суммой и адресом PEOPLE для сопоставления.",
    pendingBadge: "скоро",
    network: "Сеть",
    stable: "Стейблкоин",
    peopleAddress: "Адрес кошелька PEOPLE (0x)",
    amountUsdt: "Сумма (USDT)",
    quotePpl: "Оценка PPL",
    createOrder: "Создать платёж",
    payTransfer: "Отправьте ровно",
    payMemo: "Комментарий",
    receiver: "Получатель",
    status: "Статус",
    expires: "Истекает",
    evmPay: "Оплатить кошельком",
    poll: "Проверяем оплату…",
    delivered: "Зачисление PPL отправлено",
    unavailable: "Эта сеть пока недоступна.",
  },
  es: {
    ...base,
    title: "Comprar PPL",
    contractsRow: "Contratos de venta (BNB Chain, Base, Ethereum, Polygon, Tron, TON, Solana)",
    pendingBadge: "Pendiente",
    unavailable: "Esta red aún no está disponible.",
  },
  pt: {
    ...base,
    title: "Comprar PPL",
    contractsRow: "Contratos de venda (BNB Chain, Base, Ethereum, Polygon, Tron, TON, Solana)",
    pendingBadge: "Pendente",
  },
  fr: {
    ...base,
    title: "Acheter des PPL",
    contractsRow: "Contrats de vente (BNB Chain, Base, Ethereum, Polygon, Tron, TON, Solana)",
    pendingBadge: "En attente",
  },
  de: {
    ...base,
    title: "PPL kaufen",
    contractsRow: "Verkaufsverträge (BNB Chain, Base, Ethereum, Polygon, Tron, TON, Solana)",
    pendingBadge: "Ausstehend",
  },
  it: {
    ...base,
    title: "Acquista PPL",
    contractsRow: "Contratti di vendita (BNB Chain, Base, Ethereum, Polygon, Tron, TON, Solana)",
    pendingBadge: "In attesa",
  },
  tr: {
    ...base,
    title: "PPL satın al",
    contractsRow: "Satış sözleşmeleri (BNB Chain, Base, Ethereum, Polygon, Tron, TON, Solana)",
    pendingBadge: "Beklemede",
  },
  vi: {
    ...base,
    title: "Mua PPL",
    contractsRow: "Hợp đồng bán (BNB Chain, Base, Ethereum, Polygon, Tron, TON, Solana)",
    pendingBadge: "Chờ",
  },
  id: {
    ...base,
    title: "Beli PPL",
    contractsRow: "Kontrak penjualan (BNB Chain, Base, Ethereum, Polygon, Tron, TON, Solana)",
    pendingBadge: "Tertunda",
  },
  zh: {
    ...base,
    title: "购买 PPL",
    contractsRow: "销售合约（BNB Chain、Base、Ethereum、Polygon、Tron、TON、Solana）",
    pendingBadge: "待定",
  },
  ar: {
    ...base,
    title: "شراء PPL",
    contractsRow: "عقود البيع (BNB Chain، Base، Ethereum، Polygon، Tron، TON، Solana)",
    pendingBadge: "قيد الانتظار",
  },
};

for (const [lang, data] of Object.entries(locales)) {
  writeFileSync(join(root, `sale-${lang}.json`), JSON.stringify(data) + "\n");
}

// Patch tokenomics surfaces salePayBody + contracts row
import { readFileSync, readdirSync } from "node:fs";
for (const file of readdirSync(root).filter((f) => f.startsWith("tokenomics-") && f.endsWith(".json"))) {
  const lang = file.replace("tokenomics-", "").replace(".json", "");
  const copy = locales[lang] ?? locales.en;
  const doc = JSON.parse(readFileSync(join(root, file), "utf8"));
  doc.salePayBody = copy.salePayBody;
  if (Array.isArray(doc.contractRows) && doc.contractRows[0]) {
    doc.contractRows[0].name = copy.contractsRow;
  }
  writeFileSync(join(root, file), JSON.stringify(doc) + "\n");
}

console.log("sale locales + tokenomics sale copy updated");
