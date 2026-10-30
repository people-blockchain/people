// Upload size pre-check, response parsing (never raw body text) and the server side of the
// 1.5 MB limit and GIF support. Route code is called directly with a stubbed Pinata fetch.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { beforeEach, afterEach } from "node:test";
import { resetRateLimitStoresForTests, setSharedRateLimitBackendForTests } from "../src/lib/api-rate-limit.ts";
import { POST as nftImageRoute } from "../src/app/api/factory/nft/image/route.ts";
import { processMediaUpload } from "../src/lib/factory-media-upload.ts";
import {
  UPLOAD_MAX_BYTES,
  checkUploadSize,
  parseUploadResponse,
  postUploadForm,
  uploadErrorMessage,
} from "../src/lib/upload-response.ts";
import { checkImageFile, errorKeyForServerCode } from "../src/lib/nft-media-client.ts";
import { uploadNftImage } from "../src/lib/nft-media-client.ts";

const DIR_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const FLAT_CID = "QmYwAPJzv5CZsnA625s3Xv2gteR83C12YCZqGbv3bdgqm4";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const gif = (magic = "GIF89a") => Buffer.concat([Buffer.from(magic, "latin1"), Buffer.from([1, 0, 1, 0, 0x80, 0, 0, 0x3b])]);
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const copy = {
  hint: "hint",
  tooLarge: "too large",
  unsupportedType: "unsupported",
  contentMismatch: "mismatch",
  rateLimited: "rate",
  signIn: "sign in",
  missingFile: "missing",
  network: "network",
  failed: "failed",
};
const PLATFORM_TEXT = "413 FUNCTION_PAYLOAD_TOO_LARGE";

const realFetch = globalThis.fetch;
const previousJwt = process.env.PINATA_JWT;
let pinned;

