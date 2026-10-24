import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "src/lib/locales/surfaces");
const extra = ["es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];
const surfaces = [
  "hub",
  "docs",
  "wallet",
  "explorer",
  "factory",
  "fees",
  "partner",
  "swap",
  "home",
  "discover",
  "agents",
  "roadmap",
  "ecosystem",
  "founders",
  "lavka",
  "litepaper",
  "samples",
];

function load(name) {
  return JSON.parse(readFileSync(join(dir, name), "utf8"));
}

function keysOf(obj) {
  if (Array.isArray(obj)) {
    return obj.map(keysOf);
  }
  if (obj && typeof obj === "object") {
    return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, keysOf(obj[k])]));
  }
  return typeof obj;
}

function lengthsOf(obj) {
  if (Array.isArray(obj)) {
    return { len: obj.length, items: obj.map(lengthsOf) };
  }
  if (obj && typeof obj === "object") {
    return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, lengthsOf(obj[k])]));
  }
  return null;
}

// Surfaces where a locale file may carry only a subset of EN's top-level keys;
// the app merges with EN at read time (see litepaper-content.ts) so missing
// keys fall back to EN instead of being `undefined`. Any key an extra-locale
// file DOES define must still be a real EN key, and typed the same.
const PARTIAL_FALLBACK_SURFACES = new Set(); // litepaper locales now carry full key sets

function assertKeysSubsetOfEn(got, en, path) {
  if (Array.isArray(en)) {
    assert.ok(Array.isArray(got), `${path} should be an array`);
    return;
  }
  if (en && typeof en === "object") {
    assert.ok(got && typeof got === "object" && !Array.isArray(got), `${path} should be an object`);
    for (const key of Object.keys(got)) {
      assert.ok(key in en, `${path}.${key} is not a known EN key`);
      assertKeysSubsetOfEn(got[key], en[key], `${path}.${key}`);
    }
    return;
  }
  assert.equal(typeof got, typeof en, `${path} type mismatch`);
}

test("extra-language surface JSON matches EN key structure and array lengths", () => {
  for (const lang of extra) {
    for (const surface of surfaces) {
      const got = load(`${surface}-${lang}.json`);
      const en = load(`${surface}-en.json`);
      if (PARTIAL_FALLBACK_SURFACES.has(surface)) {
        assertKeysSubsetOfEn(got, en, `${surface}-${lang}`);
        continue;
      }
      assert.deepEqual(keysOf(got), keysOf(en), `${surface}-${lang} keys`);
      assert.deepEqual(lengthsOf(got), lengthsOf(en), `${surface}-${lang} array lengths`);
    }
  }
});

test("each extra language has distinctive hub.hero.ctaJoin and docs.title", () => {
  const enHub = load("hub-en.json");
  const enDocs = load("docs-en.json");
  for (const lang of extra) {
    const hub = load(`hub-${lang}.json`);
    const docs = load(`docs-${lang}.json`);
    assert.notEqual(hub.hero.ctaJoin, enHub.hero.ctaJoin, `${lang} ctaJoin`);
    assert.notEqual(docs.title, enDocs.title, `${lang} docs.title`);
    assert.ok(hub.hero.ctaJoin.length > 2, lang);
    assert.ok(docs.title.length > 2, lang);
  }
});

test("hub pillars do not use allocation or 10%+", () => {
  for (const lang of [...extra, "en"]) {
    const hub = load(`hub-${lang}.json`);
    const p0 = hub.hero.pillars[0];
    const blob = `${p0.title} ${p0.note}`;
    assert.doesNotMatch(blob, /allocation/i);
    assert.doesNotMatch(blob, /10%\+/);
    assert.doesNotMatch(blob, /10% \+/);
  }
});

test("spot-check each extra locale hub/docs/wallet/fees is not English homepage copy", () => {
  const enHub = load("hub-en.json");
  const enWallet = load("wallet-en.json");
  const enFees = load("fees-en.json");
  for (const lang of extra) {
    const hub = load(`hub-${lang}.json`);
    const wallet = load(`wallet-${lang}.json`);
    const fees = load(`fees-${lang}.json`);
    assert.notEqual(hub.hero.lead, enHub.hero.lead, `${lang} hub lead`);
    assert.notEqual(wallet.unlock, enWallet.unlock, `${lang} wallet unlock`);
    assert.notEqual(fees.title, enFees.title, `${lang} fees title`);
  }
});

test("no non-ru surface file leaks Cyrillic text (home/agents regression: #263 wip batch)", () => {
  const CYRILLIC = /[Ѐ-ӿ]/;
  for (const lang of extra) {
    for (const surface of surfaces) {
      const raw = readFileSync(join(dir, `${surface}-${lang}.json`), "utf8");
      assert.doesNotMatch(raw, CYRILLIC, `${surface}-${lang}.json contains Cyrillic text`);
    }
  }
});
