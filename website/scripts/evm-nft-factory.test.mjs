// Regression for E2E-M3: the /create/nft wizard must build real NftFactory writes
// (createCollection + payable mint) instead of POSTing to the legacy compat endpoint that
// answers 405 use_evm_wallet on chain 97401. These cover the tx-building and receipt-parsing
// helpers the component signs with.
import test from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, encodeEventTopics, getAddress } from "viem";
import {
  nftFactoryAbi,
  nftFactoryAddress,
  buildCreateCollectionRequest,
  buildMintRequest,
  buildNftTokenUri,
  deriveCollectionSymbol,
  collectionFromReceipt,
  tokenIdFromReceipt,
  classifyNftWriteError,
  feeWeiToPpl,
  collectionCreatedEvent,
  nftMintedEvent,
} from "../src/lib/evm/nft-factory.ts";

const FACTORY = "0x755fec41decd3147d693ee28b6442ef0dc9dd0df";
const OTHER = "0x89aaef7b13dfba2570c3c47390f03471596a2628";
const COLLECTION = "0x8f659a462c89314faa6a4065fb3d2deb51faef62";

test("factory address comes from the deployments file", () => {
  assert.equal(nftFactoryAddress(), getAddress(FACTORY));
});

test("createCollection request is nonpayable with name and symbol", () => {
  const req = buildCreateCollectionRequest(getAddress(FACTORY), "PitPat badge", "PITPATBADGE");
  assert.equal(req.address, getAddress(FACTORY));
  assert.equal(req.functionName, "createCollection");
  assert.deepEqual(req.args, ["PitPat badge", "PITPATBADGE"]);
  assert.equal("value" in req, false);
  // contract field must be one viem accepts, not a stray clone.
  assert.ok(nftFactoryAbi.some((entry) => entry.name === "createCollection"));
});

test("mint request carries the on-chain fee as value", () => {
  const fee = 2_925_000_000_000_000_000n;
  const req = buildMintRequest(getAddress(FACTORY), getAddress(COLLECTION), "ipfs://x", fee);
  assert.equal(req.functionName, "mint");
  assert.deepEqual(req.args, [getAddress(COLLECTION), "ipfs://x"]);
  assert.equal(req.value, fee);
});

test("symbol derivation keeps [A-Z0-9] and is bounded", () => {
  assert.equal(deriveCollectionSymbol("PitPat Founding Parent"), "PITPATFOUND");
  assert.equal(deriveCollectionSymbol("badge #1"), "BADGE1");
  assert.equal(deriveCollectionSymbol("!!!"), "NFT");
});

test("token URI is self-contained JSON metadata", () => {
  const uri = buildNftTokenUri({ name: "Badge", description: "A demo", image: "https://x/y.png" });
  assert.ok(uri.startsWith("data:application/json;utf8,"));
  const json = JSON.parse(decodeURIComponent(uri.slice("data:application/json;utf8,".length)));
  assert.deepEqual(json, { name: "Badge", description: "A demo", image: "https://x/y.png" });
  assert.deepEqual(JSON.parse(decodeURIComponent(buildNftTokenUri({ name: "Solo" }).split(",")[1])), { name: "Solo" });
});

test("collection address is decoded from a createCollection receipt", () => {
  const topics = encodeEventTopics({
    abi: [collectionCreatedEvent],
    eventName: "CollectionCreated",
    args: { collection: getAddress(COLLECTION), creator: getAddress(FACTORY) },
  });
  const data = encodeAbiParameters([{ type: "string" }, { type: "string" }], ["Badge", "BADGE"]);
  const receipt = {
    logs: [
      { address: getAddress(OTHER), topics, data },
      { address: getAddress(FACTORY), topics, data },
    ],
  };
  assert.equal(collectionFromReceipt(receipt, getAddress(FACTORY)), getAddress(COLLECTION));
  // A receipt with no factory log yields nothing (no silent wrong address).
  assert.equal(collectionFromReceipt({ logs: [] }, getAddress(FACTORY)), null);
  assert.equal(
    collectionFromReceipt({ logs: [{ address: getAddress(OTHER), topics, data }] }, getAddress(FACTORY)),
    null,
  );
});

test("collection address survives a log the ABI decoder cannot read", () => {
  const topics = encodeEventTopics({
    abi: [collectionCreatedEvent],
    eventName: "CollectionCreated",
    args: { collection: getAddress(COLLECTION), creator: getAddress(FACTORY) },
  });
  const receipt = { logs: [{ address: getAddress(FACTORY), topics, data: "0x" }] };
  assert.equal(collectionFromReceipt(receipt, getAddress(FACTORY)), getAddress(COLLECTION));
});

test("token id is decoded from a mint receipt and matched to the collection", () => {
  const makeLog = (collection, tokenId) => ({
    address: getAddress(FACTORY),
    topics: encodeEventTopics({
      abi: [nftMintedEvent],
      eventName: "NftMinted",
      args: { collection: getAddress(collection), tokenId, owner: getAddress(FACTORY) },
    }),
    data: encodeAbiParameters([{ type: "string" }], ["ipfs://meta/0"]),
  });
  const receipt = { logs: [makeLog(OTHER, 7n), makeLog(COLLECTION, 0n)] };
  assert.equal(tokenIdFromReceipt(receipt, getAddress(FACTORY), getAddress(COLLECTION)), 0n);
  assert.equal(tokenIdFromReceipt({ logs: [makeLog(COLLECTION, 3n)] }, getAddress(FACTORY), getAddress(OTHER)), null);
});

test("write errors are classified into actionable codes", () => {
  assert.equal(classifyNftWriteError(new Error("User rejected the request.")).code, "wallet_rejected");
  assert.equal(classifyNftWriteError(new Error("insufficient funds for gas * price + value")).code, "insufficient_funds");
  assert.equal(classifyNftWriteError(new Error("reverted with custom error 'InsufficientFee()'")).code, "insufficient_fee");
  assert.equal(classifyNftWriteError(new Error("reverted with custom error 'Unauthorized()'")).code, "not_collection_creator");
  const unknown = classifyNftWriteError(new Error("boom"));
  assert.equal(unknown.code, "unknown");
  assert.equal(unknown.detail, "boom");
});

test("fee wei renders as PPL", () => {
  assert.equal(feeWeiToPpl(2_925_000_000_000_000_000n), 2.925);
});
