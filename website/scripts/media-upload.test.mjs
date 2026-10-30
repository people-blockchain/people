// Direct upload: injected fetch, in-memory nonce and rate limit. No live network and no real key.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test, { beforeEach, afterEach } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import { resetRateLimitStoresForTests, setSharedRateLimitBackendForTests } from "../src/lib/api-rate-limit.ts";
import {
  UploadSignRateStoreError,
  allowDirectUploadSignIp,
  resetUploadSignRatesForTests,
  setUploadSignRateMemoryForTests,
} from "../src/lib/upload-sign-rate-store.ts";
import { GET as nonceRoute } from "../src/app/api/factory/upload/nonce/route.ts";
import { POST as signRoute } from "../src/app/api/factory/upload/sign/route.ts";
import { POST as verifyRoute } from "../src/app/api/factory/upload/verify/route.ts";
import { MediaUploadError, mediaUploadText, uploadDirect, MEDIA_UPLOAD_CODES } from "../src/lib/media-upload-client.ts";
import { directUploadAlertText } from "../src/components/factory/nft/saveNftFiles.ts";
import { nftMediaCopy } from "../src/lib/nft-media-copy.ts";
import { mediaUploadCopy } from "../src/lib/media-upload-copy.ts";
import { sniffDirectMedia } from "../src/lib/media-upload-magic.ts";
import { DIRECT_UPLOAD_RATE, directUploadAddressAllowed } from "../src/lib/media-upload-rate.ts";
import {
  declaredUploadSizeError,
  DIRECT_UPLOAD_MAX_BYTES,
  DIRECT_UPLOAD_NONCE_TTL_MS,
  directUploadSignMessage,
  downloadedBytesMatchDeclaration,
  mimeAllowedForKind,
  validateDirectUploadFields,
} from "../src/lib/media-upload-rules.ts";
import { createPinataSignedVideoUpload } from "../src/lib/ipfs.ts";
import { resetPinataGatewayCacheForTests } from "../src/lib/pinata-private-access.ts";
import { PINATA_UPLOAD_NETWORK, createPinataSignedUpload, pinataSignedUploadMaxBytes } from "../src/lib/pinata-signed-upload.ts";
import { issueUploadNonce, resetUploadNoncesForTests } from "../src/lib/upload-nonce-store.ts";

const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const realFetch = globalThis.fetch;
const previousJwt = process.env.PINATA_JWT;

let signBodies;
let deleted;
let deleteCalls;
let deleteStatus;
let fileRecord;
let gatewayBytes;
let gatewayRange;
let verifyBodies;
let gatewayStatus;
let gatewayStream;
let gatewayChunks;
let downloadLinkStatus;
let publicCid;
let publicUploads;
let downloadLinks;
let legacyPublic;
let listedPublicIds;

