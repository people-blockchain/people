import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const languages = ["ru", "en", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];
test("every locale distinguishes atomic fee calculations from the remaining JavaScript ledger", () => {
  for (const language of languages) {
    const source = readFileSync(new URL(`../src/lib/locales/${language}.ts`, import.meta.url), "utf8");
    const begin = source.indexOf("{", source.indexOf("export const"));
    const end = source.lastIndexOf("}");
    const copy = JSON.parse(source.slice(begin, end + 1));
    assert.match(copy.invariants.inv1Desc, /JavaScript/, language);
    assert.match(copy.phase1.card1.f3, /JavaScript/, language);
    assert.doesNotMatch(source, /IEEE-754|Integer Safe/, language);
  }
});
