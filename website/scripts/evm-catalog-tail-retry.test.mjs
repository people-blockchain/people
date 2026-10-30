import { test, after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createServer } from "node:http";
import { encodeAbiParameters } from "viem";

register("./fixtures/evm-catalog-fault-loader.mjs", import.meta.url);

const { getDbReady } = await import("./fixtures/evm-log-scan-pglite-db.mjs");
const { evmLogScanCursors } = await import("../src/db/schema.ts");
const {
  TOKEN_CREATED_LEFTOVER_TOPIC,
  discoverTokensOnChain,
  discoverTokensOnChainUncached,
  logWindows,
  resetChainCatalogCacheForTests,
  tokenFactoryScans,
} = await import("../src/lib/evm/chain-catalog.ts");
const { evmJsonRpc, resetRpcBackoffForTests, rpcBackoffRemainingMs } = await import("../src/lib/evm/rpc-server.ts");
const { readEvmDeployments } = await import("../src/lib/evm/config.ts");
const { handleEvmCompatGet } = await import("../src/lib/evm/people-compat.ts");

const db = await getDbReady();
const dep = readEvmDeployments();
const FACTORY = dep.contracts.tokenFactory;
const FACTORY_START = dep.startBlocks.tokenFactory;
const TOKEN = `0x${"a1".repeat(20)}`;
const CREATOR = `0x${"b2".repeat(20)}`;
/**
 * First pass of a current-factory tail window: one try plus the three backoff sleeps
 * [500, 1500, 4000]. The next attempt is the post-history retry.
 */
const TAIL_ATTEMPTS_BEFORE_END_RETRY = 4;
const hex = (value) => `0x${value.toString(16)}`;
const fromBlockOf = (filter) => Number.parseInt(filter.fromBlock, 16);
const tokenTopic = (token) => `0x${token.slice(2).toLowerCase().padStart(64, "0")}`;

const SEL_NAME = "0x06fdde03";
const SEL_SYMBOL = "0x95d89b41";
const SEL_DECIMALS = "0x313ce567";
const SEL_TOTAL_SUPPLY = "0x18160ddd";
const SEL_CREATOR = "0x02d05d3f";
const SEL_METADATA_URI = "0x03ee438c";
const str = (value) => encodeAbiParameters([{ type: "string" }], [value]);
const word = (value) => encodeAbiParameters([{ type: "uint256" }], [BigInt(value)]);

function tokenMetadata(data) {
  if (data === SEL_NAME) return str("Tail Token");
  if (data === SEL_SYMBOL) return str("TAIL");
  if (data === SEL_DECIMALS) return encodeAbiParameters([{ type: "uint8" }], [18]);
  if (data === SEL_TOTAL_SUPPLY) return word(1_000_000n * 10n ** 18n);
  if (data === SEL_CREATOR) return encodeAbiParameters([{ type: "address" }], [CREATOR]);
  if (data === SEL_METADATA_URI) return str("");
  return "0x";
}

after(() => {
  resetChainCatalogCacheForTests();
});

/**
 * Local JSON-RPC node. `answer` returns a hex/array result, or `{ http }` to fail that call.
 * Batch requests stay HTTP 200 so one bad slot does not hide the others; a lone `{ http }`
 * becomes the HTTP status of the whole response.
 */
async function startRpcNode(t, answer) {
  const calls = [];
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const replyOne = async (call) => {
        calls.push({ method: call.method, params: call.params ?? [] });
        const result = await answer(call);
        if (result && typeof result === "object" && !Array.isArray(result) && "http" in result) {
          return { http: result.http, payload: { jsonrpc: "2.0", id: call.id, error: { message: "unavailable" } } };
        }
        return { http: 200, payload: { jsonrpc: "2.0", id: call.id, result: result ?? null } };
      };
      if (Array.isArray(body)) {
        const answered = await Promise.all(body.map((call) => replyOne(call)));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(answered.map((entry) => entry.payload)));
        return;
      }
      const answered = await replyOne(body);
      const status = answered.http;
      res.writeHead(status, { "content-type": status === 200 ? "application/json" : "text/plain" });
      res.end(status === 200 ? JSON.stringify(answered.payload) : "unavailable");
    });
  });
  await new Promise((resolve) => node.listen(0, "127.0.0.1", resolve));
  const previous = process.env.EVM_RPC_URL;
  process.env.EVM_RPC_URL = `http://127.0.0.1:${node.address().port}`;
  t.after(async () => {
    if (previous === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = previous;
    resetRpcBackoffForTests();
    resetChainCatalogCacheForTests();
    await new Promise((resolve) => node.close(resolve));
  });
  return { calls };
}

const hasToken = (tokens, address = TOKEN) =>
  tokens.some((token) => token.tokenAddress.toLowerCase() === address.toLowerCase());

