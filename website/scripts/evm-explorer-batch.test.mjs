import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import {
  fetchRecentBlocks,
  fetchRecentTransactions,
  resetRecentFeedCacheForTests,
} from "../src/lib/evm/explorer-blocks.ts";

/**
 * The explorer feeds used to read the newest 20 blocks one `eth_getBlockByNumber` at a time — one
 * HTTP round-trip (0.2–1 s against the public node) per block, which made `/api/evm/compat/blocks`
 * take ~4 s. Both feeds now issue a single JSON-RPC batch.
 *
 * The RPC layer is exercised for real rather than mocked: a throwaway JSON-RPC node is started on
 * an ephemeral localhost port and `EVM_RPC_URL` is pointed at it, so `readEvmRpcUrl()` inside the
 * production `rpc-server.ts` dials the test node. Everything between `fetchRecentBlocks()` and the
 * socket — batching, slot handling, ordering, the per-block fallback — is production code.
 */

const HEAD = 100;
const TS_BASE_SECONDS = 1_700_000_000;
const TX_HASH = `0x${"cd".repeat(32)}`;
const MINER = `0x${"ab".repeat(20)}`;
const hex = (value) => `0x${value.toString(16)}`;

/** The block a live node would return for `eth_getBlockByNumber`, with no transactions. */
const blockAt = (height) => ({
  hash: `0x${height.toString(16).padStart(64, "0")}`,
  number: hex(height),
  timestamp: hex(TS_BASE_SECONDS + height),
  miner: MINER,
  transactions: [],
});

/**
 * Starts a JSON-RPC node on an ephemeral port and points the app's RPC layer at it.
 *
 * `answer(call)` returns the JSON-RPC `result` for a single call; `undefined`/`null` answers null.
 * Batch requests are answered as arrays unless `rejectBatches(calls)` opts one out, in which case
 * the node replies with a single error object — exactly how a node without batch support behaves.
 * Recorded calls carry `batched` so a test can tell the two paths apart.
 */
async function startRpcNode(t, answer, { rejectBatches } = {}) {
  const calls = [];
  const batches = [];
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const reply = (payload) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };
      if (Array.isArray(body)) {
        batches.push(body.map((call) => ({ method: call.method, params: call.params ?? [] })));
        calls.push(...body.map((call) => ({ method: call.method, params: call.params ?? [], batched: true })));
        if (rejectBatches?.(body)) {
          reply({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "rpc_batch_rejected" } });
          return;
        }
        reply(body.map((call) => ({ jsonrpc: "2.0", id: call.id, result: answer(call) ?? null })));
        return;
      }
      calls.push({ method: body.method, params: body.params ?? [], batched: false });
      reply({ jsonrpc: "2.0", id: body.id, result: answer(body) ?? null });
    });
  });
  await new Promise((resolve) => node.listen(0, "127.0.0.1", resolve));

  const previous = process.env.EVM_RPC_URL;
  process.env.EVM_RPC_URL = `http://127.0.0.1:${node.address().port}`;
  t.after(async () => {
    if (previous === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = previous;
    await new Promise((resolve) => node.close(resolve));
  });
  return { calls, batches };
}

/** A node at height 100 that answers every block read with an empty block. */
const quietNode = (call) => {
  if (call.method === "eth_blockNumber") return hex(HEAD);
  if (call.method === "eth_getBlockByNumber") return blockAt(Number.parseInt(call.params[0], 16));
  return null;
};

/** Every `eth_getBlockByNumber` a node was asked for, in order, with its height and flag. */
const blockReads = (calls) =>
  calls
    .filter((call) => call.method === "eth_getBlockByNumber")
    .map((call) => ({ height: call.params[0], full: call.params[1], batched: call.batched }));

