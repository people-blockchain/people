import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "src/lib/locales/surfaces");
const NON_EN_LANGS = ["ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];
const ALL_LANGS = ["en", ...NON_EN_LANGS];

function load(lang) {
  return JSON.parse(readFileSync(join(dir, `home-warm-${lang}.json`), "utf8"));
}

function assertNonEmpty(en, got, path) {
  if (Array.isArray(en)) {
    assert.ok(Array.isArray(got), `${path} should be an array`);
    assert.ok(got.length > 0, `${path} is empty`);
    // Arrays of objects (e.g. stages/cards/tiles) keep a fixed item count across
    // locales; arrays of plain strings (e.g. headline line-wraps) may legitimately
    // wrap into a different number of lines per language, so only recurse
    // index-by-index when the shape is "array of objects".
    if (en.length > 0 && en[0] && typeof en[0] === "object") {
      assert.equal(got.length, en.length, `${path} array length mismatch`);
      en.forEach((item, i) => assertNonEmpty(item, got[i], `${path}[${i}]`));
    } else {
      got.forEach((item, i) => assert.ok(
        typeof item === "string" && item.length > 0,
        `${path}[${i}] is empty`,
      ));
    }
    return;
  }
  if (en && typeof en === "object") {
    assert.ok(got && typeof got === "object" && !Array.isArray(got), `${path} should be an object`);
    for (const key of Object.keys(en)) {
      assert.ok(key in got, `${path}.${key} is missing`);
      assertNonEmpty(en[key], got[key], `${path}.${key}`);
    }
    return;
  }
  if (typeof en === "string") {
    assert.equal(typeof got, "string", `${path} should be a string`);
    assert.ok(got.length > 0, `${path} is empty`);
  }
}

test("every home-warm-en.json key is present and non-empty in all locales", () => {
  const en = load("en");
  for (const lang of NON_EN_LANGS) {
    assertNonEmpty(en, load(lang), `home-warm-${lang}`);
  }
});

test("no non-ru home-warm-*.json file leaks Cyrillic text", () => {
  const CYRILLIC = /[Ѐ-ӿ]/;
  for (const lang of ALL_LANGS) {
    if (lang === "ru") continue;
    const raw = readFileSync(join(dir, `home-warm-${lang}.json`), "utf8");
    assert.doesNotMatch(raw, CYRILLIC, `home-warm-${lang}.json contains Cyrillic text`);
  }
});
