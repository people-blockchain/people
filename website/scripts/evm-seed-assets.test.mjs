import { test } from "node:test";
import assert from "node:assert/strict";

test("evm seed catalog covers discover demo asset ids", async () => {
  const catalog = await import("../src/data/evm-seed-assets.json", { with: { type: "json" } });
  const assets = catalog.default?.assets ?? catalog.assets;
  for (const id of ["trosc3", "tpitp3", "tmark3"]) {
    assert.ok(assets[id], `missing seed asset ${id}`);
    assert.ok(assets[id].creationMetadata?.image, `missing image for ${id}`);
  }
});

test("enrichAssetRow attaches creation metadata for known demo tokens", async () => {
  const { enrichAssetRow } = await import("../src/lib/evm/seed-assets.ts");
  const row = enrichAssetRow({ assetId: "trosc3", name: "On-chain", symbol: "TROSC3", decimals: 18 });
  assert.match(row.creationMetadata?.image ?? "", /tROSC\.(png|svg)/);
  assert.equal(row.name, "ROSCASH (Testnet demo)");
});