const PRIVATE_BYTES = "https://cdn.example.test/private-bytes";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const freshAccount = () => privateKeyToAccount(`0x${randomBytes(32).toString("hex")}`);
const jsonRequest = (url, body, headers = {}) =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  process.env.PINATA_JWT = "test-jwt-not-a-real-key";
  setSharedRateLimitBackendForTests(null);
  resetRateLimitStoresForTests();
  resetUploadSignRatesForTests();
  resetUploadNoncesForTests();
  signBodies = [];
  deleted = [];
  deleteCalls = [];
  deleteStatus = 200;
  fileRecord = { id: "file-1234", cid: CID, size: 1, mime_type: "image/png" };
  gatewayBytes = null;
  gatewayRange = undefined;
  verifyBodies = [];
  gatewayStatus = 200;
  gatewayStream = false;
  gatewayChunks = 0;
  downloadLinkStatus = 200;
  publicCid = CID;
  publicUploads = [];
  downloadLinks = [];
  legacyPublic = false;
  listedPublicIds = ["file-1234", "file-5678"];
  resetPinataGatewayCacheForTests();
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target === "https://uploads.pinata.cloud/v3/files/sign") {
      signBodies.push(JSON.parse(init.body));
      return json({ data: "https://uploads.pinata.cloud/v3/files/token" });
    }
    if (target === "https://uploads.pinata.cloud/v3/files") {
      publicUploads.push(init.body);
      return json({ data: { id: "pub-file-1", cid: publicCid } });
    }
    if (target === "https://api.pinata.cloud/v3/gateways") {
      if (gatewayStatus !== 200) return json({}, gatewayStatus);
      return json({ data: { rows: [{ domain: "dedicated" }] } });
    }
    if (target === "https://api.pinata.cloud/v3/files/private/download_link") {
      downloadLinks.push(JSON.parse(init.body));
      if (downloadLinkStatus !== 200) return json({}, downloadLinkStatus);
      return json({ data: PRIVATE_BYTES });
    }
    if (target.startsWith("https://api.pinata.cloud/v3/files/")) {
      if (target.includes("?cid=")) return json({ data: { files: listedPublicIds.map((id) => ({ id, cid: CID })) } });
      if (init.method === "DELETE") {
        deleteCalls.push({ url: target, method: "DELETE" });
        deleted.push(target.split("/").pop());
        return json({}, deleteStatus);
      }
      const isPrivate = target.includes("/files/private/");
      if (isPrivate && legacyPublic) return json({}, 404);
      if (!isPrivate && !legacyPublic) return json({}, 404);
      return json({ data: fileRecord });
    }
    const publicGateway = `https://gateway.pinata.cloud/ipfs/${CID}`;
    if ((target === PRIVATE_BYTES || (legacyPublic && target === publicGateway)) && gatewayBytes) {
      gatewayRange = new Headers(init.headers).get("range");
      if (!gatewayStream) return new Response(gatewayBytes);
      const source = gatewayBytes;
      const chunkSize = 64 * 1024;
      let offset = 0;
      return new Response(
        new ReadableStream({
          pull(controller) {
            if (offset >= source.length) {
              controller.close();
              return;
            }
            const end = Math.min(offset + chunkSize, source.length);
            controller.enqueue(Uint8Array.from(source.subarray(offset, end)));
            offset = end;
            gatewayChunks += 1;
          },
        }),
      );
    }
    throw new Error(`unexpected fetch ${target}`);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (previousJwt === undefined) delete process.env.PINATA_JWT;
  else process.env.PINATA_JWT = previousJwt;
  setSharedRateLimitBackendForTests(undefined);
  resetUploadNoncesForTests();
});

async function signedBody(account, fields) {
  const nonceRes = await nonceRoute(new Request(`http://localhost/api/factory/upload/nonce?address=${account.address}`));
  assert.equal(nonceRes.status, 200);
  const issued = await nonceRes.json();
  const message = directUploadSignMessage({
    domain: issued.domain,
    address: account.address,
    nonce: issued.nonce,
    kind: fields.kind,
    type: fields.type,
    size: fields.size,
    sha256: fields.sha256,
    expiry: issued.expiry,
  });
  const signature = await account.signMessage({ message });
  return { ...fields, address: account.address, signature, nonce: issued.nonce };
}

test("rules accept GIF and a size above the legacy image cap, and reject past 25 MB", () => {
  assert.equal(DIRECT_UPLOAD_MAX_BYTES, 25_000_000);
  assert.equal(mimeAllowedForKind("nft-image", "image/gif"), true);
  assert.equal(mimeAllowedForKind("token-icon", "image/gif"), false);
  assert.equal(mimeAllowedForKind("nft-video", "video/mp4"), true);
  assert.equal(mimeAllowedForKind("nft-video", "video/quicktime"), false);
  const gif = validateDirectUploadFields({
    kind: "nft-image",
    type: "image/gif",
    size: 2_000_000,
    sha256: "ab".repeat(32),
  });
  assert.equal(gif.ok, true);
  const huge = validateDirectUploadFields({
    kind: "nft-image",
    type: "image/png",
    size: DIRECT_UPLOAD_MAX_BYTES + 1,
    sha256: "ab".repeat(32),
  });
  assert.equal(huge.ok, false);
  assert.equal(huge.error, "file_too_large");
  assert.equal(sniffDirectMedia(Buffer.from("GIF89a rest")), "image/gif");
  assert.equal(sniffDirectMedia(Buffer.from("GIF87a rest")), "image/gif");
  assert.notEqual(sniffDirectMedia(Buffer.from("GIF89a rest")), "image/png");
});

test("files over 25 MB are rejected before any fetch", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response("no");
  };
  const file = { size: DIRECT_UPLOAD_MAX_BYTES + 1, type: "image/png", name: "big.png" };
  await assert.rejects(
    () => uploadDirect(file, "nft-image", { fetchImpl }),
    (err) => err instanceof MediaUploadError && err.code === "file_too_large",
  );
  assert.equal(calls, 0);
});

