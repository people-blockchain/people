// The wrap-key 401 used to look the same on the client whether nobody was signed in or the
// session was simply older than the reauth window. These tests pin the three pieces that keep
// those cases apart: the route error code, the session check before a retry, and cookie-name
// detection that never reads the cookie value.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  cloudSessionRetryDecision,
  errorCodeFrom,
  fetchWrapKey,
  isWalletCloudErrorCode,
} from "../src/lib/wallet-cloud-client.ts";
import { WALLET_VAULT_REAUTH_WINDOW_MS } from "../src/lib/wallet-reauth-window.ts";
import {
  hasAuthJsSessionCookie,
  isAuthJsSessionCookieName,
} from "../src/lib/wallet-wrap-key-diagnostics.ts";

const now = 1_791_890_000_000;
const secret = "super-secret-session-value";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("reauth window stays 5 minutes", () => {
  assert.equal(WALLET_VAULT_REAUTH_WINDOW_MS, 5 * 60 * 1000);
});

test("errorCodeFrom returns the route code, or the fallback when the body has none", async () => {
  assert.equal(await errorCodeFrom(jsonResponse(401, { error: "unauthorized" }), "wrap_key_failed"), "unauthorized");
  assert.equal(
    await errorCodeFrom(jsonResponse(401, { error: "reauth_required" }), "wrap_key_failed"),
    "reauth_required",
  );
  assert.equal(await errorCodeFrom(jsonResponse(500, {}), "wrap_key_failed"), "wrap_key_failed");
  assert.equal(await errorCodeFrom(jsonResponse(401, { error: "" }), "wrap_key_failed"), "wrap_key_failed");
  assert.equal(await errorCodeFrom(new Response("not-json", { status: 502 }), "wrap_key_failed"), "wrap_key_failed");
});

test("fetchWrapKey propagates unauthorized, reauth_required, and falls back to wrap_key_failed", async () => {
  globalThis.fetch = async () => jsonResponse(401, { error: "unauthorized" });
  await assert.rejects(() => fetchWrapKey(), (err) => isWalletCloudErrorCode(err, "unauthorized"));

  globalThis.fetch = async () => jsonResponse(401, { error: "reauth_required" });
  await assert.rejects(() => fetchWrapKey(), (err) => isWalletCloudErrorCode(err, "reauth_required"));

  globalThis.fetch = async () => jsonResponse(500, {});
  await assert.rejects(() => fetchWrapKey(), (err) => isWalletCloudErrorCode(err, "wrap_key_failed"));

  globalThis.fetch = async () => new Response("not-json", { status: 502 });
  await assert.rejects(() => fetchWrapKey(), (err) => isWalletCloudErrorCode(err, "wrap_key_failed"));
});

test("session check before retry: no user id is unauthorized", () => {
  assert.equal(cloudSessionRetryDecision(null, now), "unauthorized");
  assert.equal(cloudSessionRetryDecision(undefined, now), "unauthorized");
  assert.equal(cloudSessionRetryDecision({}, now), "unauthorized");
  assert.equal(cloudSessionRetryDecision({ id: "" }, now), "unauthorized");
  assert.equal(cloudSessionRetryDecision({ authTime: now }, now), "unauthorized");
});

test("session check before retry: missing or stale authTime is reauth_required", () => {
  assert.equal(cloudSessionRetryDecision({ id: "user-1" }, now), "reauth_required");
  assert.equal(cloudSessionRetryDecision({ id: "user-1", authTime: null }, now), "reauth_required");
  assert.equal(
    cloudSessionRetryDecision({ id: "user-1", authTime: now - WALLET_VAULT_REAUTH_WINDOW_MS - 1 }, now),
    "reauth_required",
  );
});

test("session check before retry: a fresh authTime is ok", () => {
  assert.equal(cloudSessionRetryDecision({ id: "user-1", authTime: now }, now), "ok");
  assert.equal(
    cloudSessionRetryDecision({ id: "user-1", authTime: now - WALLET_VAULT_REAUTH_WINDOW_MS }, now),
    "ok",
  );
  assert.equal(
    cloudSessionRetryDecision({ id: "user-1", authTime: now - 60_000 }, now),
    "ok",
  );
});

test("session cookie detection is the cookie name only, never the value", () => {
  assert.equal(hasAuthJsSessionCookie(null), false);
  assert.equal(hasAuthJsSessionCookie(undefined), false);
  assert.equal(hasAuthJsSessionCookie(""), false);
  assert.equal(hasAuthJsSessionCookie(`theme=dark; foo=${secret}`), false);
  assert.equal(hasAuthJsSessionCookie(`note=authjs.session-token`), false);
  assert.equal(hasAuthJsSessionCookie(`authjs.session-token.extra=${secret}`), false);

  assert.equal(isAuthJsSessionCookieName("authjs.session-token"), true);
  assert.equal(isAuthJsSessionCookieName("__Secure-authjs.session-token"), true);
  assert.equal(isAuthJsSessionCookieName("authjs.session-token.0"), true);
  assert.equal(isAuthJsSessionCookieName("__Secure-authjs.session-token.0"), true);
  assert.equal(isAuthJsSessionCookieName("authjs.session-token.12"), true);
  assert.equal(isAuthJsSessionCookieName("authjs.csrf-token"), false);
  assert.equal(isAuthJsSessionCookieName("authjs.session-token.0extra"), false);

  for (const header of [
    `authjs.session-token=${secret}`,
    `__Secure-authjs.session-token=${secret}`,
    `authjs.session-token.0=${secret}`,
    `__Secure-authjs.session-token.0=${secret}`,
    `a=1; authjs.session-token.1=${secret}; b=2`,
  ]) {
    const detected = hasAuthJsSessionCookie(header);
    assert.equal(detected, true);
    assert.equal(typeof detected, "boolean");
    assert.equal(String(detected).includes(secret), false);
  }
});
