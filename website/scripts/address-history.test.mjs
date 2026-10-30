import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { getAddress } from "viem";

import { handleEvmCompatGet } from "../src/lib/evm/people-compat.ts";
import { resetRpcBackoffForTests } from "../src/lib/evm/rpc-server.ts";
import {
  ADDRESS_HISTORY_BUDGET_MS,
  ADDRESS_HISTORY_CACHE_TTL_MS,
  ADDRESS_HISTORY_PARTIAL_CACHE_TTL_MS,
  addressHistoryCacheTtlMs,
  fetchAddressHistory,
  resetAddressHistoryCacheForTests,
} from "../src/lib/evm/address-txs.ts";
import { parseHistoryResponse } from "../src/lib/wallet-activity.ts";

const LOWER = "0x2697602e17815c110abc736374b5aff8b8e405b5";
const CHECKSUM = getAddress(LOWER);
const OTHER = "0x74a50ac5ea07f86fc10f0ad0e543e9321b57eb8c";
const OUT_HASH = `0x${"ab".repeat(32)}`;
const IN_HASH = `0x${"cd".repeat(32)}`;
const TS = 1_700_000_000;
const hex = (value) => `0x${value.toString(16)}`;

function rpcTx({ hash, block, nonce, from, to }) {
  return {
    hash,
    from,
    to,
    value: "0xde0b6b3a7640000",
    blockNumber: hex(block),
    input: "0x",
    nonce: hex(nonce),
  };
}

/**
 * Local JSON-RPC stand-in. `answer(call)` returns `{ result }` or `{ error }`.
 * A batch entry with `error` becomes null inside evmJsonRpcBatch, matching a pruned node.
 */
async function startNode(t, answer, { blockDelayMs = 0 } = {}) {
  const calls = [];
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const callsIn = Array.isArray(body) ? body : [body];
        if (blockDelayMs > 0 && callsIn.some((call) => call.method === "eth_getBlockByNumber")) {
          await new Promise((resolve) => setTimeout(resolve, blockDelayMs));
        }
        const one = async (call) => {
          calls.push({ method: call.method, params: call.params ?? [] });
          const answered = await answer(call);
          if (answered?.error) return { jsonrpc: "2.0", id: call.id, error: answered.error };
          return { jsonrpc: "2.0", id: call.id, result: answered?.result ?? null };
        };
        const entries = [];
        for (const call of callsIn) entries.push(await one(call));
        const payload = Array.isArray(body) ? entries : entries[0];
        res.writeHead(200, { "content-type": "application/json", connection: "close" });
        res.end(JSON.stringify(payload));
      } catch (error) {
        res.writeHead(500, { "content-type": "application/json", connection: "close" });
        res.end(JSON.stringify({ error: String(error) }));
      }
    });
  });
  node.keepAliveTimeout = 1;
  await new Promise((resolve) => node.listen(0, "127.0.0.1", resolve));
  const previous = process.env.EVM_RPC_URL;
  const previousPublic = process.env.NEXT_PUBLIC_EVM_RPC_URL;
  delete process.env.NEXT_PUBLIC_EVM_RPC_URL;
  process.env.EVM_RPC_URL = `http://127.0.0.1:${node.address().port}`;
  resetAddressHistoryCacheForTests();
  resetRpcBackoffForTests();
  t.after(async () => {
    if (previous === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = previous;
    if (previousPublic === undefined) delete process.env.NEXT_PUBLIC_EVM_RPC_URL;
    else process.env.NEXT_PUBLIC_EVM_RPC_URL = previousPublic;
    resetAddressHistoryCacheForTests();
    await new Promise((resolve) => node.close(resolve));
  });
  return { calls };
}

test("history cache keeps complete pages and only briefly keeps partial ones", () => {
  assert.ok(ADDRESS_HISTORY_BUDGET_MS >= 12_000 && ADDRESS_HISTORY_BUDGET_MS <= 15_000);
  assert.equal(ADDRESS_HISTORY_CACHE_TTL_MS, 60_000);
  assert.equal(ADDRESS_HISTORY_PARTIAL_CACHE_TTL_MS, 5_000);
  assert.equal(addressHistoryCacheTtlMs({ items: [{ id: "0x1" }], outgoing: 1, incoming: 0, hasMore: false }), 60_000);
  assert.equal(
    addressHistoryCacheTtlMs({ items: [], outgoing: 0, incoming: 0, hasMore: false, partial: true, truncated: true }),
    5_000,
  );
  assert.equal(
    addressHistoryCacheTtlMs({ items: [], outgoing: 1, incoming: 0, hasMore: true, partial: true, truncated: true, prunedBeforeBlock: 80 }),
    5_000,
  );
});

test("parseHistoryResponse reads an items page and a legacy array", () => {
  const now = 1_700_000_000_000;
  const page = parseHistoryResponse({
    items: [{ id: OUT_HASH, from: CHECKSUM, to: OTHER, amount: 1, type: "transfer", blockHeight: 700 }],
    hasMore: true,
    partial: true,
    nextBeforeBlock: 690,
  }, now);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].id, OUT_HASH);
  assert.equal(page.items[0].from, CHECKSUM);
  assert.equal(page.items[0].timestamp, now);
  assert.equal(page.items[0].fee, 0);
  assert.equal(page.hasMore, true);
  assert.equal(page.partial, true);
  assert.equal(page.nextBeforeBlock, 690);

  const legacy = parseHistoryResponse([
    { id: IN_HASH, from: LOWER, to: OTHER, amount: 2, fee: 0.1, timestamp: 50, type: "transfer" },
  ], now);
  assert.equal(legacy.items.length, 1);
  assert.equal(legacy.items[0].timestamp, 50);
  assert.equal(legacy.hasMore, false);
  assert.equal(legacy.partial, false);
  assert.equal(legacy.nextBeforeBlock, undefined);
  assert.deepEqual(parseHistoryResponse(null, now), { items: [], hasMore: false, partial: false });
});

