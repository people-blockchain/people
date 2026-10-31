import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { encodeAbiParameters, getAddress, toFunctionSelector } from "viem";

import { readEvmDeployments } from "../src/lib/evm/config.ts";
import {
  catalogListIsPartial,
  discoverTokensOnChain,
  logStartBlock,
  peekCachedCatalogTokens,
  resetChainCatalogCacheForTests,
} from "../src/lib/evm/chain-catalog.ts";
import { handleEvmCompatGet } from "../src/lib/evm/people-compat.ts";
import { resetRpcBackoffForTests } from "../src/lib/evm/rpc-server.ts";
import {
  FALLBACK_TOKEN_SYMBOL,
  TOKEN_IMAGE_CACHE_MAX,
  TokenReadError,
  readTokenOnchain,
  resetTokenImageCacheForTests,
  resolveTokenImageUri,
  tokenImageCacheSizeForTests,
} from "../src/lib/evm/token-onchain.ts";
import { ipfsGatewayUrlForUri } from "../src/lib/ipfs.ts";
import { settleTokenImageReadsForTests } from "../src/lib/evm/token-uri-metadata.ts";

/**
 * GET /api/evm/compat/assets/<factory token>: symbol/name/creator come from the token contract and
 * the image from the pinned metadata JSON, never from an address-derived fallback; a node failure
 * is an error (uncached by the route), not fabricated data. The RPC is a throwaway localhost node
 * and the IPFS gateway is a stubbed `fetch`.
 */

const TOKEN = "0x00000000000000000000000000000000000c0ffe";
const CREATOR = getAddress("0x00000000000000000000000000000000000000c1");
const META_CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
const LOGO_CID = "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o";
const META_URI = `ipfs://${META_CID}/metadata.json`;
const LOGO_URI = `ipfs://${LOGO_CID}/logo.png`;
const TOKEN_CREATED_TOPIC = "0x10911c4cd4fbfa42352cbeb31e021abbab48257dff3d94957b57da33a205d724";
// One log window above the token factory's start block keeps the catalog scan to a single request.
const HEAD = logStartBlock(readEvmDeployments().contracts.tokenFactory) + 100;
const TRUE_WORD = `0x${"0".repeat(63)}1`;

const selector = (sig) => toFunctionSelector(sig);
const SEL = {
  isPeopleToken: selector("isPeopleToken(address)"),
  name: selector("name()"),
  symbol: selector("symbol()"),
  creator: selector("creator()"),
  metadataURI: selector("metadataURI()"),
  decimals: selector("decimals()"),
  totalSupply: selector("totalSupply()"),
};

const str = (value) => encodeAbiParameters([{ type: "string" }], [value]);

/** ABI-encoded answers for a factory token; `over` replaces entries (a function result is passed through). */
function tokenAnswers(over = {}) {
  return {
    [SEL.name]: str("People Coin"),
    [SEL.symbol]: str("PCOIN"),
    [SEL.creator]: encodeAbiParameters([{ type: "address" }], [CREATOR]),
    [SEL.metadataURI]: str(META_URI),
    [SEL.decimals]: encodeAbiParameters([{ type: "uint8" }], [6]),
    [SEL.totalSupply]: encodeAbiParameters([{ type: "uint256" }], [5_000_000n]),
    ...over,
  };
}

/**
 * `{ error: msg }` -> JSON-RPC error member (revert); `{ http: n }` -> HTTP failure; a function
 * answer is called per request. Also answers eth_blockNumber and the factory's TokenCreated logs.
 */
