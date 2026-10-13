import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ALL_LOCALES = ["en", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar", "ru"];

function extractRecord(src, name) {
  const match = src.match(new RegExp(`const ${name}:[\\s\\S]*?= \\{\\n([\\s\\S]*?)\\n\\};`));
  assert.ok(match, `${name} not found`);
  return match[1];
}

// The wallet-link copy used to live in FoundersPersonal (HP_COPY / PW_COPY); it is now the
// Human Passport flow's own COPY table, so both records are still checked here.
const COPY_SOURCES = {
  COPY: "src/components/founders/HumanPassportFlow.tsx",
  VERIFY_EXTRA: "src/components/founders/FoundersPersonal.tsx",
};

test("Human Passport copy (flow COPY, VERIFY_EXTRA badges) is translated for all 12 locales, not just en/ru", () => {
  for (const [name, file] of Object.entries(COPY_SOURCES)) {
    const src = readFileSync(join(root, file), "utf8");
    const body = extractRecord(src, name);
    for (const lang of ALL_LOCALES) {
      assert.match(body, new RegExp(`^\\s*${lang}: \\{`, "m"), `${name} is missing the "${lang}" locale`);
    }
  }
});

// Mirrors fill() in src/components/warm/warm-ui.tsx (re-exported through founders-ui): the
// placeholder syntax there is {{name}}, with TWO braces. The whole flow COPY table shipped
// with single-brace placeholders, so the indicator rendered the literal "STEP {STEP} OF 4"
// and the low-score message rendered "is {score}, required {need}" on every viewport.
const FILL_RE = /\{\{(\w+)\}\}/g;

/** The values the flow passes to fill() for each interpolated key, per call site. */
const FILL_ARGS = {
  stepOf: { step: 2 },
  scoredWallet: { walletLabel: "your wallet", wallet: "0x1111…1111" },
  walletReady: { address: "0x1111…1111" },
  low: { walletLabel: "your wallet", wallet: "0x1111…1111", score: 4.2, need: 20 },
};

test("every interpolated Human Passport string substitutes in every locale", () => {
  const src = readFileSync(join(root, COPY_SOURCES.COPY), "utf8");
  const body = extractRecord(src, "COPY");

  for (const [key, vars] of Object.entries(FILL_ARGS)) {
    const templates = [...body.matchAll(new RegExp(`${key}:\\s*"([^"]*)"`, "g"))].map((m) => m[1]);
    assert.equal(templates.length, ALL_LOCALES.length, `expected one ${key} string per locale`);

    for (const template of templates) {
      const rendered = template.replace(FILL_RE, (_, name) =>
        name in vars ? String(vars[name]) : `UNFILLED:${name}`,
      );
      assert.ok(!/[{}]/.test(rendered), `${key} renders literal placeholders: ${rendered}`);
    }
  }
});

test("no flow COPY string keeps a single-brace placeholder", () => {
  const src = readFileSync(join(root, COPY_SOURCES.COPY), "utf8");
  const body = extractRecord(src, "COPY");
  // A {word} that is not part of a {{word}} pair is a placeholder fill() will never replace.
  const strays = [...body.matchAll(/(?<!\{)\{[a-zA-Z]\w*\}(?!\})/g)].map((m) => m[0]);
  assert.deepEqual(strays, [], `single-brace placeholders fill() cannot substitute: ${strays.join(", ")}`);
});
