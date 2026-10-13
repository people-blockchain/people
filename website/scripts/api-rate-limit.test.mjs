import assert from "node:assert/strict";
import test from "node:test";
import {
  checkSlidingWindowRateLimit,
  resetRateLimitStoresForTests
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
