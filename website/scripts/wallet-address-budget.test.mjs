import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { toFunctionSelector } from "viem";

import { resetChainCatalogCacheForTests, seedTokenCatalogCacheForTests } from "../src/lib/evm/chain-catalog.ts";
import { handleEvmCompatGet, resetMintedNftCacheForTests } from "../src/lib/evm/people-compat.ts";
import { formatWalletNative, mapWalletAccount } from "../src/lib/wallet-account-view.ts";

const OWNER = "0x0000000000000000000000000000000000000c33";
const OTHER = "0x0000000000000000000000000000000000000d44";
const GOOD = "0x0000000000000000000000000000000000000b22";
const HUNG = "0x0000000000000000000000000000000000000a11";
const BALANCE_OF = toFunctionSelector("balanceOf(address)");
const DECIMALS = toFunctionSelector("decimals()");
const CREATOR = toFunctionSelector("creator()");
const ONE_PPL = "0xde0b6b3a7640000";

const word = (value) => `0x${BigInt(value).toString(16).padStart(64, "0")}`;
const addressWord = (value) => `0x${value.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;

function catalogRow(assetId, tokenAddress) {
  return {
    assetId,
    tokenAddress,
    name: assetId,
    symbol: assetId.toUpperCase(),
    decimals: 6,
    totalSupply: 10,
    creator: OTHER,
    status: "active",
    type: "token",
    verified: false,
  };
}

function answerCall(call, state) {
  if (call.method === "eth_getLogs") {
    state.logs += 1;
    return { result: [] };
  }
  if (call.method === "eth_blockNumber") return { result: "0x10" };
  if (call.method === "eth_getTransactionCount") return { result: "0x1" };
  if (call.method === "eth_getBalance") {
    state.balances += 1;
    if (state.balances === 1) return { http: 503 };
    return { result: ONE_PPL };
  }
  if (call.method !== "eth_call") return { result: "0x" };
  const to = String(call.params?.[0]?.to ?? "").toLowerCase();
  const data = String(call.params?.[0]?.data ?? "");
  const selector = data.slice(0, 10);
  if (selector === BALANCE_OF && to === HUNG.toLowerCase()) return { hang: true };
  if (selector === BALANCE_OF && to === GOOD.toLowerCase()) return { result: word(2_000_000) };
  if (selector === BALANCE_OF) return { result: word(0) };
  if (selector === DECIMALS) return { result: word(6) };
  if (selector === CREATOR) return { result: addressWord(OTHER) };
  return { result: word(0) };
}

async function startRpc(t, includeHung) {
  const state = { logs: 0, balances: 0 };
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const calls = Array.isArray(body) ? body : [body];
      const replies = calls.map((call) => answerCall(call, state));
      if (replies.some((reply) => reply.hang)) return;
      const payload = (reply) => {
        if (reply.http) {
          return { http: reply.http, error: { message: `rpc_http_${reply.http}` } };
        }
        return { result: reply.result ?? "0x" };
      };
      if (Array.isArray(body)) {
        const http = replies.find((reply) => reply.http);
        if (http) {
          res.writeHead(http.http, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { message: `rpc_http_${http.http}` } }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(body.map((call, index) => ({
          jsonrpc: "2.0",
          id: call.id,
          result: payload(replies[index]).result,
        }))));
        return;
      }
      const one = payload(replies[0]);
      if (one.http) {
        res.writeHead(one.http, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: one.error }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: one.result }));
    });
  });
  await new Promise((resolve) => node.listen(0, "127.0.0.1", resolve));
  const previous = process.env.EVM_RPC_URL;
  process.env.EVM_RPC_URL = `http://127.0.0.1:${node.address().port}`;
  resetChainCatalogCacheForTests();
  resetMintedNftCacheForTests();
  seedTokenCatalogCacheForTests(includeHung ? [catalogRow("good", GOOD), catalogRow("hung", HUNG)] : [catalogRow("good", GOOD)]);
  t.after(async () => {
    if (previous === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = previous;
    await new Promise((resolve) => node.close(resolve));
  });
  return state;
}

describe("address route budget", { concurrency: 1 }, () => {
test("address route retries a 503 on eth_getBalance and still returns that balance", async (t) => {
  const state = await startRpc(t, false);
  const started = Date.now();
  const res = await handleEvmCompatGet(`/address/${OWNER}`, new URLSearchParams());
  assert.ok(Date.now() - started < 2_000, `elapsed ${Date.now() - started}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.balance, 1);
  assert.equal(res.body.balances.ppl, 1);
  assert.equal(res.body.balances.good, 2);
  assert.ok(state.balances >= 2);
  assert.equal(state.logs, 0);
});

test("address route returns partial balances within a few seconds when one balanceOf hangs", async (t) => {
  const state = await startRpc(t, true);
  const started = Date.now();
  const res = await handleEvmCompatGet(`/address/${OWNER}`, new URLSearchParams());
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 4_500, `elapsed ${elapsed}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.balance, 1);
  assert.equal(res.body.balances.good, 2);
  assert.equal(res.body.balances.hung, undefined);
  assert.equal(res.body.partial, true);
  assert.equal(state.logs, 0);
});
});

test("wallet mapping shows a partial native balance instead of a dash", () => {
  const view = mapWalletAccount({
    balance: 1.5,
    nonce: 2,
    balances: { ppl: 1.5, good: 2 },
    partial: true,
  });
  assert.equal(view.partial, true);
  assert.equal(view.balance, 1.5);
  assert.equal(view.balances.good, 2);
  assert.equal(formatWalletNative(view, (value) => String(value)), "1.5");
  const tokensOnly = mapWalletAccount({ nonce: 0, balances: { good: 4 }, partial: true });
  assert.equal(tokensOnly.balance, null);
  assert.equal(tokensOnly.partial, true);
  assert.equal(tokensOnly.balances.good, 4);
  assert.equal(formatWalletNative(tokensOnly, (value) => String(value)), "—");
  assert.equal(mapWalletAccount({ error: "rpc_unavailable" }), null);
  assert.equal(formatWalletNative(null, (value) => String(value)), "—");
  const src = readFileSync(new URL("../src/components/wallet/WalletApp.tsx", import.meta.url), "utf8");
  assert.match(src, /formatWalletNative/);
  assert.match(src, /balancesPartial/);
});
