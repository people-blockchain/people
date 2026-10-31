import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { readEvmDeployments } from "../src/lib/evm/config.ts";
import {
  catalogListIsPartial,
  discoverTokensOnChain,
  resetChainCatalogCacheForTests,
  seedTokenCatalogCacheForTests,
  setTokenCatalogSoftDeadlineForTests,
  TOKEN_CREATED_TOPIC,
} from "../src/lib/evm/chain-catalog.ts";

const dep = readEvmDeployments();
const FACTORY = dep.contracts.tokenFactory;
const FACTORY_START = dep.startBlocks.tokenFactory;
const NEW_TOKEN = "0x" + "64".repeat(20);
const OLD_TOKEN = "0x" + "32".repeat(20);
const hex = (value) => `0x${value.toString(16)}`;
const word = (value) => BigInt(value).toString(16).padStart(64, "0");
const encodeString = (value) => {
  const data = Buffer.from(value, "utf8").toString("hex");
  return `0x${word(32)}${word(value.length)}${data.padEnd(Math.ceil(data.length / 64) * 64, "0")}`;
};
const SEL = {
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  supply: "0x18160ddd",
  creator: "0x02d05d3f",
  metadataURI: "0x03ee438c",
};

function tokenLog(token, block) {
  return {
    address: FACTORY,
    topics: [TOKEN_CREATED_TOPIC, `0x${token.slice(2).toLowerCase().padStart(64, "0")}`],
    data: "0x",
    blockNumber: hex(block),
  };
}

function metadata(call) {
  const data = call.params?.[0]?.data;
  if (data === SEL.name) return encodeString("Fresh Tail");
  if (data === SEL.symbol) return encodeString("TAIL");
  if (data === SEL.decimals) return `0x${word(18)}`;
  if (data === SEL.supply) return `0x${word(1_000_000n)}`;
  if (data === SEL.creator) return `0x${(dep.deployer ?? OLD_TOKEN).slice(2).toLowerCase().padStart(64, "0")}`;
  if (data === SEL.metadataURI) return encodeString("");
  return "0x";
}

async function startRpc(t, answer) {
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const one = async (call) => ({ jsonrpc: "2.0", id: call.id, result: (await answer(call)) ?? null });
      const payload = Array.isArray(body) ? await Promise.all(body.map(one)) : await one(body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    });
  });
  await new Promise((resolve) => node.listen(0, "127.0.0.1", resolve));
  const previous = process.env.EVM_RPC_URL;
  process.env.EVM_RPC_URL = `http://127.0.0.1:${node.address().port}`;
  resetChainCatalogCacheForTests();
  t.after(async () => {
    if (previous === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = previous;
    resetChainCatalogCacheForTests();
    await new Promise((resolve) => node.close(resolve));
  });
}

function row(address, symbol) {
  return {
    assetId: address.toLowerCase(),
    tokenAddress: address,
    name: symbol,
    symbol,
    decimals: 18,
    totalSupply: 1,
    creator: dep.deployer ?? address,
    status: "active",
    type: "token",
    verified: false,
    imageUri: "https://cdn.example.com/kept.png",
    creationMetadata: { image: "https://cdn.example.com/kept.png" },
  };
}

describe("catalog tail", { concurrency: 1 }, () => {
test("a complete catalog scan is not partial, and a failed tail read is", async (t) => {
  assert.ok(FACTORY && FACTORY_START);
  let failLogs = false;
  const latest = FACTORY_START + 100;
  await startRpc(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(latest);
    if (call.method === "eth_call") return metadata(call);
    if (call.method === "eth_getLogs") return failLogs ? null : [];
    return "0x";
  });
  setTokenCatalogSoftDeadlineForTests(60_000);
  t.after(() => setTokenCatalogSoftDeadlineForTests(null));
  const listed = await discoverTokensOnChain();
  assert.equal(catalogListIsPartial(listed), false);

  seedTokenCatalogCacheForTests([row(OLD_TOKEN, "OLD")], latest);
  failLogs = true;
  const missed = await discoverTokensOnChain();
  assert.equal(catalogListIsPartial(missed), true);
  assert.ok(missed.some((token) => token.tokenAddress.toLowerCase() === OLD_TOKEN.toLowerCase()));
});

test("a token created in the latest block is listed on the next request", async (t) => {
  assert.ok(FACTORY && FACTORY_START);
  let tip = FACTORY_START + 50_000;
  await startRpc(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(tip);
    if (call.method === "eth_call") return metadata(call);
    if (call.method !== "eth_getLogs") return "0x";
    const filter = call.params?.[0] ?? {};
    if (String(filter.address).toLowerCase() !== FACTORY.toLowerCase()) return [];
    const from = Number.parseInt(filter.fromBlock, 16);
    const to = Number.parseInt(filter.toBlock, 16);
    return [tokenLog(NEW_TOKEN, tip)].filter(() => tip >= from && tip <= to);
  });
  seedTokenCatalogCacheForTests([row(OLD_TOKEN, "OLD")], tip - 1);
  const started = Date.now();
  const first = await discoverTokensOnChain();
  assert.ok(Date.now() - started < 4_000, `tail read took ${Date.now() - started}ms`);
  assert.equal(catalogListIsPartial(first), false);
  assert.ok(first.some((token) => token.tokenAddress.toLowerCase() === NEW_TOKEN.toLowerCase()));
  assert.equal(
    first.find((token) => token.tokenAddress.toLowerCase() === OLD_TOKEN.toLowerCase())?.imageUri,
    "https://cdn.example.com/kept.png",
  );

  tip += 1;
  const second = await discoverTokensOnChain();
  assert.ok(second.some((token) => token.tokenAddress.toLowerCase() === NEW_TOKEN.toLowerCase()));
  assert.equal(catalogListIsPartial(second), false);
});
});