test("GIF is accepted and the signed URL is bound to that type and the declared size", async () => {
  const account = freshAccount();
  const fields = { kind: "nft-image", type: "image/gif", size: 2_000_000, sha256: "ab".repeat(32) };
  const body = await signedBody(account, fields);
  const res = await signRoute(jsonRequest("/api/factory/upload/sign", body));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).url, "https://uploads.pinata.cloud/v3/files/token");
  assert.equal(signBodies.length, 1);
  assert.deepEqual(signBodies[0].allow_mime_types, ["image/gif"]);
  assert.equal(signBodies[0].max_file_size, pinataSignedUploadMaxBytes(2_000_000));
  assert.equal(PINATA_UPLOAD_NETWORK, "private");
  assert.equal(signBodies[0].network, "private");
  assert.equal(signBodies[0].expires, 120);
  const icon = await signRoute(
    jsonRequest("/api/factory/upload/sign", { kind: "token-icon", type: "image/gif", size: 10, sha256: "ab".repeat(32) }),
  );
  assert.equal(icon.status, 415);
  assert.equal((await icon.json()).error, "unsupported_format");
});

test("verify accepts GIF bytes and returns size, mime and sha256", async () => {
  const bytes = Buffer.from("GIF89a-original");
  fileRecord = { id: "file-1234", cid: CID, size: bytes.length, mime_type: "image/gif" };
  gatewayBytes = bytes;
  const sha256 = hash(bytes);
  const res = await verifyRoute(
    jsonRequest("/api/factory/upload/verify", { id: "file-1234", kind: "nft-image", sha256, size: bytes.length }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.uri, `ipfs://${CID}`);
  assert.equal(body.size, bytes.length);
  assert.equal(body.mime, "image/gif");
  assert.equal(body.sha256, sha256);
  assert.equal(gatewayRange, null);
  assert.equal(downloadLinks.length, 1);
  assert.equal(downloadLinks[0].expires, 60);
  assert.equal(downloadLinks[0].method, "GET");
  assert.equal(downloadLinks[0].url, `https://dedicated.mypinata.cloud/files/${CID}`);
  assert.equal(publicUploads.length, 1);
  assert.equal(publicUploads[0].get("network"), "public");
  assert.deepEqual(deleted, ["file-1234"]);
  assert.equal(deleteCalls[0].url, "https://api.pinata.cloud/v3/files/private/file-1234");
});

test("a multi-block file passes when Pinata's DAG size is larger than the declared file length", async () => {
  const bytes = Buffer.from("GIF89a-multiblock-payload");
  fileRecord = { id: "file-1234", cid: CID, size: bytes.length + 80_000, mime_type: "image/gif" };
  gatewayBytes = bytes;
  const sha256 = hash(bytes);
  const res = await verifyRoute(
    jsonRequest("/api/factory/upload/verify", { id: "file-1234", kind: "nft-image", sha256, size: bytes.length }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.size, bytes.length);
  assert.equal(body.sha256, sha256);
  assert.equal(gatewayRange, null);
  assert.equal(publicUploads.length, 1);
  assert.deepEqual(deleted, ["file-1234"]);
  assert.equal(downloadedBytesMatchDeclaration(bytes.length, bytes.length + 80_000, bytes.length, false), true);
  assert.equal(declaredUploadSizeError(DIRECT_UPLOAD_MAX_BYTES + 1), "file_too_large");
});

function paintPng(bytes) {
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
}

function paintMp4(bytes) {
  bytes.write("ftyp", 4, "ascii");
  bytes.write("isom", 8, "ascii");
}

function paintWebp(bytes) {
  bytes.write("RIFF", 0, "ascii");
  bytes.write("WEBP", 8, "ascii");
}

test("verify accepts streamed PNG, MP4 and WebP payloads when the private DAG is larger", async () => {
  gatewayStream = true;
  const cases = [
    { kind: "nft-image", mime: "image/png", size: 5_000_000, paint: paintPng },
    { kind: "nft-video", mime: "video/mp4", size: 20_000_000, paint: paintMp4 },
    { kind: "nft-image", mime: "image/webp", size: 535_000, paint: paintWebp },
  ];
  for (const item of cases) {
    const bytes = Buffer.alloc(item.size);
    item.paint(bytes);
    const sha256 = hash(bytes);
    const recordSize = bytes.length + Math.ceil(bytes.length * 0.005);
    assert.ok(recordSize > bytes.length);
    fileRecord = { id: "file-1234", cid: CID, size: recordSize, mime_type: item.mime };
    gatewayBytes = bytes;
    publicUploads.length = 0;
    deleted.length = 0;
    deleteCalls.length = 0;
    gatewayChunks = 0;
    const res = await verifyRoute(
      jsonRequest("/api/factory/upload/verify", { id: "file-1234", kind: item.kind, sha256, size: bytes.length }),
    );
    const body = await res.json();
    assert.equal(res.status, 200, `${item.mime} ${body.error ?? ""}`);
    assert.equal(body.size, bytes.length);
    assert.equal(body.mime, item.mime);
    assert.equal(body.sha256, sha256);
    assert.equal(publicUploads.length, 1, item.mime);
    assert.equal(publicUploads[0].get("network"), "public");
    assert.equal(publicUploads[0].get("file").size, bytes.length);
    assert.deepEqual(deleted, ["file-1234"]);
    assert.equal(deleteCalls[0].url, "https://api.pinata.cloud/v3/files/private/file-1234");
    assert.ok(gatewayChunks > 1, `${item.mime} bounded read`);
  }

  publicUploads.length = 0;
  deleted.length = 0;
  deleteCalls.length = 0;
  fileRecord = { id: "file-1234", cid: CID, size: 25_000_001, mime_type: "image/png" };
  const tooBig = await verifyRoute(
    jsonRequest("/api/factory/upload/verify", {
      id: "file-1234",
      kind: "nft-image",
      sha256: "ab".repeat(32),
      size: 25_000_001,
    }),
  );
  assert.equal(tooBig.status, 413);
  assert.equal((await tooBig.json()).error, "file_too_large");
  assert.equal(publicUploads.length, 0);
});

test("truncated bytes, a read past the cap, and a sha256 mismatch are rejected", async () => {
  const bytes = Buffer.from("GIF89a-truncated-source");
  fileRecord = { id: "file-1234", cid: CID, size: bytes.length + 10, mime_type: "image/gif" };
  gatewayBytes = bytes.subarray(0, bytes.length - 1);
  let res = await verifyRoute(
    jsonRequest("/api/factory/upload/verify", { id: "file-1234", kind: "nft-image", sha256: hash(bytes), size: bytes.length }),
  );
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, "size_mismatch");
  assert.deepEqual(deleted, ["file-1234"]);

  deleted.length = 0;
  const header = Buffer.from("GIF89a");
  const overflow = Buffer.alloc(DIRECT_UPLOAD_MAX_BYTES + 1);
  header.copy(overflow);
  fileRecord = { id: "file-1234", cid: CID, size: DIRECT_UPLOAD_MAX_BYTES + 50, mime_type: "image/gif" };
  gatewayBytes = overflow;
  res = await verifyRoute(
    jsonRequest("/api/factory/upload/verify", {
      id: "file-1234",
      kind: "nft-image",
      sha256: hash(overflow),
      size: DIRECT_UPLOAD_MAX_BYTES,
    }),
  );
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, "size_mismatch");

  deleted.length = 0;
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  fileRecord = { id: "file-1234", cid: CID, size: png.length + 100, mime_type: "image/png" };
  gatewayBytes = png;
  res = await verifyRoute(
    jsonRequest("/api/factory/upload/verify", { id: "file-1234", kind: "nft-image", sha256: "11".repeat(32), size: png.length }),
  );
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, "sha256_mismatch");
  assert.equal(deleted.at(-1), "file-1234");
});

