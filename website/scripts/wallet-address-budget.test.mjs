import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { toFunctionSelector } from "viem";

import { resetChainCatalogCacheForTests, seedTokenCatalogCacheForTests } from "../src/lib/evm/chain-catalog.ts";
import { readEvmDeployments } from "../src/lib/evm/config.ts";
import { handleEvmCompatGet, resetAddressBalanceCacheForTests, resetMintedNftCacheForTests } from "../src/lib/evm/people-compat.ts";
import { formatWalletNative, mapWalletAccount } from "../src/lib/wallet-account-view.ts";

const OWNER = "0x0000000000000000000000000000000000000c33";
const OTHER = "0x0000000000000000000000000000000000000d44";
const GOOD = "0x0000000000000000000000000000000000000b22";
const HUNG = "0x0000000000000000000000000000000000000a11";
const FAIL = "0x0000000000000000000000000000000000000a12";
const NOT_ERC20 = "0x0000000000000000000000000000000000000e11";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
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
    if (state.hangLogs) return { hang: true };
    const topic0 = call.params?.[0]?.topics?.[0];
    if (state.transferLog && topic0 === TRANSFER_TOPIC) return { result: [{ address: NOT_ERC20 }] };
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
  if (selector === BALANCE_OF && to === FAIL.toLowerCase()) return { http: 503 };
  if (selector === DECIMALS && to === NOT_ERC20.toLowerCase()) return { revert: true };
  if (selector === BALANCE_OF && to === GOOD.toLowerCase()) return { result: word(2_000_000) };
  if (selector === BALANCE_OF) return { result: word(0) };
  if (selector === DECIMALS) return { result: word(6) };
  if (selector === CREATOR) return { result: addressWord(OTHER) };
  return { result: word(0) };
}

async function startRpc(t, mode) {
  const includeHung = mode === "hung";
  const includeFail = mode === "fail";
  const state = { logs: 0, balances: 0, transferLog: mode === "complete", hangLogs: mode === "logs-hang" };
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const calls = Array.isArray(body) ? body : [body];
      const replies = calls.map((call) => answerCall(call, state));
      if (replies.some((reply) => reply.hang)) return;
      const payload = (reply) => {
        if (reply.revert) return { error: { message: "execution reverted" } };
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
      if (one.error) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, error: one.error }));
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
  resetAddressBalanceCacheForTests();
  const rows = [catalogRow("good", GOOD)];
  if (includeHung) rows.push(catalogRow("hung", HUNG));
  if (includeFail) rows.push(catalogRow("fail", FAIL));
  // Deployment tokens are already known. The address route must not spend its budget
  // re-reading their decimals before it can answer a native balance.
  for (const [assetId, tokenAddress] of Object.entries(readEvmDeployments().assetMap ?? {})) {
    if (!tokenAddress || rows.some((row) => row.tokenAddress.toLowerCase() === String(tokenAddress).toLowerCase())) continue;
    rows.push(catalogRow(assetId, tokenAddress));
  }
  seedTokenCatalogCacheForTests(rows);
  t.after(async () => {
    if (previous === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = previous;
    await new Promise((resolve) => node.close(resolve));
  });
  return state;
}

describe("address route budget", { concurrency: 1 }, () => {
test("address route retries a 503 on eth_getBalance and still returns that balance", async (t) => {
  const state = await startRpc(t, "plain");
  const started = Date.now();
  const res = await handleEvmCompatGet(`/address/${OWNER}`, new URLSearchParams());
  assert.ok(Date.now() - started < 2_000, `elapsed ${Date.now() - started}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.balance, 1);
  assert.equal(res.body.balances.ppl, 1);
  assert.equal(res.body.balances.good, 2);
  assert.equal(res.body.partial, undefined);
  assert.ok(state.balances >= 2);
  assert.ok(state.logs <= 2, `fresh tail is a couple of getLogs, saw ${state.logs}`);
});

test("complete reads are not partial when a recent transfer is not an ERC-20", async (t) => {
  await startRpc(t, "complete");
  const res = await handleEvmCompatGet(`/address/${OWNER}`, new URLSearchParams());
  assert.equal(res.status, 200);
  assert.equal(res.body.balance, 1);
  assert.equal(res.body.balances.good, 2);
  assert.equal(res.body.balances[NOT_ERC20.toLowerCase()], undefined);
  assert.equal(res.body.partial, undefined);
});

test("a failed balanceOf read is partial and keeps the balances that were read", async (t) => {
  await startRpc(t, "fail");
  const started = Date.now();
  const res = await handleEvmCompatGet(`/address/${OWNER}`, new URLSearchParams());
  assert.ok(Date.now() - started < 4_500, `elapsed ${Date.now() - started}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.balance, 1);
  assert.equal(res.body.balances.good, 2);
  assert.equal(res.body.balances.fail, undefined);
  assert.equal(res.body.partial, true);
});

test("address route returns native PPL without waiting on a hung catalog log", async (t) => {
  await startRpc(t, "logs-hang");
  const started = Date.now();
  const res = await handleEvmCompatGet(`/address/${OWNER}`, new URLSearchParams());
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 4_000, `elapsed ${elapsed}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.balance, 1);
  assert.equal(res.body.balances.ppl, 1);
  assert.equal(res.body.balances.good, 2);
  assert.equal(res.body.partial, true);
});

test("address route returns partial balances within a few seconds when one balanceOf hangs", async (t) => {
  const state = await startRpc(t, "hung");
  const started = Date.now();
  const res = await handleEvmCompatGet(`/address/${OWNER}`, new URLSearchParams());
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 4_500, `elapsed ${elapsed}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.balance, 1);
  assert.equal(res.body.balances.good, 2);
  assert.equal(res.body.balances.hung, undefined);
  assert.equal(res.body.partial, true);
  assert.ok(state.logs <= 2, `fresh tail is a couple of getLogs, saw ${state.logs}`);
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
