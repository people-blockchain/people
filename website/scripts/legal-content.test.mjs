import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { legalBundle } from "../src/lib/legal-content.ts";
import { LEGAL_CONTACT_EMAIL } from "../src/lib/legal-contact.ts";
import { SITE_ROUTES } from "../src/lib/site.ts";
import {
  NON_EN_LEGAL_LOCALES,
  findUntranslated,
  structurePaths,
  untranslatedReasons,
} from "./legal-untranslated.mjs";

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

const loadLegal = (lang) => JSON.parse(readFileSync(join(surfaces, `legal-${lang}.json`), "utf8"));

test("every non-en legal locale has exactly the same keys and sections as en", () => {
  const enPaths = structurePaths(loadLegal("en"));
  for (const lang of NON_EN_LEGAL_LOCALES) {
    const paths = structurePaths(loadLegal(lang));
    assert.deepEqual(
      enPaths.filter((p) => !paths.includes(p)),
      [],
      `${lang}: keys missing vs en`,
    );
    assert.deepEqual(
      paths.filter((p) => !enPaths.includes(p)),
      [],
      `${lang}: keys not present in en`,
    );
  }
});

test("English notice keys exist in en and in every locale", () => {
  const en = loadLegal("en");
  for (const page of ["terms", "privacy"]) {
    assert.equal(en[page].englishPrevails, "In case of discrepancies, the English version prevails.");
    assert.ok(en[page].englishLink, `en/${page}.englishLink`);
    for (const lang of NON_EN_LEGAL_LOCALES) {
      const doc = loadLegal(lang)[page];
      assert.ok(doc.englishPrevails?.trim(), `${lang}/${page}.englishPrevails`);
      assert.ok(doc.englishLink?.trim(), `${lang}/${page}.englishLink`);
    }
  }
});

test("legal document shows the English-prevails notice with a link to the English page", () => {
  const src = readFileSync(join(root, "src/components/legal/LegalDocument.tsx"), "utf8");
  assert.match(src, /lang !== "en"/);
  assert.match(src, /data-testid="english-version-link"/);
  assert.match(src, /setLang\("en"\)/);
  assert.match(src, /kind === "privacy" \? "\/privacy" : "\/terms"/);
  for (const page of ["terms", "privacy"]) {
    const route = readFileSync(join(root, `src/app/${page}/page.tsx`), "utf8");
    assert.match(route, /buildLegalMetadata\(/, `${page} metadata must be localized`);
  }
});

test("untranslated-English detector flags English prose and accepts translations", () => {
  const en = "We do not sell your personal information and you may ask us to delete it.";
  assert.ok(untranslatedReasons(en, en).length > 0);
  assert.ok(untranslatedReasons("Мы не продаём ваши персональные данные.", en).length === 0);
  assert.ok(untranslatedReasons("Мы используем Vercel, Neon, Resend и Human Passport.", en).length === 0);
  assert.ok(untranslatedReasons("Children", "Children").length > 0);
});

for (const lang of NON_EN_LEGAL_LOCALES) {
  test(`legal-${lang}.json contains no untranslated English`, () => {
    const found = findUntranslated(loadLegal(lang), loadLegal("en"), lang);
    assert.deepEqual(
      found.map((f) => `${f.path} (${f.reasons.join("; ")})`),
      [],
      `${lang}: ${found.length} string(s) still English`,
    );
  });
}