test("a spoofed Content-Type is rejected and the file is deleted", async () => {
  const bytes = Buffer.from("GIF89a-not-a-png");
  fileRecord = { id: "file-1234", cid: CID, size: bytes.length, mime_type: "image/png" };
  gatewayBytes = bytes;
  const res = await verifyRoute(
    jsonRequest("/api/factory/upload/verify", { id: "file-1234", kind: "nft-image", sha256: hash(bytes), size: bytes.length }),
  );
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.error, "content_mismatch");
  assert.equal(body.cleanup, "deleted");
  assert.equal(publicUploads.length, 0);
  assert.deepEqual(deleted, ["file-1234"]);
  assert.deepEqual(deleteCalls, [
    { url: `https://api.pinata.cloud/v3/files/${PINATA_UPLOAD_NETWORK}/file-1234`, method: "DELETE" },
  ]);
  assert.equal(deleteCalls[0].url.includes(CID), false);
});

test("gateway discovery failure deletes the private file and does not publish", async () => {
  gatewayStatus = 403;
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args);
  };
  try {
    const bytes = Buffer.from("GIF89a-hidden");
    fileRecord = { id: "file-1234", cid: CID, size: bytes.length, mime_type: "image/gif" };
    gatewayBytes = bytes;
    const res = await verifyRoute(
      jsonRequest("/api/factory/upload/verify", { id: "file-1234", kind: "nft-image", sha256: hash(bytes), size: bytes.length }),
    );
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, "verify_unavailable");
    assert.equal(body.cleanup, "deleted");
    assert.deepEqual(deleted, ["file-1234"]);
    assert.equal(publicUploads.length, 0);
    const logged = JSON.stringify(warnings);
    assert.match(logged, /private read unavailable/);
    assert.equal(logged.includes(process.env.PINATA_JWT), false);
    assert.equal(logged.includes("Bearer"), false);
  } finally {
    console.warn = originalWarn;
  }
});

