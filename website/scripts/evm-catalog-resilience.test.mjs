import { test, after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createServer } from "node:http";

register("./fixtures/evm-catalog-fault-loader.mjs", import.meta.url);

const { getDbReady, setDatabaseConfiguredForTests } = await import("./fixtures/evm-log-scan-pglite-db.mjs");
const { evmLogScanCursors } = await import("../src/db/schema.ts");
const { readLogScanCursor } = await import("../src/lib/evm/log-scan-cursor.ts");
const {
  TOKEN_CREATED_TOPIC,
  TOKEN_CREATED_LEFTOVER_TOPIC,
  discoverTokensOnChain,
  discoverTokensOnChainUncached,
  fetchLogsWindowedIncrementalResult,
  resetChainCatalogCacheForTests,
  setTokenCatalogSoftDeadlineForTests,
} = await import("../src/lib/evm/chain-catalog.ts");
const { readEvmDeployments } = await import("../src/lib/evm/config.ts");

const db = await getDbReady();
const dep = readEvmDeployments();
const FACTORY = dep.contracts.tokenFactory;
const FACTORY_START = dep.startBlocks.tokenFactory;
const TOKEN_TOPICS = [TOKEN_CREATED_TOPIC, TOKEN_CREATED_LEFTOVER_TOPIC];
const TOKEN = "0x1234567890abcdef1234567890abcdef12345678";
const TOKEN_TOPIC = `0x${TOKEN.slice(2).toLowerCase().padStart(64, "0")}`;
const hex = (value) => `0x${value.toString(16)}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

after(async () => {
  delete process.env.EVM_TEST_FAIL_CURSOR_FACTORY;
  setDatabaseConfiguredForTests(true);
  setTokenCatalogSoftDeadlineForTests(null);
  resetChainCatalogCacheForTests();
});

/** Starts a JSON-RPC node on an ephemeral port and points the app's RPC layer at it. */
async function startRpcNode(t, answer) {
  const calls = [];
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const reply = (payload) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };
      const answerCall = async (call) => ({ jsonrpc: "2.0", id: call.id, result: (await answer(call)) ?? null });
      if (Array.isArray(body)) {
        calls.push(...body.map((call) => ({ method: call.method, params: call.params ?? [] })));
        reply(await Promise.all(body.map(answerCall)));
        return;
      }
      calls.push({ method: body.method, params: body.params ?? [] });
      reply(await answerCall(body));
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

const fromBlockOf = (filter) => Number.parseInt(filter.fromBlock, 16);
const toBlockOf = (filter) => Number.parseInt(filter.toBlock, 16);
const tokenLog = (block) => ({
  address: FACTORY,
  topics: [TOKEN_CREATED_TOPIC, TOKEN_TOPIC],
  data: "0x",
  blockNumber: hex(block),
});

test("one failed log window keeps the other windows and marks the scan incomplete", async (t) => {
  await db.delete(evmLogScanCursors);
  const latest = FACTORY_START + 20_000;
  const tail = tokenLog(latest);
  await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(latest);
    if (call.method !== "eth_getLogs") return null;
    const filter = call.params[0];
    // Fail the only history window; both tail windows still answer.
    if (fromBlockOf(filter) === FACTORY_START) return null;
    return toBlockOf(filter) >= latest ? [tail] : [];
  });
  resetChainCatalogCacheForTests();

  const result = await fetchLogsWindowedIncrementalResult(
    FACTORY,
    TOKEN_TOPICS,
    undefined,
    undefined,
    undefined,
    { retryDelays: [0], historyNewestFirst: true, maxParallel: 4 },
  );
  assert.equal(result.complete, false);
  assert.equal(result.failedWindows, 1);
  assert.ok(result.logs.some((log) => log.blockNumber === hex(latest)));
});

test("a rejecting factory leaves the other factories' tokens in the catalog", async (t) => {
  await db.delete(evmLogScanCursors);
  process.env.EVM_TEST_FAIL_CURSOR_FACTORY = FACTORY;
  const latest = FACTORY_START + 100_000;
  const otherFactoryLog = { ...tokenLog(FACTORY_START + 1) };
  await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(latest);
    if (call.method === "eth_getLogs") return [otherFactoryLog];
    return null;
  });
  resetChainCatalogCacheForTests();

  try {
    const result = await discoverTokensOnChainUncached();
    assert.equal(result.complete, false);
    assert.ok(
      result.tokens.some((token) => token.tokenAddress.toLowerCase() === TOKEN.toLowerCase()),
      "token from a surviving factory is missing",
    );
    // Static deployment/seed tokens are never dropped either.
    assert.ok(result.tokens.some((token) => token.verified));
  } finally {
    delete process.env.EVM_TEST_FAIL_CURSOR_FACTORY;
    resetChainCatalogCacheForTests();
  }
});

test("the cursor never advances past a failed window", async (t) => {
  await db.delete(evmLogScanCursors);
  const latest = FACTORY_START + 50_000;
  await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(latest);
    if (call.method !== "eth_getLogs") return null;
    // Oldest history window fails; newer windows succeed. A contiguous cursor must stay unset.
    return fromBlockOf(call.params[0]) === FACTORY_START ? null : [];
  });
  resetChainCatalogCacheForTests();

  const result = await fetchLogsWindowedIncrementalResult(
    FACTORY,
    TOKEN_TOPICS,
    undefined,
    undefined,
    undefined,
    { retryDelays: [0], historyNewestFirst: true, maxParallel: 4 },
  );
  assert.equal(result.complete, false);
  assert.ok((result.failedWindows ?? 0) >= 1);
  const topicKey = [...TOKEN_TOPICS].sort().join("+");
  assert.equal(await readLogScanCursor(FACTORY, topicKey), null);
});

test("a cold catalog call returns within the soft deadline with tail tokens", async (t) => {
  await db.delete(evmLogScanCursors);
  const latest = FACTORY_START + 20_000;
  const tail = tokenLog(latest);
  await startRpcNode(t, async (call) => {
    if (call.method === "eth_blockNumber") return hex(latest);
    if (call.method !== "eth_getLogs") return null;
    const filter = call.params[0];
    if (filter.address.toLowerCase() !== FACTORY.toLowerCase()) return [];
    if (toBlockOf(filter) >= latest) return [tail];
    // Slow current-factory history: the cold request must not wait for it.
    await sleep(1_500);
    return [];
  });
  resetChainCatalogCacheForTests();
  setTokenCatalogSoftDeadlineForTests(250);

  try {
    const startedAt = Date.now();
    const tokens = await discoverTokensOnChain();
    const elapsed = Date.now() - startedAt;
    assert.ok(elapsed < 2_000, `cold catalog took ${elapsed} ms`);
    assert.ok(
      tokens.some((token) => token.tokenAddress.toLowerCase() === TOKEN.toLowerCase()),
      "tail token missing from the partial list",
    );
    assert.ok(tokens.length > 0);
    // Let the background scan finish before the test node is torn down.
    await sleep(2_500);
  } finally {
    setTokenCatalogSoftDeadlineForTests(null);
    resetChainCatalogCacheForTests();
  }
});
