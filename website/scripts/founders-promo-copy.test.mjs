import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const surfaces = join(root, "src/lib/locales/surfaces");
const load = (name) => JSON.parse(readFileSync(join(surfaces, name), "utf8"));

function shape(obj) {
  if (Array.isArray(obj)) return obj.map(shape);
  if (obj && typeof obj === "object") return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, shape(obj[k])]));
  return typeof obj;
}

/** `hello` is a greeting carousel: each locale leads with its own language, so lengths may differ. */
const FREE_LENGTH_LISTS = ["hello"];

test("founders promo RU matches EN structure", () => {
  const ru = load("founders-promo-ru.json");
  const en = load("founders-promo-en.json");
  for (const key of FREE_LENGTH_LISTS) {
    for (const copy of [ru, en]) {
      assert.ok(Array.isArray(copy[key]) && copy[key].length > 0 && copy[key].every((item) => typeof item === "string" && item));
    }
  }
  const strip = (copy) => Object.fromEntries(Object.entries(copy).filter(([key]) => !FREE_LENGTH_LISTS.includes(key)));
  assert.deepEqual(shape(strip(ru)), shape(strip(en)));
});

test("founders copy names only Telegram and Human Passport verification", () => {
  const files = readdirSync(surfaces).filter((f) => f.startsWith("founders-"));
  for (const f of files) {
    const text = readFileSync(join(surfaces, f), "utf8");
    assert.doesNotMatch(text, /World ID/i, f);
    assert.doesNotMatch(text, /clawback/i, f);
  }
  const component = readFileSync(join(root, "src/components/founders/FoundersApp.tsx"), "utf8");
  assert.doesNotMatch(component, /WorldId/);
});

test("founders promo copy still powers card and referral UI strings", () => {
  const en = load("founders-promo-en.json");
  assert.ok(en.ctaClaim);
  assert.ok(en.cardFounder);
  assert.equal(en.countriesEmpty, "Be the first founder from your country");
});

const CARD_KEYS = [
  "eyebrow",
  "cardFounder",
  "cardNumberPlaceholder",
  "cardNetwork",
  "cardFlipHint",
  "cardBackTitle",
  "cardCountry",
  "cardRank",
  "cardPoints",
];
const CARD_LANGS = ["ar", "de", "es", "fr", "id", "it", "pt", "tr", "vi", "zh"];
/** Values that legitimately equal the English copy, keyed as `lang.key`. */
const SAME_AS_EN_ALLOWED = new Set(["fr.cardPoints"]);

const isText = (value) => typeof value === "string" && value.trim().length > 0;
const cardFile = (lang) => `founders-card-${lang}.json`;

function assertCardCopy(lang, copy, en) {
  for (const key of CARD_KEYS) {
    assert.ok(isText(copy[key]), `${lang}.${key} must be a non-empty string`);
    if (lang !== "en" && !SAME_AS_EN_ALLOWED.has(`${lang}.${key}`)) {
      assert.notEqual(copy[key], en[key], `${lang}.${key} must differ from English`);
    }
  }
  assert.ok(Array.isArray(copy.cardBackLines) && copy.cardBackLines.length === 3, `${lang}.cardBackLines must have 3 lines`);
  copy.cardBackLines.forEach((line, i) => {
    assert.ok(isText(line), `${lang}.cardBackLines[${i}] must be a non-empty string`);
    if (lang !== "en") assert.notEqual(line, en.cardBackLines[i], `${lang}.cardBackLines[${i}] must differ from English`);
  });
}

test("founder card copy is complete for all 12 languages", () => {
  const en = load("founders-promo-en.json");
  assertCardCopy("en", en, en);
  assertCardCopy("ru", load("founders-promo-ru.json"), en);
  for (const lang of CARD_LANGS) assertCardCopy(lang, load(cardFile(lang)), en);
});

test("founder card locale files hold exactly the card keys", () => {
  const expected = [...CARD_KEYS, "cardBackLines"].sort();
  for (const lang of CARD_LANGS) {
    assert.deepEqual(Object.keys(load(cardFile(lang))).sort(), expected, cardFile(lang));
  }
});

test("founder card locale files keep scripts and brand names clean", () => {
  for (const lang of CARD_LANGS) {
    const copy = load(cardFile(lang));
    const values = [...CARD_KEYS.map((key) => copy[key]), ...copy.cardBackLines];
    for (const value of values) {
      assert.doesNotMatch(value, /[Ѐ-ӿ]/, `${lang}: Cyrillic in "${value}"`);
      for (const brand of value.match(/\b(?:people|ppl)\b/gi) ?? []) {
        assert.equal(brand, brand.toUpperCase(), `${lang}: brand must be uppercase in "${value}"`);
      }
    }
  }
});

test("foundersPromoCopy serves the card translation for every new language", async () => {
  const { foundersPromoCopy } = await import("../src/lib/founders-promo-content.ts");
  const en = load("founders-promo-en.json");
  const ru = load("founders-promo-ru.json");
  assert.deepEqual(foundersPromoCopy("en"), en);
  assert.deepEqual(foundersPromoCopy("ru"), ru);
  for (const lang of CARD_LANGS) {
    const card = load(cardFile(lang));
    const copy = foundersPromoCopy(lang);
    for (const key of [...CARD_KEYS, "cardBackLines"]) assert.deepEqual(copy[key], card[key], `${lang}.${key}`);
    assert.equal(copy.ctaClaim, en.ctaClaim, `${lang} keeps English for non-card copy`);
    assert.equal(foundersPromoCopy(lang), copy, `${lang} copy is precomputed`);
  }
});