test("a public legacy mismatch deletes every file record for that cid", async () => {
  legacyPublic = true;
  const bytes = Buffer.from("GIF89a-not-a-png");
  fileRecord = { id: "file-1234", cid: CID, size: bytes.length, mime_type: "image/png" };
  gatewayBytes = bytes;
  const res = await verifyRoute(
    jsonRequest("/api/factory/upload/verify", { id: "file-1234", kind: "nft-image", sha256: hash(bytes), size: bytes.length }),
  );
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, "content_mismatch");
  assert.equal(publicUploads.length, 0);
  assert.deepEqual(deleted, ["file-1234", "file-5678"]);
  assert.ok(deleteCalls.every((call) => call.url.startsWith("https://api.pinata.cloud/v3/files/public/")));
});

test("a public cid that is not the verified bytes is discarded", async () => {
  publicCid = `b${"a".repeat(58)}`;
  const bytes = Buffer.from("GIF89a-other-cid");
  fileRecord = { id: "file-1234", cid: CID, size: bytes.length, mime_type: "image/gif" };
  gatewayBytes = bytes;
  const res = await verifyRoute(
    jsonRequest("/api/factory/upload/verify", { id: "file-1234", kind: "nft-image", sha256: hash(bytes), size: bytes.length }),
  );
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, "content_mismatch");
  assert.equal(publicUploads.length, 1);
  assert.ok(deleted.includes("pub-file-1"));
  assert.ok(deleted.includes("file-1234"));
  assert.equal(deleteCalls.some((call) => call.url.includes("/files/public/pub-file-1")), true);
  assert.equal(deleteCalls.some((call) => call.url.includes("/files/private/file-1234")), true);
});

test("a content mismatch reports a failed delete instead of hiding it", async () => {
  deleteStatus = 500;
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args);
  };
  try {
    const bytes = Buffer.from("GIF89a-not-a-png");
    fileRecord = { id: "file-1234", cid: CID, size: bytes.length, mime_type: "image/png" };
    gatewayBytes = bytes;
    const res = await verifyRoute(
      jsonRequest("/api/factory/upload/verify", { id: "file-1234", kind: "nft-image", sha256: hash(bytes), size: bytes.length }),
    );
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error, "content_mismatch");
    assert.equal(body.cleanup, "delete_failed");
    assert.equal(deleteCalls.length, 1);
    assert.equal(deleteCalls[0].url, `https://api.pinata.cloud/v3/files/${PINATA_UPLOAD_NETWORK}/file-1234`);
    const logged = JSON.stringify(warnings);
    assert.match(logged, /delete failed/);
    assert.match(logged, /file-1234/);
    assert.match(logged, new RegExp(PINATA_UPLOAD_NETWORK));
    assert.equal(logged.includes(process.env.PINATA_JWT), false);
    assert.equal(logged.includes("Bearer"), false);
  } finally {
    console.warn = originalWarn;
  }
});

test("verify refuses a content id in place of the Pinata file id", async () => {
  const res = await verifyRoute(
    jsonRequest("/api/factory/upload/verify", { id: CID, kind: "nft-image", sha256: "ab".repeat(32), size: 4 }),
  );
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "invalid_request");
  assert.equal(deleteCalls.length, 0);
});

test("sha256 mismatch deletes the file", async () => {
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  fileRecord = { id: "file-1234", cid: CID, size: bytes.length, mime_type: "image/png" };
  gatewayBytes = bytes;
  const res = await verifyRoute(
    jsonRequest("/api/factory/upload/verify", { id: "file-1234", kind: "nft-image", sha256: "11".repeat(32), size: bytes.length }),
  );
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.error, "sha256_mismatch");
  assert.equal(body.cleanup, "deleted");
  assert.deepEqual(deleted, ["file-1234"]);
});

test("an over-25 MB declaration is rejected before a signed URL is issued", async () => {
  const res = await signRoute(
    jsonRequest("/api/factory/upload/sign", {
      kind: "nft-image",
      type: "image/png",
      size: DIRECT_UPLOAD_MAX_BYTES + 1,
      sha256: "ab".repeat(32),
    }),
  );
  assert.equal(res.status, 413);
  assert.equal((await res.json()).error, "file_too_large");
  assert.equal(signBodies.length, 0);
});

