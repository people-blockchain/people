// Owner NFT listing must answer inside a short budget. A slow eth_getLogs cannot hold the
// request open, and history is resumed from the cursor instead of a background scan.
import { createServer } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, encodeEventTopics, getAddress } from "viem";
import { readEvmDeployments } from "../src/lib/evm/config.ts";
import { fetchLogsWindowed, LOG_WINDOW_BLOCKS, logWindows, resetChainCatalogCacheForTests } from "../src/lib/evm/chain-catalog.ts";
import { NFT_MINTED_TOPIC, nftMintedEvent } from "../src/lib/evm/nft-factory.ts";
import { handleEvmCompatGet } from "../src/lib/evm/people-compat.ts";
import { resetRpcBackoffForTests } from "../src/lib/evm/rpc-server.ts";
import {
  NFT_OWNER_LIST_BUDGET_MS,
  listMintedNfts,
  recentMintScanStart,
  resetMintHistoryForTests,
  setNftHistoryPageSizeForTests,
  setNftOwnerListBudgetForTests,
} from "../src/lib/evm/nft-chain.ts";

const OWNER = "0x1003A5Ae6ccd73818fB33718e341a73BA77a80c2";
const COLLECTION = "0x8f659a462c89314faa6a4065fb3d2deb51faef62";
const TOKEN_URI = "ipfs://budget-test";

function mintLog(owner, tokenId, collection = COLLECTION) {
  const topics = encodeEventTopics({
    abi: [nftMintedEvent],
    eventName: "NftMinted",
    args: { collection: getAddress(collection), tokenId, owner: getAddress(owner) },
  });
  const data = encodeAbiParameters([{ type: "string" }], [TOKEN_URI]);
  return { address: "0x755fec41decd3147d693ee28b6442ef0dc9dd0df", topics, data };
}

function listen(handler) {
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "localhost", () => resolve(server));
  });
}

async function useNode(t, server) {
  const previous = process.env.EVM_RPC_URL;
  process.env.EVM_RPC_URL = `http://localhost:${server.address().port}`;
  resetChainCatalogCacheForTests();
  resetRpcBackoffForTests();
  resetMintHistoryForTests();
  t.after(async () => {
    setNftOwnerListBudgetForTests(null);
    setNftHistoryPageSizeForTests(null);
    resetMintHistoryForTests();
    resetChainCatalogCacheForTests();
    resetRpcBackoffForTests();
    if (previous === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = previous;
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  });
}

test("a slow log window returns inside the budget with partial and a cursor", async (t) => {
  const budgetMs = 350;
  assert.equal(NFT_OWNER_LIST_BUDGET_MS, 6_000);
  setNftOwnerListBudgetForTests(budgetMs);
  const dep = readEvmDeployments();
  const factoryStart = dep.startBlocks.nftFactory;
  const latest = factoryStart + 40 * LOG_WINDOW_BLOCKS;
  const windows = logWindows(factoryStart, latest);
  const newest = windows.at(-1);
  let logCalls = 0;
  const server = await listen((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (body.method === "eth_getLogs") {
        logCalls += 1;
        const timer = setTimeout(() => {
          if (res.writableEnded) return;
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: [] }));
        }, budgetMs + 2_000);
        req.on("close", () => clearTimeout(timer));
        return;
      }
      const result = body.method === "eth_blockNumber" ? `0x${latest.toString(16)}` : "0x";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
    });
  });
  await useNode(t, server);

  const started = Date.now();
  const page = await listMintedNfts(OWNER);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < budgetMs + 1_200, `elapsed ${elapsed}`);
  assert.equal(page.partial, true);
  assert.equal(page.next, `${newest[0]}-${newest[1]}`);
  assert.deepEqual(page.items, []);
  const callsAtReturn = logCalls;
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(logCalls, callsAtReturn);
  assert.ok(logCalls >= 1 && logCalls <= 2, `log calls ${logCalls}`);

  const viaRoute = await handleEvmCompatGet("nfts", new URLSearchParams({ owner: OWNER }));
  assert.ok(Array.isArray(viaRoute.body));
  assert.equal(viaRoute.headers?.["X-Nfts-Partial"], "1");
  assert.equal(viaRoute.headers?.["X-Nfts-Next"], `${newest[0]}-${newest[1]}`);
});