async function startNode(t, answers, { logs = false } = {}) {
  const calls = [];
  const answer = (body) => {
    calls.push({ method: body.method, params: body.params ?? [] });
    if (body.method === "eth_blockNumber") return `0x${HEAD.toString(16)}`;
    if (body.method === "eth_getLogs") {
      const filter = body.params[0] ?? {};
      // The catalog ORs both TokenCreated signatures into one topic position.
      const topic0 = filter.topics?.[0];
      const created =
        topic0 === TOKEN_CREATED_TOPIC || (Array.isArray(topic0) && topic0.includes(TOKEN_CREATED_TOPIC));
      return logs && created
        ? [{ address: filter.address, topics: [TOKEN_CREATED_TOPIC, `0x${TOKEN.slice(2).padStart(64, "0")}`], data: "0x" }]
        : [];
    }
    if (body.method !== "eth_call") return "0x";
    const data = String(body.params[0].data);
    const sel = data.slice(0, 10);
    if (sel === SEL.isPeopleToken) return `0x${data.slice(-40)}` === TOKEN ? TRUE_WORD : `0x${"0".repeat(64)}`;
    const value = answers[sel];
    if (value === undefined) return "0x";
    return typeof value === "function" ? value() : value;
  };
  const reply = (body) => {
    const result = answer(body);
    if (result && typeof result === "object" && "error" in result) {
      return { status: 200, json: { jsonrpc: "2.0", id: body.id, error: { code: 3, message: result.error } } };
    }
    if (result && typeof result === "object" && "http" in result) {
      return { status: result.http, json: { error: { message: "unavailable" } } };
    }
    return { status: 200, json: { jsonrpc: "2.0", id: body.id, result } };
  };
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (Array.isArray(body)) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(body.map((call) => reply(call).json)));
        return;
      }
      const { status, json } = reply(body);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise((resolve) => node.listen(0, "127.0.0.1", resolve));
  const previous = process.env.EVM_RPC_URL;
  process.env.EVM_RPC_URL = `http://127.0.0.1:${node.address().port}`;
  resetChainCatalogCacheForTests();
  resetRpcBackoffForTests();
  resetTokenImageCacheForTests();
  t.after(async () => {
    if (previous === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = previous;
    resetChainCatalogCacheForTests();
    await new Promise((resolve) => node.close(resolve));
  });
  return calls;
}

/** Stubs gateway fetches: `docs[url]` is JSON, a number is an HTTP status; others pass through. */
function stubGateway(t, docs) {
  const real = globalThis.fetch;
  const gatewayCalls = [];
  const gateway = new URL(ipfsGatewayUrlForUri(`ipfs://${META_CID}`)).origin;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(gateway)) return real(input, init);
    gatewayCalls.push(url);
    const doc = docs[url];
    if (typeof doc === "number") return new Response("nope", { status: doc });
    if (doc === undefined) return new Response("missing", { status: 404 });
    return new Response(JSON.stringify(doc), { status: 200, headers: { "content-type": "application/json" } });
  };
  t.after(() => {
    globalThis.fetch = real;
  });
  return gatewayCalls;
}

const metaUrl = (cid = META_CID) => ipfsGatewayUrlForUri(`ipfs://${cid}/metadata.json`);

test("a factory token reports its own symbol/name/creator and the metadata URL without a gateway read", async (t) => {
  await startNode(t, tokenAnswers());
  const gatewayCalls = stubGateway(t, { [metaUrl()]: { name: "People Coin", symbol: "PCOIN", image: LOGO_URI } });
  const res = await handleEvmCompatGet(`/assets/${TOKEN}`, new URLSearchParams());
  assert.equal(res.status, 200);
  assert.equal(res.body.symbol, "PCOIN");
  assert.notEqual(res.body.symbol, TOKEN.slice(0, 6).toUpperCase());
  assert.equal(res.body.name, "People Coin");
  assert.equal(res.body.creator, CREATOR);
  assert.equal(res.body.decimals, 6);
  assert.equal(res.body.totalSupply, 5);
  assert.equal(res.body.tokenAddress.toLowerCase(), TOKEN);
  assert.equal(res.body.partial, undefined);
  assert.match(String(res.body.imageUri), /metadata\.json/);
  await settleTokenImageReadsForTests();
  const again = await handleEvmCompatGet(`/assets/${TOKEN}`, new URLSearchParams());
  assert.match(String(again.body.imageUri), /metadata\.json/);
  assert.equal(again.body.partial, undefined);
  assert.deepEqual(gatewayCalls, []);
});

test("a metadata document URL is returned without opening the gateway", async (t) => {
  await startNode(t, tokenAnswers());
  const gatewayCalls = stubGateway(t, { [metaUrl()]: { name: "People Coin", symbol: "PCOIN" } });
  const res = await handleEvmCompatGet(`/assets/${TOKEN}`, new URLSearchParams());
  assert.equal(res.status, 200);
  assert.equal(res.body.partial, undefined);
  assert.match(String(res.body.imageUri), /metadata\.json/);
  assert.equal(res.body.symbol, "PCOIN");
  await settleTokenImageReadsForTests();
  const again = await handleEvmCompatGet(`/assets/${TOKEN}`, new URLSearchParams());
  assert.match(String(again.body.imageUri), /metadata\.json/);
  assert.deepEqual(gatewayCalls, []);
});

