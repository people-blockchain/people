import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_KEYS_PER_NAMESPACE,
  checkSharedRateLimit,
  checkSlidingWindowRateLimit,
  rateLimitKey,
  resetRateLimitStoresForTests,
  setSharedRateLimitBackendForTests
} from "../src/lib/api-rate-limit.ts";

test("sliding window rate limit allows up to max then rejects", () => {
  resetRateLimitStoresForTests();
  const ns = "test-ns";
  const key = "1.2.3.4";
  for (let i = 0; i < 5; i++) {
    assert.equal(checkSlidingWindowRateLimit(ns, key, 5, 60_000), true);
  }
  assert.equal(checkSlidingWindowRateLimit(ns, key, 5, 60_000), false);
});

// IPv6 samples use the documentation prefix (2001:db8::/32), never real addresses.
test("IPv6 subjects are keyed by their /64 prefix", () => {
  assert.equal(rateLimitKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), "2001:db8:1:2::/64");
  assert.equal(rateLimitKey("2001:db8:1:2::1"), "2001:db8:1:2::/64");
  assert.equal(rateLimitKey("2001:DB8:0001:0002:0:0:0:ffff"), "2001:db8:1:2::/64");
  assert.equal(rateLimitKey("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(rateLimitKey("::ffff:1.2.3.4"), "1.2.3.4");
  // Non-IPv6 subjects are untouched.
  assert.equal(rateLimitKey("1.2.3.4"), "1.2.3.4");
  assert.equal(rateLimitKey("unknown"), "unknown");
  assert.equal(rateLimitKey("user-1:1.2.3.4"), "user-1:1.2.3.4");
});

test("rotating addresses inside one IPv6 /64 shares a single budget", () => {
  resetRateLimitStoresForTests();
  for (let i = 1; i <= 3; i++) {
    assert.equal(checkSlidingWindowRateLimit("v6", `2001:db8:5:6::${i.toString(16)}`, 3, 60_000), true);
  }
  assert.equal(checkSlidingWindowRateLimit("v6", "2001:db8:5:6::ffff", 3, 60_000), false);
  // A different /64 still has its own budget.
  assert.equal(checkSlidingWindowRateLimit("v6", "2001:db8:5:7::1", 3, 60_000), true);
});

test("namespace overflow evicts the least recently used key instead of refusing new keys", () => {
  resetRateLimitStoresForTests();
  const ns = "overflow";
  // Exhaust the first key's budget, then fill the namespace to the cap.
  assert.equal(checkSlidingWindowRateLimit(ns, "victim", 1, 60_000), true);
  assert.equal(checkSlidingWindowRateLimit(ns, "victim", 1, 60_000), false);
  for (let i = 0; i < MAX_KEYS_PER_NAMESPACE; i++) checkSlidingWindowRateLimit(ns, `filler-${i}`, 1, 60_000);
  // A brand-new key is accepted even though the namespace is full.
  assert.equal(checkSlidingWindowRateLimit(ns, "newcomer", 1, 60_000), true);
  // The oldest entry ("victim") was evicted, so it starts a fresh window.
  assert.equal(checkSlidingWindowRateLimit(ns, "victim", 1, 60_000), true);
});

test("recently used keys survive eviction", () => {
  resetRateLimitStoresForTests();
  const ns = "lru";
  assert.equal(checkSlidingWindowRateLimit(ns, "hot", 2, 60_000), true);
  for (let i = 0; i < MAX_KEYS_PER_NAMESPACE - 1; i++) checkSlidingWindowRateLimit(ns, `filler-${i}`, 1, 60_000);
  // Touch "hot" so it becomes most recent, then overflow by one.
  assert.equal(checkSlidingWindowRateLimit(ns, "hot", 2, 60_000), true);
  checkSlidingWindowRateLimit(ns, "overflow-key", 1, 60_000);
  assert.equal(checkSlidingWindowRateLimit(ns, "hot", 2, 60_000), false);
});

test("shared limiter uses the in-memory window when no store is configured", async () => {
  resetRateLimitStoresForTests();
  setSharedRateLimitBackendForTests(null);
  try {
    for (let i = 0; i < 2; i++) assert.equal(await checkSharedRateLimit("mem-only", "k", 2, 60_000), true);
    assert.equal(await checkSharedRateLimit("mem-only", "k", 2, 60_000), false);
  } finally {
    setSharedRateLimitBackendForTests(undefined);
  }
});

test("shared limiter defers to the shared store (budget shared across instances)", async () => {
  resetRateLimitStoresForTests();
  // Simulates another instance having already spent the shared budget.
  const calls = [];
  setSharedRateLimitBackendForTests(async (ns, subject, max, windowMs) => {
    calls.push({ ns, subject, max, windowMs });
    return false;
  });
  try {
    assert.equal(await checkSharedRateLimit("shared", "2001:db8:9:9::1", 5, 60_000), false);
    assert.deepEqual(calls, [{ ns: "shared", subject: "2001:db8:9:9::/64", max: 5, windowMs: 60_000 }]);
  } finally {
    setSharedRateLimitBackendForTests(undefined);
  }
});

test("a local rejection never reaches the shared store", async () => {
  resetRateLimitStoresForTests();
  let calls = 0;
  setSharedRateLimitBackendForTests(async () => {
    calls += 1;
    return true;
  });
  try {
    assert.equal(await checkSharedRateLimit("local-first", "k", 1, 60_000), true);
    assert.equal(await checkSharedRateLimit("local-first", "k", 1, 60_000), false);
    assert.equal(calls, 1);
  } finally {
    setSharedRateLimitBackendForTests(undefined);
  }
});

test("shared store errors fail open to the in-memory limiter without throwing", async () => {
  resetRateLimitStoresForTests();
  let calls = 0;
  setSharedRateLimitBackendForTests(async () => {
    calls += 1;
    throw new Error("db down");
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await checkSharedRateLimit("db-down", "k", 2, 60_000), true);
    assert.equal(await checkSharedRateLimit("db-down", "k", 2, 60_000), true);
    // The in-memory window still enforces the limit.
    assert.equal(await checkSharedRateLimit("db-down", "k", 2, 60_000), false);
    // After one failure the store is skipped for a cooldown instead of retried per request.
    assert.equal(calls, 1);
  } finally {
    console.warn = warn;
    setSharedRateLimitBackendForTests(undefined);
  }
});

test("without DATABASE_URL the default shared limiter stays in memory", async () => {
  resetRateLimitStoresForTests();
  setSharedRateLimitBackendForTests(undefined);
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    assert.equal(await checkSharedRateLimit("no-db", "k", 1, 60_000), true);
    assert.equal(await checkSharedRateLimit("no-db", "k", 1, 60_000), false);
  } finally {
    if (previous !== undefined) process.env.DATABASE_URL = previous;
  }
});

