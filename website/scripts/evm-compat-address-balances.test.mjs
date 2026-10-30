import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { encodeAbiParameters, encodeEventTopics, toFunctionSelector } from "viem";

import { readEvmDeployments } from "../src/lib/evm/config.ts";
import { logStartBlock, resetChainCatalogCacheForTests, seedTokenCatalogCacheForTests } from "../src/lib/evm/chain-catalog.ts";
import { handleEvmCompatGet, resetMintedNftCacheForTests } from "../src/lib/evm/people-compat.ts";
import { NFT_MINTED_TOPIC, nftFactoryAddress, nftMintedEvent } from "../src/lib/evm/nft-factory.ts";
import { ipfsGatewayUrlForUri } from "../src/lib/ipfs.ts";

const hex = (value) => `0x${value.toString(16)}`;
const HEAD = 100_000;
const OWNER = "0x00000000000000000000000000000000000a11ce";
const OTHER = "0x00000000000000000000000000000000000b0b0b";
const EXTRA = "0x00000000000000000000000000000000000c0ffe";

const SEL = {
  name: toFunctionSelector("name()"),
  symbol: toFunctionSelector("symbol()"),
  decimals: toFunctionSelector("decimals()"),
  supply: toFunctionSelector("totalSupply()"),
  creator: toFunctionSelector("creator()"),
  metadataURI: toFunctionSelector("metadataURI()"),
  balanceOf: toFunctionSelector("balanceOf(address)"),
  isPeopleToken: toFunctionSelector("isPeopleToken(address)"),
};

const word = (value) => BigInt(value).toString(16).padStart(64, "0");
const addressWord = (value) => value.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const stringWord = (value) => encodeAbiParameters([{ type: "string" }], [value]);
const TRUE_WORD = `0x${word(1)}`;

function answerFor(tokens, factoryTokens = [EXTRA]) {
  return (call) => {
    if (call.method === "eth_blockNumber") return hex(HEAD);
    if (call.method === "eth_getLogs") return [];
    if (call.method === "eth_getBalance") return "0x0";
    if (call.method === "eth_getTransactionCount") return "0x0";
    if (call.method !== "eth_call") return "0x";
    const to = String(call.params[0]?.to ?? "").toLowerCase();
    const data = String(call.params[0]?.data ?? "");
    const selector = data.slice(0, 10);
    if (selector === SEL.isPeopleToken) {
      const asked = `0x${data.slice(-40)}`.toLowerCase();
      return factoryTokens.some((address) => address.toLowerCase() === asked) ? TRUE_WORD : `0x${"0".repeat(64)}`;
    }
    const token = tokens.find((row) => row.address.toLowerCase() === to);
    if (!token) return `0x${"0".repeat(64)}`;
    if (selector === SEL.name) return stringWord(token.name);
    if (selector === SEL.symbol) return stringWord(token.symbol);
    if (selector === SEL.decimals) return `0x${word(token.decimals)}`;
    if (selector === SEL.supply) return `0x${word(token.supply)}`;
    if (selector === SEL.creator) return `0x${addressWord(token.creator)}`;
    if (selector === SEL.metadataURI) return stringWord(token.metadataURI ?? "");
    if (selector === SEL.balanceOf) return `0x${word(token.balance)}`;
    return `0x${"0".repeat(64)}`;
  };
}

async function startRpcNode(t, answer, rejectBatch = () => false) {
  const calls = [];
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const replyOne = (call) => {
        const result = answer(call);
        if (result && typeof result === "object" && result.http) {
          return { http: result.http, error: { message: `rpc_http_${result.http}` } };
        }
        return { result: result ?? null };
      };
      if (Array.isArray(body)) {
        calls.push(...body);
        if (rejectBatch(body)) {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { message: "batch too large" } }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(body.map((call) => {
          const one = replyOne(call);
          return one.error
            ? { jsonrpc: "2.0", id: call.id, error: one.error }
            : { jsonrpc: "2.0", id: call.id, result: one.result };
        })));
        return;
      }
      calls.push(body);
      const one = replyOne(body);
      if (one.http) {
        res.writeHead(one.http, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: one.error }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: one.result }));
    });
  });
  await new Promise((resolve) => node.listen(0, "127.0.0.1", resolve));
  const previous = process.env.EVM_RPC_URL;
  process.env.EVM_RPC_URL = `http://127.0.0.1:${node.address().port}`;
  resetChainCatalogCacheForTests();
  resetMintedNftCacheForTests();
  t.after(async () => {
    if (previous === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = previous;
    await new Promise((resolve) => node.close(resolve));
  });
  return calls;
}

