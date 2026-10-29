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
      const answerCall = async (call, batch) => ({
        jsonrpc: "2.0",
        id: call.id,
        result: (await answer(call, { batch })) ?? null,
      });
      if (Array.isArray(body)) {
        calls.push(...body.map((call) => ({ method: call.method, params: call.params ?? [] })));
        try {
          reply(await Promise.all(body.map((call) => answerCall(call, true))));
        } catch (error) {
          // A thrown answer fails the whole JSON-RPC batch (transport-level batch rejection).
          reply({ jsonrpc: "2.0", id: null, error: { message: error.message } });
        }
        return;
      }
      calls.push({ method: body.method, params: body.params ?? [] });
      try {
        reply(await answerCall(body, false));
      } catch (error) {
        reply({ jsonrpc: "2.0", id: body.id, error: { message: error.message } });
      }
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
const tokenTopic = (token) => `0x${token.slice(2).toLowerCase().padStart(64, "0")}`;
const tokenLogFor = (token, block) => ({
  address: FACTORY,
  topics: [TOKEN_CREATED_TOPIC, tokenTopic(token)],
  data: "0x",
  blockNumber: hex(block),
});
const tokenLog = (block) => tokenLogFor(TOKEN, block);

const SEL_NAME = "0x06fdde03";
const SEL_SYMBOL = "0x95d89b41";
const SEL_DECIMALS = "0x313ce567";
const SEL_TOTAL_SUPPLY = "0x18160ddd";
const SEL_CREATOR = "0x02d05d3f";
const SEL_METADATA_URI = "0x03ee438c";
const word = (value) => value.toString(16).padStart(64, "0");
const encodeString = (value) => {
  const data = Buffer.from(value, "utf8").toString("hex");
  return `0x${word(32)}${word(value.length)}${data.padEnd(Math.ceil(data.length / 64) * 64, "0")}`;
};
const encodeUint = (value) => `0x${BigInt(value).toString(16).padStart(64, "0")}`;
const encodeAddress = (value) => `0x${value.slice(2).toLowerCase().padStart(64, "0")}`;

/** Metadata for the fixed TOKEN address, used by the resilience tests below. */
function tokenMetadata(call) {
  const data = call.params?.[0]?.data;
  if (data === SEL_NAME) return encodeString("Resilient Token");
  if (data === SEL_SYMBOL) return encodeString("RST");
  if (data === SEL_DECIMALS) return encodeUint(18);
  if (data === SEL_TOTAL_SUPPLY) return encodeUint(1_000_000n * 10n ** 18n);
  if (data === SEL_CREATOR) return encodeAddress(dep.deployer ?? TOKEN);
  if (data === SEL_METADATA_URI) return encodeString("");
  return null;
}


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
    if (toBlockOf(filter) >= latest) {
      // The tail is slower than the soft deadline, but must still be awaited.
      await sleep(600);
      return [tail];
    }
    // Slow current-factory history: the cold request must not wait for it.
    await sleep(2_500);
    return [];
  });
  resetChainCatalogCacheForTests();
  setTokenCatalogSoftDeadlineForTests(100);

  try {
    const startedAt = Date.now();
    const tokens = await discoverTokensOnChain();
    const elapsed = Date.now() - startedAt;
    assert.ok(elapsed < 4_000, `cold catalog took ${elapsed} ms`);
    assert.ok(
      tokens.some((token) => token.tokenAddress.toLowerCase() === TOKEN.toLowerCase()),
      "tail token missing from the partial list",
    );
    assert.ok(tokens.length > 0);
    // Let the background scan finish before the test node is torn down.
    await sleep(3_000);
  } finally {
    setTokenCatalogSoftDeadlineForTests(null);
    resetChainCatalogCacheForTests();
  }
});

test("metadata batch failure reuses cached metadata and falls back to single calls", async (t) => {
  await db.delete(evmLogScanCursors);
  const latest = FACTORY_START + 20_000;
  const tail = tokenLog(latest);
  let batchFails = true;
  let singleReadsWork = true;
  const calls = [];
  await startRpcNode(t, (call, { batch } = {}) => {
    calls.push(call);
    if (call.method === "eth_blockNumber") return hex(latest);
    if (call.method === "eth_getLogs") {
      const filter = call.params[0];
      if (filter.address.toLowerCase() !== FACTORY.toLowerCase()) return [];
      return toBlockOf(filter) >= latest ? [tail] : [];
    }
    if (call.method === "eth_call") {
      if (batchFails && batch) throw new Error("batch_rejected");
      return singleReadsWork ? tokenMetadata(call) : null;
    }
    return null;
  });
  resetChainCatalogCacheForTests();

  try {
    // Batch fails, so metadata comes from the individual fallback reads.
    const first = await discoverTokensOnChainUncached();
    const firstRow = first.tokens.find((token) => token.tokenAddress.toLowerCase() === TOKEN.toLowerCase());
    assert.equal(firstRow?.name, "Resilient Token");
    assert.equal(firstRow?.symbol, "RST");
    const singleNameReads = calls.filter(
      (call) => call.method === "eth_call" && call.params?.[0]?.data === SEL_NAME,
    );
    assert.ok(singleNameReads.length >= 1, "expected individual name eth_calls");

    // Now both the batch and the individual reads fail: the cached metadata must survive.
    singleReadsWork = false;
    const second = await discoverTokensOnChainUncached();
    const secondRow = second.tokens.find((token) => token.tokenAddress.toLowerCase() === TOKEN.toLowerCase());
    assert.equal(secondRow?.name, "Resilient Token");
    assert.equal(secondRow?.symbol, "RST");
    assert.equal(second.complete, true, "cached metadata must keep the row out of the partial set");
  } finally {
    resetChainCatalogCacheForTests();
  }
});

test("a partial result merges with the previous catalog instead of shrinking it", async (t) => {
  await db.delete(evmLogScanCursors);
  const tokenA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const tokenB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const latest = FACTORY_START + 40_000;
  const logA = tokenLogFor(tokenA, latest);
  const logB = tokenLogFor(tokenB, FACTORY_START + 28_000);
  let failTailFrom = null;
  await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(latest);
    if (call.method !== "eth_getLogs") return null;
    const filter = call.params[0];
    if (filter.address.toLowerCase() !== FACTORY.toLowerCase()) return [];
    const from = fromBlockOf(filter);
    const to = toBlockOf(filter);
    if (failTailFrom !== null && from === failTailFrom) return null;
    return [logA, logB].filter((log) => {
      const block = Number.parseInt(log.blockNumber, 16);
      return block >= from && block <= to;
    });
  });
  resetChainCatalogCacheForTests();

  try {
    const first = await discoverTokensOnChain();
    assert.ok(first.some((token) => token.tokenAddress.toLowerCase() === tokenA.toLowerCase()));
    assert.ok(first.some((token) => token.tokenAddress.toLowerCase() === tokenB.toLowerCase()));

    // The first of the two tail windows now fails: this scan only sees A, not B.
    failTailFrom = FACTORY_START + 27_000;
    const second = await discoverTokensOnChainUncached();
    assert.equal(second.complete, false);
    assert.ok(
      second.tokens.some((token) => token.tokenAddress.toLowerCase() === tokenB.toLowerCase()),
      "token from the previous catalog was dropped by the partial scan",
    );
    assert.ok(
      second.tokens.some((token) => token.tokenAddress.toLowerCase() === tokenA.toLowerCase()),
      "fresh tail token missing",
    );
    assert.ok(second.tokens.length >= first.length, "partial catalog shrank");
  } finally {
    resetChainCatalogCacheForTests();
  }
});
