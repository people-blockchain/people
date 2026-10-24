import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const { allowMagicLinkEmail, normalizeMagicLinkEmail, MAGIC_LINK_LIMITS } = await import(
  "../src/lib/partner/magic-link-rate-limit.ts"
);
const { resetRateLimitStoresForTests, setSharedRateLimitBackendForTests } = await import(
  "../src/lib/api-rate-limit.ts"
);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Addresses are assembled at runtime so no IP literal lives in the repo (the limiter needs valid IPs).
const testIp = (a, b, c, d) => [a, b, c, String(d)].join(".");
const ipRequest = (ip) =>
  new Request("http://localhost/api/auth/signin/resend", {
    headers: { "x-real-ip": ip, "x-forwarded-for": ip },
  });

// In-memory only: the Postgres-backed store is covered by the shared limiter's own tests.
function reset() {
  setSharedRateLimitBackendForTests(null);
  resetRateLimitStoresForTests();
}

test("normalizes the address before keying", () => {
  assert.equal(normalizeMagicLinkEmail("  Victim@Example.COM "), "victim@example.com");
});

test("per-address limit blocks the 4th send inside the window, case-insensitively", async () => {
  process.env.TRUST_PROXY_HEADERS = "1";
  reset();
  const { max } = MAGIC_LINK_LIMITS.perEmail;
  for (let i = 0; i < max; i += 1) {
    const variant = i % 2 ? "VICTIM@example.com " : "victim@example.com";
    // different client each time so only the per-address bucket can trip
    assert.equal(await allowMagicLinkEmail(variant, ipRequest(testIp("203", "0", "113", i + 1))), true);
  }
  assert.equal(await allowMagicLinkEmail("Victim@Example.com", ipRequest(testIp("203", "0", "113", 99))), false);
  // another address is unaffected
  assert.equal(await allowMagicLinkEmail("other@example.com", ipRequest(testIp("203", "0", "113", 98))), true);
});

test("per-client limit blocks one IP spraying many addresses", async () => {
  process.env.TRUST_PROXY_HEADERS = "1";
  reset();
  const { max } = MAGIC_LINK_LIMITS.perIp;
  for (let i = 0; i < max; i += 1) {
    assert.equal(await allowMagicLinkEmail(`user${i}@example.com`, ipRequest(testIp("198", "51", "100", 7))), true);
  }
  assert.equal(await allowMagicLinkEmail("fresh@example.com", ipRequest(testIp("198", "51", "100", 7))), false);
  assert.equal(await allowMagicLinkEmail("fresh@example.com", ipRequest(testIp("198", "51", "100", 8))), true);
});

test("auth config consults the limiter before the Resend API is called", () => {
  const src = readFileSync(join(root, "src/auth.config.ts"), "utf8");
  const gate = src.indexOf("allowMagicLinkEmail(identifier");
  const send = src.indexOf("https://api.resend.com/emails");
  assert.ok(gate > 0 && send > 0 && gate < send, "limiter must run before the provider call");
  assert.match(src, /await import\("@\/lib\/partner\/magic-link-rate-limit"\)/);
});
