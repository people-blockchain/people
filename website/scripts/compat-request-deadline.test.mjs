import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { encodeAbiParameters, getAddress, toFunctionSelector } from "viem";

import { readEvmDeployments } from "../src/lib/evm/config.ts";
import { resetChainCatalogCacheForTests } from "../src/lib/evm/chain-catalog.ts";
import { resetAddressBalanceCacheForTests, handleEvmCompatGet } from "../src/lib/evm/people-compat.ts";
import { API_REQUEST_DEADLINE_MS } from "../src/lib/evm/request-deadline.ts";
import { resetRpcBackoffForTests } from "../src/lib/evm/rpc-server.ts";
import { resetTokenImageCacheForTests } from "../src/lib/evm/token-uri-metadata.ts";
import { resetTokenCreationBlockCacheForTests, resetTransferIndexCacheForTests } from "../src/lib/evm/transfer-index.ts";

/**
 * A compat request must answer inside one deadline even when the node answers 503 forever
 * or never answers at all. Timers are faked: the suite does not wait out the deadline.
 */

const dep = readEvmDeployments();
const mapped = Object.entries(dep.assetMap ?? {}).find(([, value]) => typeof value === "string" && value.startsWith("0x"));
const TOKEN = getAddress(mapped?.[1] ?? "0x00000000000000000000000000000000000000aa");
const FRESH = getAddress("0x0000000000000000000000000000000000000d11");
const ASSET_ID = mapped?.[0] ?? TOKEN;
const OWNER = getAddress("0x00000000000000000000000000000000000000bb");
const META_URI = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/metadata.json";

const str = (value) => encodeAbiParameters([{ type: "string" }], [value]);
const SEL = {
  name: toFunctionSelector("name()"),
  symbol: toFunctionSelector("symbol()"),
  metadataURI: toFunctionSelector("metadataURI()"),
  decimals: toFunctionSelector("decimals()"),
  totalSupply: toFunctionSelector("totalSupply()"),
  creator: toFunctionSelector("creator()"),
};

function resetCaches() {
  resetChainCatalogCacheForTests();
  resetRpcBackoffForTests();
  resetTransferIndexCacheForTests();
  resetTokenCreationBlockCacheForTests();
  resetTokenImageCacheForTests();
  resetAddressBalanceCacheForTests();
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
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
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
  t.after(() => {
    restoreEnv();
    resetCaches();
    node.closeAllConnections?.();
    node.close();
  });
  return run();
}

async function expectPartial(t, mode, path, search) {
  await withRpc(t, mode, async () => {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const pending = handleEvmCompatGet(path, search);
    await advance(t, API_REQUEST_DEADLINE_MS + 1_000);
    const res = await pending;
    assert.equal(res.status, 200, `${mode} ${path}`);
    assert.equal(isPartial(res.body), true, `${mode} ${path} body ${JSON.stringify(res.body)}`);
    assert.ok(API_REQUEST_DEADLINE_MS <= 15_000);
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

test("a metadata.json that never responds does not hold the asset past the deadline", async (t) => {
  resetCaches();
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const one = (call) => {
        if (call.method === "eth_blockNumber") return { jsonrpc: "2.0", id: call.id, result: "0x10" };
        if (call.method === "eth_getLogs") return { jsonrpc: "2.0", id: call.id, result: [] };
        if (call.method !== "eth_call") return { jsonrpc: "2.0", id: call.id, result: "0x" };
        const data = String(call.params?.[0]?.data ?? "");
        const sel = data.slice(0, 10);
        const result = sel === SEL.name
          ? str("Deadline Token")
          : sel === SEL.symbol
            ? str("DDLN")
            : sel === SEL.metadataURI
              ? str(META_URI)
              : sel === SEL.decimals
                ? encodeAbiParameters([{ type: "uint8" }], [18])
                : sel === SEL.totalSupply
                  ? encodeAbiParameters([{ type: "uint256" }], [1n])
                  : sel === SEL.creator
                    ? encodeAbiParameters([{ type: "address" }], [OWNER])
                    : "0x";
        return { jsonrpc: "2.0", id: call.id, result };
      };
      if (Array.isArray(body)) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(body.map(one)));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(one(body)));
    });
  });
  const restoreEnv = await listen(node);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("127.0.0.1")) return originalFetch(input, init);
    return new Promise(() => {});
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreEnv();
    resetCaches();
    node.closeAllConnections?.();
    node.close();
  });
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const pending = handleEvmCompatGet(`/assets/${FRESH}`, new URLSearchParams());
  await advance(t, API_REQUEST_DEADLINE_MS + 1_000);
  const res = await pending;
  assert.equal(res.status, 200);
  assert.equal(res.body.symbol, "DDLN");
  assert.equal(res.body.imageUri, undefined);
  assert.equal(res.body.partial, true);
});
