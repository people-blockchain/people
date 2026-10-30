import assert from "node:assert/strict";
import test from "node:test";
import { resolveAssetImageUrl } from "../src/lib/asset-image-src.ts";

const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const CID0 = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";

test("ipfs token icons render through the same-origin proxy", () => {
  assert.equal(resolveAssetImageUrl(`ipfs://${CID}`), `/api/ipfs/${CID}`);
  assert.equal(resolveAssetImageUrl(`  ipfs://${CID}/image.png  `), `/api/ipfs/${CID}/image.png`);
  assert.equal(resolveAssetImageUrl(`ipfs://${CID0}/icon.webp`), `/api/ipfs/${CID0}/icon.webp`);
  assert.equal(resolveAssetImageUrl(`ipfs://${CID}`).includes("ipfs.io"), false);
});

test("site paths and http(s) stay; unsafe and invalid ipfs do not become image URLs", () => {
  assert.equal(resolveAssetImageUrl("/tokens/ppl.png"), "/tokens/ppl.png");
  assert.equal(resolveAssetImageUrl("https://cdn.example/icon.png"), "https://cdn.example/icon.png");
  assert.equal(resolveAssetImageUrl("http://cdn.example/icon.png"), "http://cdn.example/icon.png");
  for (const bad of [
    "",
    "   ",
    null,
    1,
    "//evil.test/x",
    "javascript:alert(1)",
    "data:image/png;base64,aaaa",
    "https://user:pw@cdn.example/a.png",
    "ipfs://not-a-cid",
    `ipfs://${CID}/../x`,
    `ipfs://${CID}/a?b=1`,
  ]) {
    assert.equal(resolveAssetImageUrl(bad), null, String(bad));
  }
});
