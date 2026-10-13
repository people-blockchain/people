import { test } from "node:test";
import assert from "node:assert/strict";

test("curated keys map curated names and symbols back to their asset id", async () => {
  const { curatedAssetKeys, seedAssetMeta } = await import("../src/lib/evm/seed-assets.ts");
  const keys = curatedAssetKeys();
  assert.ok(keys.size > 0);
  for (const [assetId, meta] of Object.entries(
    (await import("../src/data/evm-seed-assets.json", { with: { type: "json" } })).default.assets
  )) {
    for (const value of [meta.symbol, meta.name]) {
      const key = value?.trim().toLowerCase();
      if (!key) continue;
      assert.ok(keys.has(key), `missing curated key ${key}`);
      assert.equal(keys.get(key), assetId.toLowerCase());
    }
    assert.equal(seedAssetMeta(assetId)?.symbol, meta.symbol);
  }
});

test("curated keys are trimmed lowercase and point at a catalog asset id", async () => {
  const { curatedAssetKeys, seedAssetMeta } = await import("../src/lib/evm/seed-assets.ts");
  for (const [key, assetId] of curatedAssetKeys()) {
    assert.equal(key, key.toLowerCase());
    assert.equal(key, key.trim());
    assert.ok(seedAssetMeta(assetId), `${assetId} is not a seed asset`);
  }
});
