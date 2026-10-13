import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "src/lib/locales/surfaces");
const langs = readdirSync(dir)
  .filter((name) => name.startsWith("partner-") && name.endsWith(".json"))
  .map((name) => name.replace(/^partner-/, "").replace(/\.json$/, ""));

test("partner surfaces exist for all 12 locales", () => {
  const expected = ["en", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar", "ru"];
  assert.deepEqual([...langs].sort(), [...expected].sort());
});

test("partner copy avoids Model A wording", () => {
  for (const lang of langs) {
    const blob = readFileSync(join(dir, `partner-${lang}.json`), "utf8");
    assert.doesNotMatch(blob, /Model A/i, lang);
  }
});

test("partner locale JSON keys match EN", () => {
  const en = JSON.parse(readFileSync(join(dir, "partner-en.json"), "utf8"));
  const enKeys = Object.keys(en).sort();
  for (const lang of langs) {
    if (lang === "en") continue;
    const got = JSON.parse(readFileSync(join(dir, `partner-${lang}.json`), "utf8"));
    assert.deepEqual(Object.keys(got).sort(), enKeys, lang);
  }
});
