import { test, after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createServer } from "node:http";

register("./fixtures/evm-log-scan-db-loader.mjs", import.meta.url);

const { getDbReady, setDatabaseConfiguredForTests } = await import("./fixtures/evm-log-scan-pglite-db.mjs");
const { evmLogScanCursors } = await import("../src/db/schema.ts");
const { readLogScanCursor, writeLogScanCursor } = await import("../src/lib/evm/log-scan-cursor.ts");
const {
  fetchLogsWindowedIncremental,
  resetChainCatalogCacheForTests,
} = await import("../src/lib/evm/chain-catalog.ts");
const { readEvmDeployments } = await import("../src/lib/evm/config.ts");

const db = await getDbReady();
const dep = readEvmDeployments();
const FACTORY = dep.contracts.bondingCurve;
const START = dep.startBlocks.bondingCurve;
const LATEST = START + 30_000;
const TOPIC = `0x${"11".repeat(32)}`;
const hex = (value) => `0x${value.toString(16)}`;

const LOG_EARLY = {
  address: FACTORY,
  topics: [TOPIC],
  data: "0x01",
  blockNumber: hex(START + 100),
};
const LOG_TIP = {
  address: FACTORY,
  topics: [TOPIC],
  data: "0x02",
  blockNumber: hex(START + 29_000),
};

const realFetch = globalThis.fetch;

after(async () => {
  globalThis.fetch = realFetch;
  setDatabaseConfiguredForTests(true);
});

/** Starts a JSON-RPC node whose tip is `latest` and returns logs inside each requested range. */
async function startRpcNode(t, latest = LATEST) {
  const calls = [];
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      calls.push({ method: body.method, params: body.params ?? [] });
      const reply = (result) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
      };
      if (body.method === "eth_blockNumber") return reply(hex(latest));
      if (body.method === "eth_getLogs") {
        const filter = body.params[0];
        const from = Number.parseInt(filter.fromBlock, 16);
        const to = Number.parseInt(filter.toBlock, 16);
        return reply(
          [LOG_EARLY, LOG_TIP].filter((log) => {
            const block = Number.parseInt(log.blockNumber, 16);
            return block >= from && block <= to;
          }),
        );
      }
      return reply(null);
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

test("log-scan cursor round-trips through the database", async () => {
  await db.delete(evmLogScanCursors);
  await writeLogScanCursor(FACTORY, TOPIC, START + 17_999, [LOG_EARLY]);
  const cursor = await readLogScanCursor(FACTORY.toUpperCase(), TOPIC.toUpperCase());
  assert.equal(cursor.lastBlock, START + 17_999);
  assert.deepEqual(cursor.logs, [LOG_EARLY]);
});

test("incremental scan skips persisted windows and keeps their logs", async (t) => {
  await db.delete(evmLogScanCursors);
  const node = await startRpcNode(t);
  resetChainCatalogCacheForTests();

  const first = await fetchLogsWindowedIncremental(FACTORY, TOPIC);
  assert.equal(first.length, 2);
  assert.deepEqual(logFilters(node.calls).map(fromBlockOf).sort((a, b) => a - b), [
    START,
    START + 9_000,
    START + 18_000,
    START + 27_000,
  ]);

  // Only the two immutable windows (below latest - 9000) are stored; the tip is re-read.
  const cursor = await readLogScanCursor(FACTORY, TOPIC);
  assert.equal(cursor.lastBlock, START + 17_999);
  assert.deepEqual(cursor.logs, [LOG_EARLY]);

  const before = node.calls.length;
  const second = await fetchLogsWindowedIncremental(FACTORY, TOPIC);
  assert.deepEqual(
    logFilters(node.calls.slice(before)).map(fromBlockOf).sort((a, b) => a - b),
    [START + 18_000, START + 27_000],
  );
  assert.equal(second.length, 2);
  assert.deepEqual(second.map((log) => log.data), ["0x01", "0x02"]);
});

test("without a database the incremental scan still returns every log and persists nothing", async (t) => {
  await db.delete(evmLogScanCursors);
  setDatabaseConfiguredForTests(false);
  const node = await startRpcNode(t);
  resetChainCatalogCacheForTests();

  try {
    const logs = await fetchLogsWindowedIncremental(FACTORY, TOPIC);
    assert.equal(logs.length, 2);
    assert.equal(logFilters(node.calls).length, 4);
    assert.equal(await readLogScanCursor(FACTORY, TOPIC), null);
  } finally {
    setDatabaseConfiguredForTests(true);
  }
});
