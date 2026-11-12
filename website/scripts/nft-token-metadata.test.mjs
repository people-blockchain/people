import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchNftTokenMetadata,
  parseNftTokenMetadata,
  resolveNftImageUrl,
  resolveNftMetadataUrl,
} from "../src/lib/nft-token-metadata.ts";

const CID = "QmWBpyJ3M5hqg9en5E95MJk8BycLMGFaJCqDVh5DYP7A54";
const GATEWAY = (process.env.IPFS_GATEWAY_URL ?? "").trim().replace(/\/$/, "") || "https://gateway.pinata.cloud/ipfs";

test("an ipfs token URI keeps its path and resolves through the configured gateway", () => {
  assert.equal(
    resolveNftMetadataUrl(`ipfs://${CID}/metadata.json`),
    `${GATEWAY}/${CID}/metadata.json`,
  );
  assert.equal(resolveNftMetadataUrl(`https://example.com/metadata.json`), "https://example.com/metadata.json");
  assert.equal(resolveNftMetadataUrl("http://example.com/metadata.json"), null);
  assert.equal(resolveNftMetadataUrl("data:application/json,{}"), null);
});

test("metadata parsing keeps name, description and an allowed image only", () => {
  const parsed = parseNftTokenMetadata({
    name: "First People NFT",
    description: "A real description.",
    image: `ipfs://${CID}/art.png`,
    animation_url: "ipfs://ignored",
    extra: "ignored",
  });
  assert.deepEqual(parsed, {
    name: "First People NFT",
    description: "A real description.",
    imageUrl: `${GATEWAY}/${CID}/art.png`,
  });
  assert.equal(resolveNftImageUrl("javascript:alert(1)"), null);
  assert.equal(resolveNftImageUrl("data:image/svg+xml,<svg/>"), null);
  assert.deepEqual(parseNftTokenMetadata(null), {});
});

test("a metadata fetch failure is reported as unavailable, not an error", async () => {
  const missing = await fetchNftTokenMetadata(`ipfs://${CID}/metadata.json`, {
    fetchImpl: async () => new Response("not found", { status: 404 }),
  });
  assert.equal(missing, null);

  const ok = await fetchNftTokenMetadata(`ipfs://${CID}/metadata.json`, {
    fetchImpl: async () => new Response(JSON.stringify({ name: "Name", image: `ipfs://${CID}/a.png` }), { status: 200 }),
  });
  assert.equal(ok?.name, "Name");
});