test("pruned state still locates a native outgoing transfer above the floor", async (t) => {
  const head = 1000;
  const floor = 600;
  const outgoing = rpcTx({ hash: OUT_HASH, block: 700, nonce: 0, from: CHECKSUM, to: getAddress(OTHER) });
  const incoming = rpcTx({ hash: IN_HASH, block: 950, nonce: 4, from: getAddress(OTHER), to: CHECKSUM });
  await startNode(t, async (call) => {
    if (call.method === "eth_blockNumber") return { result: hex(head) };
    if (call.method === "eth_getTransactionCount") {
      const height = Number.parseInt(call.params[1], 16);
      if (height < floor) return { error: { code: -32000, message: "version does not exist / pruned" } };
      return { result: hex(height >= 700 ? 1 : 0) };
    }
    if (call.method === "eth_getLogs") return { result: [] };
    if (call.method === "eth_getBlockByNumber") {
      const height = Number.parseInt(call.params[0], 16);
      const txs = call.params[1] === true && height === 700 ? [outgoing] : call.params[1] === true && height === 950 ? [incoming] : [];
      return { result: { number: hex(height), timestamp: hex(TS + height), transactions: txs } };
    }
    if (call.method === "eth_getTransactionByHash") {
      if (call.params[0] === OUT_HASH) return { result: outgoing };
      if (call.params[0] === IN_HASH) return { result: incoming };
    }
    return { result: null };
  });

  const history = await fetchAddressHistory(LOWER, 30);
  const sent = history.items.find((item) => item.id === OUT_HASH);
  const received = history.items.find((item) => item.id === IN_HASH);
  assert.ok(sent, "native outgoing transfer above the prune floor must be found");
  assert.equal(sent.blockHeight, 700);
  assert.equal(sent.timestamp, (TS + 700) * 1000);
  assert.equal(sent.from.toLowerCase(), LOWER);
  assert.ok(received, "checksummed counterparty must match a lowercase query");
  assert.equal(received.to.toLowerCase(), LOWER);
  assert.equal(received.timestamp, (TS + 950) * 1000);
  assert.equal(history.prunedBeforeBlock, undefined);
  assert.equal(history.partial, false);
  assert.equal(history.truncated, false);
});

test("nonce gap below the prune floor is reported instead of dropped", async (t) => {
  const head = 1000;
  const floor = 600;
  const outgoing = rpcTx({ hash: OUT_HASH, block: 700, nonce: 1, from: LOWER, to: OTHER });
  await startNode(t, async (call) => {
    if (call.method === "eth_blockNumber") return { result: hex(head) };
    if (call.method === "eth_getTransactionCount") {
      const height = Number.parseInt(call.params[1], 16);
      if (height < floor) return { error: { code: -32000, message: "version does not exist / pruned" } };
      return { result: hex(height >= 700 ? 2 : 1) };
    }
    if (call.method === "eth_getLogs") return { result: [] };
    if (call.method === "eth_getBlockByNumber") {
      const height = Number.parseInt(call.params[0], 16);
      if (height < floor) return { error: { code: -32000, message: "version does not exist / pruned" } };
      const txs = call.params[1] === true && height === 700 ? [outgoing] : [];
      return { result: { number: hex(height), timestamp: hex(TS + height), transactions: txs } };
    }
    if (call.method === "eth_getTransactionByHash" && call.params[0] === OUT_HASH) return { result: outgoing };
    return { result: null };
  });

  const response = await handleEvmCompatGet(`address/${LOWER}/transactions`, new URLSearchParams("limit=30"));
  assert.equal(response.status, 200);
  const body = response.body;
  assert.equal(body.partial, true);
  assert.equal(body.truncated, true);
  assert.equal(body.prunedBeforeBlock, floor);
  const sent = body.items.find((item) => item.id === OUT_HASH);
  assert.ok(sent);
  assert.equal(sent.blockHeight, 700);
  assert.equal(sent.timestamp, (TS + 700) * 1000);
  assert.equal(sent.from.toLowerCase(), LOWER);
});

test("a block walk that overruns the deadline returns partial with a continuation cursor", async (t) => {
  const head = 4000;
  await startNode(t, async (call) => {
    if (call.method === "eth_blockNumber") return { result: hex(head) };
    if (call.method === "eth_getTransactionCount") return { result: "0x0" };
    if (call.method === "eth_getLogs") return { result: [] };
    if (call.method === "eth_getBlockByNumber") {
      const height = Number.parseInt(call.params[0], 16);
      return { result: { number: hex(height), timestamp: hex(TS + height), transactions: [] } };
    }
    return { result: null };
  }, { blockDelayMs: 400 });

  const history = await fetchAddressHistory(LOWER, 30, { budgetMs: 800 });
  assert.equal(history.partial, true);
  assert.equal(history.truncated, true);
  assert.equal(typeof history.nextBeforeBlock, "number");
  assert.ok(history.nextBeforeBlock > 0);
  assert.ok(history.nextBeforeBlock <= head + 1);
  assert.equal(history.hasMore, true);
});
