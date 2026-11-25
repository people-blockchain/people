import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { foundersPromoCopy } from "../src/lib/founders-promo-content.ts";
import { foundersReferralCopy } from "../src/lib/founders-referral-content.ts";
import { foundersCopyLang, foundersPublicCopy } from "../src/lib/founders-public-content.ts";

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

const CYRILLIC = /[Ѐ-ӿ]/;

test("founders promo, referral, and public copy: ru is localized with Cyrillic", () => {
  const promoRu = foundersPromoCopy("ru");
  const promoEn = foundersPromoCopy("en");
  assert.notDeepEqual(promoRu, promoEn);
  assert.match(JSON.stringify(promoRu), CYRILLIC);
  assert.equal(promoEn.cardNumberPlaceholder, "Revealed at 1,000 wallets");

  const referralRu = foundersReferralCopy("ru");
  assert.notDeepEqual(referralRu, foundersReferralCopy("en"));
  assert.match(JSON.stringify(referralRu), CYRILLIC);

  const publicRu = foundersPublicCopy("ru");
  assert.notDeepEqual(publicRu, foundersPublicCopy("en"));
  assert.match(JSON.stringify(publicRu), CYRILLIC);
});

test("foundersCopyLang passes ru through and leaves other locales alone", () => {
  assert.equal(foundersCopyLang("ru"), "ru");
  assert.equal(foundersCopyLang("en"), "en");
  assert.equal(foundersCopyLang("de"), "de");
});

const FOUNDERS_UI_FILES = [
  "src/components/founders/HumanPassportFlow.tsx",
  "src/components/founders/FoundersPersonal.tsx",
  "src/components/founders/FoundersApp.tsx",
  "src/components/founders/VerifyStatusBadge.tsx",
  "src/components/founders/FoundersNftCard.tsx",
];

test("founders UI copy lookups use foundersCopyLang", () => {
  for (const file of FOUNDERS_UI_FILES) {
    const src = readFileSync(join(root, file), "utf8");
    assert.match(src, /foundersCopyLang/, `${file} must call foundersCopyLang`);
    assert.doesNotMatch(
      src,
      /COPY\[lang\]|GUIDE\[lang\]|VERIFY_EXTRA\[lang\]|founderNftCopy\[lang\]/,
      `${file} still indexes a copy table with raw lang`,
    );
  }
});