test("nonce replay is rejected", async () => {
  const account = freshAccount();
  const body = await signedBody(account, { kind: "nft-image", type: "image/png", size: 32, sha256: "ab".repeat(32) });
  const first = await signRoute(jsonRequest("/api/factory/upload/sign", body));
  assert.equal(first.status, 200);
  const second = await signRoute(jsonRequest("/api/factory/upload/sign", body));
  assert.equal(second.status, 409);
  assert.equal((await second.json()).error, "nonce_used");
  assert.equal(signBodies.length, 1);
});

test("a nonce expires after five minutes", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_700_000_000_000 });
  const account = freshAccount();
  const nonceRes = await nonceRoute(new Request(`http://localhost/api/factory/upload/nonce?address=${account.address}`));
  assert.equal(nonceRes.status, 200);
  const issued = await nonceRes.json();
  t.mock.timers.tick(DIRECT_UPLOAD_NONCE_TTL_MS);
  const res = await signRoute(
    jsonRequest("/api/factory/upload/sign", {
      kind: "nft-image",
      type: "image/png",
      size: 32,
      sha256: "ab".repeat(32),
      address: account.address,
      signature: `0x${"11".repeat(65)}`,
      nonce: issued.nonce,
    }),
  );
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, "nonce_expired");
  assert.equal(signBodies.length, 0);
});

test("an expired nonce is rejected", async () => {
  const account = freshAccount();
  const issued = await issueUploadNonce({ address: account.address, domain: "localhost", ttlMs: -1 });
  const res = await signRoute(
    jsonRequest("/api/factory/upload/sign", {
      kind: "nft-image",
      type: "image/png",
      size: 32,
      sha256: "ab".repeat(32),
      address: account.address,
      signature: `0x${"11".repeat(65)}`,
      nonce: issued.nonce,
    }),
  );
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, "nonce_expired");
  assert.equal(signBodies.length, 0);
});

test("sign is rate-limited by address", async () => {
  const account = freshAccount();
  const fields = { kind: "nft-image", type: "image/png", size: 32, sha256: "cd".repeat(32) };
  for (let i = 0; i < DIRECT_UPLOAD_RATE.signAddress.limit; i++) {
    const body = await signedBody(account, fields);
    const res = await signRoute(jsonRequest("/api/factory/upload/sign", body));
    assert.equal(res.status, 200, `attempt ${i}`);
  }
  const blocked = await signedBody(account, fields);
  const res = await signRoute(jsonRequest("/api/factory/upload/sign", blocked));
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, "rate_limited");
});

test("sign is rate-limited by IP", async () => {
  const fields = { kind: "token-icon", type: "image/png", size: 32, sha256: "ef".repeat(32) };
  for (let i = 0; i < DIRECT_UPLOAD_RATE.signIp.limit; i++) {
    const body = await signedBody(freshAccount(), fields);
    const res = await signRoute(jsonRequest("/api/factory/upload/sign", body));
    assert.equal(res.status, 200, `attempt ${i}`);
  }
  const blocked = await signedBody(freshAccount(), fields);
  const res = await signRoute(jsonRequest("/api/factory/upload/sign", blocked));
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, "rate_limited");
});

test("on Vercel the sign limit follows the forwarding headers per client", async () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    const fields = { kind: "token-icon", type: "image/png", size: 32, sha256: "ef".repeat(32) };
    const forwarded = { "x-forwarded-for": "127.0.0.2, 127.0.0.3" };
    for (let i = 0; i < DIRECT_UPLOAD_RATE.signIp.limit; i++) {
      const body = await signedBody(freshAccount(), fields);
      const res = await signRoute(jsonRequest("/api/factory/upload/sign", body, forwarded));
      assert.equal(res.status, 200, `attempt ${i}`);
    }
    const blocked = await signedBody(freshAccount(), fields);
    const limited = await signRoute(jsonRequest("/api/factory/upload/sign", blocked, forwarded));
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error, "rate_limited");
    const other = await signedBody(freshAccount(), fields);
    const allowed = await signRoute(jsonRequest("/api/factory/upload/sign", other, { "x-real-ip": "127.0.0.3" }));
    assert.equal(allowed.status, 200);
    const preferred = await signedBody(freshAccount(), fields);
    const fromVercel = await signRoute(
      jsonRequest("/api/factory/upload/sign", preferred, { "x-vercel-forwarded-for": "127.0.0.2", "x-forwarded-for": "127.0.0.3" }),
    );
    assert.equal(fromVercel.status, 429);
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});

