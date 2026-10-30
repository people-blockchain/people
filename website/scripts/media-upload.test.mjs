// Direct upload: injected fetch, in-memory nonce and rate limit. No live network and no real key.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test, { beforeEach, afterEach } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import { resetRateLimitStoresForTests, setSharedRateLimitBackendForTests } from "../src/lib/api-rate-limit.ts";
import { GET as nonceRoute } from "../src/app/api/factory/upload/nonce/route.ts";
import { POST as signRoute } from "../src/app/api/factory/upload/sign/route.ts";
import { POST as verifyRoute } from "../src/app/api/factory/upload/verify/route.ts";
import { MediaUploadError, mediaUploadText, uploadDirect, MEDIA_UPLOAD_CODES } from "../src/lib/media-upload-client.ts";
import { mediaUploadCopy } from "../src/lib/media-upload-copy.ts";
import { sniffDirectMedia } from "../src/lib/media-upload-magic.ts";
import { DIRECT_UPLOAD_RATE, directUploadAddressAllowed } from "../src/lib/media-upload-rate.ts";
import {
  DIRECT_UPLOAD_MAX_BYTES,
  directUploadSignMessage,
  mimeAllowedForKind,
  validateDirectUploadFields,
} from "../src/lib/media-upload-rules.ts";
import { createPinataSignedVideoUpload } from "../src/lib/ipfs.ts";
import { issueUploadNonce, resetUploadNoncesForTests } from "../src/lib/upload-nonce-store.ts";

const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const realFetch = globalThis.fetch;
const previousJwt = process.env.PINATA_JWT;

let signBodies;
let deleted;
let fileRecord;
let gatewayBytes;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const freshAccount = () => privateKeyToAccount(`0x${randomBytes(32).toString("hex")}`);
const jsonRequest = (url, body) =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  process.env.PINATA_JWT = "test-jwt-not-a-real-key";
  setSharedRateLimitBackendForTests(null);
  resetRateLimitStoresForTests();
  resetUploadNoncesForTests();
  signBodies = [];
  deleted = [];
  fileRecord = { id: "file-1234", cid: CID, size: 1, mime_type: "image/png" };
  gatewayBytes = null;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target === "https://uploads.pinata.cloud/v3/files/sign") {
      signBodies.push(JSON.parse(init.body));
      return json({ data: "https://uploads.pinata.cloud/v3/files/token" });
    }
    if (target.startsWith("https://api.pinata.cloud/v3/files/public/")) {
      if (init.method === "DELETE") {
        deleted.push(target.split("/").pop());
        return json({});
      }
      return json({ data: fileRecord });
    }
    if (!gatewayBytes) throw new Error(`unexpected fetch ${target}`);
    return new Response(gatewayBytes);
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
  assert.equal(signBodies[0].max_file_size, 2_000_000);
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
  const res = await verifyRoute(jsonRequest("/api/factory/upload/verify", { id: "file-1234", kind: "nft-image", sha256 }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.uri, `ipfs://${CID}`);
  assert.equal(body.size, bytes.length);
  assert.equal(body.mime, "image/gif");
  assert.equal(body.sha256, sha256);
  assert.equal(deleted.length, 0);
});

test("a spoofed Content-Type is rejected and the file is deleted", async () => {
  const bytes = Buffer.from("GIF89a-not-a-png");
  fileRecord = { id: "file-1234", cid: CID, size: bytes.length, mime_type: "image/png" };
  gatewayBytes = bytes;
  const res = await verifyRoute(
    jsonRequest("/api/factory/upload/verify", { id: "file-1234", kind: "nft-image", sha256: hash(bytes) }),
  );
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, "content_mismatch");
  assert.deepEqual(deleted, ["file-1234"]);
});

test("sha256 mismatch deletes the file", async () => {
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  fileRecord = { id: "file-1234", cid: CID, size: bytes.length, mime_type: "image/png" };
  gatewayBytes = bytes;
  const res = await verifyRoute(
    jsonRequest("/api/factory/upload/verify", { id: "file-1234", kind: "nft-image", sha256: "11".repeat(32) }),
  );
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, "sha256_mismatch");
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
  assert.equal(seen.body.max_file_size, 20_000_000);
  assert.equal(seen.body.expires, 120);
  assert.equal(seen.body.network, "public");
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
  assert.ok(posted);
  assert.deepEqual(Buffer.from(await posted.arrayBuffer()), bytes);
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
