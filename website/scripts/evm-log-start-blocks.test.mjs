import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { encodeAbiParameters, encodeEventTopics } from "viem";

import { readEvmDeployments } from "../src/lib/evm/config.ts";
import {
  MAX_PARALLEL_LOG_WINDOWS,
  fetchLogsWindowed,
  logStartBlock,
  logWindowConcurrencyPeakForTests,
  logWindows,
  pairLogStartBlock,
  resetChainCatalogCacheForTests,
} from "../src/lib/evm/chain-catalog.ts";
import {
  RPC_BACKOFF_BASE_MS,
  RPC_BACKOFF_MAX_MS,
  evmJsonRpc,
  rpcBackoffDelayMs,
  rpcBackoffRemainingMs,
} from "../src/lib/evm/rpc-server.ts";
import { fetchTokenMarketSnapshot, resetTokenMarketCacheForTests } from "../src/lib/evm/market-data.ts";

/**
 * Per-contract log start blocks: a contract deployed long after the chain's first deploy block
 * would otherwise force scanning from `deployBlock` and walk windows that can never match.
 * `logStartBlock()` collapses that to the contract's own first block (see
 * S2-04: the currently-authorized token factory/bonding curve/community vault are near-genesis
 * deploys, so their own start blocks are close to `deployBlock` today — the collapsing behavior
 * itself is still covered below with a synthetic far-start value).
 *
 * The RPC layer is exercised for real rather than mocked: a throwaway JSON-RPC node is started on
 * an ephemeral localhost port and `EVM_RPC_URL` is pointed at it, so `readEvmRpcUrl()` inside the
 * production `rpc-server.ts` dials the test node. Everything between `fetchLogsWindowed()` and the
 * socket — windowing, batching, the window cache key, the per-block fallback — is production code.
 */

const dep = readEvmDeployments();
const contract = (key) => {
  const address = dep.contracts[key];
  if (!address) throw new Error(`missing contract ${key}`);
  return address;
};

/** Start blocks come from the deployment JSON (the launch stack was redeployed on 2026-10-16). */
const TF_START = dep.startBlocks.tokenFactory;
const CURVE_START = dep.startBlocks.bondingCurve;
/** Pairs not in the JSON fall back to the earliest AMM factory (legacy V1 or current). */
const AMM_START = Math.min(dep.startBlocks.ammFactory, dep.startBlocks.ammFactoryV1 ?? Infinity);
/** A live-ish tip shortly after the current stack's deploy. */
const LATEST = CURVE_START + 10_000;
const TRADE_BLOCK = CURVE_START + 9_000;
const TRADE_TS_SECONDS = 1_700_000_000;
const DECIMALS = 18;
const TOKEN = "0x89e2d0d8a921027b4bf22aab600f100e9139ec3e";
const hex = (value) => `0x${value.toString(16)}`;

const BUY_TOPIC = `0x${"11".repeat(32)}`;
const SELL_TOPIC = `0x${"22".repeat(32)}`;
/** An AMM pair the factory deployed: it is not in the deployment JSON. */
const PAIR_ADDRESS = "0x1111111111111111111111111111111111111111";

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

/** The `eth_getLogs` filters a node was asked for, in order. */
const logFilters = (calls) => calls.filter((call) => call.method === "eth_getLogs").map((call) => call.params[0]);

/** A node that reports a tip and answers every log query with no logs. */
const emptyNode = (call) => (call.method === "eth_blockNumber" ? hex(LATEST) : []);

const fromBlockOf = (filter) => Number.parseInt(filter.fromBlock, 16);

test("logStartBlock uses the per-contract start block, not the chain's first deploy block", () => {
  assert.equal(logStartBlock(contract("tokenFactory")), TF_START);
  assert.equal(logStartBlock(contract("bondingCurve")), CURVE_START);
  assert.equal(logStartBlock(contract("ammFactory")), dep.startBlocks.ammFactory);
  assert.equal(logStartBlock(contract("wppl")), 57);
  assert.equal(logStartBlock(contract("router")), dep.startBlocks.router);
  // Legacy (pre-2026-10-16) AMM keeps its own start block.
  assert.equal(logStartBlock(contract("ammFactoryV1")), 58);
});

test("logStartBlock matches contract addresses case-insensitively", () => {
  assert.equal(logStartBlock(contract("tokenFactory").toUpperCase()), TF_START);
  assert.equal(logStartBlock(`0x${contract("bondingCurve").slice(2).toLowerCase()}`), CURVE_START);
});

