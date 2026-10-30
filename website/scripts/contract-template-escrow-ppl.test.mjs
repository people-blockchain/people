import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONTRACT_TEMPLATES, findTemplateById, templateSummary } from "../src/lib/contract-templates.ts";

const LANGS = ["en", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar", "ru"];

test("escrow summary names PPL, not an ETH-like native value, in all 12 languages", () => {
  const escrow = findTemplateById("escrow");
  assert.ok(escrow);
  for (const lang of LANGS) {
    const text = templateSummary(escrow, lang);
    assert.match(text, /PPL/, `${lang}: ${text}`);
    assert.doesNotMatch(text, /\bETH\b|ETH-like|native value|натив/i, `${lang}: ${text}`);
  }
  // Non-English languages get their own text, not the English fallback.
  for (const lang of LANGS.filter((l) => l !== "en")) {
    assert.notEqual(templateSummary(escrow, lang), escrow.summaryEn, lang);
  }
});

test("no template summary mentions ETH in any language", () => {
  for (const template of CONTRACT_TEMPLATES) {
    for (const lang of LANGS) {
      assert.doesNotMatch(templateSummary(template, lang), /\bETH\b|ETH-like/, `${template.id}/${lang}`);
    }
  }
});

test("templateSummary falls back to English for a language without its own text", () => {
  const vesting = findTemplateById("vesting");
  assert.equal(templateSummary(vesting, "de"), vesting.summaryEn);
  assert.equal(templateSummary(vesting, "ru"), vesting.summaryRu);
});

test("compose route returns the summary in the requested site language", () => {
  const src = readFileSync(new URL("../src/app/api/contracts/compose/route.ts", import.meta.url), "utf8");
  assert.match(src, /templateSummary\(template, typeof body\.lang === "string" \? body\.lang : lang\)/);
});

test('picking a file never shows the generic "Could not submit" prefix', () => {
  // FactoryWizard: file selection writes only to uploadError, never to the submit error.
  const wizard = readFileSync(new URL("../src/components/factory/FactoryWizard.tsx", import.meta.url), "utf8");
  const onFile = wizard.slice(wizard.indexOf("const onFile = useCallback"), wizard.indexOf("}, [", wizard.indexOf("const onFile = useCallback")));
  assert.ok(onFile.length > 0);
  assert.doesNotMatch(onFile, /\bsetError\(/);
  assert.match(onFile, /setUploadError\(/);
  // EvmNftMint: errors from the media picker are shown without the form.error prefix.
  const mint = readFileSync(new URL("../src/components/factory/EvmNftMint.tsx", import.meta.url), "utf8");
  assert.match(mint, /errorFrom === "pick" \? errorText : `\$\{form\.error\}: \$\{errorText\}`/);
});
