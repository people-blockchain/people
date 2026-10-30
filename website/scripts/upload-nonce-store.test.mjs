// Database-backed nonces. PGlite stands in for Postgres. No live network.
import { register } from "node:module";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";

register("./fixtures/upload-nonce-db-loader.mjs", import.meta.url);

const signRouteModule = await import("../src/app/api/factory/upload/sign/route.ts");
const signRoute = signRouteModule.POST;
const { resetRateLimitStoresForTests, setSharedRateLimitBackendForTests } = await import("../src/lib/api-rate-limit.ts");
const { DIRECT_UPLOAD_NONCE_TTL_MS } = await import("../src/lib/media-upload-rules.ts");
const {
  UPLOAD_NONCE_EXPIRED_RETENTION_MS,
  consumeUploadNonce,
  issueUploadNonce,
  setUploadNonceMemoryForTests,
} = await import("../src/lib/upload-nonce-store.ts");

const previousJwt = process.env.PINATA_JWT;
process.env.PINATA_JWT = "test-jwt-not-a-real-key";

test.before(() => {
  setSharedRateLimitBackendForTests(null);
  setUploadNonceMemoryForTests(false);
});

test.after(() => {
  setUploadNonceMemoryForTests(null);
  setSharedRateLimitBackendForTests(undefined);
  if (previousJwt === undefined) delete process.env.PINATA_JWT;
  else process.env.PINATA_JWT = previousJwt;
});

test.beforeEach(() => {
  resetRateLimitStoresForTests();
});

function account() {
  return privateKeyToAccount(`0x${randomBytes(32).toString("hex")}`);
}

test("an expired database nonce stays nonce_expired after another nonce is issued", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_700_000_000_000 });
  const wallet = account();
  const issued = await issueUploadNonce({ address: wallet.address, domain: "localhost" });
  t.mock.timers.tick(DIRECT_UPLOAD_NONCE_TTL_MS);
  await issueUploadNonce({ address: wallet.address, domain: "localhost" });
  assert.equal(await consumeUploadNonce(issued.nonce, wallet.address), "nonce_expired");

  const res = await signRoute(
    new Request("http://localhost/api/factory/upload/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "nft-image",
        type: "image/png",
        size: 32,
        sha256: "ab".repeat(32),
        address: wallet.address,
        signature: `0x${"11".repeat(65)}`,
        nonce: issued.nonce,
      }),
    }),
  );
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, "nonce_expired");
});

test("a database nonce is dropped only after the retention window", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_700_000_000_000 });
  const wallet = account();
  const issued = await issueUploadNonce({ address: wallet.address, domain: "localhost" });
  t.mock.timers.tick(DIRECT_UPLOAD_NONCE_TTL_MS + UPLOAD_NONCE_EXPIRED_RETENTION_MS + 1);
  await issueUploadNonce({ address: wallet.address, domain: "localhost" });
  assert.equal(await consumeUploadNonce(issued.nonce, wallet.address), "nonce_missing");
});