test("logStartBlock falls back to the deployment block for contracts with no start entry", () => {
  // `timelock` is in the deployment JSON but has no `startBlocks` entry.
  assert.equal(dep.startBlocks.timelock, undefined);
  assert.equal(logStartBlock(contract("timelock")), dep.deployBlock);
});

test("every contract of the 2026-10-16 redeploys has its own start block", () => {
  // Current stack (fullStackRedeploy) and the earlier V4 redeploy of the same day: deploy blocks
  // were read from the chain (first block with code).
  const current = ["registry", "creatorVesting", "communityVault", "gateway", "tokenFactory", "bondingCurve", "ammFactory", "router", "nftFactory", "promoRewardsVault"];
  const v4 = ["registryV4", "creatorVestingV4", "communityVaultV4", "promoRewardsVaultV4", "nftFactoryV4", "gatewayV4", "tokenFactoryV4", "bondingCurveV4", "ammFactoryV4", "routerV4"];
  for (const key of current) assert.ok(logStartBlock(contract(key)) >= 471_827, key);
  for (const key of v4) {
    const start = logStartBlock(contract(key));
    assert.ok(start >= 470_209 && start < 471_827, `${key} ${start}`);
  }
  assert.equal(logStartBlock(contract("agentWallet")), 220_464);
});

test("logStartBlock scans AMM pairs from the factory's start block, since the factory deployed them", () => {
  assert.equal(logStartBlock(PAIR_ADDRESS), AMM_START);
});

test("logWindows collapses a scan to a handful of windows when a contract's start block is far into the range", () => {
  // Representative of a contract deployed long after genesis (the shape the old, mismatched
  // tokenFactory/bondingCurve startBlocks used to have before S2-04) — not tied to the current
  // deployment JSON, which now points at near-genesis contracts.
  const farStart = LATEST - 20_000;
  const fromStart = logWindows(farStart, LATEST);
  const fromGenesis = logWindows(1, LATEST);
  assert.ok(fromStart.length < fromGenesis.length / 10);
  assert.equal(fromStart[0][0], farStart);
  assert.equal(fromStart.at(-1)[1], LATEST);
});

test("fetchLogsWindowed starts the bonding-curve scan at its own deploy block, not block 56", async (t) => {
  const node = await startRpcNode(t, emptyNode);
  resetChainCatalogCacheForTests();

  await fetchLogsWindowed(contract("bondingCurve"), [BUY_TOPIC]);
  const filters = logFilters(node.calls);
  assert.ok(filters.length > 0);
  assert.equal(filters[0].fromBlock, hex(CURVE_START));
  for (const filter of filters) assert.ok(fromBlockOf(filter) >= CURVE_START);
});

test("fetchLogsWindowed starts an AMM pair scan at the factory's start block", async (t) => {
  const node = await startRpcNode(t, emptyNode);
  resetChainCatalogCacheForTests();

  await fetchLogsWindowed(PAIR_ADDRESS, [BUY_TOPIC]);
  const filters = logFilters(node.calls);
  assert.ok(filters.length > 0);
  assert.equal(filters[0].fromBlock, hex(AMM_START));
});

test("fetchLogsWindowed passes every topic through to the log filter, wildcards included", async (t) => {
  const node = await startRpcNode(t, emptyNode);
  resetChainCatalogCacheForTests();

  const topics = [BUY_TOPIC, null];
  await fetchLogsWindowed(contract("bondingCurve"), topics);
  const filters = logFilters(node.calls);
  assert.ok(filters.length > 0);
  for (const filter of filters) assert.deepEqual(filter.topics, topics);
});

test("fetchLogsWindowed keys the window cache on all topics, so different scans do not collide", async (t) => {
  const node = await startRpcNode(t, emptyNode);
  const ammFactory = contract("ammFactory");
  resetChainCatalogCacheForTests();

  await fetchLogsWindowed(ammFactory, [BUY_TOPIC]);
  const buyCallCount = logFilters(node.calls).length;
  assert.ok(buyCallCount > 1);

  // Same address, different topics: a distinct cache key, so every window is read again.
  const beforeSell = node.calls.length;
  await fetchLogsWindowed(ammFactory, [SELL_TOPIC]);
  assert.equal(logFilters(node.calls.slice(beforeSell)).length, buyCallCount);

  // Same address and topics: every window is served from cache, so nothing is re-read.
  const beforeRepeat = node.calls.length;
  await fetchLogsWindowed(ammFactory, [BUY_TOPIC]);
  assert.deepEqual(logFilters(node.calls.slice(beforeRepeat)), []);
});

