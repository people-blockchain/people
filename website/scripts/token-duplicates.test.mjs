import test from "node:test";
import assert from "node:assert/strict";
import { findDuplicateTokens } from "../src/lib/factory/token-duplicates.ts";

const row = (address, name, symbol, creator = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") => ({ address, name, symbol, creator });
const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";

test("a token from a different creator is a duplicate (no creator filter)", () => {
  const catalog = [row(A, "Neighbourhood Savings", "NBH", "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")];
  assert.deepEqual(findDuplicateTokens(catalog, { name: "Neighbourhood Savings", symbol: "NBH" }).map((r) => r.address), [A]);
});

test("matching is trimmed and case-insensitive", () => {
  const catalog = [row(A, "Neighbourhood Savings", "NBH")];
  assert.equal(findDuplicateTokens(catalog, { name: "  neighbourhood SAVINGS ", symbol: " nbh " }).length, 1);
});

test("a name-only or symbol-only match warns, a pair with neither does not", () => {
  const catalog = [row(A, "Neighbourhood Savings", "NBH")];
  assert.equal(findDuplicateTokens(catalog, { name: "Neighbourhood Savings", symbol: "OTHER" }).length, 1);
  assert.equal(findDuplicateTokens(catalog, { name: "Other", symbol: "NBH" }).length, 1);
  assert.equal(findDuplicateTokens(catalog, { name: "Neighbourhood Savings", symbol: "" }).length, 1);
  assert.equal(findDuplicateTokens(catalog, { name: "", symbol: "NBH" }).length, 1);
  assert.deepEqual(findDuplicateTokens(catalog, { name: "Other", symbol: "OTH" }), []);
  assert.deepEqual(findDuplicateTokens(catalog, { name: "  ", symbol: "" }), []);
});

test("duplicate addresses collapse and an empty catalog finds nothing", () => {
  const catalog = [row(A, "Same", "SAM"), row(A.toUpperCase().replace("0X", "0x"), "Same", "SAM"), row(B, "Same", "SAM")];
  assert.deepEqual(findDuplicateTokens(catalog, { name: "same", symbol: "sam" }).map((r) => r.address), [A, B]);
  assert.deepEqual(findDuplicateTokens([], { name: "Same", symbol: "SAM" }), []);
});
