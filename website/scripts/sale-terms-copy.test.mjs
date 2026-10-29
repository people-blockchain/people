import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const LANGS = ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];
const buy = Object.fromEntries(
  LANGS.map((l) => [l, JSON.parse(readFileSync(join(root, `src/lib/locales/surfaces/buy-${l}.json`), "utf8"))]),
);

function shape(value, prefix = "", out = new Map()) {
  if (Array.isArray(value)) {
    out.set(`${prefix}[len]`, String(value.length));
    value.forEach((v, i) => shape(v, `${prefix}.${i}`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) shape(v, prefix ? `${prefix}.${k}` : k, out);
  } else if (typeof value === "string") {
    out.set(prefix, [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(","));
  }
  return out;
}

test("every buy locale has the same keys, array lengths and placeholders as en", () => {
  const en = shape(buy.en);
  for (const lang of LANGS) {
    const got = shape(buy[lang]);
    assert.deepEqual([...got.keys()].sort(), [...en.keys()].sort(), `${lang}: key set`);
    for (const [key, placeholders] of en) {
      // The en notes strip markers; compare placeholders only where en has them.
      assert.equal(got.get(key), placeholders, `${lang}: ${key}`);
    }
  }
});

test("rules and FAQ take every sale number from the contract placeholders", () => {
  const needs = (text, keys, where) => {
    for (const key of keys) assert.ok(text.includes(`{${key}}`), `${where}: {${key}}`);
  };
  for (const lang of LANGS) {
    const b = buy[lang];
    const [limits, reserve, sellBack, contract] = b.rules.items.map((item) => `${item.title} ${item.body}`);
    needs(limits, ["whitelistDays", "min", "max", "perDay", "cooldown"], `${lang}: rules.items[0]`);
    needs(reserve, ["reservePct", "treasuryPct"], `${lang}: rules.items[1]`);
    needs(sellBack, ["holdDays", "sellDailyPct", "sellPerAddress", "feeLow", "feeHigh", "feeThreshold"], `${lang}: rules.items[2]`);
    needs(contract, ["signersM", "signersN"], `${lang}: rules.items[3]`);
    needs(b.faq.items[3].a, ["holdDays", "sellDailyPct", "sellPerAddress"], `${lang}: faq sell-back answer`);
    needs(b.rules.details.join(" "), ["releaseDays"], `${lang}: rules details release notice`);
    // No literal sale numbers in the new blocks: a digit there would bypass the contract constants.
    // The only literal figure allowed is the fixed 24-hour purchase window in the limits rule.
    for (const text of [limits, reserve, sellBack, contract, b.faq.items[3].a]) {
      const bare = text.replace(/\{\w+\}/g, "").replace(text === limits ? /\b24\b/ : /^$/, "");
      assert.doesNotMatch(bare, /\d/, `${lang}: literal number in ${text}`);
    }
    assert.match(b.rules.items[0].body, /\b24\b/, `${lang}: rolling 24-hour window in rules.items[0]`);
  }
});

test("terms are stated in every language", () => {
  for (const lang of LANGS) {
    const b = buy[lang];
    const sb = b.form.sellBackTerms;
    for (const n of ["30", "2", "3", "1"]) assert.match(sb, new RegExp(n), `${lang}: sell-back ${n}`);
    assert.match(sb, /1[.,]5/, `${lang}: fee 1.5`);
    assert.match(sb, /2[.,\s  ]?000/, `${lang}: $2,000`);
    assert.match(b.form.saleTermsNote, /24/, `${lang}: 24 months`);
    assert.match(b.form.saleTermsNote, /Community Pool/, `${lang}: Community Pool`);
    for (const text of [b.form.payFromNetworks, b.faq.items[2].a]) {
      for (const word of ["Tron", "Solana", "TON"]) assert.match(text, new RegExp(word), `${lang}: ${word}`);
      assert.match(text, /EVM/, `${lang}: EVM`);
    }
    assert.doesNotMatch(JSON.stringify(b), /Tonkeeper|TRC-20|jetton/i, lang);
    for (const key of [b.form.riskBody, b.form.riskTitle, b.form.saleTermsNote, b.faq.items[4].a, b.faq.riskBody]) {
      assert.ok(key && key.length > 1, `${lang}: risk/refund copy present`);
    }
  }
});

test("forbidden wording never appears in buy copy", () => {
  const forbidden = [
    /180/,
    /пул сообщества|fondo comunitario|kolam komunitas|社区池|community pool/,
    /audited by|аудит:|auditado por|audité par|auditiert von|auditato da|denetleyen|kiểm toán bởi|diaudit oleh|审计：|تم تدقيقه/i,
    /the earlier you buy, the less you pay/i,
  ];
  for (const lang of LANGS) {
    const blob = JSON.stringify(buy[lang]);
    for (const pattern of forbidden) assert.doesNotMatch(blob, pattern, `${lang}: ${pattern}`);
  }
});

test("sale config states the fixed facts", () => {
  const config = readFileSync(join(root, "src/lib/sale/config.ts"), "utf8");
  for (const needle of [
    "saleTermMonths: 24",
    "holdDays: 30",
    "dailyCapReservePct: 2",
    "perPersonPerDayUsd: 2000",
    "feePct: 1.5",
    "feeHighPct: 3",
    "feeHighThresholdReservePct: 1",
    'closesAt: "graduation"',
    "ton: false",
    "tron: true",
    "solana: true",
    "chainId: 8453",
  ]) {
    assert.ok(config.includes(needle), needle);
  }
  assert.doesNotMatch(config, /durationDays|SUPPORTED_WALLETS|AI_AUDITS/);
});

test("the sale never targets the PEOPLE chain on /buy", () => {
  for (const file of ["src/components/buy/BuyForm.tsx", "src/lib/sale/useBuyPpl.ts", "src/context/ExternalWalletContext.tsx"]) {
    const text = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(text, /ensurePeopleChain\(/, `${file}: no PEOPLE chain switch`);
    assert.doesNotMatch(text, /0x17c79/i, file);
  }
});
