import assert from "node:assert/strict";
import test from "node:test";

import {
  clientIpFromHeaders,
  clientIpFromRequest,
  requestCameViaCloudflare,
} from "../src/lib/request-client-ip.ts";
import { geoFromRequestHeaders } from "../src/lib/analytics/geo.ts";

function req(headers) {
  return new Request("http://localhost", { headers });
}

test("Cloudflare IP is used only when cf-ray is present", () => {
  const previousTrust = process.env.TRUST_PROXY_HEADERS;
  const previousVercel = process.env.VERCEL;
  try {
    delete process.env.TRUST_PROXY_HEADERS;
    delete process.env.VERCEL;
    assert.equal(
      clientIpFromRequest(
        req({
          "cf-connecting-ip": "203.0.113.10",
          "x-forwarded-for": "198.51.100.1",
        }),
      ),
      "unknown",
    );
    assert.equal(
      clientIpFromRequest(
        req({
          "cf-ray": "abc123",
          "cf-connecting-ip": "203.0.113.10",
          "x-forwarded-for": "198.51.100.1",
        }),
      ),
      "203.0.113.10",
    );
    assert.equal(
      clientIpFromRequest(
        req({
          "cf-ray": "abc123",
          "true-client-ip": "203.0.113.11",
        }),
      ),
      "203.0.113.11",
    );
    assert.ok(
      requestCameViaCloudflare(new Headers({ "cf-ray": "1" })),
    );
  } finally {
    if (previousTrust === undefined) delete process.env.TRUST_PROXY_HEADERS;
    else process.env.TRUST_PROXY_HEADERS = previousTrust;
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
  }
});

test("Cloudflare then Vercel forwarding on Vercel", () => {
  const previousVercel = process.env.VERCEL;
  try {
    process.env.VERCEL = "1";
    assert.equal(
      clientIpFromHeaders(
        new Headers({
          "cf-ray": "x",
          "cf-connecting-ip": "203.0.113.20",
          "x-vercel-forwarded-for": "198.51.100.9",
        }),
      ),
      "203.0.113.20",
    );
    assert.equal(
      clientIpFromHeaders(
        new Headers({
          "x-vercel-forwarded-for": "198.51.100.9",
          "x-forwarded-for": "1.2.3.4",
        }),
      ),
      "198.51.100.9",
    );
  } finally {
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
  }
});

test("geo prefers cf-ipcountry when proxied via Cloudflare", () => {
  const geo = geoFromRequestHeaders(
    new Headers({
      "cf-ray": "1",
      "cf-ipcountry": "de",
      "x-vercel-ip-country": "US",
    }),
  );
  assert.equal(geo.country, "DE");
  const vercelOnly = geoFromRequestHeaders(
    new Headers({ "x-vercel-ip-country": "US" }),
  );
  assert.equal(vercelOnly.country, "US");
});