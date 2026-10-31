import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { toFunctionSelector } from "viem";

import { readEvmDeployments } from "../src/lib/evm/config.ts";
import { resetChainCatalogCacheForTests } from "../src/lib/evm/chain-catalog.ts";
import { handleEvmCompatGet } from "../src/lib/evm/people-compat.ts";
import { findTokenCreationBlock, resetTokenCreationBlockCacheForTests, resetTransferIndexCacheForTests } from "../src/lib/evm/transfer-index.ts";

/**
 * Token page distribution: a fresh factory token is scanned from its creation block, a node that
 * cannot be asked is a 502 (retryable) and never "unknown token" or an empty holder list. The RPC
 * is a throwaway localhost JSON-RPC node, never the public one.
 */

const hex = (value) => `0x${value.toString(16)}`;
const IS_PEOPLE_TOKEN = toFunctionSelector("isPeopleToken(address)");
const TRUE_WORD = `0x${"0".repeat(63)}1`;
const FALSE_WORD = `0x${"0".repeat(64)}`;
const ZERO_ADDRESS_TOPIC = `0x${"0".repeat(64)}`;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const deployBlock = () => {
  const start = readEvmDeployments().deployBlock;
  return typeof start === "number" && start > 0 ? start : 0;
};
const HOLDER = "0x00000000000000000000000000000000000000a1";

/** `answer` returns a result, or `{ http: 500 }` to simulate a node/transport failure. */
async function startRpcNode(t, answer) {
  const calls = [];
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      calls.push({ method: body.method, params: body.params ?? [] });
      const result = answer(body);
      if (result && typeof result === "object" && "http" in result) {
        res.writeHead(result.http, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: `rpc_http_${result.http}` } }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: result ?? null }));
    });
  });
  await new Promise((resolve) => node.listen(0, "127.0.0.1", resolve));
  const previous = process.env.EVM_RPC_URL;
  process.env.EVM_RPC_URL = `http://127.0.0.1:${node.address().port}`;
  resetChainCatalogCacheForTests();
  resetTransferIndexCacheForTests();
  resetTokenCreationBlockCacheForTests();
  t.after(async () => {
    if (previous === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = previous;
    await new Promise((resolve) => node.close(resolve));
  });
  return calls;
}

const isRegistryCall = (call) => call.method === "eth_call" && String(call.params[0]?.data).startsWith(IS_PEOPLE_TOKEN);
const getLogCalls = (calls) => calls.filter((c) => c.method === "eth_getLogs");

test("a fresh factory token is scanned from its creation block, not the deployment block", async (t) => {
  const token = "0x00000000000000000000000000000000000f0001";
  const created = 700_000;
  const head = created + 20_000;
  const calls = await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(head);
    if (isRegistryCall(call)) return String(call.params[0].data).toLowerCase().endsWith(token.slice(2)) ? TRUE_WORD : FALSE_WORD;
    if (call.method === "eth_getCode") return Number.parseInt(call.params[1], 16) >= created ? "0x6080604052" : "0x";
    if (call.method === "eth_getLogs") {
      const from = Number.parseInt(call.params[0].fromBlock, 16);
      const to = Number.parseInt(call.params[0].toBlock, 16);
      if (created + 5 < from || created + 5 > to) return [];
      return [{
        address: token,
        topics: [TRANSFER_TOPIC, ZERO_ADDRESS_TOPIC, `0x${"0".repeat(24)}${HOLDER.slice(2)}`],
        data: hex(5n * 10n ** 18n),
        blockNumber: hex(created + 5),
        transactionHash: `0x${"ab".repeat(32)}`,
      }];
    }
    return "0x";
  });
  const res = await handleEvmCompatGet("/accounts", new URLSearchParams({ assetId: token }));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].address.toLowerCase(), HOLDER);
  assert.ok(res.body[0].balance > 0);
  const scans = getLogCalls(calls);
  assert.ok(scans.length >= 1 && scans.length <= 3);
  assert.equal(Number.parseInt(scans[0].params[0].fromBlock, 16), created);
  assert.ok(deployBlock() < created);
});

test("creation block search is bounded and falls back to null without historical state", async (t) => {
  const token = "0x00000000000000000000000000000000000f0002";
  const created = deployBlock() + 123_456;
  const calls = await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(deployBlock() + 50_000_000);
    if (call.method === "eth_getCode") return Number.parseInt(call.params[1], 16) >= created ? "0x6080" : "0x";
    return "0x";
  });
  assert.equal(await findTokenCreationBlock(token), created);
  assert.ok(calls.filter((c) => c.method === "eth_getCode").length <= 32);
  // Cached: no further node traffic.
  calls.length = 0;
  assert.equal(await findTokenCreationBlock(token), created);
  assert.equal(calls.length, 0);

  await startRpcNode(t, (call) => (call.method === "eth_blockNumber" ? hex(deployBlock() + 1000) : { http: 500 }));
  assert.equal(await findTokenCreationBlock("0x00000000000000000000000000000000000f0003"), null);
});

