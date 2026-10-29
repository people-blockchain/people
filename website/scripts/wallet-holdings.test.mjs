import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { formatUnits } from "viem";

import { resetChainCatalogCacheForTests } from "../src/lib/evm/chain-catalog.ts";
import { handleEvmCompatGet } from "../src/lib/evm/people-compat.ts";
import { readEvmDeployments } from "../src/lib/evm/config.ts";
import { seedAssetMeta } from "../src/lib/evm/seed-assets.ts";
import {
  balanceOfData,
  ownerOfData,
  readOwnedFactoryNfts,
  readTokenBalances,
} from "../src/lib/evm/wallet-holdings.ts";

/**
 * Wallet holdings are read from the contracts (balanceOf / ownerOf), so a token or NFT created
 * after the catalog / deployment snapshot still shows. The RPC is a throwaway localhost node.
 */

const hex = (v) => `0x${v.toString(16)}`;
const word = (v) => `0x${BigInt(v).toString(16).padStart(64, "0")}`;
const HEAD = 480_000;
const OWNER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const TOKEN = "0xd2dd2666990a77921e034f44ec920d6b49390ba9";
const COLLECTION = "0xead74edb323da357b1ea37180bb48bf1f7b4d582";
const pad = (a) => `0x${a.slice(2).padStart(64, "0")}`;

async function startRpcNode(t, answer) {
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      res.writeHead(200, { "content-type": "application/json" });
      const one = (call) => ({ jsonrpc: "2.0", id: call.id, result: answer(call) ?? null });
      res.end(JSON.stringify(Array.isArray(body) ? body.map(one) : one(body)));
    });
  });
  await new Promise((resolve) => node.listen(0, "127.0.0.1", resolve));
  const previous = process.env.EVM_RPC_URL;
  process.env.EVM_RPC_URL = `http://127.0.0.1:${node.address().port}`;
  resetChainCatalogCacheForTests();
  t.after(async () => {
    if (previous === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = previous;
    await new Promise((resolve) => node.close(resolve));
  });
}

test("calldata encodes the owner / token id as one 32-byte word", () => {
  assert.equal(balanceOfData(OWNER), `0x70a08231${"0".repeat(24)}${OWNER.slice(2)}`);
  assert.equal(ownerOfData(BigInt(255)), `0x6352211e${"0".repeat(62)}ff`);
});

test("readTokenBalances returns human amounts, using caller decimals or the token's own decimals()", async (t) => {
  const SIX = "0x3333333333333333333333333333333333333333";
  await startRpcNode(t, (call) => {
    if (call.method !== "eth_call") return null;
    const { to, data } = call.params[0];
    if (data === "0x313ce567") return word(6);
    if (data.startsWith("0x70a08231")) {
      if (to.toLowerCase() === TOKEN) return word(1_500_000_000_000);
      if (to.toLowerCase() === SIX) return word(78_038_183);
    }
    return word(0);
  });
  const out = await readTokenBalances(OWNER, [
    { assetId: TOKEN, address: TOKEN, decimals: 6 },
    { assetId: "alias-of-token", address: TOKEN, decimals: 6 },
    { assetId: "six", address: SIX },
    { assetId: "empty", address: OTHER },
    { assetId: "bad", address: "not-an-address" },
  ]);
  assert.deepEqual(out, { [TOKEN]: 1_500_000, six: 78.038183 });
});

test("address route returns human ERC-20 balances next to ppl for deployment-mapped tokens", async (t) => {
  const [assetId, address] = Object.entries(readEvmDeployments().assetMap)[0];
  const decimals = seedAssetMeta(assetId)?.decimals ?? 18;
  await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(100);
    if (call.method === "eth_getBalance") return hex(5n * 10n ** 18n);
    if (call.method === "eth_getTransactionCount") return hex(3);
    if (call.method === "eth_getLogs") return [];
    if (call.method === "eth_call") {
      const { to, data } = call.params[0];
      if (to.toLowerCase() === address.toLowerCase() && data.startsWith("0x70a08231")) return word(42_000_000);
      if (data === "0x313ce567") return word(decimals);
    }
    return "0x";
  });
  const { status, body } = await handleEvmCompatGet(`address/${OWNER}`, new URLSearchParams());
  assert.equal(status, 200);
  assert.equal(body.balances.ppl, 5);
  assert.equal(body.balances[assetId.toLowerCase()], Number(formatUnits(42_000_000n, decimals)));
});

