#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const surfaces = join(root, "src/lib/locales/surfaces");

const BANNED = /basescan|\bRPC\b|\bGnosis\b|\bSafe\b/;
const BAD_BRAND = /\bPeople\b(?!\s*(network explorer|chain))/;

function walkStrings(obj, path, out) {
  if (typeof obj === "string") {
    out.push({ path, value: obj });
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => walkStrings(item, `${path}[${i}]`, out));
    return;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      walkStrings(v, path ? `${path}.${k}` : k, out);
    }
  }
}

test("buy form copy has no banned explorer/RPC/Safe/Gnosis strings", () => {
  for (const file of readdirSync(surfaces).filter((f) => f.startsWith("buy-") && f.endsWith(".json"))) {
    const doc = JSON.parse(readFileSync(join(surfaces, file), "utf8"));
    const strings = [];
    walkStrings(doc.form ?? {}, "form", strings);
    for (const { path, value } of strings) {
      assert.doesNotMatch(value, BANNED, `${file} ${path}`);
    }
  }
});

test("new USDT copy keys use PEOPLE brand where applicable", () => {
  const keys = [
    "usdtConvertHint",
    "usdtSwapTitle",
    "usdtSwapAwaiting",
    "usdtSwapReady",
    "bridgeUsdtHint",
    "stableUsdtOption",
  ];
  for (const file of readdirSync(surfaces).filter((f) => f.startsWith("buy-") && f.endsWith(".json"))) {
    const form = JSON.parse(readFileSync(join(surfaces, file), "utf8")).form ?? {};
    for (const key of keys) {
      const value = form[key];
      if (typeof value === "string") {
        assert.doesNotMatch(value, BAD_BRAND, `${file} form.${key}`);
      }
    }
  }
});

const LANGS = ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];
const readJson = (name, lang) => JSON.parse(readFileSync(join(surfaces, `${name}-${lang}.json`), "utf8"));
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

// Purchase-limit wording per locale: "per address" and a UTC day are the old (wrong) facts.
const PER_ADDRESS = {
  en: /per address/i,
  ru: /на адрес/i,
  es: /por direcci[oó]n/i,
  pt: /por endere[cç]o/i,
  fr: /par adresse/i,
  de: /pro Adresse/i,
  it: /per indirizzo/i,
  tr: /adres başına/i,
  vi: /mỗi địa chỉ/i,
  id: /per alamat/i,
  zh: /每个地址/,
  ar: /لكل عنوان/,
};

test("purchase-limit strings are not per address or a UTC day, and keep their placeholders, in all 12 locales", () => {
  const en = readJson("buy", "en");
  const paths = {
    "rules.items[0].body": (b) => b.rules.items[0].body,
    "form.limitPerDay": (b) => b.form.limitPerDay,
    "v2.form.overDay": (b) => b.v2.form.overDay,
  };
  for (const lang of LANGS) {
    const b = readJson("buy", lang);
    for (const [path, get] of Object.entries(paths)) {
      const text = get(b);
      assert.doesNotMatch(text, PER_ADDRESS[lang], `buy-${lang} ${path}`);
      assert.doesNotMatch(text, /UTC/, `buy-${lang} ${path}`);
      assert.deepEqual(placeholders(text), placeholders(get(en)), `buy-${lang} ${path} placeholders`);
    }
    assert.match(b.rules.items[0].body, /\b24\b/, `buy-${lang} rules.items[0].body: 24 hours`);
    assert.match(b.form.limitPerDay, /\b24\b/, `buy-${lang} form.limitPerDay: 24 hours`);
  }
  assert.match(en.rules.items[0].body, /rolling 24 hours/);
  assert.match(en.v2.banner.openBody, /\$2,000 per person per rolling 24 hours/);
});

test("the other half of every purchase reaches the project wallet immediately, not at graduation", () => {
  const en = readJson("buy", "en");
  const ru = readJson("buy", "ru");
  assert.match(en.rules.items[1].body, /immediately/i);
  assert.match(ru.rules.items[1].body, /сразу|немедленно/i);
  assert.doesNotMatch(en.rules.items[1].body, /funds the project/i);
  assert.match(en.rules.details[2], /immediately/i);
  assert.match(ru.rules.details[2], /сразу/i);
  for (const lang of LANGS) {
    const b = readJson("buy", lang);
    assert.ok(b.rules.items[1].body.includes("{treasuryPct}"), `buy-${lang} rules.items[1].body: {treasuryPct}`);
    assert.ok(b.rules.details[2].includes("{treasuryPct}"), `buy-${lang} rules.details[2]: {treasuryPct}`);
  }
});

test("tokenomics, litepaper and transparency state the 50/50 split of each purchase, not a graduation split", () => {
  for (const lang of LANGS.filter((l) => l !== "en" && l !== "ru")) {
    const bullet = readJson("tokenomics", lang).saleCurveBullets[2];
    assert.match(bullet, /50/, `tokenomics-${lang} saleCurveBullets[2]`);
    assert.doesNotMatch(bullet, /LP/, `tokenomics-${lang} saleCurveBullets[2] no locked-LP split`);
  }
  const tokenomics = readFileSync(join(root, "src/lib/tokenomics-content.ts"), "utf8");
  assert.doesNotMatch(tokenomics, /Raise split 50% locked liquidity|Сбор 50% в заблокированную ликвидность/);
  assert.match(tokenomics, /goes to the treasury multisig immediately/);
  assert.match(tokenomics, /сразу, в момент покупки, поступают в мультисиг казны/);
  const transparency = readFileSync(join(root, "src/lib/transparency-content.ts"), "utf8");
  assert.match(transparency, /receives 50% of every purchase immediately/);
  assert.match(transparency, /сразу, в момент покупки, получает 50% каждой покупки/);
  for (const lang of LANGS) {
    const md = readFileSync(join(root, `src/content/litepaper/${lang}.md`), "utf8");
    const saleLine = md.split("\n").find((line) => /(50\s?%|%50)/.test(line) && /multisig|multifirma|мультисиг|متعددة التوقيع|多签|çoklu imza/i.test(line));
    assert.ok(saleLine, `litepaper ${lang}.md: the sale-proceeds line states the 50% share`);
    assert.doesNotMatch(md, /funds the project/i, `litepaper ${lang}.md`);
  }
});