test("fetchLogsWindowed returns nothing when the node cannot report a tip", async (t) => {
  const node = await startRpcNode(t, () => null);
  resetChainCatalogCacheForTests();

  assert.deepEqual(await fetchLogsWindowed(contract("bondingCurve"), [BUY_TOPIC]), []);
  assert.deepEqual(logFilters(node.calls), []);
});

test("fetchLogsWindowed retries a failed window once before succeeding", async (t) => {
  const attempts = new Map();
  await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(LATEST);
    if (call.method !== "eth_getLogs") return [];
    const key = `${call.params[0].fromBlock}-${call.params[0].toBlock}`;
    const count = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, count);
    return count === 1 ? null : [];
  });
  resetChainCatalogCacheForTests();

  assert.deepEqual(await fetchLogsWindowed(contract("bondingCurve"), [BUY_TOPIC]), []);
  const counts = [...attempts.values()];
  assert.ok(counts.length > 0);
  assert.ok(counts.every((count) => count === 2), counts.join(","));
});

test("fetchLogsWindowed rejects with log_window_unavailable when a window still fails after one retry", async (t) => {
  await startRpcNode(t, (call) => (call.method === "eth_blockNumber" ? hex(LATEST) : null));
  resetChainCatalogCacheForTests();

  await assert.rejects(fetchLogsWindowed(contract("bondingCurve"), [BUY_TOPIC]), /log_window_unavailable/);
});

// --- market-data.ts: the same windowing through a full snapshot ------------------------------

// The package targets ES2017, so BigInt literals (`10n`) do not compile — spell them out.
const E18 = BigInt(10) ** BigInt(18);
/** `whole` tokens, scaled to 18 decimals. */
const tokens = (whole) => BigInt(whole) * E18;

const curveBuyAbi = [
  {
    type: "event",
    name: "CurveBuy",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "nativeIn", type: "uint256", indexed: false },
      { name: "tokensOut", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
    ],
  },
];

const CURVE_BUY_TOPIC = encodeEventTopics({ abi: curveBuyAbi, eventName: "CurveBuy" })[0];
const TOKEN_TOPIC = `0x${TOKEN.slice(2).toLowerCase().padStart(64, "0")}`;
const BUY_LOG = {
  address: contract("bondingCurve"),
  topics: [CURVE_BUY_TOPIC, TOKEN_TOPIC, `0x${"ab".repeat(20).padStart(64, "0")}`],
  data: encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
    [tokens(5), tokens(10_000), BigInt(0)],
  ),
  blockNumber: hex(TRADE_BLOCK),
};

/** The 11 outputs of `BondingCurveMarket.curves(address)`, as `market-data.ts` decodes them. */
const CURVES_OUTPUT_TYPES = [
  { type: "uint256" }, // virtualTokenReserve
  { type: "uint256" }, // virtualNativeReserve
  { type: "uint256" }, // actualNativeReserve
  { type: "uint256" }, // currentTokenReserve
  { type: "uint256" }, // invariantK
  { type: "uint256" }, // migrationThreshold
  { type: "bool" }, // active
  { type: "bool" }, // migrated
  { type: "uint256" }, // liquidityReserve
  { type: "uint256" }, // ecosystemReserve
  { type: "uint256" }, // curveInventory
];

/** An active, un-migrated curve, so the snapshot stays on the bonding-curve branch. */
const CURVE_STATE = [
  tokens(600_000), // virtualTokenReserve
  tokens(100), // virtualNativeReserve
  tokens(40), // actualNativeReserve
  tokens(500_000), // currentTokenReserve
  BigInt(0), // invariantK
  tokens(200), // migrationThreshold
  true, // active
  false, // migrated
  BigInt(0), // liquidityReserve
  BigInt(0), // ecosystemReserve
  tokens(400_000), // curveInventory
];

/** The buy log belongs to one block, so only the window covering it returns it — as a node would. */
function filterMatchesBuy(filter) {
  return (
    filter.topics[0] === CURVE_BUY_TOPIC && fromBlockOf(filter) <= TRADE_BLOCK && TRADE_BLOCK <= Number.parseInt(filter.toBlock, 16)
  );
}

