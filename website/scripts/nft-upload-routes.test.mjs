// Route handlers are called directly with a stubbed Pinata/gateway (global fetch) and the
// in-memory rate limiter: no live storage, no database, no real key.
import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { readFileSync } from "node:fs";
import { resetRateLimitStoresForTests, setSharedRateLimitBackendForTests } from "../src/lib/api-rate-limit.ts";
import { POST as imageRoute } from "../src/app/api/factory/nft/image/route.ts";
import { POST as signRoute } from "../src/app/api/factory/nft/video/sign/route.ts";
import { POST as verifyRoute } from "../src/app/api/factory/nft/video/verify/route.ts";
import { POST as metadataRoute } from "../src/app/api/factory/nft/metadata/route.ts";

const fixture = (name) => readFileSync(new URL(`./fixtures/nft-media/${name}`, import.meta.url));
const DIR_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const VIDEO_CID = "QmYwAPJzv5CZsnA625s3Xv2gteR83C12YCZqGbv3bdgqm4";

const realFetch = globalThis.fetch;
const previousJwt = process.env.PINATA_JWT;
let pinned;
let deleted;
let fileRecord;
let gateway;
let signStatus;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  process.env.PINATA_JWT = "test-jwt-not-a-real-key";
  setSharedRateLimitBackendForTests(null);
  resetRateLimitStoresForTests();
  pinned = [];
  deleted = [];
  signStatus = 200;
  fileRecord = { id: "file-1234", cid: VIDEO_CID, size: fixture("video.mp4").length, mime_type: "video/mp4" };
  gateway = { status: 206, bytes: fixture("video.mp4").subarray(0, 4096) };
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target === "https://api.pinata.cloud/pinning/pinFileToIPFS") {
      const file = init.body.get("file");
      pinned.push({ name: file.name, type: file.type, bytes: Buffer.from(await file.arrayBuffer()), wrap: init.body.get("pinataOptions") });
      return json({ IpfsHash: DIR_CID });
    }
    if (target === "https://uploads.pinata.cloud/v3/files/sign") {
      return signStatus === 200 ? json({ data: "https://uploads.pinata.cloud/v3/files/token" }) : json({}, signStatus);
    }
    if (target.startsWith("https://api.pinata.cloud/v3/files/public/")) {
      if (init.method === "DELETE") {
        deleted.push(target.split("/").pop());
        return json({});
      }
      return json({ data: fileRecord });
    }
    if (target.includes(`/${VIDEO_CID}`)) {
      if (!gateway) throw new Error("gateway down");
      return new Response(gateway.bytes, { status: gateway.status });
    }
    throw new Error(`unexpected fetch ${target}`);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (previousJwt === undefined) delete process.env.PINATA_JWT;
  else process.env.PINATA_JWT = previousJwt;
  setSharedRateLimitBackendForTests(undefined);
});

