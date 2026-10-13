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

test("founders promo RU matches EN structure", () => {
  assert.deepEqual(shape(load("founders-promo-ru.json")), shape(load("founders-promo-en.json")));
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

test("founders promo copy carries the agreed hero and disclaimer", () => {
  const en = load("founders-promo-en.json");
  const ru = load("founders-promo-ru.json");
  assert.equal(en.heroTitle, "Be one of the first million people building a blockchain for everyone.");
  assert.equal(ru.heroTitle, "Стань одним из первых миллиона людей, кто строит блокчейн для всех.");
  assert.equal(en.disclaimer, "Preliminary. Points, rates and season budget may change before mainnet. Not a promise of income.");
  assert.equal(ru.disclaimer, "Предварительно. Очки, курсы и бюджет сезона могут измениться до мейннета. Это не обещание дохода.");
  assert.equal(en.countriesEmpty, "Be the first founder from your country");
  assert.equal(en.faq.length, 6);
  assert.equal(ru.faq.length, 6);
});
