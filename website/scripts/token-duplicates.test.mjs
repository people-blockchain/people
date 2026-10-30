import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { catalogRowsToTokens, findDuplicateTokens, loadDuplicateCatalog } from "../src/lib/factory/token-duplicates.ts";

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

test("clean browser: empty localStorage still warns from the server-side catalog", async () => {
  const previous = globalThis.localStorage;
  const touched = [];
  globalThis.localStorage = new Proxy({}, { get: (_t, key) => { touched.push(String(key)); return () => null; } });
  try {
    const rows = [
      { assetId: A, tokenAddress: A, name: "Neighbourhood Savings", symbol: "NBH", creator: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" },
      { assetId: "ppl", name: "PEOPLE", symbol: "PPL" },
      { name: "no address", symbol: "X" },
    ];
    const catalog = await loadDuplicateCatalog(async () => rows);
    assert.equal(catalog.length, 2);
    const found = findDuplicateTokens(catalog, { name: "neighbourhood savings", symbol: "nbh" });
    assert.deepEqual(found.map((r) => r.address), [A]);
    assert.equal(found[0].creator, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    assert.deepEqual(touched, []);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("a failing or malformed catalog response yields no entries instead of throwing in the mapper", async () => {
  assert.deepEqual(catalogRowsToTokens({ error: "x" }), []);
  await assert.rejects(loadDuplicateCatalog(async () => { throw new Error("http_502"); }));
});

test("the launch form does not read browser storage for the duplicate source", () => {
  const source = readFileSync(new URL("../src/components/factory/EvmTokenLaunch.tsx", import.meta.url), "utf8");
  assert.ok(!source.includes("readCreatedTokens"));
  assert.ok(source.includes("loadDuplicateCatalog("));
});