beforeEach(() => {
  process.env.PINATA_JWT = "test-jwt-not-a-real-key";
  setSharedRateLimitBackendForTests(null);
  resetRateLimitStoresForTests();
  pinned = [];
  globalThis.fetch = async (url, init = {}) => {
    if (String(url) === "https://api.pinata.cloud/pinning/pinFileToIPFS") {
      const file = init.body.get("file");
      pinned.push({ name: file.name, type: file.type, bytes: Buffer.from(await file.arrayBuffer()) });
      return new Response(JSON.stringify({ IpfsHash: pinned.length === 1 ? DIR_CID : FLAT_CID }), { status: 200 });
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

const formRequest = (bytes, name, type, url = "http://localhost/api/factory/media") => {
  const form = new FormData();
  form.append("file", new File([bytes], name, { type }));
  return new Request(url, { method: "POST", body: form });
};

test("size pre-check: the limit itself is accepted, one byte more is not", () => {
  assert.equal(UPLOAD_MAX_BYTES, 1_500_000);
  assert.equal(checkUploadSize(1_500_000), null);
  assert.equal(checkUploadSize(1_500_001), "file_too_large");
  assert.equal(checkUploadSize(1), null);
  assert.equal(checkUploadSize(0), "missing_file");
  assert.equal(checkUploadSize(Number.NaN), "missing_file");
  // The NFT picker uses the same number for rasters.
  assert.equal(checkImageFile({ name: "a.png", type: "image/png", size: 1_500_000 }).ok, true);
  assert.equal(checkImageFile({ name: "a.png", type: "image/png", size: 1_500_001 }).ok, false);
});

test("parseUploadResponse: JSON success and JSON error codes", async () => {
  const ok = await parseUploadResponse(new Response(JSON.stringify({ uri: "ipfs://x" }), { status: 200 }));
  assert.deepEqual(ok, { ok: true, data: { uri: "ipfs://x" } });
  const big = await parseUploadResponse(new Response(JSON.stringify({ error: "file_too_large", maxBytes: 1_500_000 }), { status: 413 }));
  assert.deepEqual(big, { ok: false, status: 413, code: "file_too_large" });
  const mismatch = await parseUploadResponse(new Response(JSON.stringify({ error: "content_type_mismatch" }), { status: 415 }));
  assert.equal(mismatch.code, "content_type_mismatch");
  // An error string we do not know is never passed through; the status decides.
  const odd = await parseUploadResponse(new Response(JSON.stringify({ error: "viem exploded at 0xabc" }), { status: 502 }));
  assert.deepEqual(odd, { ok: false, status: 502, code: "upload_failed" });
  const odd429 = await parseUploadResponse(new Response(JSON.stringify({ error: "whatever" }), { status: 429 }));
  assert.equal(odd429.code, "rate_limited");
});

test("parseUploadResponse: platform 413 text maps to file_too_large without the raw text", async () => {
  const res = new Response(PLATFORM_TEXT, { status: 413, headers: { "Content-Type": "text/plain" } });
  const parsed = await parseUploadResponse(res);
  assert.deepEqual(parsed, { ok: false, status: 413, code: "file_too_large" });
  assert.ok(!JSON.stringify(parsed).includes("FUNCTION_PAYLOAD"));
  assert.equal(uploadErrorMessage(parsed.code, copy), "too large");
});

test("parseUploadResponse: HTML 502, empty body, other statuses and a non-JSON 200", async () => {
  const html = await parseUploadResponse(new Response("<html><body>Bad Gateway</body></html>", { status: 502, headers: { "Content-Type": "text/html" } }));
  assert.deepEqual(html, { ok: false, status: 502, code: "upload_failed" });
  assert.equal(uploadErrorMessage(html.code, copy), "failed");
  assert.equal((await parseUploadResponse(new Response("", { status: 500 }))).code, "upload_failed");
  assert.equal((await parseUploadResponse(new Response(null, { status: 413 }))).code, "file_too_large");
  assert.equal((await parseUploadResponse(new Response("Unsupported Media Type", { status: 415 }))).code, "unsupported_type");
  assert.equal((await parseUploadResponse(new Response("slow down", { status: 429 }))).code, "rate_limited");
  assert.equal((await parseUploadResponse(new Response("Unauthorized", { status: 401 }))).code, "sign_in_required");
  assert.equal((await parseUploadResponse(new Response("not json", { status: 200 }))).code, "upload_failed");
  assert.equal((await parseUploadResponse(new Response("[1,2]", { status: 200 }))).ok, false);
});

test("postUploadForm: a network failure is a network code, not an exception", async () => {
  const throwing = async () => {
    throw new TypeError("Failed to fetch");
  };
  const parsed = await postUploadForm("/api/factory/media", new FormData(), throwing);
  assert.deepEqual(parsed, { ok: false, status: 0, code: "network" });
  assert.equal(uploadErrorMessage(parsed.code, copy), "network");
  const text413 = await postUploadForm("/x", new FormData(), async () => new Response(PLATFORM_TEXT, { status: 413 }));
  assert.equal(text413.code, "file_too_large");
});

test("uploadErrorMessage covers every code with a localized string, never the raw code", () => {
  const codes = ["file_too_large", "unsupported_type", "content_type_mismatch", "rate_limited", "sign_in_required", "missing_file", "network", "upload_failed", "pin_failed"];
  for (const code of codes) assert.ok(!uploadErrorMessage(code, copy).includes("_"), code);
});

test("nft client: platform 413 text and HTML 502 become copy keys; oversize is refused before sending", async () => {
  const file = new File([PNG], "a.png", { type: "image/png" });
  await assert.rejects(
    uploadNftImage(file, "image/png", async () => new Response(PLATFORM_TEXT, { status: 413 })),
    (err) => err.key === "errTooLarge" && !String(err.detail).includes("FUNCTION"),
  );
  await assert.rejects(
    uploadNftImage(file, "image/png", async () => new Response("<html>x</html>", { status: 502 })),
    (err) => err.key === "errPinFailed",
  );
  await assert.rejects(
    uploadNftImage(file, "image/png", async () => {
      throw new TypeError("offline");
    }),
    (err) => err.key === "errNetwork",
  );
  let sent = false;
  const big = new File([new Uint8Array(1_500_001)], "big.png", { type: "image/png" });
  await assert.rejects(
    uploadNftImage(big, "image/png", async () => {
      sent = true;
      return new Response("{}");
    }),
    (err) => err.key === "errTooLarge",
  );
  assert.equal(sent, false);
  assert.equal(errorKeyForServerCode("upload_failed"), "errPinFailed");
});

test("factory media route: oversize returns JSON 413 by header and by file size", async () => {
  const declared = new Request("http://localhost/api/factory/media", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=x", "Content-Length": "4600000" },
    body: "x",
  });
  let res = await processMediaUpload(declared);
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { error: "file_too_large", maxBytes: 1_500_000 });

  // Passes the body cap (limit + multipart slack) but is over the file limit.
  const slightlyBig = Buffer.concat([PNG, Buffer.alloc(1_500_000 - PNG.length + 1)]);
  res = await processMediaUpload(formRequest(slightlyBig, "a.png", "image/png"));
  assert.equal(res.status, 413);
  assert.equal((await res.json()).error, "file_too_large");

  const exact = Buffer.concat([PNG, Buffer.alloc(1_500_000 - PNG.length)]);
  res = await processMediaUpload(formRequest(exact, "a.png", "image/png"));
  assert.equal(res.status, 200);
  assert.equal(pinned.length, 1);
});

test("factory media route: GIF is accepted byte for byte, bad bytes are rejected", async () => {
  for (const magic of ["GIF89a", "GIF87a"]) {
    pinned = [];
    const bytes = gif(magic);
    const res = await processMediaUpload(formRequest(bytes, "a.gif", "image/gif"));
    assert.equal(res.status, 200, magic);
    const body = await res.json();
    assert.equal(body.persisted, true);
    assert.equal(pinned.length, 1);
    assert.equal(pinned[0].type, "image/gif");
    assert.ok(pinned[0].name.endsWith(".gif"));
    assert.ok(pinned[0].bytes.equals(bytes), "stored bytes equal the upload");
    assert.equal(sha256(pinned[0].bytes), sha256(bytes));
    assert.equal(body.sha256, sha256(bytes));
  }
  pinned = [];
  let res = await processMediaUpload(formRequest(PNG, "a.gif", "image/gif"));
  assert.equal(res.status, 415);
  assert.equal((await res.json()).error, "content_type_mismatch");
  res = await processMediaUpload(formRequest(gif(), "a.png", "image/png"));
  assert.equal(res.status, 415);
  res = await processMediaUpload(formRequest(Buffer.from("GIF89a"), "a.gif", "image/gif"));
  assert.equal(res.status, 415);
  res = await processMediaUpload(formRequest(Buffer.from("BM......"), "a.bmp", "image/bmp"));
  assert.equal((await res.json()).error, "unsupported_type");
  assert.equal(pinned.length, 0);
});

test("nft image route: oversize is JSON 413 with maxBytes; GIF is pinned as is", async () => {
  const req = formRequest(Buffer.concat([PNG, Buffer.alloc(1_500_000)]), "a.png", "image/png", "http://localhost/api/factory/nft/image");
  let res = await nftImageRoute(req);
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { error: "file_too_large", maxBytes: 1_500_000 });

  const declared = new Request("http://localhost/api/factory/nft/image", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=x", "Content-Length": "4600000" },
    body: "x",
  });
  res = await nftImageRoute(declared);
  assert.equal(res.status, 413);
  assert.equal((await res.json()).error, "file_too_large");

  const bytes = gif();
  res = await nftImageRoute(formRequest(bytes, "a.gif", "image/gif", "http://localhost/api/factory/nft/image"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.kind, "gif");
  assert.equal(body.uri, `ipfs://${DIR_CID}/image.gif`);
  assert.equal(pinned[0].type, "image/gif");
  assert.ok(pinned[0].bytes.equals(bytes));
  assert.equal(sha256(pinned[0].bytes), sha256(bytes));
  assert.equal(body.sha256, sha256(bytes));

  pinned = [];
  res = await nftImageRoute(formRequest(PNG, "a.gif", "image/gif", "http://localhost/api/factory/nft/image"));
  assert.equal(res.status, 415);
  assert.equal((await res.json()).error, "content_type_mismatch");
  assert.equal(pinned.length, 0);
});
