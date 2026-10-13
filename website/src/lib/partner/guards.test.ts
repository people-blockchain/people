import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PARTNER_LOGIN_HREF,
  partnerHomeAfterLogin,
  resolvePostAuthRedirectUrl,
} from "./guards.ts";

const base = "https://www.peopleblockchain.network";

test("PARTNER_LOGIN_HREF targets partner callback", () => {
  assert.equal(PARTNER_LOGIN_HREF, "/login?callbackUrl=%2Fpartner");
});

test("partnerHomeAfterLogin defaults to /wallet", () => {
  assert.equal(partnerHomeAfterLogin(undefined), "/wallet");
  assert.equal(partnerHomeAfterLogin("/"), "/wallet");
});

test("partnerHomeAfterLogin preserves in-app callbacks", () => {
  assert.equal(partnerHomeAfterLogin("/wallet"), "/wallet");
  assert.equal(partnerHomeAfterLogin("/swap"), "/swap");
});

test("partnerHomeAfterLogin keeps partner callback paths", () => {
  assert.equal(partnerHomeAfterLogin("/partner"), "/partner");
  assert.equal(partnerHomeAfterLogin("/partner/settings"), "/partner/settings");
});

test("resolvePostAuthRedirectUrl sends successful sign-in to wallet by default", () => {
  assert.equal(resolvePostAuthRedirectUrl("/", base), `${base}/wallet`);
  assert.equal(resolvePostAuthRedirectUrl(base, base), `${base}/wallet`);
  assert.equal(resolvePostAuthRedirectUrl("/login", base), `${base}/partner`);
  assert.equal(resolvePostAuthRedirectUrl("/login?callbackUrl=%2Fpartner", base), `${base}/partner`);
});

test("resolvePostAuthRedirectUrl preserves in-origin partner URLs", () => {
  assert.equal(resolvePostAuthRedirectUrl("/partner", base), `${base}/partner`);
  assert.equal(
    resolvePostAuthRedirectUrl(`${base}/partner?tab=wallet`, base),
    `${base}/partner?tab=wallet`,
  );
});

test("resolvePostAuthRedirectUrl rejects foreign origins", () => {
  assert.equal(
    resolvePostAuthRedirectUrl("https://evil.example/phish", base),
    `${base}/partner`,
  );
});

// Regression: in-place sign-in on /founders sent `callbackUrl = <origin>/founders`, the
// callback used to answer with the relative path "/founders", and `next-auth/react`'s
// signIn(..., { redirect: false }) then threw on a bare `new URL("/founders")` — shown to
// the user as `stage: connect_start · "/founders" cannot be parsed as a URL.`
test("resolvePostAuthRedirectUrl keeps non-partner app pages absolute (/founders)", () => {
  for (const [url, expected] of [
    ["/founders", `${base}/founders`],
    [`${base}/founders`, `${base}/founders`],
    [`${base}/founders?ref=abc123`, `${base}/founders?ref=abc123`],
    ["/founders?ref=abc123", `${base}/founders?ref=abc123`],
    [`${base}/swap?in=eth#top`, `${base}/swap?in=eth#top`],
  ] as const) {
    const resolved = resolvePostAuthRedirectUrl(url, base);
    assert.equal(resolved, expected, url);
    // What next-auth's client does with the value (bare `new URL`, no base argument).
    assert.equal(new URL(resolved).href, expected);
    assert.equal(new URL(resolved).pathname, new URL(expected).pathname);
  }
});

test("resolvePostAuthRedirectUrl never returns a relative URL", () => {
  for (const url of [
    "/",
    "/founders",
    "/founders?ref=abc123",
    "/login",
    "/login?callbackUrl=%2Ffounders",
    "/partner",
    "/partner/settings?tab=keys",
    "/wallet?walletConnect=1",
    "https://evil.example/phish",
    "not a url at all",
    base,
  ]) {
    const resolved = resolvePostAuthRedirectUrl(url, base);
    assert.ok(
      new URL(resolved).origin === base,
      `${url} → ${resolved} must be an absolute same-origin URL`,
    );
  }
});
