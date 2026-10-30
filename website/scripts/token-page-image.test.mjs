import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { tokenPageImageSrc, tokenPageImageUrl } from "../src/lib/explorer/token-page-image.ts";

const CID = `Qm${"a".repeat(44)}`;
const GATEWAY = `https://gateway.pinata.cloud/ipfs/${CID}/image.png`;

test("the token page resolver rewrites ipfs metadata images to the gateway", () => {
  assert.equal(tokenPageImageUrl(`ipfs://${CID}/image.png`), GATEWAY);
  assert.equal(tokenPageImageUrl(`ipfs://${CID}/metadata.json`), null);
  assert.equal(tokenPageImageUrl("https://example.com/icon.png"), "https://example.com/icon.png");
  assert.equal(tokenPageImageUrl("/tokens/ppl.png"), "/tokens/ppl.png");
  assert.equal(tokenPageImageUrl(""), null);
  assert.equal(
    tokenPageImageSrc(`ipfs://${CID}/image.png`, `ipfs://${CID}/metadata.json`),
    GATEWAY,
  );
  assert.equal(tokenPageImageSrc(`ipfs://${CID}/metadata.json`, GATEWAY), GATEWAY);
});

test("the token page and the shared image component use that resolver at every width", () => {
  const page = readFileSync(new URL("../src/components/explorer/TokenView.tsx", import.meta.url), "utf8");
  const image = readFileSync(new URL("../src/components/ui/AssetImage.tsx", import.meta.url), "utf8");
  assert.match(page, /tokenPageImageSrc/);
  assert.match(image, /tokenPageImageUrl/);
  assert.doesNotMatch(page, /next\/image/);
  assert.doesNotMatch(image, /next\/image/);
});