test("an unreachable gateway is never called for the asset URL", async (t) => {
  await startNode(t, tokenAnswers());
  const gatewayCalls = stubGateway(t, { [metaUrl()]: 503 });
  const res = await handleEvmCompatGet(`/assets/${TOKEN}`, new URLSearchParams());
  assert.equal(res.status, 200);
  assert.equal(res.body.partial, undefined);
  assert.match(String(res.body.imageUri), /metadata\.json/);
  assert.equal(res.body.symbol, "PCOIN");
  await settleTokenImageReadsForTests();
  const again = await handleEvmCompatGet(`/assets/${TOKEN}`, new URLSearchParams());
  assert.match(String(again.body.imageUri), /metadata\.json/);
  assert.equal(again.body.partial, undefined);
  assert.deepEqual(gatewayCalls, []);
});

test("a legacy ipfs://people metadataURI has no image and triggers no fetch", async (t) => {
  await startNode(t, tokenAnswers({ [SEL.metadataURI]: str("ipfs://people/legacy") }));
  const gatewayCalls = stubGateway(t, {});
  const res = await handleEvmCompatGet(`/assets/${TOKEN}`, new URLSearchParams());
  assert.equal(res.status, 200);
  assert.equal(res.body.imageUri, undefined);
  assert.deepEqual(gatewayCalls, []);
});

test("a direct image metadataURI is used as is without a fetch", async (t) => {
  await startNode(t, tokenAnswers({ [SEL.metadataURI]: str(LOGO_URI) }));
  const gatewayCalls = stubGateway(t, {});
  const res = await handleEvmCompatGet(`/assets/${TOKEN}`, new URLSearchParams());
  assert.equal(res.body.imageUri, ipfsGatewayUrlForUri(LOGO_URI));
  assert.match(res.body.imageUri, /\/logo\.png$/);
  assert.deepEqual(gatewayCalls, []);
});

test("a node failure while reading the token is partial, with no fabricated row", async (t) => {
  await startNode(t, {
    [SEL.name]: { http: 503 },
    [SEL.symbol]: { http: 503 },
    [SEL.creator]: { http: 503 },
    [SEL.metadataURI]: { http: 503 },
    [SEL.decimals]: { http: 503 },
    [SEL.totalSupply]: { http: 503 },
  });
  stubGateway(t, {});
  const res = await handleEvmCompatGet(`/assets/${TOKEN}`, new URLSearchParams());
  assert.equal(res.status, 200);
  assert.equal(res.body.partial, true);
  assert.equal(res.body.symbol, undefined);
  assert.equal(res.body.name, undefined);
});

test("an RPC backoff (node already failing) is a read error, not an address-derived symbol", async (t) => {
  await startNode(t, tokenAnswers());
  stubGateway(t, {});
  // First request succeeds in resolving the token, then every call fails fast with a backoff.
  const failing = process.env.EVM_RPC_URL;
  process.env.EVM_RPC_URL = "http://127.0.0.1:1";
  t.after(() => {
    process.env.EVM_RPC_URL = failing;
  });
  const first = await handleEvmCompatGet(`/assets/${TOKEN}`, new URLSearchParams());
  assert.equal(first.status, 200);
  assert.equal(first.body.partial, true);
  assert.equal(first.body.symbol, undefined);
  // Same again: now through the backoff path.
  const second = await handleEvmCompatGet(`/assets/${TOKEN}`, new URLSearchParams());
  assert.equal(second.status, 200);
  assert.equal(second.body.partial, true);
  assert.equal(second.body.symbol, undefined);
});

test("a token without symbol()/creator() gets TKN and no creator, never the deployer", async (t) => {
  await startNode(t, tokenAnswers({
    [SEL.symbol]: { error: "execution reverted" },
    [SEL.creator]: { error: "execution reverted" },
  }));
  stubGateway(t, {});
  const res = await handleEvmCompatGet(`/assets/${TOKEN}`, new URLSearchParams());
  assert.equal(res.status, 200);
  assert.equal(res.body.symbol, FALLBACK_TOKEN_SYMBOL);
  assert.equal(res.body.creator, undefined);
});

