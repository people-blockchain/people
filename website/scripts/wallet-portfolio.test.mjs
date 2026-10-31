import test from "node:test";
import assert from "node:assert/strict";
import { resolveWalletPortfolio } from "../src/lib/wallet-portfolio.ts";
import { loadOwnerNfts } from "../src/lib/wallet-nft-loader.ts";

const external = "0x1003A5Ae6ccd73818fB33718e341a73BA77a80c2";
const local = "0x00000000000000000000000000000000000000a1";

test("an external wallet is read-only and still exposes tokens, NFTs, and history", () => {
  const locked = resolveWalletPortfolio({});
  assert.equal(locked.status, "locked");
  assert.deepEqual(locked.tabs, []);
  assert.equal(locked.localKeyActions, false);

  const portfolio = resolveWalletPortfolio({ externalAddress: external });
  assert.equal(portfolio.status, "external");
  assert.equal(portfolio.address, external);
  assert.equal(portfolio.readOnly, true);
  assert.equal(portfolio.localKeyActions, false);
  assert.deepEqual(portfolio.tabs, ["tokens", "nft", "history"]);
});

test("a local session keeps key actions and wins over an injected account", () => {
  const portfolio = resolveWalletPortfolio({ sessionAddress: local, externalAddress: external });
  assert.equal(portfolio.status, "local");
  assert.equal(portfolio.address, local);
  assert.equal(portfolio.readOnly, false);
  assert.equal(portfolio.localKeyActions, true);
  assert.deepEqual(portfolio.tabs, ["tokens", "nft", "history"]);
});

test("a read-only external wallet loads NFTs for that address", async () => {
  const portfolio = resolveWalletPortfolio({ externalAddress: `  ${external}  ` });
  assert.equal(portfolio.readOnly, true);
  assert.ok(portfolio.tabs.includes("nft"));
  const paths = [];
  const loaded = await loadOwnerNfts(portfolio.address, {
    timeoutMs: 1_000,
    maxAttempts: 1,
    fetchImpl: async (path) => {
      paths.push(path);
      return new Response(
        JSON.stringify({
          items: [{ nftId: "0xefdc:0", name: "NFT #0", collection: "0xefdc", onChainTokenId: "0" }],
          partial: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  assert.equal(loaded.phase, "ready");
  assert.equal(loaded.items.length, 1);
  assert.match(paths[0], new RegExp(`owner=${external}`, "i"));
  assert.match(paths[0], /v=2/);
});
