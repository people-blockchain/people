import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { founderDemoAssetIds } = await import("../src/lib/founders/demo-airdrop.ts");
const { readEvmDeployments } = await import("../src/lib/evm/config.ts");

const STALE_IDS = ["trosc2", "tpitp2", "tmark2", "tkrda", "tmem", "tgood"];
const LIVE_IDS = ["trosc3", "tpitp3", "tmark3", "tkrda2", "tmem2", "tgood2"];

test("founder demo airdrop reads asset ids from the deployments map", () => {
  const assetMap = readEvmDeployments().assetMap ?? {};
  const ids = founderDemoAssetIds();
  assert.deepEqual(ids, Object.keys(assetMap));
  for (const id of LIVE_IDS) {
    assert.ok(ids.includes(id), `missing live id ${id}`);
  }
  for (const id of STALE_IDS) {
    assert.equal(ids.includes(id), false, `stale id ${id} must not be used`);
  }
});

test("founderDemoAssetIds follows an injected assetMap and skips non-addresses", () => {
  const ids = founderDemoAssetIds({
    trosc3: "0x89e2d0d8a921027b4bf22aab600f100e9139ec3e",
    skipped: "not-an-address",
    tgood2: "0xa3de9569ef1990d330273384684ec911adde3b9f",
  });
  assert.deepEqual(ids, ["trosc3", "tgood2"]);
});

test("demo-airdrop.ts does not hardcode the stale demo token ids", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../src/lib/founders/demo-airdrop.ts"),
    "utf8",
  );
  for (const id of STALE_IDS) {
    assert.equal(src.includes(`"${id}"`), false, `hardcoded "${id}"`);
  }
});
