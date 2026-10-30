import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { evmCompatCacheControl } from "../src/lib/evm/compat-cache.ts";
import {
  SEEN_TOKENS_TTL_MS,
  mergeSeenIntoCatalog,
  readSeenTokens,
  rememberSeenTokens,
} from "../src/lib/explorer/token-catalog-list.ts";

const now = 1_700_000_000_000;

test("a token this browser already saw stays in the list until the server returns it", () => {
  const server = [{ assetId: "0xaaa", symbol: "OLD" }];
  const seen = [{ assetId: "0xbbb", symbol: "NEW", seenAt: now - 1_000 }];
  const merged = mergeSeenIntoCatalog(server, seen, now);
  assert.deepEqual(merged.map((row) => row.assetId), ["0xaaa", "0xbbb"]);

  const stale = [{ assetId: "0xccc", symbol: "GONE", seenAt: now - SEEN_TOKENS_TTL_MS - 1 }];
  assert.deepEqual(mergeSeenIntoCatalog(server, stale, now).map((row) => row.assetId), ["0xaaa"]);

  const both = mergeSeenIntoCatalog(
    [{ assetId: "0xbbb", symbol: "SERVER" }],
    [{ assetId: "0xBBB", symbol: "LOCAL", seenAt: now }],
    now,
  );
  assert.equal(both.length, 1);
  assert.equal(both[0].symbol, "SERVER");

  const created = mergeSeenIntoCatalog([], [{ assetId: "0xddd", symbol: "MADE", createdAt: now - 50 }], now);
  assert.equal(created[0].symbol, "MADE");
  assert.equal(mergeSeenIntoCatalog([], [{ assetId: "0xeee", symbol: "NOTIME" }], now).length, 1);
});

test("seen tokens round-trip through storage and drop after the TTL", () => {
  const saved = new Map();
  const storage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
  };
  rememberSeenTokens(storage, [{ assetId: "0xbbb", name: "New", symbol: "NEW", tokenAddress: "0xbbb" }], now);
  assert.equal(readSeenTokens(storage, now)[0].symbol, "NEW");
  assert.equal(readSeenTokens(storage, now + SEEN_TOKENS_TTL_MS + 5).length, 0);
});

test("the token list response is not stored by a CDN", () => {
  assert.equal(evmCompatCacheControl("assets"), "no-store");
  assert.equal(evmCompatCacheControl("assets").includes("stale-while-revalidate"), false);
  assert.match(evmCompatCacheControl("liquidity-pools"), /s-maxage=30/);
  assert.match(evmCompatCacheControl("liquidity-pools"), /stale-while-revalidate=300/);
  const route = readFileSync(new URL("../src/app/api/evm/compat/[...path]/route.ts", import.meta.url), "utf8");
  assert.match(route, /evmCompatCacheControl/);
  assert.match(route, /Cache-Control/);
});
