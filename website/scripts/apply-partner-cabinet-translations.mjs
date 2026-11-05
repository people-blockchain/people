#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const websiteRoot = join(scriptDir, "..");
const surfacesDir = join(websiteRoot, "src/lib/locales/surfaces");
const fixturePath = join(scriptDir, "fixtures/partner-cabinet-translations.json");

const patches = JSON.parse(readFileSync(fixturePath, "utf8"));

for (const [lang, entries] of Object.entries(patches)) {
  const filePath = join(surfacesDir, `partner-${lang}.json`);
  const raw = readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);
  const keyOrder = Object.keys(data);

  for (const [key, value] of Object.entries(entries)) {
    if (!(key in data)) {
      throw new Error(`Unknown key "${key}" in partner-${lang}.json`);
    }
    data[key] = value;
  }

  const ordered = {};
  for (const key of keyOrder) {
    ordered[key] = data[key];
  }

  writeFileSync(filePath, `${JSON.stringify(ordered, null, 2)}\n`, "utf8");
  console.log(`Merged ${Object.keys(entries).length} keys into partner-${lang}.json`);
}
