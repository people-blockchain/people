#!/usr/bin/env node
/**
 * Guards public website copy against the retired 40/5 fee split (no Growth).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const SCAN_FILES = [
  "src/lib/nodes.ts",
  "src/lib/docs-content.ts",
  "src/lib/fee-split-public.ts",
  ...readdirSync(join(root, "src/lib/locales"))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => `src/lib/locales/${f}`),
  ...readdirSync(join(root, "src/lib/locales/surfaces"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => `src/lib/locales/surfaces/${f}`),
];

/** Patterns that indicate the old public fee split (validators 40%, burn 5%, no Growth). */
const FORBIDDEN = [
  /Provisional Splits \(TBD\)/i,
  /"share":\s*"40%"/,
  /40%\s+Validators?[,/]/i,
  /40%\s+Validadores?/i,
  /40%\s+Validatoren/i,
  /40%\s+Validatori/i,
  /40 %\s+Validateurs?/i,
  /40%\s+Validator[,/]/i,
  /%40\s+Doğrulayıcı/,
  /40%\s+验证节点/,
  /,\s*5%\s+Burn\b/i,
  /,\s*5%\s+Quema\b/i,
  /,\s*5%\s+Queima\b/i,
  /,\s*5%\s+Đốt\b/,
  /,\s*5%\s+Pembakaran\b/i,
  /,\s*5%\s+销毁/,
  /,\s*5%\s+Сжигание/i,
  /5 %\s+Combustion/i,
  /5%\s+للحرق/,
  /%5\s+Yakım/,
  /5% Quema \(TBD\)/,
  /5% Burn \(TBD\)/,
  /5% Queima \(TBD\)/,
];

test("locale and public data files must not contain retired 40/5 fee split copy", () => {
  for (const rel of SCAN_FILES) {
    const text = read(rel);
    for (const pattern of FORBIDDEN) {
      assert.doesNotMatch(text, pattern, `${rel} matched ${pattern}`);
    }
  }
});

test("fee-split-public.ts documents approved 30/25/20/10/15/0 in EN", () => {
  const plain = read("src/lib/fee-split-public.ts");
  assert.match(plain, /30% to validators, 25% to the community pool/);
  assert.match(plain, /15% to Growth, 0% burned/);
});
