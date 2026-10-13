/**
 * Every non-Russian litepaper markdown locale must be fully translated.
 * Regression: a locale file left partially untranslated reads as RU body
 * text mixed into translated chart chrome.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CYRILLIC = /[Ѐ-ӿ]/;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_DIR = join(root, "src/content/litepaper");

const NON_RUSSIAN_LANGS = ["en", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];

for (const lang of NON_RUSSIAN_LANGS) {
  test(`content/litepaper/${lang}.md has no Cyrillic text`, () => {
    const text = readFileSync(join(CONTENT_DIR, `${lang}.md`), "utf8");
    const match = text.match(CYRILLIC);
    assert.equal(match, null, `found Cyrillic character ${match?.[0]} in ${lang}.md`);
  });
}

test("content/litepaper/ru.md does contain Cyrillic text (sanity check)", () => {
  const text = readFileSync(join(CONTENT_DIR, "ru.md"), "utf8");
  assert.match(text, CYRILLIC);
});
