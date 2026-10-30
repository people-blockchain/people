import test from "node:test";
import assert from "node:assert/strict";
import {
  TokenMetadataError,
  TokenMetadataPinError,
  buildTokenMetadata,
  createTokenWithMetadata,
  pinTokenMetadataForCreate,
} from "../src/lib/factory/token-metadata.ts";

const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const ICON = `ipfs://${CID}/icon.png`;

test("metadata with a logo carries the image and is pinned verbatim", async () => {
  let received;
  let created = null;
  const out = await createTokenWithMetadata({
    input: { name: " Neighbourhood ", symbol: "NBH", image: ICON },
    pin: async (json) => {
      received = json;
      return { uri: `ipfs://${CID}/metadata.json` };
    },
    create: async (metadataURI) => {
      created = metadataURI;
      return "0xhash";
    },
  });
  assert.deepEqual(received, { name: "Neighbourhood", symbol: "NBH", description: "", image: ICON });
  assert.equal(out.metadataURI, `ipfs://${CID}/metadata.json`);
  assert.equal(created, `ipfs://${CID}/metadata.json`);
  assert.equal(out.result, "0xhash");
});

test("metadata without a logo has no image key at all", async () => {
  let received;
  const uri = await pinTokenMetadataForCreate({ name: "Plain", symbol: "PLN", image: null }, async (json) => {
    received = json;
    return `ipfs://${CID}/metadata.json`;
  });
  assert.equal(uri, `ipfs://${CID}/metadata.json`);
  assert.ok(!("image" in received));
  assert.ok(!("image" in buildTokenMetadata({ name: "Plain", symbol: "PLN" })));
  assert.ok(!("image" in buildTokenMetadata({ name: "Plain", symbol: "PLN", image: "" })));
});

test("a pin failure never calls create and raises TokenMetadataPinError with a locale key", async () => {
  let createCalls = 0;
  await assert.rejects(
    createTokenWithMetadata({
      input: { name: "Plain", symbol: "PLN" },
      pin: async () => {
        throw new Error("storage_unavailable");
      },
      create: async () => {
        createCalls += 1;
        return "0xhash";
      },
    }),
    (err) => {
      assert.ok(err instanceof TokenMetadataPinError);
      assert.equal(err.code, "pin_failed");
      assert.equal(err.localeKey, "tokenMetadataPinFailed");
      return true;
    },
  );
  assert.equal(createCalls, 0);
});

test("an invalid returned URI is refused before create", async () => {
  const bad = [
    "ipfs://people/PLN",
    `ipfs://${CID}`,
    `ipfs://${CID}/icon.png`,
    `https://example.com/${CID}/metadata.json`,
    "ipfs://notacid/metadata.json",
    "",
    { uri: undefined },
  ];
  for (const value of bad) {
    let createCalls = 0;
    await assert.rejects(
      createTokenWithMetadata({
        input: { name: "Plain", symbol: "PLN" },
        pin: async () => value,
        create: async () => {
          createCalls += 1;
        },
      }),
      (err) => err instanceof TokenMetadataPinError && err.code === "invalid_pin_uri",
    );
    assert.equal(createCalls, 0);
  }
});

test("invalid fields and blob:/data: images are rejected with typed codes", async () => {
  const cases = [
    [{ name: "", symbol: "X" }, "invalid_name"],
    [{ name: "N", symbol: "  " }, "invalid_symbol"],
    [{ name: "N", symbol: "X", description: "d".repeat(2001) }, "invalid_description"],
    [{ name: "N", symbol: "X", image: "blob:https://example.org/uuid" }, "invalid_image_uri"],
    [{ name: "N", symbol: "X", image: "data:image/png;base64,AAAA" }, "invalid_image_uri"],
    [{ name: "N", symbol: "X", image: "http://example.com/a.png" }, "invalid_image_uri"],
    [{ name: 5, symbol: "X" }, "invalid_name"],
  ];
  for (const [input, code] of cases) {
    assert.throws(() => buildTokenMetadata(input), (err) => err instanceof TokenMetadataError && err.code === code);
    let pinCalls = 0;
    await assert.rejects(
      pinTokenMetadataForCreate(input, async () => {
        pinCalls += 1;
        return `ipfs://${CID}/metadata.json`;
      }),
      (err) => err instanceof TokenMetadataPinError && err.code === code,
    );
    assert.equal(pinCalls, 0);
  }
  assert.equal(buildTokenMetadata({ name: "N", symbol: "X", image: "https://example.com/a.png" }).image, "https://example.com/a.png");
});
