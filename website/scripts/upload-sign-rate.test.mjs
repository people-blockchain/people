// Sign-rate counters in PGlite, plus the in-memory window. No live network.
import { register } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";

register("./fixtures/upload-nonce-db-loader.mjs", import.meta.url);

const signRouteModule = await import("../src/app/api/factory/upload/sign/route.ts");
const signRoute = signRouteModule.POST;
const { resetRateLimitStoresForTests } = await import("../src/lib/api-rate-limit.ts");
const { DIRECT_UPLOAD_RATE } = await import("../src/lib/media-upload-rate.ts");
const { issueUploadNonce, setUploadNonceMemoryForTests } = await import("../src/lib/upload-nonce-store.ts");
const { allowDirectUploadSignIp, resetUploadSignRatesForTests, setUploadSignRateMemoryForTests } = await import(
  "../src/lib/upload-sign-rate-store.ts"
);
const { UPLOAD_SIGN_RATE_SCHEMA_STATEMENTS } = await import("../src/db/upload-sign-rate-sql.mjs");

const previousJwt = process.env.PINATA_JWT;
process.env.PINATA_JWT = "test-jwt-not-a-real-key";

test.after(() => {
  resetUploadSignRatesForTests();
  setUploadNonceMemoryForTests(null);
  if (previousJwt === undefined) delete process.env.PINATA_JWT;
  else process.env.PINATA_JWT = previousJwt;
});

test("sign rate ddl is idempotent and applied from bootstrap", () => {
  for (const statement of UPLOAD_SIGN_RATE_SCHEMA_STATEMENTS) {
    assert.match(statement, /IF NOT EXISTS/i);
  }
  const bootstrap = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/db/bootstrap.ts"), "utf8");
  assert.match(bootstrap, /UPLOAD_SIGN_RATE_SCHEMA_STATEMENTS/);
});

test("the in-memory sign budget reopens when the window ends", async (t) => {
  resetUploadSignRatesForTests();
  t.mock.timers.enable({ apis: ["Date"], now: 1_700_000_000_000 });
  const windowMs = 10 * 60_000;
  assert.equal(await allowDirectUploadSignIp("client-a", 1, windowMs), true);
  assert.equal(await allowDirectUploadSignIp("client-a", 1, windowMs), false);
  assert.equal(await allowDirectUploadSignIp("client-b", 1, windowMs), true);
  t.mock.timers.tick(windowMs);
  assert.equal(await allowDirectUploadSignIp("client-a", 1, windowMs), true);
});

test("the sign route keeps counting after the in-memory limiter is cleared", async () => {
  setUploadSignRateMemoryForTests(false);
  setUploadNonceMemoryForTests(true);
  resetRateLimitStoresForTests();
  const { limit, windowMs } = DIRECT_UPLOAD_RATE.signIp;
  for (let i = 0; i < limit; i += 1) {
    assert.equal(await allowDirectUploadSignIp("unknown", limit, windowMs), true, `slot ${i}`);
  }
  resetRateLimitStoresForTests();
  const wallet = privateKeyToAccount(`0x${randomBytes(32).toString("hex")}`);
  const issued = await issueUploadNonce({ address: wallet.address, domain: "localhost" });
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
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, "rate_limited");
  assert.equal(await allowDirectUploadSignIp("client-b", limit, windowMs), true);
});
