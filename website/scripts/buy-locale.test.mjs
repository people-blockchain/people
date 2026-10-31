#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { languageFromRequest, localeFromBuyPath } from "../src/lib/locale-detect.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const surfaces = join(root, "src/lib/locales/surfaces");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const surface = (name, lang) => JSON.parse(readFileSync(join(surfaces, `${name}-${lang}.json`), "utf8"));

const LANGS = ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];

/** Structural paths of a JSON document: object keys and array lengths, not the text. */
function shape(value, path = "", out = []) {
  if (Array.isArray(value)) {
    out.push(`${path}#${value.length}`);
    value.forEach((item, i) => shape(item, `${path}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) shape(v, path ? `${path}.${k}` : k, out);
  } else {
    out.push(path);
  }
  return out;
}

const PER_PERSON = {
  en: /per person/i,
  ru: /на человека|на пользователя/i,
  es: /por persona/i,
  pt: /por pessoa/i,
  fr: /par personne/i,
  de: /pro Person/i,
  it: /per persona/i,
  tr: /kişi başına/i,
  vi: /mỗi người/i,
  id: /per orang/i,
  zh: /每人|每个人/,
  ar: /لكل شخص/,
};

const ADDRESS = {
  en: /per address/i,
  ru: /адрес/i,
  es: /dirección/i,
  pt: /endereço/i,
  fr: /adresse/i,
  de: /Adresse/i,
  it: /indirizzo/i,
  tr: /adres/i,
  vi: /địa chỉ/,
  id: /alamat/i,
  zh: /地址/,
  ar: /عنوان/,
};

test("legal-*.json has the same structure as the English source in all 12 locales", () => {
  const expected = shape(surface("legal", "en")).sort();
  for (const lang of LANGS) {
    const actual = shape(surface("legal", lang)).sort();
    assert.deepEqual(actual, expected, `legal-${lang}.json`);
  }
});

test("buy-*.json has the same keys as the English source in all 12 locales", () => {
  const expected = shape(surface("buy", "en")).sort();
  for (const lang of LANGS) {
    assert.deepEqual(shape(surface("buy", lang)).sort(), expected, `buy-${lang}.json`);
  }
});

test("terms carry the PPL sale term and the sale disclosures block in every locale", () => {
  const en = surface("legal", "en").terms.blocks;
  assert.equal(en[2].title, "Public PPL sale");
  assert.equal(en[4].title, "PPL sale disclosures");
  assert.match(en[2].body[0], /24 months/);
  assert.match(en[2].body[4], /per address/);
  for (const lang of LANGS) {
    const blocks = surface("legal", lang).terms.blocks;
    assert.ok(blocks[4].title && blocks[4].body.length > 0, `legal-${lang} disclosures block`);
    assert.ok(blocks[4].body.every((p) => typeof p === "string" && p.length > 0), `legal-${lang} disclosures text`);
    // The legal body is translated for some locales and English for the rest.
    const limits = blocks[2].body[4];
    assert.ok(ADDRESS[lang].test(limits) || /per address/.test(limits), `legal-${lang} per-address wording`);
    assert.doesNotMatch(limits, PER_PERSON[lang], `legal-${lang} per-person wording`);
    assert.doesNotMatch(limits, PER_PERSON.en, `legal-${lang} per-person wording (English)`);
    assert.doesNotMatch(blocks[2].body[0], /\$4\s?M|4 000 000|4,000,000|180/, `legal-${lang} sale term`);
  }
});

test("purchase limits are per person in a rolling 24 hours; sell-back limits stay per address, in every locale", () => {
  assert.match(surface("buy", "en").form.limitPerDay, /per person/);
  assert.match(surface("buy", "en").form.limitPerDay, /rolling 24 hours/);
  for (const lang of LANGS) {
    const b = surface("buy", lang);
    // The first sentence of the limits rule is "One person, one address." (verification); the limit follows it.
    const limitSentence = b.rules.items[0].body.split(/[.。]/).slice(1).join(" ");
    const purchaseLimits = {
      "rules.items[0].body (limit part)": limitSentence,
      "form.limitPerDay": b.form.limitPerDay,
      "v2.form.overDay": b.v2.form.overDay,
      "v2.banner.whitelistBody": b.v2.banner.whitelistBody,
      "v2.banner.openBody": b.v2.banner.openBody,
    };
    for (const [key, text] of Object.entries(purchaseLimits)) {
      assert.match(text, PER_PERSON[lang], `buy-${lang} ${key}: per person`);
      assert.doesNotMatch(text, ADDRESS[lang], `buy-${lang} ${key}: not per address`);
      assert.doesNotMatch(text, /UTC/, `buy-${lang} ${key}: not a UTC day`);
    }
    assert.doesNotMatch(b.form.limitHit, /UTC/, `buy-${lang} form.limitHit`);
    // The sell-back limit is a different thing and stays per address.
    assert.match(b.form.sellBackTerms, ADDRESS[lang], `buy-${lang} form.sellBackTerms`);
  }
});

test("Turkish surfaces state the 10% community share, never 27%", () => {
  for (const name of ["home", "hiw", "hub", "home-warm"]) {
    const file = read(`src/lib/locales/surfaces/${name}-tr.json`);
    assert.doesNotMatch(file, /%27/, `${name}-tr.json`);
  }
  assert.match(read("src/lib/locales/surfaces/home-warm-tr.json"), /%10/);
});

test("localeFromBuyPath maps /xx/buy to a shipped locale only", () => {
  assert.equal(localeFromBuyPath("/tr/buy"), "tr");
  assert.equal(localeFromBuyPath("/tr/buy/"), "tr");
  for (const lang of LANGS) assert.equal(localeFromBuyPath(`/${lang}/buy`), lang);
  assert.equal(localeFromBuyPath("/xx/buy"), null);
  assert.equal(localeFromBuyPath("/tr/buy/x"), null);
  assert.equal(localeFromBuyPath("/buy"), null);
  assert.equal(localeFromBuyPath("/tr"), null);
});

test("server language: the cookie wins over Accept-Language, which wins over English", () => {
  assert.equal(languageFromRequest("de", "tr-TR,tr;q=0.9"), "de");
  assert.equal(languageFromRequest(undefined, "tr-TR,tr;q=0.9,en;q=0.8"), "tr");
  assert.equal(languageFromRequest("xx", "pt-BR,pt;q=0.9"), "pt");
  assert.equal(languageFromRequest(null, null), "en");
});

test("proxy redirects /xx/buy to /buy keeping the query and setting the language cookie", () => {
  const proxy = read("src/proxy.ts");
  for (const lang of LANGS) assert.match(proxy, new RegExp(`\\b${lang}\\b`), `matcher lists ${lang}`);
  assert.match(proxy, /matcher:[\s\S]*\/\(en\|ru\|es\|pt\|fr\|de\|it\|tr\|vi\|id\|zh\|ar\)\/buy/);
  assert.match(proxy, /localeFromBuyPath\(pathname\)/);
  assert.match(proxy, /request\.nextUrl\.clone\(\)/);
  assert.match(proxy, /pathname = "\/buy"/);
  assert.doesNotMatch(proxy, /buy\.search\s*=/, "the query string is kept");
  assert.match(proxy, /cookies\.set\(LANG_COOKIE,\s*buyLocale/);
});

test("next.config.ts has no /buy locale redirects (a config redirect cannot set the cookie)", () => {
  const cfg = read("next.config.ts");
  const start = cfg.indexOf("async redirects()");
  const end = cfg.indexOf("async headers()");
  assert.ok(start >= 0 && end > start, "redirects() and headers() blocks are present");
  const redirects = cfg.slice(start, end);
  assert.doesNotMatch(redirects, /source:\s*["'`][^"'`]*buy/);
  assert.doesNotMatch(redirects, /source:\s*["'`]\/(\(?[a-z]{2}\b|:locale)/);
});

test("the root layout renders with the request language, not a hardcoded English snapshot", () => {
  assert.match(read("src/app/layout.tsx"), /initialLang=\{lang\}/);
  assert.doesNotMatch(read("src/lib/preferences.ts"), /getServerLanguageSnapshot/);
  assert.doesNotMatch(read("src/context/LanguageContext.tsx"), /getServerLanguageSnapshot/);
  assert.match(read("src/app/buy/page.tsx"), /generateMetadata/);
});
