import { test } from "node:test";
import assert from "node:assert/strict";

import { tokenImageFromMetadataUri } from "../src/lib/evm/chain-catalog.ts";

test("chain catalog uses ipfs:// and https:// metadata images", () => {
  assert.equal(tokenImageFromMetadataUri("ipfs://bafy-icon"), "ipfs://bafy-icon");
  assert.equal(tokenImageFromMetadataUri("https://example.com/icon.png"), "https://example.com/icon.png");
  assert.equal(tokenImageFromMetadataUri("  ipfs://bafy-icon  "), "ipfs://bafy-icon");
});

test("the old ipfs://people/<SYMBOL> placeholder is ignored", () => {
  assert.equal(tokenImageFromMetadataUri("ipfs://people/NBH"), null);
  assert.equal(tokenImageFromMetadataUri("ipfs://people"), null);
  assert.equal(tokenImageFromMetadataUri("ipfs://people/"), null);
});

test("non-image and unsafe metadata URIs are ignored", () => {
  assert.equal(tokenImageFromMetadataUri("http://example.com/icon.png"), null);
  assert.equal(tokenImageFromMetadataUri("javascript:alert(1)"), null);
  assert.equal(tokenImageFromMetadataUri(""), null);
  assert.equal(tokenImageFromMetadataUri(null), null);
});