/** Answers `eth_call`s and `eth_getLogs` the way the live node would for one active curve token. */
function marketNode(call) {
  if (call.method === "eth_blockNumber") return hex(LATEST);
  if (call.method === "eth_getBlockByNumber") return { timestamp: hex(TRADE_TS_SECONDS) };
  if (call.method === "eth_getLogs") {
    const filter = call.params[0];
    return filterMatchesBuy(filter) ? [BUY_LOG] : [];
  }
  if (call.method !== "eth_call") return null;
  const { to, data } = call.params[0];
  if (to.toLowerCase() === contract("bondingCurve").toLowerCase()) {
    return encodeAbiParameters(CURVES_OUTPUT_TYPES, CURVE_STATE);
  }
  if (data.startsWith("0x18160ddd")) return encodeAbiParameters([{ type: "uint256" }], [tokens(1_000_000)]);
  if (data.startsWith("0x313ce567")) return encodeAbiParameters([{ type: "uint8" }], [DECIMALS]);
  return "0x";
}

test("fetchTokenMarketSnapshot starts every bonding-curve window at the curve's deploy block", async (t) => {
  const node = await startRpcNode(t, marketNode);
  resetChainCatalogCacheForTests();
  resetTokenMarketCacheForTests();

  const snapshot = await fetchTokenMarketSnapshot(TOKEN);
  assert.equal(snapshot.hasMarket, true);

  const filters = logFilters(node.calls);
  assert.ok(filters.length > 0);
  const bondingCurve = contract("bondingCurve").toLowerCase();
  for (const filter of filters) {
    assert.equal(filter.address.toLowerCase(), bondingCurve);
    assert.ok(fromBlockOf(filter) >= CURVE_START);
  }
  // The whole point of the fix: the earliest window is the curve's own deploy block (CURVE_START),
  // not the chain's deploy block of 56.
  assert.equal(Math.min(...filters.map(fromBlockOf)), CURVE_START);
});

test("fetchTokenMarketSnapshot resolves trade timestamps in one batched block request", async (t) => {
  const node = await startRpcNode(t, marketNode);
  resetChainCatalogCacheForTests();
  resetTokenMarketCacheForTests();

  const snapshot = await fetchTokenMarketSnapshot(TOKEN);
  assert.equal(snapshot.hasMarket, true);

  const timestampBatches = node.batches.filter((batch) => batch.every((call) => call.method === "eth_getBlockByNumber"));
  assert.deepEqual(timestampBatches.map((batch) => batch.length), [1]);
  assert.equal(snapshot.trades.length, 1);
  assert.equal(snapshot.trades[0].ts, TRADE_TS_SECONDS * 1000);
});

test("fetchTokenMarketSnapshot falls back to per-block requests when the node rejects batches", async (t) => {
  const node = await startRpcNode(t, marketNode, {
    rejectBatches: (calls) => calls.every((call) => call.method === "eth_getBlockByNumber"),
  });
  resetChainCatalogCacheForTests();
  resetTokenMarketCacheForTests();

  const snapshot = await fetchTokenMarketSnapshot(TOKEN);
  assert.equal(snapshot.hasMarket, true);

  // The batch was attempted once, rejected, and the timestamps came back one block at a time.
  const timestampBatches = node.batches.filter((batch) => batch.every((call) => call.method === "eth_getBlockByNumber"));
  const singleBlockCalls = node.calls
    .filter((call) => call.method === "eth_getBlockByNumber" && !call.batched)
    .map((call) => call.params[0]);
  assert.equal(timestampBatches.length, 1);
  assert.deepEqual(singleBlockCalls, [hex(TRADE_BLOCK)]);
  assert.equal(snapshot.trades[0].ts, TRADE_TS_SECONDS * 1000);
});

// --- load shedding: window concurrency cap, exponential backoff, pair start blocks ------------

