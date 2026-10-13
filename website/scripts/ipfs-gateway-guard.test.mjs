// Regression tests for audit M20-1: /api/ipfs/<cid> must never serve active content
// (HTML/SVG/missing type) from the site's own origin, and responses must carry
// nosniff/CSP-sandbox headers plus a size cap.
import assert from "node:assert/strict";
import test from "node:test";
import {
  IPFS_MAX_BYTES,
  IPFS_SECURITY_HEADERS,
  isAllowedIpfsContentType,
  ipfsResponseHeaders,
  normalizeIpfsContentType,
} from "@/lib/ipfs";

test("html from the gateway is rejected", () => {
  assert.equal(isAllowedIpfsContentType("text/html"), false);
  assert.equal(isAllowedIpfsContentType("text/html; charset=utf-8"), false);
});

test("svg from the gateway is rejected (script-capable image type)", () => {
  assert.equal(isAllowedIpfsContentType("image/svg+xml"), false);
});

test("missing content-type is rejected", () => {
  assert.equal(isAllowedIpfsContentType(null), false);
  assert.equal(isAllowedIpfsContentType(""), false);
});

test("png is allowed and normalized without charset params", () => {
  assert.equal(isAllowedIpfsContentType("image/png"), true);
  assert.equal(normalizeIpfsContentType("Image/PNG; charset=binary"), "image/png");
});

test("allowed response always carries nosniff + sandbox CSP + CORP", () => {
  const headers = ipfsResponseHeaders("image/png");
  assert.equal(headers["X-Content-Type-Options"], IPFS_SECURITY_HEADERS["X-Content-Type-Options"]);
  assert.match(headers["Content-Security-Policy"], /sandbox/);
  assert.equal(headers["Cross-Origin-Resource-Policy"], "same-site");
});

test("application/json responses are forced to download (never rendered inline)", () => {
  const headers = ipfsResponseHeaders("application/json");
  assert.equal(headers["Content-Disposition"], "attachment");
});

test("size cap is a sane finite bound", () => {
  assert.ok(IPFS_MAX_BYTES > 0 && IPFS_MAX_BYTES <= 50 * 1024 * 1024);
});
