import test from "node:test";
import assert from "node:assert/strict";

import { displayTokenImageUrl, ipfsGatewayUrlForUri } from "../src/lib/ipfs.ts";
import { resetTokenImageCacheForTests, resolveTokenImageUri } from "../src/lib/evm/token-onchain.ts";

const CID = "QmPaQnZ9dGtPD1Xp1iSttHxUfMkwLMHV6MSit2PkGwktsc";
const IMAGE = `ipfs://${CID}/image.png`;
const META = `ipfs://${CID}/metadata.json`;
const GATEWAY_IMAGE = `https://gateway.pinata.cloud/ipfs/${CID}/image.png`;

test("ipfs gateway conversion keeps the path after the CID", () => {
  assert.equal(ipfsGatewayUrlForUri(IMAGE), GATEWAY_IMAGE);
  assert.equal(ipfsGatewayUrlForUri(META), `https://gateway.pinata.cloud/ipfs/${CID}/metadata.json`);
  assert.equal(displayTokenImageUrl(IMAGE), GATEWAY_IMAGE);
  assert.equal(displayTokenImageUrl("https://cdn.example.com/a.png"), "https://cdn.example.com/a.png");
  assert.equal(displayTokenImageUrl("/tokens/ppl.png"), "/tokens/ppl.png");
});

test("metadata.json resolves to the image, then to a gateway URL that keeps the path", async () => {
  resetTokenImageCacheForTests();
  let fetches = 0;
  const resolved = await resolveTokenImageUri(META, async () => {
    fetches += 1;
    return { name: "Fresh", symbol: "FRSH", description: "A token", image: IMAGE };
  });
  assert.equal(fetches, 1);
  assert.equal(resolved, IMAGE);
  assert.equal(await resolveTokenImageUri(META, async () => {
    fetches += 1;
    return { image: IMAGE };
  }), IMAGE);
  assert.equal(fetches, 1);
  assert.equal(displayTokenImageUrl(resolved), GATEWAY_IMAGE);
  assert.equal(displayTokenImageUrl(resolved).endsWith("/image.png"), true);
  assert.notEqual(displayTokenImageUrl(META), displayTokenImageUrl(resolved));
});
