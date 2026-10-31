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
  tokenFactoryScans,
} = await import("../src/lib/evm/chain-catalog.ts");
const { evmJsonRpc, rpcBackoffRemainingMs } = await import("../src/lib/evm/rpc-server.ts");
const { runWithRequestDeadline } = await import("../src/lib/evm/request-deadline.ts");
const { readEvmDeployments } = await import("../src/lib/evm/config.ts");

const db = await getDbReady();
const dep = readEvmDeployments();
const FACTORY = dep.contracts.tokenFactory;
const FACTORY_START = dep.startBlocks.tokenFactory;
const TOKEN_TOPICS = [TOKEN_CREATED_TOPIC, TOKEN_CREATED_LEFTOVER_TOPIC];
// Built at runtime so secret scanners do not mistake the fixture address for a key.
const TOKEN = ["0x", "1234567890abcdef".repeat(2), "12345678"].join("");
const hex = (value) => `0x${value.toString(16)}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

after(async () => {
  delete process.env.EVM_TEST_FAIL_CURSOR_FACTORY;
  setDatabaseConfiguredForTests(true);
  setTokenCatalogSoftDeadlineForTests(null);
  resetChainCatalogCacheForTests();
});

/** Starts a JSON-RPC node on an ephemeral port and points the app's RPC layer at it. */
async function startRpcNode(t, answer, { status } = {}) {
  const calls = [];
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      const failStatus = status?.() ?? 200;
      if (failStatus !== 200) {
        res.writeHead(failStatus, { "content-type": "text/html" });
        res.end("<html><body>Bad Gateway</body></html>");
        return;
      }
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
    if (call.method === "eth_call") return tokenMetadata(call);
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

test("history keeps scanning after the request aborts and the next scan resumes the cursor", async (t) => {
  await db.delete(evmLogScanCursors);
  const latest = FACTORY_START + 40_000;
  const seenFrom = [];
  await startRpcNode(t, async (call) => {
    if (call.method === "eth_blockNumber") return hex(latest);
    if (call.method === "eth_call") return tokenMetadata(call);
    if (call.method !== "eth_getLogs") return null;
    const filter = call.params[0];
    if (filter.address.toLowerCase() !== FACTORY.toLowerCase()) return [];
    const from = fromBlockOf(filter);
    const to = toBlockOf(filter);
    if (to >= latest) return [tokenLog(latest)];
    seenFrom.push(from);
    await sleep(40);
    return from === FACTORY_START ? [tokenLog(FACTORY_START + 10)] : [];
  });
  resetChainCatalogCacheForTests();
  setTokenCatalogSoftDeadlineForTests(30);

  try {
    await runWithRequestDeadline(() => discoverTokensOnChain(), 80);
    const topicKey = [...TOKEN_TOPICS].sort().join("+");
    let cursor = null;
    for (let attempt = 0; attempt < 40 && !cursor; attempt++) {
      await sleep(50);
      cursor = await readLogScanCursor(FACTORY, topicKey);
    }
    assert.ok(cursor && cursor.lastBlock > FACTORY_START, "cursor did not advance after the request ended");
    const firstReads = seenFrom.filter((from) => from === FACTORY_START).length;
    assert.equal(firstReads, 1);
    seenFrom.length = 0;
    await discoverTokensOnChainUncached();
    assert.equal(
      seenFrom.filter((from) => from === FACTORY_START).length,
      0,
      "resumed scan re-read the cursor prefix",
    );
  } finally {
    setTokenCatalogSoftDeadlineForTests(null);
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
    if (call.method === "eth_call") return tokenMetadata(call);
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
  // Inside the older tail window, so a later failed re-read of that window is not the tip.
  const tokenBBlock = latest - 400;
  const logB = tokenLogFor(tokenB, tokenBBlock);
  let failTokenB = false;
  await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(latest);
    if (call.method === "eth_call") return tokenMetadata(call);
    if (call.method !== "eth_getLogs") return null;
    const filter = call.params[0];
    if (filter.address.toLowerCase() !== FACTORY.toLowerCase()) return [];
    const from = fromBlockOf(filter);
    const to = toBlockOf(filter);
    if (failTokenB && from <= tokenBBlock && tokenBBlock <= to) return null;
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

    // The window that contains B now fails: this scan only sees A, not B.
    failTokenB = true;
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

const isTkn = (token) => token.symbol === "TKN";
const hasToken = (tokens, address) => tokens.some((token) => token.tokenAddress.toLowerCase() === address.toLowerCase());

test("a failed log window is logged with its context and without the RPC url", async (t) => {
  await db.delete(evmLogScanCursors);
  const latest = FACTORY_START + 20_000;
  const tail = tokenLog(latest);
  const warn = t.mock.method(console, "warn", () => {});
  await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(latest);
    if (call.method !== "eth_getLogs") return null;
    const filter = call.params[0];
    if (fromBlockOf(filter) === FACTORY_START) return null;
    return toBlockOf(filter) >= latest ? [tail] : [];
  });
  resetChainCatalogCacheForTests();

  const result = await fetchLogsWindowedIncrementalResult(FACTORY, TOKEN_TOPICS, undefined, undefined, undefined, {
    retryDelays: [0],
    historyNewestFirst: true,
    maxParallel: 4,
  });
  assert.equal(result.failedWindows, 1);
  const messages = warn.mock.calls.map((call) => String(call.arguments[0]));
  assert.ok(
    messages.some((message) =>
      new RegExp(`^\\[evm-catalog\\] log window failed address=${FACTORY.toLowerCase()} from=${FACTORY_START} to=\\d+:`).test(message),
    ),
    `no window warning in ${JSON.stringify(messages)}`,
  );
  assert.ok(messages.every((message) => !/https?:|127\.0\.0\.1/.test(message)), "a warning leaked the rpc url");
});

test("an rpc backoff does not blank the other factories", async (t) => {
  await db.delete(evmLogScanCursors);
  const scans = tokenFactoryScans();
  const superseded = scans.find((scan) => scan.toBlock !== undefined);
  assert.ok(superseded, "deployment config has no superseded factory");
  const current = scans.find((scan) => scan.toBlock === undefined);
  const latest = current.fromBlock + 20_000;
  const oldToken = `0x${"c".repeat(40)}`;
  const oldLog = { ...tokenLogFor(oldToken, superseded.fromBlock + 1), address: superseded.address };
  let status = 502;
  t.mock.method(console, "warn", () => {});
  await startRpcNode(
    t,
    (call) => {
      if (call.method === "eth_blockNumber") return hex(latest);
      if (call.method === "eth_call") return tokenMetadata(call);
      if (call.method !== "eth_getLogs") return null;
      const filter = call.params[0];
      if (filter.address.toLowerCase() !== superseded.address.toLowerCase()) return [];
      return fromBlockOf(filter) <= superseded.fromBlock + 1 && toBlockOf(filter) >= superseded.fromBlock + 1 ? [oldLog] : [];
    },
    { status: () => status },
  );
  resetChainCatalogCacheForTests();

  // An unrelated call fails and trips the per-url backoff; the node is healthy again afterwards.
  await assert.rejects(evmJsonRpc("eth_chainId"));
  status = 200;
  assert.ok(rpcBackoffRemainingMs() > 0, "backoff was not tripped");

  try {
    const result = await discoverTokensOnChainUncached();
    assert.ok(hasToken(result.tokens, oldToken), "superseded factory token lost to the backoff");
  } finally {
    resetChainCatalogCacheForTests();
  }
});

test("the persisted catalog keeps the list when every read fails", async (t) => {
  await db.delete(evmLogScanCursors);
  const latest = FACTORY_START + 20_000;
  const tail = tokenLog(latest);
  let status = 200;
  t.mock.method(console, "warn", () => {});
  await startRpcNode(
    t,
    (call) => {
      if (call.method === "eth_blockNumber") return hex(latest);
      if (call.method === "eth_call") return tokenMetadata(call);
      if (call.method !== "eth_getLogs") return null;
      const filter = call.params[0];
      if (filter.address.toLowerCase() !== FACTORY.toLowerCase()) return [];
      return toBlockOf(filter) >= latest ? [tail] : [];
    },
    { status: () => status },
  );
  resetChainCatalogCacheForTests();

  try {
    const good = await discoverTokensOnChainUncached();
    assert.equal(good.complete, true);
    assert.ok(hasToken(good.tokens, TOKEN));

    // A new instance (empty in-process cache) meets a node that fails everything.
    resetChainCatalogCacheForTests();
    status = 502;
    const degraded = await discoverTokensOnChain();
    assert.ok(hasToken(degraded, TOKEN), "persisted token missing after a failed scan");
    assert.ok(degraded.length >= good.tokens.length, "catalog shrank to the static list");
  } finally {
    resetChainCatalogCacheForTests();
  }
});

test("placeholder metadata is neither listed nor cached", async (t) => {
  await db.delete(evmLogScanCursors);
  const latest = FACTORY_START + 20_000;
  const tail = tokenLog(latest);
  let metadataWorks = false;
  t.mock.method(console, "warn", () => {});
  await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(latest);
    if (call.method === "eth_call") return metadataWorks ? tokenMetadata(call) : null;
    if (call.method !== "eth_getLogs") return null;
    const filter = call.params[0];
    if (filter.address.toLowerCase() !== FACTORY.toLowerCase()) return [];
    return toBlockOf(filter) >= latest ? [tail] : [];
  });
  resetChainCatalogCacheForTests();

  try {
    const first = await discoverTokensOnChain();
    assert.ok(!hasToken(first, TOKEN), "token with unreadable metadata was listed");
    assert.ok(!first.some(isTkn), "placeholder TKN row in the catalog");

    // Metadata recovers within the cache window: the token must appear with its real name.
    metadataWorks = true;
    const second = await discoverTokensOnChain();
    const row = second.find((token) => token.tokenAddress.toLowerCase() === TOKEN.toLowerCase());
    assert.equal(row?.name, "Resilient Token");
    assert.equal(row?.symbol, "RST");
    assert.ok(!second.some(isTkn));
  } finally {
    resetChainCatalogCacheForTests();
  }
});

test("a fresh cache still shows a token created since, and concurrent requests share one read", async (t) => {
  await db.delete(evmLogScanCursors);
  const latest = FACTORY_START + 20_000;
  const newer = `0x${"d".repeat(40)}`;
  const logs = [tokenLog(latest)];
  const node = await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(latest);
    if (call.method === "eth_call") return tokenMetadata(call);
    if (call.method !== "eth_getLogs") return null;
    const filter = call.params[0];
    if (filter.address.toLowerCase() !== FACTORY.toLowerCase()) return [];
    return logs.filter((log) => {
      const block = Number.parseInt(log.blockNumber, 16);
      return block >= fromBlockOf(filter) && block <= toBlockOf(filter);
    });
  });
  resetChainCatalogCacheForTests();
  const getLogsCount = () => node.calls.filter((call) => call.method === "eth_getLogs").length;

  try {
    const first = await discoverTokensOnChain();
    assert.ok(hasToken(first, TOKEN));
    assert.ok(!hasToken(first, newer));
    await sleep(100);

    // Well inside the 30 s cache window, yet the new token is in the very next answer.
    logs.push(tokenLogFor(newer, latest));
    const before = getLogsCount();
    const second = await discoverTokensOnChain();
    const single = getLogsCount() - before;
    assert.ok(hasToken(second, newer), "fresh cache hid a newly created token");
    assert.ok(hasToken(second, TOKEN), "cached token dropped");
    assert.ok(single > 0, "no tail window was re-read");

    const beforeBurst = getLogsCount();
    const burst = await Promise.all([discoverTokensOnChain(), discoverTokensOnChain(), discoverTokensOnChain()]);
    assert.ok(burst.every((tokens) => hasToken(tokens, newer)));
    assert.ok(getLogsCount() - beforeBurst <= single, "concurrent requests did not share the tail read");
  } finally {
    resetChainCatalogCacheForTests();
  }
});
