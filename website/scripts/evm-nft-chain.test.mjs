// A minted token is invisible when the wallet only lists the seed catalog and /nft/<collection>/<id>
// has no page. These cover the log decode, the direct ownerOf read, and the factory scan start.
import { createServer } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  encodeFunctionResult,
  getAddress,
  keccak256,
  pad,
  toBytes,
} from "viem";
import { readEvmDeployments } from "../src/lib/evm/config.ts";
import { resetChainCatalogCacheForTests } from "../src/lib/evm/chain-catalog.ts";
import { resetRpcBackoffForTests } from "../src/lib/evm/rpc-server.ts";
import {
  COLLECTION_CREATED_TOPIC,
  NFT_MINTED_TOPIC,
  nftMintedEvent,
  peopleNftAbi,
} from "../src/lib/evm/nft-factory.ts";
import {
  assembleNftRows,
  chainNftFromMintLog,
  inAppNftPath,
  listMintedNfts,
  mintLogTopics,
  nftFactoryScanStart,
  nftIdFor,
  nftIndexPath,
  nftsFromMintLogs,
  readNftToken,
  recentMintScanStart,
  resetMintHistoryForTests,
} from "../src/lib/evm/nft-chain.ts";

const OWNER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const COLLECTION = "0x8f659a462c89314faa6a4065fb3d2deb51faef62";
const FACTORY = "0x755fec41decd3147d693ee28b6442ef0dc9dd0df";
const TOKEN_URI = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/metadata.json";

const nameAbi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
];

function mintLog(owner, tokenId, collection = COLLECTION) {
  const topics = encodeEventTopics({
    abi: [nftMintedEvent],
    eventName: "NftMinted",
    args: { collection: getAddress(collection), tokenId, owner: getAddress(owner) },
  });
  const data = encodeAbiParameters([{ type: "string" }], [TOKEN_URI]);
  return { address: FACTORY, topics, data };
}

test("minted and collection-created topics match the factory signatures", () => {
  assert.equal(NFT_MINTED_TOPIC, keccak256(toBytes("NftMinted(address,uint256,address,string)")));
  assert.equal(COLLECTION_CREATED_TOPIC, keccak256(toBytes("CollectionCreated(address,address,string,string)")));
});

test("the owner filter is the third indexed argument", () => {
  const topics = mintLogTopics(OWNER);
  assert.equal(topics[0], NFT_MINTED_TOPIC);
  assert.equal(topics[1], null);
  assert.equal(topics[2], null);
  assert.equal(topics[3], pad(getAddress(OWNER), { size: 32 }).toLowerCase());
});

test("a factory mint log becomes a wallet row for that collection and token", () => {
  const row = chainNftFromMintLog(mintLog(OWNER, 0n));
  assert.ok(row);
  assert.equal(row.collection, getAddress(COLLECTION));
  assert.notEqual(row.collection.toLowerCase(), FACTORY);
  assert.equal(row.onChainTokenId, "0");
  assert.equal(row.owner, getAddress(OWNER));
  assert.equal(row.tokenUri, TOKEN_URI);
  assert.equal(row.nftId, nftIdFor(COLLECTION, 0));
  assert.equal(inAppNftPath(row.collection, row.onChainTokenId), `/nft/${row.collection}/0`);
  const rows = nftsFromMintLogs([mintLog(OWNER, 0n), mintLog(OTHER, 1n), mintLog(OWNER, 0n)], OWNER);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].onChainTokenId, "0");
});

test("a direct chain read fills a token the log index missed", async () => {
  const ownerData = encodeFunctionData({ abi: peopleNftAbi, functionName: "ownerOf", args: [0n] });
  const uriData = encodeFunctionData({ abi: peopleNftAbi, functionName: "tokenURI", args: [0n] });
  const nameData = encodeFunctionData({ abi: nameAbi, functionName: "name" });
  const call = async (_to, data) => {
    if (data === ownerData) {
      return encodeFunctionResult({ abi: peopleNftAbi, functionName: "ownerOf", result: getAddress(OWNER) });
    }
    if (data === uriData) {
      return encodeFunctionResult({ abi: peopleNftAbi, functionName: "tokenURI", result: TOKEN_URI });
    }
    if (data === nameData) {
      return encodeFunctionResult({ abi: nameAbi, functionName: "name", result: "Badge" });
    }
    throw new Error(`unexpected call ${data}`);
  };
  const direct = await readNftToken(COLLECTION, 0n, call);
  assert.ok(direct);
  assert.equal(direct.name, "Badge #0");
  assert.equal(direct.owner, getAddress(OWNER));
  assert.equal(direct.tokenUri, TOKEN_URI);
  const rows = assembleNftRows([], [], direct, OWNER, COLLECTION, "0");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nftId, direct.nftId);
  const hidden = assembleNftRows([], [], direct, OTHER, COLLECTION, "0");
  assert.equal(hidden.length, 0);
  const already = assembleNftRows([], [direct], direct, OWNER, COLLECTION, "0");
  assert.equal(already.length, 1);
});

