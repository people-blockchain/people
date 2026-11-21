import assert from "node:assert/strict";
import test from "node:test";

import { isCloudflareIp } from "../src/lib/cloudflare-ip-ranges.ts";
import {
  clientIpFromHeaders,
  clientIpFromRequest,
  cloudflareHeadersTrusted,
} from "../src/lib/request-client-ip.ts";
import { geoFromRequestHeaders } from "../src/lib/analytics/geo.ts";

function req(headers) {
  return new Request("http://localhost", { headers });
}

test("Cloudflare range matching (v4 sample + v6 published)", () => {
  assert.ok(isCloudflareIp("104.16.0.1"));
  assert.ok(isCloudflareIp("2a06:98c0::1"));
  assert.ok(!isCloudflareIp("203.0.113.10"));
  assert.ok(!isCloudflareIp("198.51.100.9"));
});

test("forged cf-* on Vercel never wins without TRUST_CLOUDFLARE_HEADERS and a CF hop", () => {
  const previousTrust = process.env.TRUST_PROXY_HEADERS;
  const previousCf = process.env.TRUST_CLOUDFLARE_HEADERS;
  const previousVercel = process.env.VERCEL;
  try {
    delete process.env.TRUST_PROXY_HEADERS;
    delete process.env.TRUST_CLOUDFLARE_HEADERS;
    process.env.VERCEL = "1";
    assert.equal(
      clientIpFromRequest(
        req({
          "cf-ray": "forged",
          "cf-connecting-ip": "203.0.113.10",
          "x-vercel-forwarded-for": "198.51.100.9",
        }),
      ),
      "198.51.100.9",
    );
    assert.equal(cloudflareHeadersTrusted(new Headers({ "cf-ray": "1" })), false);
  } finally {
    if (previousTrust === undefined) delete process.env.TRUST_PROXY_HEADERS;
    else process.env.TRUST_PROXY_HEADERS = previousTrust;
    if (previousCf === undefined) delete process.env.TRUST_CLOUDFLARE_HEADERS;
    else process.env.TRUST_CLOUDFLARE_HEADERS = previousCf;
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
  }
});

test("TRUST_CLOUDFLARE_HEADERS off ignores cf-connecting-ip even with CF-range hop", () => {
  const previousCf = process.env.TRUST_CLOUDFLARE_HEADERS;
  const previousVercel = process.env.VERCEL;
  try {
    delete process.env.TRUST_CLOUDFLARE_HEADERS;
    process.env.VERCEL = "1";
    assert.equal(
      clientIpFromHeaders(
        new Headers({
          "x-real-ip": "104.16.0.1",
          "cf-connecting-ip": "203.0.113.20",
          "x-vercel-forwarded-for": "198.51.100.9",
        }),
      ),
      "198.51.100.9",
    );
  } finally {
    if (previousCf === undefined) delete process.env.TRUST_CLOUDFLARE_HEADERS;
    else process.env.TRUST_CLOUDFLARE_HEADERS = previousCf;
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
  }
});

test("TRUST_CLOUDFLARE_HEADERS on + CF-range hop uses cf-connecting-ip", () => {
  const previousCf = process.env.TRUST_CLOUDFLARE_HEADERS;
  const previousVercel = process.env.VERCEL;
  try {
    process.env.TRUST_CLOUDFLARE_HEADERS = "1";
    process.env.VERCEL = "1";
    assert.equal(
      clientIpFromHeaders(
        new Headers({
          "x-real-ip": "104.16.0.1",
          "cf-ray": "real",
          "cf-connecting-ip": "203.0.113.20",
          "x-vercel-forwarded-for": "198.51.100.9",
        }),
      ),
      "203.0.113.20",
    );
    assert.equal(
      clientIpFromHeaders(
        new Headers({
          "x-real-ip": "2a06:98c0::1",
          "true-client-ip": "2001:db8::5",
        }),
      ),
      "2001:db8::5",
    );
    assert.ok(
      cloudflareHeadersTrusted(
        new Headers({ "x-real-ip": "104.16.0.1", "cf-connecting-ip": "1.2.3.4" }),
      ),
    );
  } finally {
    if (previousCf === undefined) delete process.env.TRUST_CLOUDFLARE_HEADERS;
    else process.env.TRUST_CLOUDFLARE_HEADERS = previousCf;
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
  }
});

test("geo prefers cf-ipcountry only when Cloudflare headers are trusted", () => {
  const previousCf = process.env.TRUST_CLOUDFLARE_HEADERS;
  const previousVercel = process.env.VERCEL;
  try {
    delete process.env.TRUST_CLOUDFLARE_HEADERS;
    process.env.VERCEL = "1";
    const ignored = geoFromRequestHeaders(
      new Headers({
        "cf-ray": "forged",
        "cf-ipcountry": "de",
        "x-vercel-ip-country": "US",
      }),
    );
    assert.equal(ignored.country, "US");

    process.env.TRUST_CLOUDFLARE_HEADERS = "1";
    const trusted = geoFromRequestHeaders(
      new Headers({
        "x-real-ip": "104.16.0.1",
        "cf-ipcountry": "de",
        "x-vercel-ip-country": "US",
      }),
    );
    assert.equal(trusted.country, "DE");
  } finally {
    if (previousCf === undefined) delete process.env.TRUST_CLOUDFLARE_HEADERS;
    else process.env.TRUST_CLOUDFLARE_HEADERS = previousCf;
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
  }
});

test("Vercel platform IP path unchanged without Cloudflare trust", () => {
  const previousVercel = process.env.VERCEL;
  const previousCf = process.env.TRUST_CLOUDFLARE_HEADERS;
  try {
    process.env.VERCEL = "1";
    delete process.env.TRUST_CLOUDFLARE_HEADERS;
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
    if (previousCf === undefined) delete process.env.TRUST_CLOUDFLARE_HEADERS;
    else process.env.TRUST_CLOUDFLARE_HEADERS = previousCf;
  }
});