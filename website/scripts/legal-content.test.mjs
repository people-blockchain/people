import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { legalBundle } from "../src/lib/legal-content.ts";
import { LEGAL_CONTACT_EMAIL } from "../src/lib/legal-contact.ts";
import { SITE_ROUTES } from "../src/lib/site.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const surfaces = join(root, "src/lib/locales/surfaces");
const localesDir = join(root, "src/lib/locales");

test("legal policy is English-only single bundle with required sections", () => {
  assert.equal(legalBundle.privacy.effectiveDate, "23 October 2026");
  assert.equal(legalBundle.terms.effectiveDate, "23 October 2026");
  assert.ok(legalBundle.privacy.blocks.length >= 8);
  assert.ok(legalBundle.terms.blocks.length >= 6);
  assert.match(legalBundle.privacy.contactBody, /\{email\}/);
  const blob = JSON.stringify(legalBundle);
  assert.match(blob, /ppl-web-wallets/);
  assert.match(blob, /people_partner_ref/);
  assert.match(blob, /Neon/);
  assert.match(blob, /do not run third-party advertising or analytics scripts/i);
});

test("legal surfaces exist for all 12 locales", () => {
  const langs = ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];
  const legalFiles = readdirSync(surfaces)
    .filter((name) => name.startsWith("legal-") && name.endsWith(".json"))
    .sort();
  assert.deepEqual(
    legalFiles,
    langs.map((l) => `legal-${l}.json`).sort(),
  );
});

test("legal surfaces do not hide public sale (P0-10)", () => {
  const banned = [/no public PPL sale/i, /payment widget is switched off/i, /no token prices/i];
  for (const file of readdirSync(surfaces).filter((n) => n.startsWith("legal-"))) {
    const raw = readFileSync(join(surfaces, file), "utf8");
    for (const re of banned) {
      assert.doesNotMatch(raw, re, file);
    }
    assert.match(raw, /\/buy/, `${file} should reference /buy`);
  }
});

test("privacy and terms routes are public and contact email is set", () => {
  const paths = new Set(SITE_ROUTES.map((r) => r.path));
  assert.ok(paths.has("/privacy"));
  assert.ok(paths.has("/terms"));
  assert.equal(LEGAL_CONTACT_EMAIL, "privacy@peopleblockchain.network");
});

test("non-English legal pages say the English text prevails", () => {
  for (const lang of ["ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"]) {
    const doc = JSON.parse(readFileSync(join(surfaces, `legal-${lang}.json`), "utf8"));
    for (const page of ["terms", "privacy"]) assert.ok(doc[page].englishPrevails, `${lang}/${page}`);
  }
});

test("footer and partner login UI strings exist in every locale", () => {
  const langs = [
    "en",
    "ru",
    "es",
    "pt",
    "fr",
    "de",
    "it",
    "tr",
    "vi",
    "id",
    "zh",
    "ar",
  ];
  const enPartner = JSON.parse(readFileSync(join(surfaces, "partner-en.json"), "utf8"));
  const partnerKeys = [
    "signInAgreementBefore",
    "signInTermsLink",
    "signInAgreementAnd",
    "signInPrivacyLink",
    "signInAgreementAfter",
  ];
  for (const lang of langs) {
    const localeText = readFileSync(join(localesDir, `${lang}.ts`), "utf8");
    assert.match(localeText, /"privacyLink":/, lang);
    assert.match(localeText, /"termsLink":/, lang);
    const partner = JSON.parse(readFileSync(join(surfaces, `partner-${lang}.json`), "utf8"));
    for (const key of partnerKeys) {
      assert.ok(partner[key], `${lang}.${key}`);
    }
  }
  assert.deepEqual(
    Object.keys(JSON.parse(readFileSync(join(surfaces, "partner-ru.json"), "utf8"))).sort(),
    Object.keys(enPartner).sort(),
  );
});

test("legal-en.json is valid JSON on disk", () => {
  const raw = readFileSync(join(surfaces, "legal-en.json"), "utf8");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.privacy.title, "Privacy Policy");
  assert.equal(parsed.terms.title, "Terms of Service");
});