test("a reverted or empty token read is a miss", async () => {
  assert.equal(await readNftToken(COLLECTION, 0n, async () => { throw new Error("execution reverted"); }), null);
  assert.equal(await readNftToken(COLLECTION, 0n, async () => "0x"), null);
});

test("seed names win and a missing token is appended from the direct read", () => {
  const minted = {
    nftId: nftIdFor(COLLECTION, 1),
    name: "NFT #1",
    owner: getAddress(OWNER),
    collection: getAddress(COLLECTION),
    onChainTokenId: "1",
  };
  const seed = {
    nftId: minted.nftId,
    name: "Curated badge",
    owner: getAddress(OWNER),
    collection: getAddress(COLLECTION),
    onChainTokenId: "1",
    imageUri: "ipfs://image",
  };
  const direct = {
    nftId: nftIdFor(COLLECTION, 0),
    name: "Badge #0",
    owner: getAddress(OWNER),
    collection: getAddress(COLLECTION),
    onChainTokenId: "0",
    tokenUri: TOKEN_URI,
  };
  const rows = assembleNftRows([seed], [minted], direct, OWNER, COLLECTION, "0");
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.onChainTokenId === "1").name, "Curated badge");
  assert.equal(rows.find((row) => row.onChainTokenId === "0").tokenUri, TOKEN_URI);
});

test("the factory log scan starts at the factory block, after the chain deploy block", () => {
  const dep = readEvmDeployments();
  const factory = dep.contracts.nftFactory;
  assert.equal(typeof dep.startBlocks.nftFactory, "number");
  assert.equal(nftFactoryScanStart(factory), dep.startBlocks.nftFactory);
  assert.ok(nftFactoryScanStart(factory) > dep.deployBlock);
});

test("a wallet mint scan stays near the tip instead of the factory deploy block", () => {
  const dep = readEvmDeployments();
  const factoryStart = dep.startBlocks.nftFactory;
  const latest = factoryStart + 40 * 9_000;
  const recent = recentMintScanStart(latest, factoryStart);
  assert.ok(recent > factoryStart);
  assert.ok(latest - recent <= 4 * 9_000);
  assert.equal(recentMintScanStart(factoryStart + 10, factoryStart), factoryStart);
});

test("holdings include a mint in the newest window without scanning the factory deploy block", async (t) => {
  const dep = readEvmDeployments();
  const factoryStart = dep.startBlocks.nftFactory;
  const latest = factoryStart + 40 * 9_000;
  const recentFrom = recentMintScanStart(latest, factoryStart);
  const mintBlock = latest - 20;
  assert.ok(mintBlock >= recentFrom);

  const calls = [];
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      calls.push(body);
      let result = null;
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
  await new Promise((resolve) => node.listen(0, "127.0.0.1", resolve));
  const previous = process.env.EVM_RPC_URL;
  process.env.EVM_RPC_URL = `http://127.0.0.1:${node.address().port}`;
  resetChainCatalogCacheForTests();
  resetRpcBackoffForTests();
  t.after(async () => {
    if (previous === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = previous;
    resetMintHistoryForTests();
    resetChainCatalogCacheForTests();
    resetRpcBackoffForTests();
    node.closeAllConnections?.();
    await new Promise((resolve) => node.close(resolve));
  });

  const page = await listMintedNfts(OWNER);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].onChainTokenId, "0");
  assert.equal(page.items[0].collection, getAddress(COLLECTION));
  assert.equal(page.items[0].owner, getAddress(OWNER));
  const filters = calls.filter((call) => call.method === "eth_getLogs").map((call) => call.params[0]);
  assert.ok(filters.length > 0);
  assert.ok(filters.length < 20);
  assert.ok(filters.some((filter) => {
    const from = Number.parseInt(filter.fromBlock, 16);
    const to = Number.parseInt(filter.toBlock, 16);
    return from <= mintBlock && mintBlock <= to;
  }));
});

test("/nft without a token redirects to the explorer NFT list", async () => {
  assert.equal(nftIndexPath(), "/explorer/nfts");
  const { default: page } = await import("../src/app/nft/page.ts");
  try {
    page();
    assert.fail("expected a redirect");
  } catch (err) {
    assert.equal(err.digest, "NEXT_REDIRECT;replace;/explorer/nfts;307;");
  }
});
