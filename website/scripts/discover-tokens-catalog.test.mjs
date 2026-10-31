import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DISCOVER_TOKENS_CACHE_CONTROL, discoverTokensFromCatalog } from "../src/lib/discover/seed.ts";

test("discover tokens come from the catalog fixture and the route is no-store", () => {
  const tokens = discoverTokensFromCatalog([
    { assetId: "ppl", name: "PEOPLE", symbol: "PPL" },
    {
      assetId: "0x" + "ab".repeat(20),
      name: "Catalog Token",
      symbol: "CAT",
      imageUri: "https://cdn.example.com/cat.png",
    },
  ]);
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].symbol, "CAT");
  assert.equal(tokens[0].imageUri, "https://cdn.example.com/cat.png");
  assert.equal(DISCOVER_TOKENS_CACHE_CONTROL, "no-store");
  const route = readFileSync(new URL("../src/app/api/discover/tokens/route.ts", import.meta.url), "utf8");
  assert.match(route, /force-dynamic/);
  assert.match(route, /DISCOVER_TOKENS_CACHE_CONTROL/);
  assert.doesNotMatch(route, /revalidate:\s*60/);
});
