import assert from "node:assert/strict";
import test from "node:test";

import { buildTokenMetadata, TokenMetadataError } from "../src/lib/token-metadata.ts";

const CID = "QmWBpyJ3M5hqg9en5E95MJk8BycLMGFaJCqDVh5DYP7A54";

test("token metadata has name, symbol and a permanent logo", () => {
  assert.deepEqual(
    buildTokenMetadata({
      name: "People Test Token",
      symbol: "ptt",
      description: "A test token.",
      image: `ipfs://${CID}`,
    }),
    {
      name: "People Test Token",
      symbol: "PTT",
      description: "A test token.",
      image: `ipfs://${CID}`,
    },
  );
});

test("a token without a logo still produces real metadata", () => {
  assert.deepEqual(buildTokenMetadata({ name: "No Logo", symbol: "NL" }), { name: "No Logo", symbol: "NL" });
});

test("token metadata refuses a fake or unsafe image address", () => {
  for (const image of ["blob:https://example.com/x", "data:image/png;base64,AA", "http://example.com/x.png"]) {
    assert.throws(() => buildTokenMetadata({ name: "Bad Image", symbol: "BAD", image }), (err) => {
      assert.ok(err instanceof TokenMetadataError);
      assert.equal(err.code, "invalid_image_uri");
      return true;
    });
  }
});

test("token metadata validates name and symbol", () => {
  assert.throws(() => buildTokenMetadata({ name: "A", symbol: "SYM" }), TokenMetadataError);
  assert.throws(() => buildTokenMetadata({ name: "Good Name", symbol: " " }), (err) => {
    assert.equal(err.code, "invalid_symbol");
    return true;
  });
});