function imageRequest(bytes, name, type) {
  const form = new FormData();
  form.append("file", new File([bytes], name, { type }));
  return new Request("http://localhost/api/factory/nft/image", { method: "POST", body: form });
}
const jsonRequest = (url, body) =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("image route: raster is pinned as is inside a directory", async () => {
  const res = await imageRoute(imageRequest(fixture("image.png"), "a.png", "image/png"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.uri, `ipfs://${DIR_CID}/image.png`);
  assert.equal(body.kind, "png");
  assert.equal(body.sanitizedSvgBase64, undefined);
  assert.equal(pinned.length, 1);
  assert.equal(pinned[0].name, "image.png");
  assert.equal(pinned[0].wrap, JSON.stringify({ wrapWithDirectory: true }));
  assert.deepEqual(pinned[0].bytes, fixture("image.png"));
});

test("image route: SVG is sanitized before pinning and the raw file is never returned", async () => {
  const res = await imageRoute(imageRequest(fixture("malicious.svg"), "x.svg", "image/svg+xml"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.kind, "svg");
  assert.equal(body.uri, `ipfs://${DIR_CID}/image.svg`);
  const stored = pinned[0].bytes.toString();
  assert.ok(!/script|onload|foreignObject|iframe|evil|<image/.test(stored), stored);
  assert.match(stored, /<rect[^>]*fill="blue"/);
  assert.equal(pinned[0].type, "image/svg+xml");
  const echoed = Buffer.from(body.sanitizedSvgBase64, "base64");
  assert.deepEqual(echoed, pinned[0].bytes);
  assert.ok(!JSON.stringify(body).includes("script"));
});

test("image route: declared type must match the real bytes (415)", async () => {
  let res = await imageRoute(imageRequest(fixture("image.png"), "a.svg", "image/svg+xml"));
  assert.equal(res.status, 415);
  assert.equal((await res.json()).error, "content_type_mismatch");
  res = await imageRoute(imageRequest(fixture("clean.svg"), "a.png", "image/png"));
  assert.equal(res.status, 415);
  res = await imageRoute(imageRequest(Buffer.from("<html><script>1</script></html>"), "a.svg", "image/svg+xml"));
  assert.equal(res.status, 415);
  res = await imageRoute(imageRequest(Buffer.from("GIF89a...."), "a.gif", "image/gif"));
  assert.equal(res.status, 415);
  assert.equal((await res.json()).error, "content_type_mismatch");
  res = await imageRoute(imageRequest(Buffer.from("BM......"), "a.bmp", "image/bmp"));
  assert.equal(res.status, 415);
  assert.equal((await res.json()).error, "unsupported_type");
  assert.equal(pinned.length, 0);
});

test("image route: oversize files and unusable SVG are refused", async () => {
  const big = Buffer.concat([fixture("image.png"), Buffer.alloc(1_500_000)]);
  let res = await imageRoute(imageRequest(big, "a.png", "image/png"));
  assert.equal(res.status, 413);
  assert.equal((await res.json()).error, "file_too_large");
  const bigSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${" ".repeat(262_200)}</svg>`);
  res = await imageRoute(imageRequest(bigSvg, "a.svg", "image/svg+xml"));
  assert.equal(res.status, 413);
  res = await imageRoute(imageRequest(Buffer.from('<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>'), "a.svg", "image/svg+xml"));
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, "svg_rejected");
  assert.equal(pinned.length, 0);
});

test("image route: oversize bodies are refused by header, and an endless stream is cut off", async () => {
  const declared = new Request("http://localhost/api/factory/nft/image", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=x", "Content-Length": "3000000" },
    body: "x",
  });
  assert.equal((await imageRoute(declared)).status, 413);

  let pulled = 0;
  const endless = new ReadableStream({
    pull(controller) {
      pulled += 1;
      controller.enqueue(new Uint8Array(100_000));
    },
  });
  const streaming = new Request("http://localhost/api/factory/nft/image", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=x" },
    body: endless,
    duplex: "half",
  });
  assert.equal((await imageRoute(streaming)).status, 413);
  assert.ok(pulled < 40, `read ${pulled} chunks before giving up`);
});

test("image route: rate limit answers 429", async () => {
  let last;
  for (let i = 0; i < 21; i++) last = await imageRoute(imageRequest(fixture("image.png"), "a.png", "image/png"));
  assert.equal(last.status, 429);
  assert.equal((await last.json()).error, "rate_limited");
});

test("routes are disabled with a clear error when storage is not configured", async () => {
  delete process.env.PINATA_JWT;
  let res = await imageRoute(imageRequest(fixture("image.png"), "a.png", "image/png"));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "storage_unavailable");
  res = await signRoute(jsonRequest("/api/factory/nft/video/sign", { type: "video/mp4", size: 100 }));
  assert.equal((await res.json()).error, "video_storage_unavailable");
});

test("video sign: validates type and size, then returns only the signed url", async () => {
  let res = await signRoute(jsonRequest("/api/factory/nft/video/sign", { type: "video/mp4", size: 1000 }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { url: "https://uploads.pinata.cloud/v3/files/token" });
  res = await signRoute(jsonRequest("/api/factory/nft/video/sign", { type: "video/quicktime", size: 1000 }));
  assert.equal(res.status, 415);
  res = await signRoute(jsonRequest("/api/factory/nft/video/sign", { type: "video/mp4", size: 20_000_001 }));
  assert.equal(res.status, 413);
  res = await signRoute(jsonRequest("/api/factory/nft/video/sign", { type: "video/webm", size: 0 }));
  assert.equal(res.status, 400);
  signStatus = 403;
  res = await signRoute(jsonRequest("/api/factory/nft/video/sign", { type: "video/mp4", size: 1000 }));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "video_storage_unavailable");
});

test("video verify: a good file returns ipfs://<cid>", async () => {
  const res = await verifyRoute(jsonRequest("/api/factory/nft/video/verify", { id: "file-1234" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.uri, `ipfs://${VIDEO_CID}`);
  assert.equal(body.type, "video/mp4");
  assert.deepEqual(deleted, []);
});

test("video verify: a bad header, wrong type or oversize file is rejected and deleted", async () => {
  gateway = { status: 206, bytes: Buffer.alloc(4096, 7) };
  let res = await verifyRoute(jsonRequest("/api/factory/nft/video/verify", { id: "file-1234" }));
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, "video_rejected");
  assert.deepEqual(deleted, ["file-1234"]);

  deleted = [];
  gateway = { status: 206, bytes: fixture("video.mp4").subarray(0, 4096) };
  fileRecord = { ...fileRecord, mime_type: "image/png" };
  res = await verifyRoute(jsonRequest("/api/factory/nft/video/verify", { id: "file-1234" }));
  assert.equal(res.status, 422);
  assert.deepEqual(deleted, ["file-1234"]);

  deleted = [];
  fileRecord = { ...fileRecord, mime_type: "video/mp4", size: 20_000_001 };
  res = await verifyRoute(jsonRequest("/api/factory/nft/video/verify", { id: "file-1234" }));
  assert.equal(res.status, 422);
  assert.deepEqual(deleted, ["file-1234"]);
});

test("video verify: an unreachable gateway keeps the file so verification can be retried", async () => {
  gateway = null;
  let res = await verifyRoute(jsonRequest("/api/factory/nft/video/verify", { id: "file-1234" }));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "video_verify_unavailable");
  assert.deepEqual(deleted, []);
  res = await verifyRoute(jsonRequest("/api/factory/nft/video/verify", { id: "../etc" }));
  assert.equal(res.status, 400);
});

