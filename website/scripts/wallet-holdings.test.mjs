import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { TEST_STABLES } from "../src/lib/evm/test-stables.ts";
import { resetChainCatalogCacheForTests, seedTokenCatalogCacheForTests } from "../src/lib/evm/chain-catalog.ts";
import { handleEvmCompatGet, resetMintedNftCacheForTests } from "../src/lib/evm/people-compat.ts";
import { reduceWalletChain, walletHoldings } from "../src/lib/wallet-account-view.ts";

const OWNER = "0x1003A5Ae6ccd73818fB33718e341a73BA77a80c2";
const usdc = TEST_STABLES.find((row) => row.symbol === "tUSDC");
const usdt = TEST_STABLES.find((row) => row.symbol === "tUSDT");

test("wallet rows show tUSDC and tUSDT from a balance fixture before the asset catalog arrives", () => {
  assert.ok(usdc && usdt);
  const payload = {
    balance: 4,
    nonce: 1,
    balances: {
      ppl: 4,
      [usdc.tokenAddress.toLowerCase()]: 7,
      [usdt.tokenAddress]: 6,
      ["0x" + "aa".repeat(20)]: 1,
    },
  };
  const afterAddress = reduceWalletChain({ account: null, assets: [] }, { type: "address", payload });
  assert.equal(afterAddress.account?.balance, 4);
  assert.equal(afterAddress.assets.length, 0);
  const early = walletHoldings(afterAddress.account?.balances, afterAddress.assets);
  const byId = Object.fromEntries(early.map((row) => [row.id, row]));
  assert.equal(byId.tusdc?.amount, 7);
  assert.equal(byId.tusdc?.symbol, "tUSDC");
  assert.equal(byId.tusdc?.decimals, 6);
  assert.equal(byId.tusdc?.tokenAddress.toLowerCase(), usdc.tokenAddress.toLowerCase());
  assert.equal(byId.tusdt?.amount, 6);
  assert.equal(byId.tusdt?.symbol, "tUSDT");
  assert.equal(byId.ppl, undefined);

  const afterAssets = reduceWalletChain(afterAddress, {
    type: "assets",
    rows: [{
      assetId: "0x" + "aa".repeat(20),
      name: "Later",
      symbol: "LTR",
      decimals: 18,
      imageUri: "https://cdn.example.com/ltr.png",
    }],
  });
  assert.equal(afterAssets.account?.balance, 4);
  const enriched = walletHoldings(afterAssets.account?.balances, afterAssets.assets);
  const later = enriched.find((row) => row.symbol === "LTR");
  assert.equal(later?.name, "Later");
  assert.equal(later?.imageUri, "https://cdn.example.com/ltr.png");
  assert.equal(enriched.find((row) => row.id === "tusdc")?.amount, 7);
  assert.equal(enriched.find((row) => row.id === "tusdt")?.amount, 6);
});

test("address balances include non-zero tUSDC and tUSDT", async (t) => {
  assert.ok(usdc && usdt);
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const calls = Array.isArray(body) ? body : [body];
      const reply = (call) => {
        if (call.method === "eth_blockNumber") return "0x10";
        if (call.method === "eth_getBalance" || call.method === "eth_getTransactionCount") return "0x0";
        if (call.method === "eth_getLogs") return [];
        if (call.method === "eth_call") {
          const to = String(call.params?.[0]?.to ?? "").toLowerCase();
          const data = String(call.params?.[0]?.data ?? "");
          if (data.startsWith("0x70a08231")) {
            if (to === usdc.tokenAddress.toLowerCase()) return "0x" + (7_000_000n).toString(16).padStart(64, "0");
            if (to === usdt.tokenAddress.toLowerCase()) return "0x" + (6_000_000n).toString(16).padStart(64, "0");
          }
        }
        return "0x0";
      };
      const payload = calls.map((call) => ({ jsonrpc: "2.0", id: call.id, result: reply(call) }));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(Array.isArray(body) ? payload : payload[0]));
    });
  });
  await new Promise((resolve) => node.listen(0, "127.0.0.1", resolve));
  const previous = process.env.EVM_RPC_URL;
  process.env.EVM_RPC_URL = `http://127.0.0.1:${node.address().port}`;
  resetChainCatalogCacheForTests();
  resetMintedNftCacheForTests();
  seedTokenCatalogCacheForTests([]);
  t.after(async () => {
    if (previous === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = previous;
    resetChainCatalogCacheForTests();
    await new Promise((resolve) => node.close(resolve));
  });

  const res = await handleEvmCompatGet(`/address/${OWNER}`, new URLSearchParams());
  assert.equal(res.status, 200);
  assert.equal(res.body.balances.tusdc, 7);
  assert.equal(res.body.balances.tusdt, 6);
});
