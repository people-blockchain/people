import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchNftTokenMetadata,
  NFT_TOKEN_METADATA_TIMEOUT_MS,
  parseNftTokenMetadata,
  resolveNftImageUrl,
  resolveNftMetadataUrl,
} from "../src/lib/nft-token-metadata.ts";
import { NFT_METADATA_MAX_BYTES } from "../src/lib/nft-media-rules.ts";

const CID = "QmWBpyJ3M5hqg9en5E95MJk8BycLMGFaJCqDVh5DYP7A54";
const GATEWAY = (process.env.IPFS_GATEWAY_URL ?? "").trim().replace(/\/$/, "") || "https://gateway.pinata.cloud/ipfs";
const GATEWAY_HOST_URL = `${GATEWAY}/${CID}/metadata.json`;

test("an ipfs token URI keeps its path and resolves through the configured gateway", () => {
  assert.equal(
    resolveNftMetadataUrl(`ipfs://${CID}/metadata.json`),
    `${GATEWAY}/${CID}/metadata.json`,
  );
  assert.equal(resolveNftMetadataUrl(GATEWAY_HOST_URL), GATEWAY_HOST_URL);
  assert.equal(resolveNftMetadataUrl(`https://example.com/metadata.json`), null);
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

test("a non-gateway HTTPS token URI is never fetched", async () => {
  let calls = 0;
  const result = await fetchNftTokenMetadata("https://example.com/metadata.json", {
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ name: "Remote" }), { status: 200 });
    },
  });
  assert.equal(result, null);
  assert.equal(calls, 0);
});

test("a metadata read rejects redirects and keeps the timeout at ten seconds", () => {
  assert.equal(NFT_TOKEN_METADATA_TIMEOUT_MS, 10_000);
});

test("the fetch sets redirect error and an immutable data-cache window", async () => {
  let seen;
  const result = await fetchNftTokenMetadata(GATEWAY_HOST_URL, {
    fetchImpl: async (_url, init) => {
      seen = init;
      return new Response(JSON.stringify({ name: "Cached" }), { status: 200 });
    },
  });
  assert.equal(result?.name, "Cached");
  assert.equal(seen.redirect, "error");
  assert.equal(seen.next.revalidate, 3600);
});

test("an oversized metadata body is refused while streaming", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(NFT_METADATA_MAX_BYTES + 1));
      controller.close();
    },
  });
  const result = await fetchNftTokenMetadata(`ipfs://${CID}/metadata.json`, {
    fetchImpl: async () => new Response(body, { status: 200 }),
  });
  assert.equal(result, null);
});
