import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafeInAppPath, sanitizeInAppPath } from "../src/lib/safe-return-path.ts";
import { isSafeReturnPath, resolveResumeTarget } from "../src/lib/web3auth-redirect-resume.ts";
import {
  partnerHomeAfterLogin,
  resolvePostAuthRedirectUrl,
} from "../src/lib/partner/guards.ts";
import { isSafeLinkTarget } from "../src/lib/discover/url-policy.ts";

const BYPASS_PAYLOADS = [
  "/\t/evil.example",
  "/\n/evil.example",
  "/\r/evil.example",
  "/\r\n/evil.example",
  "/\u0000/evil.example",
  "/\u001f/evil.example",
  "/\u007f/evil.example",
  "/\\evil.example",
  "/\\/evil.example",
  "\\\\evil.example",
  "//evil.example",
  "///evil.example",
  "/ok\t",
  "/ok\n?x=1",
  "http://evil.example",
  "javascript:alert(1)",
  "evil.example",
  "",
  "   ",
];

const NORMAL_PATHS = [
  "/",
  "/wallet",
  "/partner",
  "/founders?ref=abc",
  "/lavka/v/some-slug/pay",
  "/wallet#section",
  "/a/b?x=1&y=%2F%2Fevil.example",
];

test("sanitizeInAppPath rejects control-char, backslash and protocol-relative payloads", () => {
  for (const p of BYPASS_PAYLOADS) {
    assert.equal(sanitizeInAppPath(p), null, JSON.stringify(p));
    assert.equal(isSafeInAppPath(p), false, JSON.stringify(p));
  }
  for (const v of [null, undefined, 42, {}, []]) assert.equal(sanitizeInAppPath(v), null);
});

test("sanitizeInAppPath keeps normal in-app paths", () => {
  for (const p of NORMAL_PATHS) assert.equal(sanitizeInAppPath(p), p);
});

test("sanitizeInAppPath never changes origin for any single control char after the slash", () => {
  for (let c = 0; c < 0x20; c++) {
    const p = `/${String.fromCharCode(c)}/evil.example`;
    assert.equal(sanitizeInAppPath(p), null, JSON.stringify(p));
  }
});

test("isSafeReturnPath rejects bypass payloads and accepts normal paths", () => {
  for (const p of BYPASS_PAYLOADS) assert.equal(isSafeReturnPath(p), false, JSON.stringify(p));
  for (const p of NORMAL_PATHS) assert.equal(isSafeReturnPath(p), true, p);
});

test("resolveResumeTarget falls back for bypass payloads, also via login callbackUrl", () => {
  for (const p of BYPASS_PAYLOADS) assert.equal(resolveResumeTarget(p), "/wallet", JSON.stringify(p));
  for (const p of BYPASS_PAYLOADS) {
    const wrapped = `/login?callbackUrl=${encodeURIComponent(p)}`;
    assert.equal(resolveResumeTarget(wrapped), "/wallet", JSON.stringify(wrapped));
  }
  assert.equal(resolveResumeTarget("/founders?x=1"), "/founders?x=1");
  assert.equal(resolveResumeTarget("/login?callbackUrl=%2Fpartner"), "/partner");
});

test("partnerHomeAfterLogin ignores bypass payloads", () => {
  for (const p of BYPASS_PAYLOADS) assert.equal(partnerHomeAfterLogin(p), "/wallet", JSON.stringify(p));
  assert.equal(partnerHomeAfterLogin("/partner/x?y=1"), "/partner/x?y=1");
  assert.equal(partnerHomeAfterLogin("/lavka"), "/lavka");
});

test("resolvePostAuthRedirectUrl never leaves the base origin", () => {
  const base = "https://people.example";
  for (const p of BYPASS_PAYLOADS) {
    const out = resolvePostAuthRedirectUrl(p, base);
    assert.equal(new URL(out).origin, base, JSON.stringify(p));
  }
  assert.equal(resolvePostAuthRedirectUrl("/\t/evil.example", base), `${base}/partner`);
  assert.equal(resolvePostAuthRedirectUrl("/founders?a=1", base), `${base}/founders?a=1`);
});

test("isSafeLinkTarget rejects control-char paths but keeps http(s) and normal paths", () => {
  for (const p of ["/\t/evil.example", "/\n/evil", "/\\evil", "//evil.example", "javascript:alert(1)", ""]) {
    assert.equal(isSafeLinkTarget(p), false, JSON.stringify(p));
  }
  assert.equal(isSafeLinkTarget("/token/abc"), true);
  assert.equal(isSafeLinkTarget("https://example.com/x"), true);
});

test("resolvePostAuthRedirectUrl rejects absolute URLs carrying control chars or backslashes", () => {
  const base = "https://people.example";
  for (const p of [`${base}/\t/evil.example`, `${base}/\n/evil.example`, `${base}/\\evil.example`, "https:\\\\evil.example"]) {
    assert.equal(resolvePostAuthRedirectUrl(p, base), `${base}/partner`, JSON.stringify(p));
  }
  assert.equal(resolvePostAuthRedirectUrl(`${base}/founders?a=1`, base), `${base}/founders?a=1`);
});

test("percent-encoded %09 / %5c stay inert literal path text and never change origin", () => {
  for (const p of ["/%09/evil.example", "/%5cevil.example", "/%0d%0a/evil.example"]) {
    const out = sanitizeInAppPath(p);
    assert.equal(out, p);
    assert.equal(new URL(out, "https://people.example").origin, "https://people.example");
  }
  const base = "https://people.example";
  for (const p of ["/%09/evil.example", "/%5cevil.example"]) {
    assert.equal(new URL(resolvePostAuthRedirectUrl(p, base)).origin, base);
  }
});