test("fetchLogsWindowed never has more than MAX_PARALLEL_LOG_WINDOWS eth_getLogs in flight", async (t) => {
  assert.equal(MAX_PARALLEL_LOG_WINDOWS, 2);
  let inFlight = 0;
  let peak = 0;
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const reply = (result) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
      };
      if (body.method !== "eth_getLogs") return reply(hex(LATEST + 200_000));
      inFlight++;
      peak = Math.max(peak, inFlight);
      setTimeout(() => {
        inFlight--;
        reply([]);
      }, 15);
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
  resetChainCatalogCacheForTests();

  // Two concurrent scans (~23 windows each) share the same global cap.
  await Promise.all([
    fetchLogsWindowed(contract("bondingCurve"), [BUY_TOPIC]),
    fetchLogsWindowed(contract("bondingCurve"), [SELL_TOPIC]),
  ]);
  assert.ok(peak >= 1);
  assert.ok(peak <= MAX_PARALLEL_LOG_WINDOWS, `peak ${peak}`);
  assert.ok(logWindowConcurrencyPeakForTests() <= MAX_PARALLEL_LOG_WINDOWS);
});

test("fetchLogsWindowed honours a later fromBlock hint but never scans before the contract's start", async (t) => {
  const node = await startRpcNode(t, emptyNode);
  resetChainCatalogCacheForTests();

  await fetchLogsWindowed(PAIR_ADDRESS, [BUY_TOPIC], CURVE_START);
  assert.equal(Math.min(...logFilters(node.calls).map(fromBlockOf)), CURVE_START);

  resetChainCatalogCacheForTests();
  const before = node.calls.length;
  await fetchLogsWindowed(contract("bondingCurve"), [BUY_TOPIC], 1);
  assert.equal(Math.min(...logFilters(node.calls.slice(before)).map(fromBlockOf)), CURVE_START);
});

test("pairLogStartBlock starts a pair at the start block of the factory that created it", async (t) => {
  const factory = contract("ammFactory");
  await startRpcNode(t, (call) =>
    call.method === "eth_call" && call.params[0].data === "0xc45a0155"
      ? `0x${factory.slice(2).toLowerCase().padStart(64, "0")}`
      : null,
  );
  resetChainCatalogCacheForTests();
  assert.equal(await pairLogStartBlock(PAIR_ADDRESS), dep.startBlocks.ammFactory);
});

test("pairLogStartBlock falls back to the earliest AMM factory when factory() is unknown", async (t) => {
  await startRpcNode(t, () => `0x${"99".repeat(32)}`);
  resetChainCatalogCacheForTests();
  assert.equal(await pairLogStartBlock(PAIR_ADDRESS), AMM_START);
});

test("rpc backoff doubles from the base delay and is capped", () => {
  assert.equal(rpcBackoffDelayMs(0), 0);
  assert.equal(rpcBackoffDelayMs(1), RPC_BACKOFF_BASE_MS);
  assert.equal(rpcBackoffDelayMs(2), RPC_BACKOFF_BASE_MS * 2);
  assert.equal(rpcBackoffDelayMs(3), RPC_BACKOFF_BASE_MS * 4);
  assert.equal(rpcBackoffDelayMs(50), RPC_BACKOFF_MAX_MS);
});

test("after a node failure, calls fail fast without touching the node until the backoff expires", async (t) => {
  let hits = 0;
  const node = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      hits++;
      res.writeHead(503, { "content-type": "text/plain" });
      res.end("busy");
    });
  });
  await new Promise((resolve) => node.listen(0, "127.0.0.1", resolve));
  const previous = process.env.EVM_RPC_URL;
  process.env.EVM_RPC_URL = `http://127.0.0.1:${node.address().port}`;
  t.after(async () => {
    if (previous === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = previous;
    resetChainCatalogCacheForTests();
    await new Promise((resolve) => node.close(resolve));
  });
  resetChainCatalogCacheForTests();

  await assert.rejects(evmJsonRpc("eth_blockNumber"), /rpc_http_503/); // plain-text body: status code
  assert.equal(hits, 1);
  assert.ok(rpcBackoffRemainingMs() > 0);
  assert.ok(rpcBackoffRemainingMs() <= RPC_BACKOFF_BASE_MS);

  // Backing off: neither single calls nor a whole log scan reach the node.
  await assert.rejects(evmJsonRpc("eth_blockNumber"), /rpc_backoff/);
  assert.deepEqual(await fetchLogsWindowed(contract("bondingCurve"), [BUY_TOPIC]), []);
  assert.equal(hits, 1);
});

test("a JSON-RPC error is an answer from a healthy node and does not trigger backoff", async (t) => {
  const node = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "execution reverted" } }));
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
  resetChainCatalogCacheForTests();

  await assert.rejects(evmJsonRpc("eth_call"), /execution reverted/);
  assert.equal(rpcBackoffRemainingMs(), 0);
});