test("the sign IP store fails closed when the database is required and missing", async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  setUploadSignRateMemoryForTests(false);
  try {
    await assert.rejects(
      () => allowDirectUploadSignIp("client-a", 1, 60_000),
      (err) => err instanceof UploadSignRateStoreError,
    );
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
    resetUploadSignRatesForTests();
  }
});

test("address rate helper counts one wallet on its own", async () => {
  const rule = { namespace: "direct-upload-test-address", limit: 1, windowMs: 60_000 };
  assert.equal(await directUploadAddressAllowed("0xabc", rule), true);
  assert.equal(await directUploadAddressAllowed("0xabc", rule), false);
  assert.equal(await directUploadAddressAllowed("0xdef", rule), true);
});

test("createPinataSignedVideoUpload still wraps the shared signer", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url: String(url), body: JSON.parse(init.body), method: init.method };
    return json({ data: "https://uploads.pinata.cloud/v3/files/signed-token" });
  };
  const out = await createPinataSignedVideoUpload(
    { filename: "people-nft-1.mp4", mimeType: "video/mp4", maxBytes: 20_000_000, expiresSec: 120 },
    fetchImpl,
  );
  assert.equal(out.url, "https://uploads.pinata.cloud/v3/files/signed-token");
  assert.equal(seen.url, "https://uploads.pinata.cloud/v3/files/sign");
  assert.equal(seen.method, "POST");
  assert.deepEqual(seen.body.allow_mime_types, ["video/mp4"]);
  assert.equal(seen.body.max_file_size, pinataSignedUploadMaxBytes(20_000_000));
  assert.equal(seen.body.expires, 120);
  assert.equal(seen.body.network, "public");
});

test("signed upload limit adds multipart headroom for 5 MB and 20 MB and caps at 25 MB", async () => {
  assert.equal(pinataSignedUploadMaxBytes(5_000_000), 5_100_000);
  assert.equal(pinataSignedUploadMaxBytes(20_000_000), 20_400_000);
  assert.equal(pinataSignedUploadMaxBytes(DIRECT_UPLOAD_MAX_BYTES), 25_500_000);
  assert.equal(pinataSignedUploadMaxBytes(DIRECT_UPLOAD_MAX_BYTES + 5_000_000), 25_500_000);
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), method: init.method, body: JSON.parse(init.body) });
    return json({ data: "https://uploads.pinata.cloud/v3/files/signed-token" });
  };
  for (const maxBytes of [5_000_000, 20_000_000]) {
    await createPinataSignedUpload(
      { filename: "people-direct.bin", mimeTypes: ["image/png"], maxBytes, expiresSec: 120 },
      fetchImpl,
    );
  }
  assert.equal(seen.length, 2);
  assert.equal(seen[0].url, "https://uploads.pinata.cloud/v3/files/sign");
  assert.equal(seen[0].method, "POST");
  assert.equal(seen[0].body.max_file_size, 5_100_000);
  assert.equal(seen[1].body.max_file_size, 20_400_000);
  assert.equal(seen[0].body.network, PINATA_UPLOAD_NETWORK);
  assert.deepEqual(seen[0].body.allow_mime_types, ["image/png"]);
  assert.equal(seen[0].body.filename, "people-direct.bin");
  assert.equal(seen[0].body.expires, 120);
});

test("client signs the shared message and posts the original bytes", async () => {
  const account = freshAccount();
  const bytes = Buffer.from("GIF89a-original");
  const file = new File([bytes], "a.gif", { type: "image/gif" });
  const sha256 = hash(bytes);
  let posted = null;
  const fetchImpl = async (url, init = {}) => {
    const target = String(url);
    if (target.startsWith("/api/factory/upload/nonce")) {
      return json({ nonce: "ab".repeat(16), expiry: "2030-01-01T00:00:00.000Z", domain: "localhost" });
    }
    if (target === "/api/factory/upload/sign") {
      const body = JSON.parse(init.body);
      const message = directUploadSignMessage({
        domain: "localhost",
        address: account.address,
        nonce: body.nonce,
        kind: "nft-image",
        type: "image/gif",
        size: file.size,
        sha256,
        expiry: "2030-01-01T00:00:00.000Z",
      });
      assert.equal(await verifyMessage({ address: account.address, message, signature: body.signature }), true);
      assert.equal(target.includes("/api/factory/nft/image"), false);
      assert.equal(target.includes("/api/factory/media"), false);
      return json({ url: "https://uploads.pinata.cloud/v3/files/token" });
    }
    if (target === "https://uploads.pinata.cloud/v3/files/token") {
      posted = init.body.get("file");
      return json({ data: { id: "file-1234" } });
    }
    if (target === "/api/factory/upload/verify") {
      verifyBodies.push(JSON.parse(init.body));
      return json({
        uri: `ipfs://${CID}`,
        gatewayUrl: `https://gateway.pinata.cloud/ipfs/${CID}`,
        size: bytes.length,
        mime: "image/gif",
        sha256,
      });
    }
    throw new Error(target);
  };
  const out = await uploadDirect(file, "nft-image", {
    fetchImpl,
    signer: { address: account.address, signMessage: (message) => account.signMessage({ message }) },
  });
  assert.equal(out.mime, "image/gif");
  assert.equal(out.sha256, sha256);
  assert.equal(verifyBodies[0].size, file.size);
  assert.equal(verifyBodies[0].sha256, sha256);
  assert.ok(posted);
  assert.deepEqual(Buffer.from(await posted.arrayBuffer()), bytes);
});

