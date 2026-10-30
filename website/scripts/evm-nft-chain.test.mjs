// A minted token is invisible when the wallet only lists the seed catalog and /nft/<collection>/<id>
// has no page. These cover the log decode, the direct ownerOf read, and the factory scan start.
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
  mintLogTopics,
  nftFactoryScanStart,
  nftIdFor,
  nftsFromMintLogs,
  readNftToken,
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
