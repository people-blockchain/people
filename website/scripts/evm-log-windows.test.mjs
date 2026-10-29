import { test, after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createServer } from "node:http";

register("./fixtures/evm-log-scan-db-loader.mjs", import.meta.url);

const { getDbReady, setDatabaseConfiguredForTests } = await import("./fixtures/evm-log-scan-pglite-db.mjs");
const { evmLogScanCursors } = await import("../src/db/schema.ts");
const {
  CATALOG_PARTIAL_STALE_MS,
  MAX_GLOBAL_LOG_WINDOWS,
  MAX_PARALLEL_LOG_WINDOWS,
  TOKEN_CATALOG_SCAN_BUDGET_MS,
  TOKEN_CREATED_TOPIC,
  TOKEN_CREATED_LEFTOVER_TOPIC,
  fetchLogsWindowedIncremental,
  fetchLogsWindowedIncrementalResult,
  resetChainCatalogCacheForTests,
  tokenFactoryScans,
} = await import("../src/lib/evm/chain-catalog.ts");
const { readEvmDeployments } = await import("../src/lib/evm/config.ts");

const db = await getDbReady();
const dep = readEvmDeployments();
const FACTORY = dep.contracts.tokenFactory;
const FACTORY_START = dep.startBlocks.tokenFactory;
const TOKEN_TOPICS = [TOKEN_CREATED_TOPIC, TOKEN_CREATED_LEFTOVER_TOPIC];
const hex = (value) => `0x${value.toString(16)}`;

after(async () => {
  setDatabaseConfiguredForTests(true);
  resetChainCatalogCacheForTests();
});

// Mirrors logWindows() in chain-catalog.ts (kept dependency-free for the pure tests below).
function logWindows(fromBlock, latest, size = 9000) {
  const out = [];
  for (let start = Math.max(0, fromBlock); start <= latest; start += size) out.push([start, Math.min(latest, start + size - 1)]);
  return out;
}

test("windows never exceed the 10,000-block eth_getLogs cap and cover the range", () => {
  const w = logWindows(158860, 175000);
  assert.equal(w[0][0], 158860);
  assert.equal(w.at(-1)[1], 175000);
  for (const [a, b] of w) assert.ok(b - a + 1 <= 10000);
  for (let i = 1; i < w.length; i++) assert.equal(w[i][0], w[i - 1][1] + 1);
});

test("empty when start is past latest", () => {
  assert.deepEqual(logWindows(10, 5), []);
});

/** Starts a JSON-RPC node on an ephemeral port and points the app's RPC layer at it. */
async function startRpcNode(t, answer) {
  const calls = [];
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      calls.push({ method: body.method, params: body.params ?? [] });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: answer(body) ?? null }));
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
  return { calls };
}

const logFilters = (calls) => calls.filter((call) => call.method === "eth_getLogs").map((call) => call.params[0]);
const fromBlockOf = (filter) => Number.parseInt(filter.fromBlock, 16);
const toBlockOf = (filter) => Number.parseInt(filter.toBlock, 16);

test("superseded token factories end at the next factory's start block", () => {
  const scans = tokenFactoryScans();
  assert.deepEqual(scans.map((scan) => scan.key), ["tokenFactoryV1", "tokenFactoryV2", "tokenFactoryV3", "tokenFactoryV4", "tokenFactory"]);

  const byKey = new Map(scans.map((scan) => [scan.key, scan]));
  assert.equal(byKey.get("tokenFactoryV1").toBlock, dep.startBlocks.tokenFactoryV2 - 1);
  assert.equal(byKey.get("tokenFactoryV2").toBlock, dep.startBlocks.tokenFactoryV3 - 1);
  assert.equal(byKey.get("tokenFactoryV3").toBlock, dep.startBlocks.tokenFactoryV4 - 1);
  assert.equal(byKey.get("tokenFactoryV4").toBlock, dep.startBlocks.tokenFactory - 1);
  // The current factory has no successor and scans to the tip.
  assert.equal(byKey.get("tokenFactory").toBlock, undefined);
});

