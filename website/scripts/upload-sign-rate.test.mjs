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
const { directUploadSignMessage } = await import("../src/lib/media-upload-rules.ts");
const { issueUploadNonce, resetUploadNoncesForTests, setUploadNonceMemoryForTests } = await import(
  "../src/lib/upload-nonce-store.ts"
);
const { allowDirectUploadSignIp, decideSlidingWindow, resetUploadSignRatesForTests, setUploadSignRateMemoryForTests } =
  await import("../src/lib/upload-sign-rate-store.ts");
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

function spanStart() {
  const windowMs = 10 * 60_000;
  const boundary = 1_700_004_000_000;
  return { windowMs, boundary, start: boundary - 30_000 };
}

async function assertTenMinuteSpan(label, probe) {
  const { windowMs, boundary, start } = spanStart();
  assert.equal(boundary % windowMs, 0);
  assert.ok(start + 2 * 60_000 > boundary);
  for (let i = 0; i < 10; i += 1) {
    assert.equal(await probe(start), true, `${label} slot ${i}`);
  }
  assert.equal(await probe(start), false, `${label} 11th`);
  assert.equal(await probe(start + 2 * 60_000), false, `${label} plus 2 min`);
  assert.equal(await probe(boundary + 1_000), false, `${label} across the boundary`);
  assert.equal(await probe(start + windowMs), true, `${label} after 10 min`);
}

test("a sliding window keeps the 11th blocked across a fixed-window boundary", () => {
  const { windowMs, boundary, start } = spanStart();
  let hits = [];
  for (let i = 0; i < 10; i += 1) {
    const step = decideSlidingWindow(hits, start, windowMs, 10);
    assert.equal(step.allow, true);
    hits = step.hits;
  }
  const blocked = decideSlidingWindow(hits, start, windowMs, 10);
  assert.equal(blocked.allow, false);
  const later = decideSlidingWindow(blocked.hits, start + 2 * 60_000, windowMs, 10);
  assert.equal(later.allow, false);
  assert.equal(decideSlidingWindow(later.hits, boundary + 1_000, windowMs, 10).allow, false);
  assert.equal(decideSlidingWindow(later.hits, start + windowMs, windowMs, 10).allow, true);
});

test("the in-memory sign budget is a 10 minute sliding window", async () => {
  resetUploadSignRatesForTests();
  await assertTenMinuteSpan("memory", (now) => allowDirectUploadSignIp("client-slide", 10, 10 * 60_000, now));
});

test("the database sign budget is a 10 minute sliding window", async () => {
  setUploadSignRateMemoryForTests(false);
  await assertTenMinuteSpan("db", (now) => allowDirectUploadSignIp("client-slide-db", 10, 10 * 60_000, now));
  setUploadSignRateMemoryForTests(true);
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

test("the sign route blocks an 11th call from one client across a fixed-window boundary", async (t) => {
  resetUploadSignRatesForTests();
  resetUploadNoncesForTests();
  resetRateLimitStoresForTests();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url) === "https://uploads.pinata.cloud/v3/files/sign") {
      return new Response(JSON.stringify({ data: "https://uploads.pinata.cloud/v3/files/token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const windowMs = 10 * 60_000;
  const boundary = 1_700_004_000_000;
  const start = boundary - 30_000;
  assert.equal(boundary % windowMs, 0);
  assert.ok(start + 2 * 60_000 > boundary);
  const fields = { kind: "nft-image", type: "image/png", size: 32, sha256: "ab".repeat(32) };
  const signOnce = async () => {
    const account = privateKeyToAccount(`0x${randomBytes(32).toString("hex")}`);
    const issued = await issueUploadNonce({ address: account.address, domain: "localhost" });
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
    return signRoute(
      new Request("http://localhost/api/factory/upload/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, address: account.address, signature, nonce: issued.nonce }),
      }),
    );
  };
  t.mock.timers.enable({ apis: ["Date"], now: start });
  try {
    for (let i = 0; i < 10; i += 1) {
      const res = await signOnce();
      assert.equal(res.status, 200, `attempt ${i}`);
    }
    const blocked = await signOnce();
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).error, "rate_limited");

    t.mock.timers.tick(boundary + 1_000 - start);
    assert.ok(Date.now() > boundary);
    const acrossBoundary = await signOnce();
    assert.equal(acrossBoundary.status, 429);
    assert.equal((await acrossBoundary.json()).error, "rate_limited");

    t.mock.timers.tick(start + 2 * 60_000 - Date.now());
    assert.equal(Date.now(), start + 2 * 60_000);
    const twoMinutes = await signOnce();
    assert.equal(twoMinutes.status, 429);
    assert.equal((await twoMinutes.json()).error, "rate_limited");

    t.mock.timers.tick(start + windowMs - Date.now());
    assert.equal(Date.now(), start + windowMs);
    const reopened = await signOnce();
    assert.equal(reopened.status, 200);
  } finally {
    globalThis.fetch = realFetch;
    t.mock.timers.reset();
  }
});