test("a catalog row keeps the metadata document URL and does not fetch the gateway", async (t) => {
  await startNode(t, tokenAnswers(), { logs: true });
  const gatewayCalls = stubGateway(t, { [metaUrl()]: { name: "People Coin", symbol: "PCOIN", image: LOGO_URI } });
  const rows = await discoverTokensOnChain();
  const row = rows.find((r) => r.tokenAddress?.toLowerCase() === TOKEN);
  assert.ok(row, "factory token is in the catalog");
  assert.equal(catalogListIsPartial(rows), false);
  assert.equal(row.symbol, "PCOIN");
  assert.match(String(row.imageUri), /metadata\.json/);
  await settleTokenImageReadsForTests();
  const cached = peekCachedCatalogTokens().find((r) => r.tokenAddress?.toLowerCase() === TOKEN);
  assert.match(String(cached?.imageUri), /metadata\.json/);
  assert.deepEqual(gatewayCalls, []);
});

test("single-asset route: a catalog hit is enriched with the JSON image and the real creator", async (t) => {
  // Cold reads use the token contract directly. A cached row whose creator is only the deployer
  // is completed by that same live read, without a getLogs scan.
  await startNode(
    t,
    tokenAnswers({
      [SEL.creator]: encodeAbiParameters([{ type: "address" }], [CREATOR]),
    }),
    { logs: true },
  );
  const gatewayCalls = stubGateway(t, { [metaUrl()]: { image: LOGO_URI } });
  const res = await handleEvmCompatGet(`/assets/${TOKEN}`, new URLSearchParams());
  assert.equal(res.status, 200);
  assert.equal(res.body.symbol, "PCOIN");
  assert.equal(res.body.partial, undefined);
  assert.match(String(res.body.imageUri), /metadata\.json/);
  assert.equal(res.body.creator, CREATOR);
  await settleTokenImageReadsForTests();
  const again = await handleEvmCompatGet(`/assets/${TOKEN}`, new URLSearchParams());
  assert.match(String(again.body.imageUri), /metadata\.json/);
  assert.equal(again.body.creator, CREATOR);
  assert.deepEqual(gatewayCalls, []);
});

test("a slow metadata gateway neither marks the asset list partial nor holds it", async (t) => {
  await startNode(t, tokenAnswers(), { logs: true });
  const real = globalThis.fetch;
  const gateway = new URL(metaUrl()).origin;
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(gateway)) return new Promise(() => {});
    return real(input, init);
  };
  t.after(() => {
    globalThis.fetch = real;
  });
  const started = Date.now();
  const res = await handleEvmCompatGet("/assets", new URLSearchParams());
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 8_000, `asset list took ${elapsed} ms behind a hanging gateway`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body), "a slow logo wrapped the list as partial");
  const row = res.body.find((asset) => String(asset.tokenAddress).toLowerCase() === TOKEN);
  assert.ok(row, "factory token missing from the list");
  assert.match(String(row.imageUri), /metadata\.json/);
});

test("a fast node returns the full asset list well under the request deadline", async (t) => {
  const calls = await startNode(t, tokenAnswers(), { logs: true });
  const gatewayCalls = stubGateway(t, { [metaUrl()]: { name: "People Coin", symbol: "PCOIN", image: LOGO_URI } });
  const started = Date.now();
  const res = await handleEvmCompatGet("/assets", new URLSearchParams());
  const elapsed = Date.now() - started;
  const callsAtReturn = calls.length;
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(elapsed < 8_000, `asset list took ${elapsed} ms`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length > 1, "the list was not the full catalog");
  assert.ok(res.body.some((asset) => String(asset.tokenAddress).toLowerCase() === TOKEN));
  assert.equal(res.body.partial, undefined);
  assert.equal(calls.length, callsAtReturn, "RPC continued after the asset list returned");
  assert.deepEqual(gatewayCalls, []);
});

