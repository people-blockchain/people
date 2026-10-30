import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { getAddress } from "viem";

import { readEvmDeployments } from "../src/lib/evm/config.ts";
import { resetChainCatalogCacheForTests } from "../src/lib/evm/chain-catalog.ts";
import { handleEvmCompatGet } from "../src/lib/evm/people-compat.ts";
import { API_REQUEST_DEADLINE_MS } from "../src/lib/evm/request-deadline.ts";
import { resetRpcBackoffForTests } from "../src/lib/evm/rpc-server.ts";
import { resetTransferIndexCacheForTests } from "../src/lib/evm/transfer-index.ts";

/**
 * A compat request must answer inside one deadline even when the node answers 503 forever
 * or never answers at all. Timers are faked: the suite does not wait out the deadline.
 * The RPC is a throwaway localhost node, never a public endpoint.
 */

const dep = readEvmDeployments();
const mapped = Object.entries(dep.assetMap ?? {}).find(([, value]) => typeof value === "string" && value.startsWith("0x"));
const ASSET_ID = mapped?.[0] ?? "token";
const OWNER = getAddress("0x00000000000000000000000000000000000000bb");

function resetCaches() {
  resetChainCatalogCacheForTests();
  resetRpcBackoffForTests();
  resetTransferIndexCacheForTests();
}

function isPartial(body) {
  return Boolean(body && typeof body === "object" && !Array.isArray(body) && body.partial === true);
}

/** Fake-clock advance. Node's mock timers expose `tick`, which does not flush the promises timers wake. */
async function advance(t, ms) {
  const step = 200;
  for (let left = ms; left > 0; left -= step) {
    t.mock.timers.tick(Math.min(step, left));
    await new Promise((resolve) => setImmediate(resolve));
  }
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve));
}

async function listen(node) {
  await new Promise((resolve) => node.listen(0, "127.0.0.1", resolve));
  const previous = process.env.EVM_RPC_URL;
  process.env.EVM_RPC_URL = `http://127.0.0.1:${node.address().port}`;
  return () => {
    if (previous === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = previous;
  };
}

async function closeNode(node) {
  node.closeAllConnections?.();
  if (node.listening) {
    await new Promise((resolve) => node.close(() => resolve(undefined)));
  }
  // Undici clears its parser timers from the socket close. On Node 22 that clearTimeout
  // must run before node:test resets mock timers; a later clear deletes the next test's
  // deadline timer by stale heap index, and the following hang-mode fetch never aborts.
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve));
}

async function withRpc(t, mode, run) {
  resetCaches();
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (mode === "hang") return;
      const raw = Buffer.concat(chunks).toString("utf8");
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        body = { id: 1 };
      }
      const fail = (id) => ({ jsonrpc: "2.0", id, error: { message: "unavailable" } });
      if (Array.isArray(body)) {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify(body.map((call) => fail(call.id))));
        return;
      }
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify(fail(body.id)));
    });
  });
  const restoreEnv = await listen(node);
  t.after(async () => {
    restoreEnv();
    resetCaches();
    await closeNode(node);
  });
  return run();
}

async function expectPartial(t, mode, path, search) {
  await withRpc(t, mode, async () => {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const started = Date.now();
    const pending = handleEvmCompatGet(path, search);
    await advance(t, API_REQUEST_DEADLINE_MS + 1_000);
    const res = await pending;
    assert.equal(res.status, 200, `${mode} ${path}`);
    assert.equal(isPartial(res.body), true, `${mode} ${path} body ${JSON.stringify(res.body)}`);
    assert.ok(Date.now() - started < API_REQUEST_DEADLINE_MS + 2_000, `${mode} ${path} ran past the deadline`);
  });
}

const cases = [
  ["/assets", new URLSearchParams()],
  [`/assets/${ASSET_ID}`, new URLSearchParams()],
  [`/address/${OWNER}`, new URLSearchParams()],
  ["/accounts", new URLSearchParams({ assetId: ASSET_ID })],
];

for (const mode of ["503", "hang"]) {
  for (const [path, search] of cases) {
    test(`${path} returns partial when RPC ${mode === "503" ? "always returns 503" : "never responds"}`, async (t) => {
      await expectPartial(t, mode, path, search);
    });
  }
}

test("a healthy RPC omits partial", async (t) => {
  resetCaches();
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const body = JSON.parse(raw);
      const one = (call) => {
        if (call.method === "eth_blockNumber") return { jsonrpc: "2.0", id: call.id, result: "0x10" };
        if (call.method === "eth_getBalance") return { jsonrpc: "2.0", id: call.id, result: "0xde0b6b3a7640000" };
        if (call.method === "eth_getTransactionCount") return { jsonrpc: "2.0", id: call.id, result: "0x1" };
        if (call.method === "eth_getLogs") return { jsonrpc: "2.0", id: call.id, result: [] };
        return { jsonrpc: "2.0", id: call.id, result: "0x" };
      };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(Array.isArray(body) ? body.map(one) : one(body)));
    });
  });
  const restoreEnv = await listen(node);
  t.after(async () => {
    restoreEnv();
    resetCaches();
    await closeNode(node);
  });
  for (const [path, search] of cases) {
    const res = await handleEvmCompatGet(path, search);
    assert.equal(res.status, 200, path);
    assert.equal(isPartial(res.body), false, `${path} ${JSON.stringify(res.body)?.slice(0, 180)}`);
  }
});
