import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isMobileUserAgent,
  walletAppDeepLink,
  withTimeout,
  TimeoutError,
} from "../src/lib/mobile-env.ts";

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36";

test("detects Android Chrome, desktop, and iPadOS", () => {
  assert.equal(isMobileUserAgent(ANDROID), true);
  assert.equal(isMobileUserAgent(DESKTOP), false);
  assert.equal(isMobileUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5), true);
  assert.equal(isMobileUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0), false);
});

test("MetaMask deep link uses host+path without protocol", () => {
  assert.equal(
    walletAppDeepLink("metamask", "https://peopleblockchain.network/wallet?x=1"),
    "https://metamask.app.link/dapp/peopleblockchain.network/wallet?x=1",
  );
});

test("Trust deep link encodes the full page URL", () => {
  const link = walletAppDeepLink("trust", "https://peopleblockchain.network/wallet?x=1&y=2");
  assert.equal(
    link,
    "https://link.trustwallet.com/open_url?coin_id=60&url=https%3A%2F%2Fpeopleblockchain.network%2Fwallet%3Fx%3D1%26y%3D2",
  );
});

test("withTimeout rejects with TimeoutError and passes through results", async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 20), TimeoutError);
  assert.equal(await withTimeout(Promise.resolve(7), 50), 7);
});

import {
  prefersRedirectSignIn,
  watchRedirectStart,
  formatSignInStage,
  isSignInDebugEnabled,
  signInErrorLabel,
  WEB3AUTH_INIT_TIMEOUT_MS,
  REDIRECT_START_TIMEOUT_MS,
  SIGN_IN_POPUP_TIMEOUT_MS,
  SIGN_IN_SLOW_NOTICE_MS,
} from "../src/lib/mobile-env.ts";

const ANDROID_DESKTOP_MODE = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36";

test("redirect sign-in: Android Chrome, its Desktop-site mode, not plain desktop or ChromeOS", () => {
  assert.equal(prefersRedirectSignIn(ANDROID, 5), true);
  assert.equal(prefersRedirectSignIn(ANDROID, 0), true);
  assert.equal(prefersRedirectSignIn(ANDROID_DESKTOP_MODE, 5), true);
  assert.equal(prefersRedirectSignIn(DESKTOP, 0), false);
  assert.equal(prefersRedirectSignIn("Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/126", 10), false);
});

test("init and redirect-start budgets are at most 15s", () => {
  assert.ok(WEB3AUTH_INIT_TIMEOUT_MS <= 15_000);
  assert.ok(REDIRECT_START_TIMEOUT_MS <= 15_000);
});

test("popup sign-in budget leaves room for the hCaptcha and email-code pages", () => {
  // Google/email sign-in can take 1–2 min in hCaptcha before the email-code page even appears.
  assert.equal(SIGN_IN_POPUP_TIMEOUT_MS, 15 * 60_000);
});

test("watchRedirectStart rejects with the start label when the page never leaves", async () => {
  const target = new EventTarget();
  const watch = watchRedirectStart(new Promise(() => {}), { target, startMs: 10 });
  await assert.rejects(watch.promise, (err) => err instanceof TimeoutError && err.message === "web3auth_redirect_start_timeout");
});

test("watchRedirectStart: leaving cancels the start timeout and reports redirect_pending", async () => {
  const target = new EventTarget();
  let left = 0;
  const watch = watchRedirectStart(new Promise(() => {}), {
    target,
    startMs: 20,
    leaveGraceMs: 60,
    onLeave: () => left++,
  });
  let settled = false;
  watch.promise.catch(() => {}).finally(() => (settled = true));
  target.dispatchEvent(new Event("beforeunload"));
  target.dispatchEvent(new Event("pagehide"));
  assert.equal(left, 1);
  await new Promise((r) => setTimeout(r, 35));
  assert.equal(settled, false, "start timeout must not fire once the page is leaving");
  await assert.rejects(watch.promise, (err) => err.message === "web3auth_redirect_stalled");
});

test("watchRedirectStart passes through the flow result and errors", async () => {
  const target = new EventTarget();
  assert.equal(await watchRedirectStart(Promise.resolve(7), { target, startMs: 50 }).promise, 7);
  await assert.rejects(
    watchRedirectStart(Promise.reject(new Error("boom")), { target, startMs: 50 }).promise,
    /boom/,
  );
});

test("watchRedirectStart.cancel stops timers (bfcache restore)", async () => {
  const target = new EventTarget();
  const watch = watchRedirectStart(new Promise(() => {}), { target, startMs: 10 });
  let settled = false;
  watch.promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  watch.cancel();
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(settled, false);
});

test("stage line formatting and error labels", () => {
  assert.equal(formatSignInStage(null), null);
  assert.equal(formatSignInStage("sdk_init"), "stage: sdk_init");
  assert.equal(formatSignInStage("connect_start", "web3auth_redirect_start_timeout"), "stage: connect_start · web3auth_redirect_start_timeout");
  assert.equal(formatSignInStage("connect_finishing"), "stage: connect_finishing");
  assert.equal(formatSignInStage(null, "x"), "failed: x");
  assert.equal(signInErrorLabel(new TimeoutError("web3auth_init_timeout")), "web3auth_init_timeout");
  assert.equal(signInErrorLabel("s"), "s");
  assert.equal(signInErrorLabel(42), "unknown_error");
});

test("the stage/failure line is only enabled with ?debug=1 (never shown to normal users)", () => {
  // Issue: a raw machine label like "stage: connect_start" was rendered to every user mid
  // sign-in. The line itself may still exist (console + opt-in debug view); it must default off.
  assert.equal(isSignInDebugEnabled(""), false);
  assert.equal(isSignInDebugEnabled("?foo=1"), false);
  assert.equal(isSignInDebugEnabled("?debug=0"), false);
  assert.equal(isSignInDebugEnabled("?debug=1"), true);
  assert.equal(isSignInDebugEnabled("", "#debug=1"), true);
  assert.equal(isSignInDebugEnabled("?other=1&debug=1"), true);
});

test("the slow notice is advisory and well inside the popup ceiling", () => {
  // Long enough that a person in the popup's hCaptcha does not see it immediately, short enough
  // to name a stalled attempt while they are still looking at the card.
  assert.equal(SIGN_IN_SLOW_NOTICE_MS, 20_000);
  assert.ok(SIGN_IN_SLOW_NOTICE_MS < SIGN_IN_POPUP_TIMEOUT_MS);
});
