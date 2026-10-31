import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { encodeAbiParameters, toFunctionSelector } from "viem";

import { resetChainCatalogCacheForTests } from "../src/lib/evm/chain-catalog.ts";
import { handleEvmCompatGet, resetMintedNftCacheForTests } from "../src/lib/evm/people-compat.ts";
import { resetTokenImageCacheForTests } from "../src/lib/evm/token-onchain.ts";
import { loadTokenPage } from "../src/lib/explorer/token-load.ts";

const TOKEN = "0x0000000000000000000000000000000000000e55";
const CREATOR = "0x0000000000000000000000000000000000000d44";
const CID = `Qm${"b".repeat(44)}`;

const SEL = {
  name: toFunctionSelector("name()"),
  symbol: toFunctionSelector("symbol()"),
  decimals: toFunctionSelector("decimals()"),
  supply: toFunctionSelector("totalSupply()"),
  creator: toFunctionSelector("creator()"),
  metadataURI: toFunctionSelector("metadataURI()"),
  isPeopleToken: toFunctionSelector("isPeopleToken(address)"),
};

const word = (value) => `0x${BigInt(value).toString(16).padStart(64, "0")}`;
const addressWord = (value) => `0x${value.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
const stringWord = (value) => encodeAbiParameters([{ type: "string" }], [value]);

test("basic token data is painted before a hanging asset request", async () => {
  const events = [];
  let started = false;
  await loadTokenPage({
    initialAsset: { id: "basic", name: "Basic" },
    fetchAsset: async () => {
      started = true;
      return new Promise(() => {});
    },
    fetchAccounts: async () => new Promise(() => {}),
    timeoutMs: { asset: 30, accounts: 30, timestamp: 30 },
    onAsset: (asset) => events.push(asset.id ?? asset.name),
    onAssetFailed: () => events.push("fail"),
    onAccounts: () => {},
    onTimestamp: () => {},
  });
  assert.equal(started, true);
  assert.equal(events[0], "basic");
  assert.ok(events.includes("fail"));
});

test("a cold token page returns name and symbol without a getLogs scan", async (t) => {
  const state = { logs: 0, fetches: 0 };
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const calls = Array.isArray(body) ? body : [body];
      if (calls.some((call) => call.method === "eth_getLogs")) {
        state.logs += calls.filter((call) => call.method === "eth_getLogs").length;
        return;
      }
      const one = (call) => {
        if (call.method === "eth_blockNumber") return "0x10";
        if (call.method !== "eth_call") return "0x";
        const data = String(call.params?.[0]?.data ?? "");
        const selector = data.slice(0, 10);
        if (selector === SEL.name) return stringWord("Cold");
        if (selector === SEL.symbol) return stringWord("COLD");
        if (selector === SEL.decimals) return word(6);
        if (selector === SEL.supply) return word(5_000_000);
        if (selector === SEL.creator) return addressWord(CREATOR);
        if (selector === SEL.metadataURI) return stringWord(`ipfs://${CID}/metadata.json`);
        if (selector === SEL.isPeopleToken) return word(1);
        return "0x";
      };
      const send = (call, result) => ({ jsonrpc: "2.0", id: call.id, result });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(Array.isArray(body) ? body.map((call) => send(call, one(call))) : send(body, one(body))));
    });
  });
  await new Promise((resolve) => node.listen(0, "127.0.0.1", resolve));
  const previousRpc = process.env.EVM_RPC_URL;
  const previousDb = process.env.DATABASE_URL;
  const previousFetch = globalThis.fetch;
  process.env.EVM_RPC_URL = `http://127.0.0.1:${node.address().port}`;
  delete process.env.DATABASE_URL;
  resetChainCatalogCacheForTests();
  resetMintedNftCacheForTests();
  resetTokenImageCacheForTests();
  globalThis.fetch = (url, init) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : String(url?.url ?? url);
    if (href.includes("127.0.0.1")) return previousFetch(url, init);
    state.fetches += 1;
    return new Promise((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("metadata hung")), 30_000);
    const abort = () => {
      clearTimeout(timer);
      reject(init?.signal?.reason ?? new Error("aborted"));
    };
    if (init?.signal?.aborted) abort();
    else init?.signal?.addEventListener("abort", abort, { once: true });
    });
  };
  t.after(async () => {
    globalThis.fetch = previousFetch;
    if (previousRpc === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = previousRpc;
    if (previousDb === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDb;
    await new Promise((resolve) => node.close(resolve));
  });

  const started = Date.now();
  const res = await handleEvmCompatGet(`/assets/${TOKEN}`, new URLSearchParams());
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 2_500, `elapsed ${elapsed}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.name, "Cold");
  assert.equal(res.body.symbol, "COLD");
  assert.equal(res.body.partial, undefined);
  assert.match(String(res.body.imageUri), /metadata\.json/);
  assert.equal(state.logs, 0);
  assert.equal(state.fetches, 0);
});
