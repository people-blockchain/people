import test from "node:test";
import assert from "node:assert/strict";
import {
  TxRevertedError,
  isOutOfGas,
  waitForReceiptRetry,
  collectionFromReceipt,
  nftMintedFromReceipt,
} from "./seed-97401-nft.mjs";

const NFT_FACTORY = "0x00000000000000000000000000000000000000f1";
const COLLECTION = "0x00000000000000000000000000000000000000c1";

test("collectionFromReceipt reads CollectionCreated from indexed topics", () => {
  const collectionTopic = `0x000000000000000000000000${COLLECTION.slice(2)}`;
  const receipt = {
    logs: [
      {
        address: NFT_FACTORY,
        topics: [
          "0x5fead977881b23a0dbf2f905699203f29cefea57a576d2d4f412523191258e84",
          collectionTopic,
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        ],
        data: "0x",
      },
    ],
  };
  const addr = collectionFromReceipt(receipt, NFT_FACTORY);
  assert.equal(addr?.toLowerCase(), COLLECTION.toLowerCase());
});

test("nftMintedFromReceipt decodes factory NftMinted tokenId", () => {
  const collectionTopic = `0x000000000000000000000000${COLLECTION.slice(2)}`;
  const tokenIdTopic =
    "0x0000000000000000000000000000000000000000000000000000000000000001";
  const ownerTopic =
    "0x00000000000000000000000000000000000000000000000000000000000000aa";
  const receipt = {
    logs: [
      {
        address: NFT_FACTORY,
        topics: [
          "0xf8b1b480f3e90cec0b9871e75e1c6401bf4db0127701d88d80f0a9d0b39accf7",
          collectionTopic,
          tokenIdTopic,
          ownerTopic,
        ],
        data: "0x",
      },
    ],
  };
  const tokenId = nftMintedFromReceipt(receipt, NFT_FACTORY, COLLECTION);
  assert.equal(tokenId, 1n);
});

test("waitForReceiptRetry returns a successful receipt", async () => {
  const client = { waitForTransactionReceipt: async () => ({ status: "success", gasUsed: 21000n }) };
  const r = await waitForReceiptRetry(client, "0xok");
  assert.equal(r.gasUsed, 21000n);
});

test("waitForReceiptRetry throws TxRevertedError at once with gas info (no polling)", async () => {
  let calls = 0;
  const client = {
    waitForTransactionReceipt: async () => {
      calls++;
      return { status: "reverted", gasUsed: 2_500_000n };
    },
    getTransaction: async () => ({ gas: 2_500_000n }),
  };
  const t0 = Date.now();
  await assert.rejects(waitForReceiptRetry(client, "0xbad"), (err) => {
    assert.ok(err instanceof TxRevertedError);
    assert.match(err.message, /gasUsed=2500000 gasLimit=2500000/);
    assert.ok(isOutOfGas(err));
    return true;
  });
  assert.equal(calls, 1);
  assert.ok(Date.now() - t0 < 1000);
});

test("isOutOfGas: logic revert well under the limit is not out of gas", () => {
  assert.equal(isOutOfGas(new TxRevertedError("0x1", 300_000n, 6_000_000n)), false);
  assert.equal(isOutOfGas(new TxRevertedError("0x1", 5_900_000n, 6_000_000n)), true);
  assert.equal(isOutOfGas(new TxRevertedError("0x1", undefined, 6_000_000n)), false);
  assert.equal(isOutOfGas(new Error("x")), false);
});
