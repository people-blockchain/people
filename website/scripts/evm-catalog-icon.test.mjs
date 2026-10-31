import { test } from "node:test";
import assert from "node:assert/strict";

import { applyTokenImage, tokenImageFromMetadataUri } from "../src/lib/evm/chain-catalog.ts";

test("chain catalog uses ipfs:// and https:// metadata images", () => {
  assert.equal(tokenImageFromMetadataUri("ipfs://bafy-icon"), "ipfs://bafy-icon");
  assert.equal(tokenImageFromMetadataUri("https://example.com/icon.png"), "https://example.com/icon.png");
  assert.equal(tokenImageFromMetadataUri("  ipfs://bafy-icon  "), "ipfs://bafy-icon");
});

test("the old ipfs://people/<SYMBOL> placeholder is ignored", () => {
  assert.equal(tokenImageFromMetadataUri("ipfs://people/NBH"), null);
  assert.equal(tokenImageFromMetadataUri("ipfs://people"), null);
  assert.equal(tokenImageFromMetadataUri("ipfs://people/"), null);
  assert.equal(
    tokenImageFromMetadataUri("ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/metadata.json"),
    null,
  );
  assert.equal(tokenImageFromMetadataUri("https://example.com/t/metadata.json"), null);
});

test("non-image and unsafe metadata URIs are ignored", () => {
  assert.equal(tokenImageFromMetadataUri("http://example.com/icon.png"), null);
  assert.equal(tokenImageFromMetadataUri("javascript:alert(1)"), null);
  assert.equal(tokenImageFromMetadataUri(""), null);
  assert.equal(tokenImageFromMetadataUri(null), null);
});

test("the shared image helper prefers an owner override, then seed image, then metadataURI", () => {
  const row = { assetId: "0xtoken", imageUri: "/seed/tTOKEN.svg", creationMetadata: { image: "/seed/tTOKEN.svg", testnet: true } };
  assert.equal(applyTokenImage(row, "https://example.com/owner.png", "ipfs://chain-icon").imageUri, "https://example.com/owner.png");
  assert.equal(applyTokenImage({ ...row, imageUri: undefined }, undefined, "ipfs://chain-icon").imageUri, "ipfs://chain-icon");
  assert.equal(applyTokenImage(row, undefined, "ipfs://chain-icon").imageUri, "/seed/tTOKEN.svg");
  assert.equal(applyTokenImage({ assetId: "0xtoken" }, undefined, "ipfs://new-icon").imageUri, "ipfs://new-icon");
  const doc = "https://gateway.pinata.cloud/ipfs/bafy/metadata.json";
  const logo = "https://gateway.pinata.cloud/ipfs/bafy/logo.png";
  assert.equal(
    applyTokenImage({ assetId: "0xtoken", imageUri: doc, creationMetadata: { image: doc } }, undefined, logo).imageUri,
    logo,
  );
  assert.equal(applyTokenImage({ assetId: "0xtoken", imageUri: logo }, undefined, doc).imageUri, logo);
});