test("readOwnedFactoryNfts lists only tokens ownerOf still reports for the owner", async (t) => {
  const mintedTopic = (id) => ({
    topics: ["0x00", pad(COLLECTION), word(id), pad(OWNER)],
    data: "0x",
    blockNumber: hex(HEAD - 10),
  });
  await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(HEAD);
    if (call.method === "eth_getLogs") return [mintedTopic(0), mintedTopic(1)];
    if (call.method === "eth_call") {
      const { data } = call.params[0];
      if (data === ownerOfData(BigInt(0))) return pad(OWNER);
      if (data === ownerOfData(BigInt(1))) return pad(OTHER);
    }
    return "0x";
  });
  const nfts = await readOwnedFactoryNfts(OWNER);
  assert.equal(nfts.length, 1);
  assert.equal(nfts[0].onChainTokenId, "0");
  assert.equal(nfts[0].collection.toLowerCase(), COLLECTION);
  assert.equal(nfts[0].nftId, `${COLLECTION}:0`);
  assert.deepEqual(await readOwnedFactoryNfts("nope"), []);
});

function nftNode(t, owners) {
  const minted = (id, minter) => ({
    topics: ["0x00", pad(COLLECTION), word(id), pad(minter)],
    data: "0x",
    blockNumber: hex(HEAD - 10),
  });
  return startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(HEAD);
    if (call.method === "eth_getLogs") return [minted(0, OWNER), minted(1, OWNER), minted(2, OTHER)];
    if (call.method === "eth_call") {
      const { data } = call.params[0];
      for (const [id, owner] of Object.entries(owners)) if (data === ownerOfData(BigInt(id))) return owner ? pad(owner) : null;
    }
    return "0x";
  });
}

test("explorer /nfts without an owner lists real factory mints with live owners, never the demo seeds", async (t) => {
  const seeds = (readEvmDeployments().nfts ?? []).map((n) => n.nftId);
  assert.ok(seeds.length > 0, "fixture: the deployment snapshot still carries demo NFTs");
  await nftNode(t, { 0: OTHER, 1: OWNER, 2: null });
  const { status, body } = await handleEvmCompatGet("nfts", new URLSearchParams());
  assert.equal(status, 200);
  const ids = body.map((row) => row.nftId);
  for (const seed of seeds) assert.ok(!ids.includes(seed), `seed ${seed} must not be listed`);
  assert.deepEqual([...ids].sort(), [`${COLLECTION}:0`, `${COLLECTION}:1`]);
  const moved = body.find((row) => row.onChainTokenId === "0");
  assert.equal(moved.owner.toLowerCase(), OTHER);
  assert.equal(moved.creator.toLowerCase(), OWNER);
});

test("wallet /nfts?owner= lists only tokens ownerOf reports for the owner, no demo seeds", async (t) => {
  await nftNode(t, { 0: OTHER, 1: OWNER, 2: OWNER });
  const { body } = await handleEvmCompatGet("nfts", new URLSearchParams({ owner: OWNER }));
  assert.deepEqual(body.map((row) => row.nftId).sort(), [`${COLLECTION}:1`, `${COLLECTION}:2`]);
  const none = await handleEvmCompatGet("nfts", new URLSearchParams({ owner: "nope" }));
  assert.deepEqual(none.body, []);
});

test("parseNftId accepts only collection:decimalTokenId", async () => {
  const { parseNftId } = await import("../src/lib/evm/nft-id.ts");
  const ok = parseNftId(`${COLLECTION}:7`);
  assert.equal(ok.collection.toLowerCase(), COLLECTION);
  assert.equal(ok.tokenId, 7n);
  for (const bad of ["nft-1", `${COLLECTION}:`, `${COLLECTION}:01`, `${COLLECTION}:1:2`, `${COLLECTION}:-1`, "0x12:1"]) {
    assert.equal(parseNftId(bad), null, bad);
  }
});
