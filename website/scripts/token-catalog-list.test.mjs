import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { mergeTokenCatalogRows, tokenCatalogRows } from "../src/lib/explorer/token-catalog-list.ts";

test("the token list shows every public token, including a new one, with no viewport cutoff", () => {
  const fresh = { assetId: `0x${"ab".repeat(20)}`, name: "Fresh", symbol: "FRSH", tokenAddress: `0x${"ab".repeat(20)}` };
  const rows = [
    fresh,
    ...Array.from({ length: 40 }, (_, index) => ({
      assetId: `tok-${index}`,
      name: `Token ${index}`,
      symbol: `T${index}`,
    })),
    { assetId: "fixture", name: "E2E Audit Token E2E1", symbol: "E2E" },
  ];
  const listed = tokenCatalogRows(rows);
  assert.equal(listed.length, 41);
  assert.ok(listed.some((row) => row.assetId === fresh.assetId));
  assert.equal(listed.some((row) => String(row.name).startsWith("E2E Audit")), false);
  const src = readFileSync(new URL("../src/components/explorer/ExplorerLists.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /matchMedia|innerWidth|sessionStorage/);
  assert.match(src, /localStorage/);
  assert.match(src, /readSeenTokens/);
  assert.match(src, /mergeSeenIntoCatalog/);
  assert.match(src, /rememberSeenTokens/);
});

test("a stale refresh cannot drop a token already shown, and a newly returned token is added", () => {
  const current = [
    { assetId: "0xaaa", symbol: "OLD" },
    { assetId: "0xbbb", symbol: "KEEP" },
  ];
  const incoming = [
    { assetId: "0xBBB", symbol: "KEEP2" },
    { assetId: "0xccc", symbol: "NEW" },
  ];
  const merged = mergeTokenCatalogRows(current, incoming);
  assert.deepEqual(merged.map((row) => row.assetId), ["0xaaa", "0xBBB", "0xccc"]);
  assert.equal(merged[1].symbol, "KEEP2");
  assert.equal(merged[2].symbol, "NEW");
});
