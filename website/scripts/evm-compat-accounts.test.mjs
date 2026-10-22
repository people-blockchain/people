import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { toFunctionSelector } from "viem";

import { readEvmDeployments } from "../src/lib/evm/config.ts";
import { resetChainCatalogCacheForTests } from "../src/lib/evm/chain-catalog.ts";
import { handleEvmCompatGet } from "../src/lib/evm/people-compat.ts";
import {
  HOLDERS_CACHE_MAX_ENTRIES,
  aggregateHoldersFromTransfers,
  fetchTransferLogs,
  holdersCacheSizeForTests,
  resetTransferIndexCacheForTests,
} from "../src/lib/evm/transfer-index.ts";

/**
 * H3: `/api/evm/compat/accounts?token=` must not let an arbitrary address trigger a full-chain
 * Transfer-log scan, scans are capped, and the holders cache is bounded. The RPC is a throwaway
 * localhost JSON-RPC node (see scripts/evm-log-start-blocks.test.mjs), never the public node.
 */

const hex = (value) => `0x${value.toString(16)}`;
const HEAD = 50_000_000;

async function startRpcNode(t, answer) {
  const calls = [];
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      res.writeHead(200, { "content-type": "application/json" });
      if (Array.isArray(body)) {
        calls.push(...body.map((call) => ({ method: call.method, params: call.params ?? [] })));
        res.end(JSON.stringify(body.map((call) => ({ jsonrpc: "2.0", id: call.id, result: answer(call) ?? null }))));
        return;
      }
      calls.push({ method: body.method, params: body.params ?? [] });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: answer(body) ?? null }));
    });
  });
  await new Promise((resolve) => node.listen(0, "127.0.0.1", resolve));
  const previous = process.env.EVM_RPC_URL;
  process.env.EVM_RPC_URL = `http://127.0.0.1:${node.address().port}`;
  resetChainCatalogCacheForTests();
  resetTransferIndexCacheForTests();
  t.after(async () => {
    if (previous === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = previous;
    await new Promise((resolve) => node.close(resolve));
  });
  return calls;
}

const emptyNode = (call) => (call.method === "eth_blockNumber" ? hex(HEAD) : call.method === "eth_getLogs" ? [] : "0x");
const logScansFor = (calls, address) =>
  calls.filter((c) => c.method === "eth_getLogs" && String(c.params[0]?.address).toLowerCase() === address.toLowerCase());

function withScanCap(t, windows) {
  const previous = process.env.EVM_TRANSFER_SCAN_MAX_WINDOWS;
  process.env.EVM_TRANSFER_SCAN_MAX_WINDOWS = String(windows);
  t.after(() => {
    if (previous === undefined) delete process.env.EVM_TRANSFER_SCAN_MAX_WINDOWS;
    else process.env.EVM_TRANSFER_SCAN_MAX_WINDOWS = previous;
  });
}

const IS_PEOPLE_TOKEN = toFunctionSelector("isPeopleToken(address)");
const TRUE_WORD = `0x${"0".repeat(63)}1`;

/** Node whose token factory reports `registered` (lower-cased) as a factory token. */
const factoryNode = (registered) => (call) => {
  if (call.method === "eth_call" && String(call.params[0]?.data).startsWith(IS_PEOPLE_TOKEN)) {
    const asked = `0x${String(call.params[0].data).slice(-40)}`.toLowerCase();
    return asked === registered ? TRUE_WORD : `0x${"0".repeat(64)}`;
  }
  return emptyNode(call);
};

test("an unknown token address is rejected without any log scan", async (t) => {
  const calls = await startRpcNode(t, factoryNode(null));
  const unknown = "0x000000000000000000000000000000000000dEaD";
  const res = await handleEvmCompatGet("/accounts", new URLSearchParams({ token: unknown }));
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: "unknown_token" });
  assert.equal(calls.filter((c) => c.method === "eth_getLogs").length, 0);
  // Only cheap registry lookups were made.
  assert.ok(calls.every((c) => c.method === "eth_call"));
});

test("a malformed token parameter is rejected without touching the node", async (t) => {
  const calls = await startRpcNode(t, emptyNode);
  const res = await handleEvmCompatGet("/accounts", new URLSearchParams({ token: "not-a-token" }));
  assert.equal(res.status, 404);
  assert.equal(calls.length, 0);
});

test("a factory-registered token is accepted", async (t) => {
  withScanCap(t, 2);
  const token = "0x00000000000000000000000000000000000c0ffe";
  const calls = await startRpcNode(t, factoryNode(token));
  const warn = console.warn;
  console.warn = () => {};
  t.after(() => {
    console.warn = warn;
  });
  const res = await handleEvmCompatGet("/accounts", new URLSearchParams({ token }));
  assert.equal(res.status, 200);
  assert.equal(logScansFor(calls, token).length, 2);
});

test("a known assetMap token is served, with the scan capped by EVM_TRANSFER_SCAN_MAX_WINDOWS", async (t) => {
  withScanCap(t, 3);
  const calls = await startRpcNode(t, emptyNode);
  const [assetId, address] = Object.entries(readEvmDeployments().assetMap)[0];
  const warn = console.warn;
  console.warn = () => {};
  t.after(() => {
    console.warn = warn;
  });
  const res = await handleEvmCompatGet("/accounts", new URLSearchParams({ token: address }));
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  // The chain head is ~50M blocks away, yet only 3 windows are queried.
  assert.equal(logScansFor(calls, address).length, 3);

  const byId = await handleEvmCompatGet("/accounts", new URLSearchParams({ assetId }));
  assert.equal(byId.status, 200);
});

test("fetchTransferLogs never issues more windows than the cap", async (t) => {
  const calls = await startRpcNode(t, emptyNode);
  const warn = console.warn;
  console.warn = () => {};
  t.after(() => {
    console.warn = warn;
  });
  const token = Object.values(readEvmDeployments().assetMap)[0];
  await fetchTransferLogs(token, 0, HEAD, 5);
  const scans = logScansFor(calls, token);
  assert.equal(scans.length, 5);
  assert.equal(Number.parseInt(scans.at(-1).params[0].toBlock, 16), 5 * 9_000 - 1);
  // A range below the cap is scanned in full.
  calls.length = 0;
  await fetchTransferLogs(token, 0, 20_000, 5);
  assert.equal(logScansFor(calls, token).length, 3);
});

test("the holders cache is a bounded LRU", async (t) => {
  await startRpcNode(t, (call) => (call.method === "eth_blockNumber" ? hex(100) : call.method === "eth_getLogs" ? [] : "0x"));
  for (let i = 1; i <= HOLDERS_CACHE_MAX_ENTRIES + 10; i++) {
    await aggregateHoldersFromTransfers(`0x${i.toString(16).padStart(40, "0")}`);
  }
  assert.equal(holdersCacheSizeForTests(), HOLDERS_CACHE_MAX_ENTRIES);
});
