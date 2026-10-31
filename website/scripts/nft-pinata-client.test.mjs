// Storage client tests with an injected fetch: no live Pinata, no real key.
import assert from "node:assert/strict";
import test from "node:test";
import {
  PinataError,
  createPinataSignedVideoUpload,
  deletePinataFile,
  getPinataFile,
  ipfsGatewayUrlForUri,
  pinBytesToIpfs,
} from "../src/lib/ipfs.ts";
import { pinataSignedUploadMaxBytes } from "../src/lib/pinata-signed-upload.ts";

const DIR_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

function withJwt(fn) {
  return async () => {
    const previous = process.env.PINATA_JWT;
    process.env.PINATA_JWT = "test-jwt-not-a-real-key";
    try {
      await fn();
    } finally {
      if (previous === undefined) delete process.env.PINATA_JWT;
      else process.env.PINATA_JWT = previous;
    }
  };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test(
  "wrapped pin sends pinataOptions and returns ipfs://<dir>/<file>",
  withJwt(async () => {
    let seen;
    const fetchImpl = async (url, init) => {
      seen = { url, init };
      return json({ IpfsHash: DIR_CID });
    };
    const out = await pinBytesToIpfs(new Uint8Array([1, 2, 3]), "image.svg", "image/svg+xml", { wrapWithDirectory: true, fetchImpl });
    assert.equal(out.uri, `ipfs://${DIR_CID}/image.svg`);
    assert.equal(out.cid, DIR_CID);
    assert.equal(seen.url, "https://api.pinata.cloud/pinning/pinFileToIPFS");
    assert.equal(seen.init.headers.Authorization, "Bearer test-jwt-not-a-real-key");
    assert.equal(seen.init.body.get("pinataOptions"), JSON.stringify({ wrapWithDirectory: true }));
    assert.equal(seen.init.body.get("file").name, "image.svg");
  }),
);

test(
  "the default pin call is unchanged (no pinataOptions, bare ipfs:// uri)",
  withJwt(async () => {
    let body;
    const fetchImpl = async (_url, init) => {
      body = init.body;
      return json({ IpfsHash: DIR_CID });
    };
    const out = await pinBytesToIpfs(new Uint8Array([1]), "factory/x.png", "image/png", { fetchImpl });
    assert.equal(out.uri, `ipfs://${DIR_CID}`);
    assert.equal(body.get("pinataOptions"), null);
  }),
);

test("pinning without PINATA_JWT fails with pinata_not_configured", async () => {
  const previous = process.env.PINATA_JWT;
  delete process.env.PINATA_JWT;
  try {
    await assert.rejects(pinBytesToIpfs(new Uint8Array([1]), "a.png"), (err) => err instanceof PinataError && err.code === "pinata_not_configured");
    await assert.rejects(createPinataSignedVideoUpload({ filename: "a.mp4", mimeType: "video/mp4", maxBytes: 1 }), (err) => err.code === "pinata_not_configured");
  } finally {
    if (previous !== undefined) process.env.PINATA_JWT = previous;
  }
});

test(
  "signed video upload body is scoped by type, size and expiry; 401/403 mean a missing scope",
  withJwt(async () => {
    let seen;
    const ok = async (url, init) => {
      seen = { url, body: JSON.parse(init.body), method: init.method };
      return json({ data: "https://uploads.pinata.cloud/v3/files/signed-token" });
    };
    const out = await createPinataSignedVideoUpload({ filename: "people-nft-1.mp4", mimeType: "video/mp4", maxBytes: 20_000_000, expiresSec: 120 }, ok);
    assert.equal(out.url, "https://uploads.pinata.cloud/v3/files/signed-token");
    assert.equal(seen.url, "https://uploads.pinata.cloud/v3/files/sign");
    assert.equal(seen.method, "POST");
    assert.equal(seen.body.expires, 120);
    assert.equal(seen.body.max_file_size, pinataSignedUploadMaxBytes(20_000_000));
    assert.deepEqual(seen.body.allow_mime_types, ["video/mp4"]);
    assert.equal(seen.body.network, "public");
    assert.equal(seen.body.filename, "people-nft-1.mp4");
    for (const status of [401, 403]) {
      await assert.rejects(
        createPinataSignedVideoUpload({ filename: "a.mp4", mimeType: "video/mp4", maxBytes: 1 }, async () => json({}, status)),
        (err) => err.code === "pinata_scope_missing",
      );
    }
    await assert.rejects(
      createPinataSignedVideoUpload({ filename: "a.mp4", mimeType: "video/mp4", maxBytes: 1 }, async () => json({}, 500)),
      (err) => err.code === "pin_failed",
    );
    await assert.rejects(
      createPinataSignedVideoUpload({ filename: "a.mp4", mimeType: "video/mp4", maxBytes: 1 }, async () => json({ data: "http://insecure.example/x" })),
      (err) => err.code === "pin_failed",
    );
  }),
);

test(
  "file lookup and delete use the v3 public file path",
  withJwt(async () => {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url, method: init.method ?? "GET" });
      return init.method === "DELETE" ? json({}) : json({ data: { id: "abc-123", cid: DIR_CID, size: 1234, mime_type: "video/mp4" } });
    };
    const record = await getPinataFile("abc-123", fetchImpl);
    assert.deepEqual(record, { id: "abc-123", cid: DIR_CID, size: 1234, mimeType: "video/mp4" });
    await deletePinataFile("abc-123", fetchImpl);
    assert.deepEqual(calls, [
      { url: "https://api.pinata.cloud/v3/files/public/abc-123", method: "GET" },
      { url: "https://api.pinata.cloud/v3/files/public/abc-123", method: "DELETE" },
    ]);
    await assert.rejects(getPinataFile("missing", async () => json({}, 404)), (err) => err.code === "pin_failed");
    await assert.rejects(getPinataFile("x", async () => json({ data: { cid: "nope", size: 1 } })), (err) => err.code === "pin_failed");
  }),
);

test("gateway URL keeps the file name inside a wrapped directory", () => {
  const previous = process.env.IPFS_GATEWAY_URL;
  delete process.env.IPFS_GATEWAY_URL;
  try {
    assert.equal(ipfsGatewayUrlForUri(`ipfs://${DIR_CID}/metadata.json`), `https://gateway.pinata.cloud/ipfs/${DIR_CID}/metadata.json`);
    assert.equal(ipfsGatewayUrlForUri(`ipfs://${DIR_CID}`), `https://gateway.pinata.cloud/ipfs/${DIR_CID}`);
    assert.throws(() => ipfsGatewayUrlForUri("https://example.org/x"));
  } finally {
    if (previous !== undefined) process.env.IPFS_GATEWAY_URL = previous;
  }
});
