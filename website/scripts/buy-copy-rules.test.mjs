#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const surfaces = join(root, "src/lib/locales/surfaces");

const BANNED = /basescan|\bRPC\b|\bGnosis\b|\bSafe\b/;
const BAD_BRAND = /\bPeople\b(?!\s*(network explorer|chain))/;

function walkStrings(obj, path, out) {
  if (typeof obj === "string") {
    out.push({ path, value: obj });
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => walkStrings(item, `${path}[${i}]`, out));
    return;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      walkStrings(v, path ? `${path}.${k}` : k, out);
    }
  }
}

test("buy form copy has no banned explorer/RPC/Safe/Gnosis strings", () => {
  for (const file of readdirSync(surfaces).filter((f) => f.startsWith("buy-") && f.endsWith(".json"))) {
    const doc = JSON.parse(readFileSync(join(surfaces, file), "utf8"));
    const strings = [];
    walkStrings(doc.form ?? {}, "form", strings);
    for (const { path, value } of strings) {
      assert.doesNotMatch(value, BANNED, `${file} ${path}`);
    }
  }
});

test("new USDT copy keys use PEOPLE brand where applicable", () => {
  const keys = [
    "usdtConvertHint",
    "usdtSwapTitle",
    "usdtSwapAwaiting",
    "usdtSwapReady",
    "bridgeUsdtHint",
    "stableUsdtOption",
  ];
  for (const file of readdirSync(surfaces).filter((f) => f.startsWith("buy-") && f.endsWith(".json"))) {
    const form = JSON.parse(readFileSync(join(surfaces, file), "utf8")).form ?? {};
    for (const key of keys) {
      const value = form[key];
      if (typeof value === "string") {
        assert.doesNotMatch(value, BAD_BRAND, `${file} form.${key}`);
      }
    }
  }
});