test("assets list: one failing token read skips the row instead of failing the list", async (t) => {
  await startNode(t, { [SEL.name]: { http: 503 }, [SEL.symbol]: { http: 503 } });
  const res = await handleEvmCompatGet("/assets", new URLSearchParams());
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

// token-onchain.ts with an injected `call`

const ADDR = "0x00000000000000000000000000000000000c0ffe";

function injected(answers) {
  const seen = [];
  const call = async (to, data) => {
    seen.push({ to, sel: data.slice(0, 10) });
    const value = answers[data.slice(0, 10)];
    if (value instanceof Error) throw value;
    return value ?? null;
  };
  return { call, seen };
}

test("readTokenOnchain decodes every getter", async () => {
  const { call, seen } = injected(tokenAnswers());
  const out = await readTokenOnchain(call, ADDR);
  assert.deepEqual(out, {
    name: "People Coin",
    symbol: "PCOIN",
    creator: CREATOR,
    metadataUri: META_URI,
    decimals: 6,
    totalSupply: 5_000_000n,
  });
  assert.equal(seen.length, 6);
  assert.ok(seen.every((c) => c.to === ADDR));
});

test("readTokenOnchain leaves reverted/empty getters undefined", async () => {
  const { call } = injected({ [SEL.name]: str("Only Name"), [SEL.symbol]: "0x" });
  assert.deepEqual(await readTokenOnchain(call, ADDR), { name: "Only Name" });
});

test("readTokenOnchain decodes a bytes32 symbol and ignores garbage", async () => {
  const bytes32 = `0x${Buffer.from("MKR").toString("hex").padEnd(64, "0")}`;
  const { call } = injected({ [SEL.symbol]: bytes32, [SEL.name]: "0x1234", [SEL.creator]: "0xdead" });
  assert.deepEqual(await readTokenOnchain(call, ADDR), { symbol: "MKR" });
});

test("readTokenOnchain turns a transport failure into TokenReadError", async () => {
  const { call } = injected({ ...tokenAnswers(), [SEL.symbol]: new Error("rpc_backoff") });
  await assert.rejects(readTokenOnchain(call, ADDR), (error) => {
    assert.ok(error instanceof TokenReadError);
    assert.equal(error.cause.message, "rpc_backoff");
    return true;
  });
});

test("resolveTokenImageUri takes the JSON image, caches it, and caches failures", async () => {
  resetTokenImageCacheForTests();
  let fetches = 0;
  const fetchJson = async () => {
    fetches += 1;
    return { image: LOGO_URI };
  };
  assert.equal(await resolveTokenImageUri(META_URI, fetchJson), LOGO_URI);
  assert.equal(await resolveTokenImageUri(META_URI, fetchJson), LOGO_URI);
  assert.equal(fetches, 1);

  const other = `ipfs://${LOGO_CID}/metadata.json`;
  let failures = 0;
  const failing = async () => {
    failures += 1;
    throw new Error("boom");
  };
  assert.equal(await resolveTokenImageUri(other, failing), undefined);
  assert.equal(await resolveTokenImageUri(other, failing), undefined);
  assert.equal(failures, 1);
});

test("resolveTokenImageUri filters unsafe/placeholder values without fetching", async () => {
  resetTokenImageCacheForTests();
  const fetchJson = async () => {
    throw new Error("must not fetch");
  };
  assert.equal(await resolveTokenImageUri("ipfs://people/x", fetchJson), undefined);
  assert.equal(await resolveTokenImageUri("ipfs://people", fetchJson), undefined);
  assert.equal(await resolveTokenImageUri("", fetchJson), undefined);
  assert.equal(await resolveTokenImageUri(undefined, fetchJson), undefined);
  assert.equal(await resolveTokenImageUri(LOGO_URI, fetchJson), LOGO_URI);
  assert.equal(await resolveTokenImageUri("https://cdn.example.com/a.png", fetchJson), "https://cdn.example.com/a.png");
  assert.equal(await resolveTokenImageUri("data:image/png;base64,AA", fetchJson), undefined);
  // The JSON's own image must itself be an ipfs/https URI.
  assert.equal(await resolveTokenImageUri(META_URI, async () => ({ image: "javascript:alert(1)" })), undefined);
  assert.equal(await resolveTokenImageUri(`${META_URI}?x=1`, async () => ({ image: "https://cdn.example.com/l.png" })), "https://cdn.example.com/l.png");
});

test("the token image cache is bounded", async () => {
  resetTokenImageCacheForTests();
  for (let i = 0; i < TOKEN_IMAGE_CACHE_MAX + 20; i++) {
    await resolveTokenImageUri(`https://cdn.example.com/${i}/metadata.json`, async () => ({ image: LOGO_URI }));
  }
  assert.equal(tokenImageCacheSizeForTests(), TOKEN_IMAGE_CACHE_MAX);
});
