/**
 * Merge partner-cabinet-translations.json + partner-guest-translations.json into surface JSON.
 * Run: node scripts/apply-partner-translations.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "src/lib/locales/surfaces");
const cabinet = JSON.parse(
  readFileSync(join(root, "scripts/fixtures/partner-cabinet-translations.json"), "utf8"),
);
const guest = JSON.parse(
  readFileSync(join(root, "scripts/fixtures/partner-guest-translations.json"), "utf8"),
);

const langs = new Set([...Object.keys(cabinet), ...Object.keys(guest)]);

for (const lang of langs) {
  const file = join(dir, `partner-${lang}.json`);
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (cabinet[lang]) Object.assign(data, cabinet[lang]);
  if (guest[lang]) Object.assign(data, guest[lang]);
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log("updated", lang);
}
