import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Keys allowed to match EN verbatim (Latin brands, USD ranges, placeholders, punctuation).
 * Document any addition here — tests fail on EN-identical strings outside this set.
 */
const ALLOWLIST = new Set([
  "emailPlaceholder",
  "kolSlugPlaceholder",
  "tier1Range",
  "tier2Range",
  "tier3Range",
  "colBuyer",
  "colDate",
  "colHoldUntil",
  "colPeriod",
  "colPpl",
  "colRate",
  "colSettlement",
  "colUsdc",
  "colVolume",
  "footerNote",
  "or",
  "none",
  "tierUsdcSuffix",
  "tierPplSuffix",
  "signInAgreementAfter",
  "accruals",
  "cabinet",
  "email",
  "emailLabel",
  "googleCta",
  "l1",
  "l2",
  "logIn",
  "pplBalance",
  "profile",
  "referrals",
  "wallet",
]);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "src/lib/locales/surfaces");
const en = JSON.parse(readFileSync(join(dir, "partner-en.json"), "utf8"));

const langs = readdirSync(dir)
  .filter((name) => name.startsWith("partner-") && name.endsWith(".json"))
  .map((name) => name.replace(/^partner-/, "").replace(/\.json$/, ""))
  .filter((lang) => lang !== "en");

test("non-EN partner locales must not copy EN strings (except allowlist)", () => {
  for (const lang of langs) {
    const got = JSON.parse(readFileSync(join(dir, `partner-${lang}.json`), "utf8"));
    const same = [];
    for (const key of Object.keys(en)) {
      if (ALLOWLIST.has(key)) continue;
      if (got[key] === en[key]) same.push(key);
    }
    assert.deepEqual(
      same,
      [],
      `${lang}: still English for keys: ${same.slice(0, 12).join(", ")}${same.length > 12 ? ` (+${same.length - 12} more)` : ""}`,
    );
  }
});
