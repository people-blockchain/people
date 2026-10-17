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
