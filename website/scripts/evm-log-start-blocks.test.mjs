import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { encodeAbiParameters, encodeEventTopics } from "viem";

import { readEvmDeployments } from "../src/lib/evm/config.ts";
import {
  fetchLogsWindowed,
  logStartBlock,
  logWindows,
  resetChainCatalogCacheForTests,
} from "../src/lib/evm/chain-catalog.ts";
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

/** A live-ish tip: the chain re-deployed its factories around block 76. */
const LATEST = 230_000;
const TRADE_BLOCK = 229_000;
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
  assert.equal(logStartBlock(contract("tokenFactory")), 76);
  assert.equal(logStartBlock(contract("bondingCurve")), 73);
  assert.equal(logStartBlock(contract("ammFactory")), 58);
  assert.equal(logStartBlock(contract("wppl")), 57);
  assert.equal(logStartBlock(contract("router")), 59);
});

test("logStartBlock matches contract addresses case-insensitively", () => {
  assert.equal(logStartBlock(contract("tokenFactory").toUpperCase()), 76);
  assert.equal(logStartBlock(`0x${contract("bondingCurve").slice(2).toLowerCase()}`), 73);
});

test("logStartBlock falls back to the deployment block for contracts with no start entry", () => {
  // `registry` is in the deployment JSON but has no `startBlocks` entry.
  assert.equal(logStartBlock(contract("registry")), dep.deployBlock);
});

test("logStartBlock scans AMM pairs from the factory's start block, since the factory deployed them", () => {
  assert.equal(logStartBlock(PAIR_ADDRESS), 58);
});

test("logWindows collapses a scan to a handful of windows when a contract's start block is far into the range", () => {
  // Representative of a contract deployed long after genesis (the shape the old, mismatched
  // tokenFactory/bondingCurve startBlocks used to have before S2-04) — not tied to the current
  // deployment JSON, which now points at near-genesis contracts.
  const farStart = 220_459;
  const fromStart = logWindows(farStart, LATEST);
  const fromDeploy = logWindows(dep.deployBlock ?? 1, LATEST);
  assert.ok(fromStart.length < fromDeploy.length / 10);
  assert.equal(fromStart[0][0], farStart);
  assert.equal(fromStart.at(-1)[1], LATEST);
});

test("fetchLogsWindowed starts the bonding-curve scan at its own deploy block, not block 56", async (t) => {
  const node = await startRpcNode(t, emptyNode);
  resetChainCatalogCacheForTests();

  await fetchLogsWindowed(contract("bondingCurve"), [BUY_TOPIC]);
  const filters = logFilters(node.calls);
  assert.ok(filters.length > 0);
  assert.equal(filters[0].fromBlock, hex(73));
  for (const filter of filters) assert.ok(fromBlockOf(filter) >= 73);
});

test("fetchLogsWindowed starts an AMM pair scan at the factory's start block", async (t) => {
  const node = await startRpcNode(t, emptyNode);
  resetChainCatalogCacheForTests();

  await fetchLogsWindowed(PAIR_ADDRESS, [BUY_TOPIC]);
  const filters = logFilters(node.calls);
  assert.ok(filters.length > 0);
  assert.equal(filters[0].fromBlock, hex(58));
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
    assert.ok(fromBlockOf(filter) >= 73);
  }
  // The whole point of the fix: the earliest window is the curve's own deploy block (73),
  // not the chain's deploy block of 56.
  assert.equal(Math.min(...filters.map(fromBlockOf)), 73);
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