test("fetchRecentBlocks reads the newest blocks in one JSON-RPC batch, newest first", async (t) => {
  const node = await startRpcNode(t, quietNode);
  resetRecentFeedCacheForTests();

  const blocks = await fetchRecentBlocks(5);

  // Output shape and order are unchanged: newest first, one entry per block that came back.
  assert.deepEqual(blocks.map((b) => b.header.height), [100, 99, 98, 97, 96]);
  assert.equal(blocks[0].hash, blockAt(100).hash);
  assert.equal(blocks[0].header.proposer, MINER);
  assert.equal(blocks[0].header.timestamp, (TS_BASE_SECONDS + 100) * 1000);
  assert.deepEqual(blocks[0].transactions, []);

  // The five block reads plus nothing else rode one HTTP request...
  assert.equal(node.batches.length, 1);
  assert.deepEqual(node.batches[0].map((call) => call.params), [
    [hex(100), false],
    [hex(99), false],
    [hex(98), false],
    [hex(97), false],
    [hex(96), false],
  ]);
  // ...and only the head lookup went out on its own.
  assert.deepEqual(
    node.calls.filter((call) => !call.batched).map((call) => call.method),
    ["eth_blockNumber"],
  );
});

test("fetchRecentBlocks skips a block the batch could not return instead of failing the feed", async (t) => {
  // The node fails exactly one slot of the batch, as it would for a pruned or unknown block.
  const node = await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(HEAD);
    const height = Number.parseInt(call.params[0], 16);
    return height === 98 ? null : blockAt(height);
  });
  resetRecentFeedCacheForTests();

  const blocks = await fetchRecentBlocks(4);

  assert.equal(node.batches.length, 1);
  // Four blocks were asked for, three came back, and the feed just carries the three.
  assert.deepEqual(node.batches[0].map((call) => call.params[0]), [hex(100), hex(99), hex(98), hex(97)]);
  assert.deepEqual(blocks.map((b) => b.header.height), [100, 99, 97]);
});

test("fetchRecentBlocks falls back to per-block reads when the node rejects batch arrays", async (t) => {
  const node = await startRpcNode(t, quietNode, { rejectBatches: () => true });
  resetRecentFeedCacheForTests();

  const blocks = await fetchRecentBlocks(3);

  assert.deepEqual(blocks.map((b) => b.header.height), [100, 99, 98]);
  // The batch was attempted once, rejected, and every block was then read on its own.
  assert.equal(node.batches.length, 1);
  assert.deepEqual(blockReads(node.calls.filter((call) => !call.batched)), [
    { height: hex(100), full: false, batched: false },
    { height: hex(99), full: false, batched: false },
    { height: hex(98), full: false, batched: false },
  ]);
});

test("fetchRecentTransactions pulls the recent window with full transactions in one batch", async (t) => {
  const tx = { hash: TX_HASH, from: MINER, to: MINER, value: "0xde0b6b3a7640000", blockNumber: hex(HEAD), input: "0x" };
  const node = await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(HEAD);
    if (call.method !== "eth_getBlockByNumber") return null;
    const height = Number.parseInt(call.params[0], 16);
    return { ...blockAt(height), transactions: call.params[1] === true && height === HEAD ? [tx] : [] };
  });
  resetRecentFeedCacheForTests();

  const txs = await fetchRecentTransactions(1);

  // The 40-block window is scanned newest first in one request, with full transactions requested.
  assert.equal(node.batches.length, 1);
  assert.equal(node.batches[0].length, 40);
  assert.deepEqual(node.batches[0].map((call) => call.params[1]), Array(40).fill(true));
  assert.equal(node.batches[0][0].params[0], hex(HEAD));
  assert.equal(node.batches[0].at(-1).params[0], hex(HEAD - 39));

  assert.equal(txs.length, 1);
  assert.deepEqual(txs[0], {
    id: TX_HASH,
    type: "transfer",
    from: MINER,
    to: MINER,
    amountWei: "1000000000000000000",
    blockHeight: HEAD,
  });
});

test("repeat and concurrent feed requests ride one batched scan", async (t) => {
  const node = await startRpcNode(t, quietNode);
  resetRecentFeedCacheForTests();

  const [first, second] = await Promise.all([fetchRecentBlocks(5), fetchRecentBlocks(5)]);
  assert.deepEqual(first, second);
  // Two requests at once still open one block scan: the second rode the first's in-flight read.
  assert.equal(node.batches.length, 1);

  const before = node.calls.length;
  assert.deepEqual(await fetchRecentBlocks(5), first);
  // Only the head lookup is repeated; the blocks come from the 3 s cache.
  assert.deepEqual(
    node.calls.slice(before).map((call) => call.method),
    ["eth_blockNumber"],
  );
});