test("address balances merge catalog tokens, creator zero balances and requested tokens", async (t) => {
  const assetMap = Object.entries(readEvmDeployments().assetMap);
  const created = assetMap[0];
  const holding = assetMap[1];
  assert.ok(created && holding, "the deployment must contain at least two assetMap tokens");
  const tokens = [
    {
      address: created[1],
      name: "Created Token",
      symbol: "CREATED",
      decimals: 6,
      supply: 1_000_000n * 1_000_000n,
      creator: OWNER,
      metadataURI: "ipfs://people/CREATED",
      balance: 0n,
    },
    {
      address: holding[1],
      name: "Holding Token",
      symbol: "HOLD",
      decimals: 6,
      supply: 1_000_000n * 1_000_000n,
      creator: OTHER,
      metadataURI: "",
      balance: 123_456_789n,
    },
    {
      address: EXTRA,
      name: "Extra Token",
      symbol: "EXTRA",
      decimals: 6,
      supply: 10_000_000n * 1_000_000n,
      creator: OTHER,
      metadataURI: "https://example.com/extra.png",
      balance: 5_000_000n,
    },
  ];
  // Remaining assetMap tokens are zero-balance and belong to someone else: they must stay out.
  for (const [assetId, address] of assetMap.slice(2)) {
    tokens.push({
      address,
      name: assetId,
      symbol: assetId.toUpperCase(),
      decimals: 6,
      supply: 1_000_000n,
      creator: OTHER,
      metadataURI: "",
      balance: 0n,
    });
  }
  await startRpcNode(t, answerFor(tokens));

  const res = await handleEvmCompatGet(`/address/${OWNER}`, new URLSearchParams({ tokens: EXTRA }));
  assert.equal(res.status, 200);
  assert.equal(res.body.balances.ppl, 0);
  // Creator sees the token even with a zero balance.
  assert.equal(res.body.balances[created[0].toLowerCase()], 0);
  assert.equal(res.body.balances[holding[0].toLowerCase()], 123.456789);
  // A token supplied via `tokens=` is resolved only through the factory registry.
  assert.equal(res.body.balances[EXTRA.toLowerCase()], 5);
  // Unrelated zero-balance catalog tokens are not listed.
  for (const [assetId] of assetMap.slice(2)) assert.equal(res.body.balances[assetId.toLowerCase()], undefined);
  assert.equal(res.body.nonce >= 0, true);
});

test("a requested token that is not a factory token is ignored", async (t) => {
  await startRpcNode(t, answerFor([]));
  const unknown = "0x00000000000000000000000000000000000dEaD";
  const res = await handleEvmCompatGet(`/address/${OWNER}`, new URLSearchParams({ tokens: unknown }));
  assert.equal(res.status, 200);
  assert.equal(res.body.balances[unknown.toLowerCase()], undefined);
});

