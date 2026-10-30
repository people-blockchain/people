// Route handler called directly with a stubbed Pinata (global fetch) and the in-memory rate limiter.
import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { resetRateLimitStoresForTests, setSharedRateLimitBackendForTests } from "../src/lib/api-rate-limit.ts";
import { POST as metadataRoute } from "../src/app/api/factory/token/metadata/route.ts";
import { pinTokenMetadata } from "../src/lib/token-metadata-client.ts";

const DIR_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const realFetch = globalThis.fetch;
const previousJwt = process.env.PINATA_JWT;
let pinned;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const request = (body) =>
  new Request("http://localhost/api/factory/token/metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  process.env.PINATA_JWT = "test-jwt-not-a-real-key";
  setSharedRateLimitBackendForTests(null);
  resetRateLimitStoresForTests();
  pinned = [];
  globalThis.fetch = async (url, init = {}) => {
    if (String(url) === "https://api.pinata.cloud/pinning/pinFileToIPFS") {
      const file = init.body.get("file");
      pinned.push({ name: file.name, type: file.type, text: await file.text(), wrap: init.body.get("pinataOptions") });
      return json({ IpfsHash: DIR_CID });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (previousJwt === undefined) delete process.env.PINATA_JWT;
  else process.env.PINATA_JWT = previousJwt;
  setSharedRateLimitBackendForTests(undefined);
});

test("token metadata: 503 when storage is not configured", async () => {
  delete process.env.PINATA_JWT;
  const res = await metadataRoute(request({ name: "Plain", symbol: "PLN" }));
  assert.equal(res.status, 503);
  assert.equal(pinned.length, 0);
});

test("token metadata: invalid bodies are 400 and nothing is pinned", async () => {
  const cases = [
    "not json",
    {},
    { name: "Plain" },
    { name: "Plain", symbol: 5 },
    { name: "Plain", symbol: "PLN", image: "blob:https://example.org/uuid" },
    { name: "Plain", symbol: "PLN", image: "data:image/png;base64,AAAA" },
    { name: "Plain", symbol: "PLN", image: 7 },
    { name: "", symbol: "PLN" },
  ];
  for (const payload of cases) {
    const res = await metadataRoute(request(payload));
    assert.equal(res.status, 400, JSON.stringify(payload).slice(0, 80));
  }
  assert.equal(pinned.length, 0);
});

test("token metadata: success pins metadata.json in a directory and omits image without a logo", async () => {
  const res = await metadataRoute(request({ name: " Plain ", symbol: "PLN", json: { image: "ignored" } }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.tokenUri, `ipfs://${DIR_CID}/metadata.json`);
  assert.equal(pinned[0].name, "metadata.json");
  assert.equal(pinned[0].type, "application/json");
  assert.equal(pinned[0].wrap, JSON.stringify({ wrapWithDirectory: true }));
  assert.equal(pinned[0].text, JSON.stringify({ name: "Plain", symbol: "PLN", description: "Plain (PLN) token on PEOPLE" }));
  assert.ok(!("image" in body.json));
});

test("token metadata: with a logo the JSON carries the image, and the client helper returns the uri", async () => {
  const image = `ipfs://${DIR_CID}/icon.png`;
  const res = await metadataRoute(request({ name: "Plain", symbol: "PLN", image }));
  assert.equal(res.status, 200);
  assert.equal(pinned[0].text, JSON.stringify({ name: "Plain", symbol: "PLN", description: "Plain (PLN) token on PEOPLE", image }));

  const viaClient = await pinTokenMetadata({ name: "Plain", symbol: "PLN", image }, async (url, init) => {
    assert.equal(url, "/api/factory/token/metadata");
    return metadataRoute(new Request(`http://localhost${url}`, init));
  });
  assert.equal(viaClient.uri, `ipfs://${DIR_CID}/metadata.json`);
  await assert.rejects(
    pinTokenMetadata({ name: "Plain", symbol: "PLN" }, async () => json({ error: "storage_unavailable" }, 503)),
    /storage_unavailable/,
  );
});