test("a token created after the previous scan appears on the next refresh", async (t) => {
  await db.delete(evmLogScanCursors);
  // Two full windows plus a short tail, so the first scan has history to persist.
  let tip = FACTORY_START + 27_000 - 1;
  let tokenBlock = null;
  await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(tip);
    if (call.method === "eth_call") return tokenMetadata(call.params?.[0]?.data);
    if (call.method !== "eth_getLogs") return [];
    const filter = call.params[0];
    if (!tokenBlock || filter.address?.toLowerCase() !== FACTORY.toLowerCase()) return [];
    const from = fromBlockOf(filter);
    const to = Number.parseInt(filter.toBlock, 16);
    if (tokenBlock < from || tokenBlock > to) return [];
    return [
      {
        address: FACTORY,
        topics: [TOKEN_CREATED_LEFTOVER_TOPIC, tokenTopic(TOKEN)],
        data: "0x",
        blockNumber: hex(tokenBlock),
      },
    ];
  });
  resetChainCatalogCacheForTests();

  const first = await discoverTokensOnChain();
  assert.ok(!hasToken(first), "token was visible before it was created");

  const previousWindows = logWindows(FACTORY_START, tip);
  tokenBlock = previousWindows.at(-1)[1] + 1;
  tip = tokenBlock;
  const newest = logWindows(FACTORY_START, tip).at(-1);
  assert.ok(tokenBlock >= newest[0] && tokenBlock <= newest[1], "fixture log is not in the newest window");
  assert.ok(tokenBlock > previousWindows.at(-1)[1], "fixture log was already inside the previous tip");

  const second = await discoverTokensOnChain();
  assert.ok(hasToken(second), "token created in the newest window is missing from the refresh");
});

test("a newest tail window that fails its first attempts is still listed by the end of the scan", async (t) => {
  await db.delete(evmLogScanCursors);
  const tip = FACTORY_START + 20_000;
  const windows = logWindows(FACTORY_START, tip);
  const newest = windows.at(-1);
  const historyFroms = new Set(windows.slice(0, -2).map(([from]) => from));
  const superseded = new Set(
    tokenFactoryScans()
      .filter((scan) => scan.address.toLowerCase() !== FACTORY.toLowerCase())
      .map((scan) => scan.address.toLowerCase()),
  );
  let newestAttempts = 0;
  let failuresBeforeHistory = 0;
  let sawHistory = false;
  let successAfterHistory = false;
  t.mock.method(console, "warn", () => {});
  const node = await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(tip);
    if (call.method === "eth_call") return tokenMetadata(call.params?.[0]?.data);
    if (call.method !== "eth_getLogs") return [];
    const filter = call.params[0];
    const address = String(filter.address ?? "").toLowerCase();
    const from = fromBlockOf(filter);
    if (address === FACTORY.toLowerCase() && historyFroms.has(from)) sawHistory = true;
    if (address !== FACTORY.toLowerCase() || from !== newest[0]) return [];
    newestAttempts += 1;
    if (newestAttempts <= TAIL_ATTEMPTS_BEFORE_END_RETRY) {
      if (!sawHistory) failuresBeforeHistory += 1;
      return { http: 503 };
    }
    if (sawHistory) successAfterHistory = true;
    return [
      {
        address: FACTORY,
        topics: [TOKEN_CREATED_LEFTOVER_TOPIC, tokenTopic(TOKEN)],
        data: "0x",
        blockNumber: hex(newest[1]),
      },
    ];
  });
  resetChainCatalogCacheForTests();

  const result = await discoverTokensOnChainUncached();
  assert.ok(hasToken(result.tokens), "token from the retried newest window is missing");
  assert.equal(failuresBeforeHistory, TAIL_ATTEMPTS_BEFORE_END_RETRY, "tail gave up before the full backoff");
  assert.equal(successAfterHistory, true, "newest window was not retried after history");

  const logs = node.calls.filter((call) => call.method === "eth_getLogs");
  const firstCurrent = logs.findIndex((call) => String(call.params[0]?.address ?? "").toLowerCase() === FACTORY.toLowerCase());
  const firstSuperseded = logs.findIndex((call) => superseded.has(String(call.params[0]?.address ?? "").toLowerCase()));
  assert.ok(firstCurrent >= 0, "current factory was never scanned");
  assert.ok(firstSuperseded < 0 || firstCurrent < firstSuperseded, "superseded tails started during the current tail");
});

test("a single asset read survives an armed backoff and a first 503", async (t) => {
  const tokenAttempts = new Map();
  let backoffArmedAtTokenRead = false;
  t.mock.method(console, "warn", () => {});
  await startRpcNode(t, (call) => {
    if (call.method === "eth_chainId" || call.method === "eth_blockNumber") return { http: 503 };
    if (call.method !== "eth_call") return { http: 503 };
    const to = String(call.params?.[0]?.to ?? "").toLowerCase();
    if (to !== TOKEN) return { http: 503 };
    const sel = String(call.params[0].data ?? "").slice(0, 10);
    const attempt = (tokenAttempts.get(sel) ?? 0) + 1;
    tokenAttempts.set(sel, attempt);
    if (attempt === 1) backoffArmedAtTokenRead = rpcBackoffRemainingMs() > 0;
    if (attempt <= 2) return { http: 503 };
    return tokenMetadata(sel);
  });
  // Drop the snapshot left by the catalog tests so this request takes the live single-token read.
  await db.delete(evmLogScanCursors);
  resetChainCatalogCacheForTests();
  resetRpcBackoffForTests();

  await assert.rejects(evmJsonRpc("eth_chainId"));
  assert.ok(rpcBackoffRemainingMs() > 0, "backoff was not armed");

  const res = await handleEvmCompatGet(`/assets/${TOKEN}`, new URLSearchParams());
  assert.equal(res.status, 200);
  assert.equal(res.body.symbol, "TAIL");
  assert.equal(res.body.name, "Tail Token");
  assert.equal(String(res.body.tokenAddress).toLowerCase(), TOKEN);
  assert.equal(backoffArmedAtTokenRead, true, "single-token read waited out the catalog backoff");
  assert.ok((tokenAttempts.get(SEL_SYMBOL) ?? 0) >= 3, "transient 503 was not retried");
});