test("incremental scan caps a superseded factory and ORs both topics into one getLogs filter", async (t) => {
  await db.delete(evmLogScanCursors);
  const scan = tokenFactoryScans().find((candidate) => candidate.key === "tokenFactoryV4");
  assert.ok(scan?.toBlock);
  const tip = scan.toBlock + 100_000;
  const node = await startRpcNode(t, (call) => (call.method === "eth_blockNumber" ? hex(tip) : []));
  resetChainCatalogCacheForTests();

  await fetchLogsWindowedIncremental(scan.address, TOKEN_TOPICS, scan.fromBlock, scan.toBlock);
  const filters = logFilters(node.calls);
  assert.ok(filters.length > 0);
  for (const filter of filters) {
    assert.ok(fromBlockOf(filter) >= scan.fromBlock);
    assert.ok(toBlockOf(filter) <= scan.toBlock);
  }
  assert.equal(Math.max(...filters.map(toBlockOf)), scan.toBlock);
  assert.deepEqual(filters[0].topics, [TOKEN_TOPICS]);
});

test("the current factory tail (last two windows) is rescanned on every incremental refresh", async (t) => {
  await db.delete(evmLogScanCursors);
  const latest = FACTORY_START + 20_000;
  const node = await startRpcNode(t, (call) => (call.method === "eth_blockNumber" ? hex(latest) : []));
  resetChainCatalogCacheForTests();

  await fetchLogsWindowedIncremental(FACTORY, TOKEN_TOPICS);
  const first = logFilters(node.calls).map(fromBlockOf).sort((a, b) => a - b);
  assert.deepEqual(first, [FACTORY_START, FACTORY_START + 9_000, FACTORY_START + 18_000]);

  // The first scan persisted the immutable window; the second still re-reads both tail windows.
  const before = node.calls.length;
  await fetchLogsWindowedIncremental(FACTORY, TOKEN_TOPICS);
  const second = logFilters(node.calls.slice(before)).map(fromBlockOf).sort((a, b) => a - b);
  assert.deepEqual(second, [FACTORY_START + 9_000, FACTORY_START + 18_000]);
});

test("a history deadline returns the tail plus completed history and marks the scan partial", async (t) => {
  await db.delete(evmLogScanCursors);
  const latest = FACTORY_START + 30_000;
  const tailLog = {
    address: FACTORY,
    topics: [TOKEN_CREATED_TOPIC],
    data: "0x01",
    blockNumber: hex(latest),
  };
  const node = await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(latest);
    if (call.method !== "eth_getLogs") return null;
    const filter = call.params[0];
    const from = fromBlockOf(filter);
    const to = toBlockOf(filter);
    return latest >= from && latest <= to ? [tailLog] : [];
  });
  resetChainCatalogCacheForTests();

  const result = await fetchLogsWindowedIncrementalResult(FACTORY, TOKEN_TOPICS, undefined, undefined, Date.now() - 1);
  assert.equal(result.complete, false);
  assert.deepEqual(result.logs.map((log) => log.blockNumber), [hex(latest)]);

  // Tail was read even though the deadline had already passed; history never started.
  const filters = logFilters(node.calls).map(fromBlockOf).sort((a, b) => a - b);
  assert.deepEqual(filters, [FACTORY_START + 18_000, FACTORY_START + 27_000]);
  assert.ok(TOKEN_CATALOG_SCAN_BUDGET_MS <= 50_000);
  assert.ok(CATALOG_PARTIAL_STALE_MS <= 15_000);
});

test("per-scan concurrency is 6 with a global cap of 8", () => {
  assert.equal(MAX_PARALLEL_LOG_WINDOWS, 6);
  assert.equal(MAX_GLOBAL_LOG_WINDOWS, 8);
  assert.ok(MAX_PARALLEL_LOG_WINDOWS <= MAX_GLOBAL_LOG_WINDOWS);
});