test("untrusted forwarding headers cannot bypass the rate-limit identity", async () => {
  const { clientIpFromRequest } = await import("../src/lib/request-client-ip.ts");
  const previous = process.env.TRUST_PROXY_HEADERS;
  try {
    delete process.env.TRUST_PROXY_HEADERS;
    const request = new Request("http://localhost", {headers:{"x-forwarded-for":"1.2.3.4","x-real-ip":"5.6.7.8"}});
    assert.equal(clientIpFromRequest(request),"unknown");
    process.env.TRUST_PROXY_HEADERS="1";
    assert.equal(clientIpFromRequest(request),"5.6.7.8");
    assert.equal(clientIpFromRequest(new Request("http://localhost",{headers:{"x-real-ip":"not-ip"}})),"unknown");
  } finally { if(previous === undefined) delete process.env.TRUST_PROXY_HEADERS; else process.env.TRUST_PROXY_HEADERS=previous; }
});

test("Vercel's own client-ip header is used without TRUST_PROXY_HEADERS", async () => {
  const { clientIpFromRequest } = await import("../src/lib/request-client-ip.ts");
  const previousVercel = process.env.VERCEL;
  const previousTrust = process.env.TRUST_PROXY_HEADERS;
  try {
    delete process.env.TRUST_PROXY_HEADERS;
    // Off Vercel the same header is client controlled and must not be trusted.
    delete process.env.VERCEL;
    assert.equal(clientIpFromRequest(new Request("http://localhost", { headers: { "x-vercel-forwarded-for": "9.9.9.9", "x-forwarded-for": "1.2.3.4" } })), "unknown");
    // On Vercel it wins over the spoofable X-Forwarded-For.
    process.env.VERCEL = "1";
    assert.equal(clientIpFromRequest(new Request("http://localhost", { headers: { "x-vercel-forwarded-for": "9.9.9.9", "x-forwarded-for": "1.2.3.4" } })), "9.9.9.9");
    assert.equal(clientIpFromRequest(new Request("http://localhost", { headers: { "x-vercel-forwarded-for": "not-ip" } })), "unknown");
  } finally {
    if (previousVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previousVercel;
    if (previousTrust === undefined) delete process.env.TRUST_PROXY_HEADERS; else process.env.TRUST_PROXY_HEADERS = previousTrust;
  }
});