test("a mint in the newest window is on the first page", async (t) => {
  const dep = readEvmDeployments();
  const factoryStart = dep.startBlocks.nftFactory;
  const latest = factoryStart + 40 * LOG_WINDOW_BLOCKS;
  const recentFrom = recentMintScanStart(latest, factoryStart);
  const mintBlock = latest - 20;
  assert.ok(mintBlock >= recentFrom);
  const server = await listen((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      let result = "0x";
      if (body.method === "eth_blockNumber") result = `0x${latest.toString(16)}`;
      else if (body.method === "eth_getLogs") {
        const filter = body.params?.[0] ?? {};
        const from = Number.parseInt(filter.fromBlock, 16);
        const to = Number.parseInt(filter.toBlock, 16);
        result = from <= mintBlock && mintBlock <= to ? [mintLog(OWNER, 0n)] : [];
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
    });
  });
  await useNode(t, server);
  const page = await listMintedNfts(OWNER);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].onChainTokenId, "0");
  assert.equal(page.items[0].owner, getAddress(OWNER));
});

test("the cursor walks older windows until every mint is collected once", async (t) => {
  setNftHistoryPageSizeForTests(1);
  const dep = readEvmDeployments();
  const factoryStart = dep.startBlocks.nftFactory;
  const latest = factoryStart + 12 * LOG_WINDOW_BLOCKS;
  const windows = logWindows(factoryStart, latest);
  const placed = new Map([
    [windows[0][0], 1n],
    [windows[Math.floor(windows.length / 2)][0], 4n],
    [windows.at(-1)[0], 9n],
  ]);
  const server = await listen((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      let result = "0x";
      if (body.method === "eth_blockNumber") result = `0x${latest.toString(16)}`;
      else if (body.method === "eth_getLogs") {
        const from = Number.parseInt(body.params?.[0]?.fromBlock ?? "0x0", 16);
        const tokenId = placed.get(from);
        result = tokenId === undefined ? [] : [mintLog(OWNER, tokenId)];
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
    });
  });
  await useNode(t, server);

  const seen = new Set();
  let cursor;
  let pages = 0;
  for (;;) {
    const page = await listMintedNfts(OWNER, { cursor });
    for (const row of page.items) {
      assert.equal(seen.has(row.nftId), false, row.nftId);
      seen.add(row.onChainTokenId);
    }
    pages += 1;
    if (!page.partial) {
      assert.equal(page.next, undefined);
      break;
    }
    assert.equal(typeof page.next, "string");
    assert.notEqual(page.next, cursor);
    cursor = page.next;
    assert.ok(pages < 40);
  }
  assert.deepEqual([...seen].sort(), ["1", "4", "9"]);
  assert.ok(pages > 1);
});

test("a fresh mint window is not queued behind a saturated history scan", async (t) => {
  const dep = readEvmDeployments();
  const factory = dep.contracts.nftFactory;
  const factoryStart = dep.startBlocks.nftFactory;
  const latest = factoryStart + 2 * LOG_WINDOW_BLOCKS;
  let logCalls = 0;
  let releaseHistory = () => {};
  const historyGate = new Promise((resolve) => {
    releaseHistory = resolve;
  });
  let held = 0;
  const server = await listen((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const reply = (result) => {
        if (res.writableEnded) return;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
      };
      if (body.method !== "eth_getLogs") {
        reply(body.method === "eth_blockNumber" ? `0x${latest.toString(16)}` : "0x");
        return;
      }
      logCalls += 1;
      if (held < 2) {
        held += 1;
        historyGate.then(() => reply([]));
        return;
      }
      reply([]);
    });
  });
  await useNode(t, server);
  t.after(() => releaseHistory());

  const history = Promise.all([
    fetchLogsWindowed(factory, [NFT_MINTED_TOPIC]),
    fetchLogsWindowed(factory, ["0x" + "ab".repeat(32)]),
  ]);
  const opened = Date.now();
  while (logCalls < 2 && Date.now() - opened < 2_000) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(logCalls, 2);
  const pagePromise = listMintedNfts(OWNER);
  const fresh = Date.now();
  while (logCalls < 3 && Date.now() - fresh < 1_500) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(logCalls >= 3, `fresh window stayed queued (${logCalls} log calls)`);
  releaseHistory();
  await history;
  await pagePromise;
});