test("when the creation block is unknown the scan starts at the deployment block", async (t) => {
  const token = "0x00000000000000000000000000000000000f0004";
  const calls = await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(deployBlock() + 5_000);
    if (isRegistryCall(call)) return TRUE_WORD;
    if (call.method === "eth_getLogs") return [];
    return "0x"; // eth_getCode: no code anywhere, so the search yields null
  });
  const res = await handleEvmCompatGet("/accounts", new URLSearchParams({ assetId: token }));
  assert.equal(res.status, 200);
  assert.equal(Number.parseInt(getLogCalls(calls)[0].params[0].fromBlock, 16), deployBlock());
});

test("a transient RPC failure on isPeopleToken is partial, not 404", async (t) => {
  const token = "0x00000000000000000000000000000000000f0005";
  const calls = await startRpcNode(t, (call) => (isRegistryCall(call) ? { http: 503 } : call.method === "eth_blockNumber" ? hex(100) : "0x"));
  const res = await handleEvmCompatGet("/accounts", new URLSearchParams({ assetId: token }));
  assert.equal(res.status, 200);
  assert.equal(res.body.partial, true);
  assert.deepEqual(res.body.accounts, []);
  assert.equal(getLogCalls(calls).length, 0);
});

test("every factory answering false is 404 unknown_token", async (t) => {
  const token = "0x00000000000000000000000000000000000f0006";
  const calls = await startRpcNode(t, (call) => (isRegistryCall(call) ? FALSE_WORD : call.method === "eth_blockNumber" ? hex(100) : "0x"));
  const res = await handleEvmCompatGet("/accounts", new URLSearchParams({ assetId: token }));
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: "unknown_token" });
  assert.equal(getLogCalls(calls).length, 0);
});

test("a holder scan retries a transient getLogs failure and then returns holders", async (t) => {
  const token = "0x00000000000000000000000000000000000f0008";
  const created = deployBlock() + 1_000;
  const head = created + 20;
  let logs = 0;
  await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(head);
    if (isRegistryCall(call)) return String(call.params[0].data).toLowerCase().endsWith(token.slice(2)) ? TRUE_WORD : FALSE_WORD;
    if (call.method === "eth_getCode") return Number.parseInt(call.params[1], 16) >= created ? "0x6080604052" : "0x";
    if (call.method === "eth_getLogs") {
      logs += 1;
      if (logs === 1) return { http: 503 };
      return [{
        address: token,
        topics: [TRANSFER_TOPIC, ZERO_ADDRESS_TOPIC, `0x${"0".repeat(24)}${HOLDER.slice(2)}`],
        data: hex(2n * 10n ** 18n),
        blockNumber: hex(created + 1),
        transactionHash: `0x${"cd".repeat(32)}`,
      }];
    }
    return "0x";
  });
  const res = await handleEvmCompatGet("/accounts", new URLSearchParams({ assetId: token }));
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].address.toLowerCase(), HOLDER);
  assert.ok(logs >= 2);
});

test("a holder window that keeps failing is a partial 200 when another window succeeded", async (t) => {
  const token = "0x00000000000000000000000000000000000f0009";
  const created = 700_000;
  const head = created + 10_000;
  await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(head);
    if (isRegistryCall(call)) return TRUE_WORD;
    if (call.method === "eth_getCode") return Number.parseInt(call.params[1], 16) >= created ? "0x6080604052" : "0x";
    if (call.method === "eth_getLogs") {
      const from = Number.parseInt(call.params[0].fromBlock, 16);
      if (from > created + 8_999) return { http: 503 };
      return [{
        address: token,
        topics: [TRANSFER_TOPIC, ZERO_ADDRESS_TOPIC, `0x${"0".repeat(24)}${HOLDER.slice(2)}`],
        data: hex(4n * 10n ** 18n),
        blockNumber: hex(created + 2),
        transactionHash: `0x${"ef".repeat(32)}`,
      }];
    }
    return "0x";
  });
  const res = await handleEvmCompatGet("/accounts", new URLSearchParams({ assetId: token }));
  assert.equal(res.status, 200);
  assert.equal(res.body.partial, true);
  assert.equal(res.body.accounts.length, 1);
  assert.equal(res.body.accounts[0].address.toLowerCase(), HOLDER);
});

test("a failing holder scan is partial, never an empty holder list", async (t) => {
  const token = "0x00000000000000000000000000000000000f0007";
  await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(deployBlock() + 5_000);
    if (isRegistryCall(call)) return TRUE_WORD;
    if (call.method === "eth_getLogs") return { http: 500 };
    return "0x";
  });
  const res = await handleEvmCompatGet("/accounts", new URLSearchParams({ assetId: token }));
  assert.equal(res.status, 200);
  assert.equal(res.body.partial, true);
  assert.deepEqual(res.body.accounts, []);
});