test("metadata: video JSON has animation_url and is pinned as metadata.json", async () => {
  const res = await metadataRoute(
    jsonRequest("/api/factory/nft/metadata", {
      name: "Clip",
      description: "A clip",
      image: `ipfs://${DIR_CID}/image.svg`,
      animationUrl: `ipfs://${VIDEO_CID}`,
    }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.tokenUri, `ipfs://${DIR_CID}/metadata.json`);
  assert.equal(pinned[0].name, "metadata.json");
  assert.equal(pinned[0].type, "application/json");
  assert.equal(pinned[0].bytes.toString(), JSON.stringify({ name: "Clip", description: "A clip", image: `ipfs://${DIR_CID}/image.svg`, animation_url: `ipfs://${VIDEO_CID}` }));
});

test("metadata: blob:, data:, a video uri with a path and an oversized description are refused", async () => {
  const image = `ipfs://${DIR_CID}/image.png`;
  const cases = [
    { name: "Ok", image: "blob:https://example.org/uuid" },
    { name: "Ok", image: "data:image/png;base64,AAAA" },
    { name: "Ok", image, animationUrl: `ipfs://${VIDEO_CID}/clip.mp4` },
    { name: "Ok", image, animationUrl: "data:video/mp4;base64,AAAA" },
    { name: "Ok", image, description: "d".repeat(8001) },
    { name: "x", image },
  ];
  for (const payload of cases) {
    const res = await metadataRoute(jsonRequest("/api/factory/nft/metadata", payload));
    assert.equal(res.status, 400, JSON.stringify(payload).slice(0, 80));
  }
  assert.equal(pinned.length, 0);
});
