// Wallet NFT cards were labeled "NFT #0" even when the token metadata JSON has a name.
// The label is the metadata name when that string has text, and "NFT #<id>" when it does not.
import test from "node:test";
import assert from "node:assert/strict";
import { nftCardLabel } from "../src/lib/nft-card-label.ts";
import { loadOwnerNfts } from "../src/lib/wallet-nft-loader.ts";

const owner = "0x1003A5Ae6ccd73818fB33718e341a73BA77a80c2";
const namedUri = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/named.json";
const blankUri = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/blank.json";
const missingUri = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/missing.json";

test("nft card label uses the metadata name when it has text", () => {
  assert.equal(nftCardLabel("PR75C mint", "0"), "PR75C mint");
  assert.equal(nftCardLabel("  PR75C mint  ", 0), "PR75C mint");
});

test("nft card label is NFT #id when the metadata name is missing, empty, or only spaces", () => {
  assert.equal(nftCardLabel(undefined, "0"), "NFT #0");
  assert.equal(nftCardLabel(null, "4"), "NFT #4");
  assert.equal(nftCardLabel("", "0"), "NFT #0");
  assert.equal(nftCardLabel(" \n\t ", "0"), "NFT #0");
  assert.equal(nftCardLabel(0, "2"), "NFT #2");
});

test("a wallet NFT row uses the metadata name and keeps NFT #id when that name is blank", async () => {
  const fetched = [];
  const loaded = await loadOwnerNfts(owner, {
    timeoutMs: 1_000,
    maxAttempts: 1,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          items: [
            { nftId: "0xefdc:0", name: "NFT #0", tokenUri: namedUri, onChainTokenId: "0" },
            { nftId: "0xefdc:1", name: "NFT #1", tokenUri: blankUri, onChainTokenId: "1" },
            { nftId: "0xefdc:2", name: "NFT #2", tokenUri: missingUri, onChainTokenId: "2" },
            { nftId: "seed:9", name: "Curated badge", onChainTokenId: "9" },
          ],
          partial: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    metadataFetch: async (url) => {
      fetched.push(url);
      if (url.endsWith("/named.json")) {
        return new Response(JSON.stringify({ name: "PR75C mint", image: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/image.png" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/blank.json")) {
        return new Response(JSON.stringify({ name: "   " }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ image: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/image.png" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(loaded.phase, "ready");
  assert.deepEqual(
    loaded.items.map((item) => item.name),
    ["PR75C mint", "NFT #1", "NFT #2", "Curated badge"],
  );
  assert.equal(fetched.length, 3);
  assert.ok(fetched.every((url) => url.startsWith("https://gateway.pinata.cloud/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/")));
});
