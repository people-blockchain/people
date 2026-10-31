import test from "node:test";
import assert from "node:assert/strict";

import {
  assetImageAfterError,
  assetImageSources,
  ipfsContentKey,
  ipfsGatewayCandidates,
  PUBLIC_IPFS_GATEWAY_BASES,
} from "../src/lib/ipfs.ts";
import { mergeCatalogTokens } from "../src/lib/evm/chain-catalog.ts";
import { withStableImage } from "../src/lib/token-image-merge.ts";

const CID = "QmPaQnZ9dGtPD1Xp1iSttHxUfMkwLMHV6MSit2PkGwktsc";
const PATH = `/${CID}/image.png`;

test("gateway fallback rewrites one CID through pinata, ipfs.io, dweb.link, w3s.link and cloudflare", () => {
  const pinata = `https://gateway.pinata.cloud/ipfs${PATH}`;
  const expected = [
    ...PUBLIC_IPFS_GATEWAY_BASES.map((base) => `${base}${PATH}`),
    `https://gateway.pinata.cloud/ipfs${PATH}`,
  ];
  assert.deepEqual(ipfsGatewayCandidates(pinata), expected);
  assert.deepEqual(ipfsGatewayCandidates(`ipfs://${CID}/image.png`), expected);
  assert.equal(ipfsContentKey(pinata), ipfsContentKey(`https://ipfs.io/ipfs${PATH}`));
  assert.equal(assetImageSources(pinata).at(-1), pinata);
});

test("image errors walk every gateway and one short retry before the letter fallback", () => {
  const sources = assetImageSources(`ipfs://${CID}/image.png`);
  let index = 0;
  let failed = false;
  for (let step = 0; step < sources.length; step++) {
    const next = assetImageAfterError(index, sources.length);
    index = next.index;
    failed = next.failed;
  }
  assert.equal(failed, true);
  assert.equal(index, sources.length);
  const https = assetImageSources("https://cdn.example.com/icon.png");
  assert.deepEqual(https, ["https://cdn.example.com/icon.png", "https://cdn.example.com/icon.png"]);
  assert.equal(assetImageAfterError(0, https.length).failed, false);
  assert.equal(assetImageAfterError(1, https.length).failed, true);
});

test("a later catalog merge keeps a known imageUri", () => {
  const image = `https://gateway.pinata.cloud/ipfs${PATH}`;
  const previous = {
    assetId: "0x" + "ab".repeat(20),
    tokenAddress: "0x" + "ab".repeat(20),
    name: "Widget",
    symbol: "WGT",
    decimals: 18,
    totalSupply: 1,
    creator: "0x" + "11".repeat(20),
    status: "active",
    type: "token",
    verified: false,
    imageUri: image,
    creationMetadata: { image },
  };
  const incoming = { ...previous, imageUri: "", creationMetadata: {}, name: "Widget 2" };
  const merged = withStableImage(previous, incoming);
  assert.equal(merged.imageUri, image);
  assert.equal(merged.creationMetadata.image, image);
  assert.equal(merged.name, "Widget 2");
  const rows = mergeCatalogTokens([previous], [{ ...incoming, imageUri: undefined, creationMetadata: undefined }]);
  assert.equal(rows[0].imageUri, image);
  assert.equal(rows[0].creationMetadata.image, image);
  const doc = image.replace(/\/[^/]+$/, "/metadata.json");
  const kept = withStableImage(previous, { ...incoming, imageUri: doc, creationMetadata: { image: doc } });
  assert.equal(kept.imageUri, image);
  assert.equal(kept.creationMetadata.image, image);
  const replaced = withStableImage(
    { ...previous, imageUri: doc, creationMetadata: { image: doc } },
    { ...incoming, imageUri: image, creationMetadata: { image } },
  );
  assert.equal(replaced.imageUri, image);
  assert.equal(replaced.creationMetadata.image, image);
});