test("a stalled upload ends as a timeout instead of hanging", async () => {
  const account = freshAccount();
  const file = new File([Buffer.from("GIF89a-x")], "a.gif", { type: "image/gif" });
  const fetchImpl = (_url, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("missing timeout"));
        return;
      }
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  await assert.rejects(
    () =>
      uploadDirect(file, "nft-image", {
        fetchImpl,
        timeoutMs: 30,
        signer: { address: account.address, signMessage: (message) => account.signMessage({ message }) },
      }),
    (err) => err instanceof MediaUploadError && err.code === "timeout",
  );
});

test("an expired upload link and a declined wallet map to their own messages", async () => {
  const account = freshAccount();
  const file = new File([Buffer.from("GIF89a-x")], "a.gif", { type: "image/gif" });
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target.startsWith("/api/factory/upload/nonce")) {
      return json({ nonce: "cd".repeat(16), expiry: "2030-01-01T00:00:00.000Z", domain: "localhost" });
    }
    if (target === "/api/factory/upload/sign") return json({ url: "https://uploads.pinata.cloud/v3/files/token" });
    return new Response("", { status: 403 });
  };
  await assert.rejects(
    () =>
      uploadDirect(file, "nft-image", {
        fetchImpl,
        signer: { address: account.address, signMessage: (message) => account.signMessage({ message }) },
      }),
    (err) => err instanceof MediaUploadError && err.code === "link_expired",
  );
  await assert.rejects(
    () =>
      uploadDirect(file, "nft-image", {
        fetchImpl,
        signer: {
          address: account.address,
          signMessage: async () => {
            throw Object.assign(new Error("User rejected"), { code: 4001 });
          },
        },
      }),
    (err) => err instanceof MediaUploadError && err.code === "wallet_rejected",
  );
  for (const lang of Object.keys(mediaUploadCopy)) {
    for (const code of MEDIA_UPLOAD_CODES) {
      const text = mediaUploadText(lang, code);
      assert.equal(typeof text, "string");
      assert.ok(text.trim().length > 0, `${lang} ${code}`);
      assert.equal(text.includes("Could not submit"), false, `${lang} ${code}`);
    }
    assert.match(mediaUploadCopy[lang].fileTooLarge, /25/);
    assert.match(mediaUploadCopy[lang].linkExpired, /25|Retry|повтор|Reintent|outra|Relance|Wiederhol|Ripeti|yeniden|lại|Ulangi|重新|أعد/i);
  }
  assert.notEqual(mediaUploadCopy.ru.fileTooLarge, mediaUploadCopy.en.fileTooLarge);
});

test("the NFT form shows media-upload copy for direct upload errors", () => {
  const langs = Object.keys(mediaUploadCopy);
  assert.equal(langs.length, 12);
  for (const lang of langs) {
    for (const code of MEDIA_UPLOAD_CODES) {
      const text = directUploadAlertText(lang, code);
      assert.equal(text, mediaUploadText(lang, code));
      assert.equal(typeof text, "string");
      assert.ok(text.trim().length > 0);
    }
    assert.notEqual(directUploadAlertText(lang, "file_too_large"), nftMediaCopy[lang].errTooLarge);
    assert.notEqual(directUploadAlertText(lang, "nonce_expired"), nftMediaCopy[lang].errTimeout);
    assert.notEqual(directUploadAlertText(lang, "content_mismatch"), nftMediaCopy[lang].errContentMismatch);
    assert.equal(directUploadAlertText(lang, "not-a-code"), null);
  }
});