test("nfts?owner= includes a factory mint verified by ownerOf and parses its metadata", async (t) => {
  const factory = nftFactoryAddress();
  assert.ok(factory, "the deployment must contain the NFT factory");
  const collection = "0x00000000000000000000000000000000000c011e";
  const tokenId = 7n;
  const owner = "0x00000000000000000000000000000000000a11ce";
  const topics = encodeEventTopics({
    abi: [nftMintedEvent],
    eventName: "NftMinted",
    args: { collection, tokenId, owner },
  });
  const data = encodeAbiParameters([{ type: "string" }], ["ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/meta.json"]);
  const head = 50_000_000;
  await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(head);
    if (call.method === "eth_getLogs") {
      if (String(call.params[0]?.address).toLowerCase() !== factory.toLowerCase()) return [];
      if (String(call.params[0]?.topics?.[0]).toLowerCase() !== NFT_MINTED_TOPIC.toLowerCase()) return [];
      return [{ address: factory, topics, data, blockNumber: hex(head - 1), transactionHash: `0x${"1".repeat(64)}`, logIndex: "0x0" }];
    }
    if (call.method !== "eth_call") return "0x";
    const selector = String(call.params[0]?.data ?? "").slice(0, 10);
    if (selector === "0x6352211e") return `0x${addressWord(owner)}`;
    return "0x";
  });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.includes("bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")) return realFetch(input, init);
    return new Response(JSON.stringify({ name: "Minted Neighbourhood", description: "A minted NFT", image: "ipfs://bafy-image" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  const res = await handleEvmCompatGet("/nfts", new URLSearchParams({ owner }));
  assert.equal(res.status, 200);
  const row = res.body.find((item) => item.collection?.toLowerCase() === collection.toLowerCase());
  assert.ok(row, "the minted NFT must be listed");
  assert.equal(row.onChainTokenId, "7");
  assert.equal(row.name, "Minted Neighbourhood");
  assert.equal(row.description, "A minted NFT");
  assert.equal(row.imageUri, "ipfs://bafy-image");
  assert.equal(row.owner.toLowerCase(), owner.toLowerCase());
});

function extraAddresses(count) {
  return Array.from({ length: count }, (_, index) => `0x${(index + 1).toString(16).padStart(40, "0")}`);
}

function isBalanceBatch(body) {
  return body.some((call) => String(call.params?.[0]?.data ?? "").startsWith(SEL.balanceOf));
}

test("large token lists are batched in chunks of at most 20 calls", async (t) => {
  const assetMap = Object.entries(readEvmDeployments().assetMap);
  const created = assetMap[0];
  const holding = assetMap[1];
  const extras = extraAddresses(20);
  const tokens = [
    {
      address: created[1], name: "Created Token", symbol: "CREATED", decimals: 6,
      supply: 1_000_000n * 1_000_000n, creator: OWNER, metadataURI: "", balance: 0n,
    },
    {
      address: holding[1], name: "Holding Token", symbol: "HOLD", decimals: 6,
      supply: 1_000_000n * 1_000_000n, creator: OTHER, metadataURI: "", balance: 123_456_789n,
    },
    ...assetMap.slice(2).map(([assetId, address]) => ({
      address, name: assetId, symbol: assetId.toUpperCase(), decimals: 6,
      supply: 1_000_000n, creator: OTHER, metadataURI: "", balance: 0n,
    })),
    ...extras.map((address, index) => ({
      address, name: `Extra ${index}`, symbol: `EX${index}`, decimals: 6,
      supply: 1_000_000n, creator: index === 0 ? OWNER : OTHER, metadataURI: "",
      balance: index === 0 ? 0n : BigInt(1_000_000 * (index + 1)),
    })),
  ];
  // The public node rejects oversized batches. A 26-token balance read must still work.
  await startRpcNode(t, answerFor(tokens, extras), (body) => isBalanceBatch(body) && body.length > 20);

  const res = await handleEvmCompatGet(
    `/address/${OWNER}`,
    new URLSearchParams({ tokens: extras.join(",") }),
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.balances[holding[0].toLowerCase()], 123.456789);
  assert.equal(res.body.balances[extras[0].toLowerCase()], 0);
  assert.equal(res.body.balances[extras[19].toLowerCase()], 20);
  assert.equal(res.body.balances[created[0].toLowerCase()], 0);
});

test("a rejected balance batch falls back to one eth_call per token", async (t) => {
  const assetMap = Object.entries(readEvmDeployments().assetMap);
  const created = assetMap[0];
  const holding = assetMap[1];
  const tokens = [
    {
      address: created[1], name: "Created Token", symbol: "CREATED", decimals: 6,
      supply: 1_000_000n * 1_000_000n, creator: OWNER, metadataURI: "", balance: 0n,
    },
    {
      address: holding[1], name: "Holding Token", symbol: "HOLD", decimals: 6,
      supply: 1_000_000n * 1_000_000n, creator: OTHER, metadataURI: "", balance: 42_000_000n,
    },
  ];
  await startRpcNode(t, answerFor(tokens), (body) => isBalanceBatch(body));

  const res = await handleEvmCompatGet(`/address/${OWNER}`, new URLSearchParams());
  assert.equal(res.status, 200);
  assert.equal(res.body.balances[holding[0].toLowerCase()], 42);
  assert.equal(res.body.balances[created[0].toLowerCase()], 0);
});

test("a fresh factory token not in the catalog reports its on-chain creator and metadata image", async (t) => {
  const token = "0x00000000000000000000000000000000000e7a6b";
  const metadataURI = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
  await startRpcNode(t, answerFor([
    {
      address: token, name: "Fresh Token", symbol: "FRESH", decimals: 6,
      supply: 1_000_000n * 1_000_000n, creator: OWNER, metadataURI, balance: 0n,
    },
  ], [token]));

  const res = await handleEvmCompatGet(`/assets/${token}`, new URLSearchParams());
  assert.equal(res.status, 200);
  assert.equal(res.body.creator.toLowerCase(), OWNER.toLowerCase());
  assert.equal(res.body.imageUri, ipfsGatewayUrlForUri(metadataURI));
  assert.equal(res.body.creationMetadata.image, ipfsGatewayUrlForUri(metadataURI));
  assert.equal(res.body.verified, false);
  assert.equal(res.body.tokenAddress.toLowerCase(), token);
});

test("one balance read fails with 503 and the response is partial 200 with the other tokens", async (t) => {
  const dep = readEvmDeployments();
  const factory = dep.contracts.tokenFactory;
  assert.ok(factory, "deployment has a token factory");
  const assetMap = Object.entries(dep.assetMap);
  const holding = assetMap[0];
  const failing = assetMap[1];
  assert.ok(holding && failing);
  const created = "0x00000000000000000000000000000000000e7a11";
  const head = logStartBlock(factory) + 50;
  const topic = "0x10911c4cd4fbfa42352cbeb31e021abbab48257dff3d94957b57da33a205d724";
  const tokens = [
    {
      address: holding[1], name: "Holding", symbol: "HOLD", decimals: 6,
      supply: 1_000_000n, creator: OTHER, metadataURI: "", balance: 2_000_000n,
    },
    {
      address: failing[1], name: "Failing", symbol: "FAIL", decimals: 6,
      supply: 1_000_000n, creator: OTHER, metadataURI: "", balance: 9_000_000n,
    },
    {
      address: created, name: "Fresh", symbol: "FRESH", decimals: 6,
      supply: 5_000_000n, creator: OTHER, metadataURI: "", balance: 3_000_000n,
    },
  ];
  for (const [, address] of assetMap.slice(2)) {
    tokens.push({
      address, name: "Other", symbol: "OTH", decimals: 6,
      supply: 1n, creator: OTHER, metadataURI: "", balance: 0n,
    });
  }
  const base = answerFor(tokens, [created]);
  await startRpcNode(t, (call) => {
    if (call.method === "eth_blockNumber") return hex(head);
    if (call.method === "eth_getLogs") {
      const filter = call.params[0] ?? {};
      const topic0 = filter.topics?.[0];
      const createdTopic = topic0 === topic || (Array.isArray(topic0) && topic0.includes(topic));
      if (!createdTopic || String(filter.address).toLowerCase() !== factory.toLowerCase()) return [];
      return [{
        address: factory,
        topics: [topic, `0x${created.slice(2).padStart(64, "0")}`],
        data: "0x",
      }];
    }
    if (call.method === "eth_call") {
      const to = String(call.params[0]?.to ?? "").toLowerCase();
      const data = String(call.params[0]?.data ?? "");
      if (data.slice(0, 10) === SEL.balanceOf && to === failing[1].toLowerCase()) return { http: 503 };
    }
    return base(call);
  });
  // The fresh token is already in the catalog cache. The address route must not scan logs to see it.
  seedTokenCatalogCacheForTests([{
    assetId: created.toLowerCase(),
    tokenAddress: created,
    name: "Fresh",
    symbol: "FRESH",
    decimals: 6,
    totalSupply: 5,
    creator: OTHER,
    status: "active",
    type: "token",
    verified: false,
  }]);

  const res = await handleEvmCompatGet(`/address/${OWNER}`, new URLSearchParams());
  assert.equal(res.status, 200);
  assert.equal(res.body.partial, true);
  assert.equal(res.body.balances[holding[0].toLowerCase()], 2);
  assert.equal(res.body.balances[failing[0].toLowerCase()], undefined);
  assert.equal(res.body.balances[created.toLowerCase()], 3);
});
