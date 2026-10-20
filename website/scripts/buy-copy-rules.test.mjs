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
const BANNED_BUY_WORDS =
  /LI\.FI|\bbridge\b|мост|конверт|Avalanche|Tron и TON|Phantom/i;

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

test("buy form copy avoids bridge/LI.FI jargon in visible strings", () => {
  for (const file of readdirSync(surfaces).filter((f) => f.startsWith("buy-") && f.endsWith(".json"))) {
    const doc = JSON.parse(readFileSync(join(surfaces, file), "utf8"));
    const strings = [];
    walkStrings(doc.form ?? {}, "form", strings);
    for (const { path, value } of strings) {
      assert.doesNotMatch(value, BANNED_BUY_WORDS, `${file} ${path}`);
    }
  }
});

test("buy form has required CTA and closed-state keys in every locale", () => {
  const required = [
    "ctaConnect",
    "ctaBuy",
    "ctaClosed",
    "closedTitle",
    "closedSub",
    "step2",
    "network",
    "disclaimerBefore",
    "disclaimerLink",
    "limitsLine",
  ];
  for (const file of readdirSync(surfaces).filter((f) => f.startsWith("buy-") && f.endsWith(".json"))) {
    const form = JSON.parse(readFileSync(join(surfaces, file), "utf8")).form ?? {};
    for (const key of required) {
      assert.ok(typeof form[key] === "string" && form[key].length > 0, `${file} form.${key}`);
    }
    assert.ok(form.networkNames?.base, `${file} networkNames`);
  }
});

test("network name strings use PEOPLE brand where applicable", () => {
  for (const file of readdirSync(surfaces).filter((f) => f.startsWith("buy-") && f.endsWith(".json"))) {
    const form = JSON.parse(readFileSync(join(surfaces, file), "utf8")).form ?? {};
    for (const value of Object.values(form.networkNames ?? {})) {
      if (typeof value === "string") {
        assert.doesNotMatch(value, BAD_BRAND, `${file} networkNames`);
      }
    }
  }
});
