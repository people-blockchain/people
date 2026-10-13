import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PENDING_KEY,
  PENDING_MAX_AGE_MS,
  hasWeb3AuthRedirectResult,
  hasWeb3AuthRedirectResultInParams,
  readPendingRedirect,
  resolvePostSignInNavigation,
  resolveResumeTarget,
  runResumeOnce,
  takePendingRedirect,
  waitForSessionUser,
  waitForWeb3AuthConnected,
  writePendingRedirect,
} from "../src/lib/web3auth-redirect-resume.ts";

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map,
  };
}

test("pending redirect round-trips and is taken only once", () => {
  const store = memoryStorage();
  writePendingRedirect(store, "/swap?x=1", 1000);
  assert.deepEqual(readPendingRedirect(store, 2000), { returnTo: "/swap?x=1", at: 1000 });
  assert.equal(takePendingRedirect(store, 2000)?.returnTo, "/swap?x=1");
  assert.equal(takePendingRedirect(store, 2000), null);
  assert.equal(store.map.has(PENDING_KEY), false);
});

test("expired or unsafe pending entries are ignored", () => {
  const store = memoryStorage();
  writePendingRedirect(store, "/", 0);
  assert.equal(readPendingRedirect(store, PENDING_MAX_AGE_MS + 1), null);
  store.setItem(PENDING_KEY, JSON.stringify({ returnTo: "//evil.example", at: 0 }));
  assert.equal(readPendingRedirect(store, 1), null);
  store.setItem(PENDING_KEY, "{not json");
  assert.equal(readPendingRedirect(store, 1), null);
});

test("redirect result is detected in hash or query", () => {
  assert.equal(hasWeb3AuthRedirectResult("", "#b64Params=abc"), true);
  assert.equal(hasWeb3AuthRedirectResult("?b64Params=abc", ""), true);
  assert.equal(hasWeb3AuthRedirectResult("", "#sessionId=1"), true);
  assert.equal(hasWeb3AuthRedirectResult("?callbackUrl=/wallet", "#top"), false);
});

test("the server-side (searchParams) redirect-result check matches the client-side one", () => {
  // The login page's `SignedInRedirect` must not bounce an already-signed-in visitor away
  // while these params are present: that would strand a mobile Web3Auth resume mid-flight
  // (its client-side navigation back to e.g. /founders?ref=... never runs).
  assert.equal(hasWeb3AuthRedirectResultInParams({ b64Params: "abc" }), true);
  assert.equal(hasWeb3AuthRedirectResultInParams({ sessionId: "1" }), true);
  assert.equal(hasWeb3AuthRedirectResultInParams({ callbackUrl: "/wallet" }), false);
  assert.equal(hasWeb3AuthRedirectResultInParams({}), false);
});

test("resume never stays on /login", () => {
  assert.equal(resolveResumeTarget("/swap?pair=1"), "/swap?pair=1");
  assert.equal(resolveResumeTarget("/"), "/");
  assert.equal(resolveResumeTarget("/login"), "/wallet");
  assert.equal(resolveResumeTarget("/login?callbackUrl=%2Fpartner"), "/partner");
  assert.equal(resolveResumeTarget("/login?callbackUrl=https://evil.example"), "/wallet");
  assert.equal(resolveResumeTarget("/login?callbackUrl=/login"), "/wallet");
  assert.equal(resolveResumeTarget(null), "/wallet");
  assert.equal(resolveResumeTarget("//evil.example"), "/wallet");
});

test("a finished popup sign-in off /login actually leaves the page", () => {
  // Regression: the desktop popup path never navigated, so /login kept the sign-in panel up
  // over a valid session and every click "succeeded" again — the owner's login loop.
  assert.equal(resolvePostSignInNavigation("/login"), "/wallet");
  assert.equal(resolvePostSignInNavigation("/login?callbackUrl=%2Ffounders"), "/founders");
  assert.equal(resolvePostSignInNavigation("/login?callbackUrl=%2Fwallet%3Ftab%3Dnfts"), "/wallet?tab=nfts");
  assert.equal(resolvePostSignInNavigation("/login?callbackUrl=https://evil.example"), "/wallet");
  // Locale is a cookie, not a path segment, so /login is the only sign-in route.
  assert.equal(resolvePostSignInNavigation("/login-help"), null);
});

test("an in-place sign-in elsewhere does not reload the route (wallet modal stays put)", () => {
  assert.equal(resolvePostSignInNavigation("/wallet"), null);
  assert.equal(resolvePostSignInNavigation("/founders"), null);
  assert.equal(resolvePostSignInNavigation("/swap?pair=1"), null);
  assert.equal(resolvePostSignInNavigation("/"), null);
});

test("a resumed sign-in moves from the current page to the remembered one", () => {
  assert.equal(resolvePostSignInNavigation("/", "/founders"), "/founders");
  assert.equal(resolvePostSignInNavigation("/wallet", "/wallet"), null);
  assert.equal(resolvePostSignInNavigation("/", null), null);
});

test("the popup sign-in path navigates once the outcome is connected", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../src/components/wallet/WalletWeb3AuthSignIn.tsx"),
    "utf8",
  );
  assert.match(
    src,
    /\.then\(\s*\(outcome\)\s*=>\s*\{[^}]*outcome === "connected"[^}]*navigateAfterSignIn\(\)/,
  );
  // The whole page must move (server components and the session bridge re-read the cookie).
  assert.match(src, /navigateAfterSignIn[\s\S]*window\.location\.replace\(target\)/);
  assert.match(src, /resolvePostSignInNavigation/);
});

test("the email flow ends a restored Web3Auth session before it connects", () => {
  // Regression: the cached Auth adapter rehydrates on every load after a previous login, and
  // resuming through it answered the email click with the old identity — no login code was
  // ever sent and the vault/migration notice appeared first.
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../src/components/wallet/WalletWeb3AuthSignIn.tsx"),
    "utf8",
  );
  assert.match(src, /hasRestoredWeb3AuthSession\(web3auth\)/);
  // The click routes the decision through the bounded helper (8s, never rejects) so a hung SDK
  // logout falls through to a fresh connect instead of stranding the card on "Signing in…".
  assert.match(src, /prepareRestoredSessionForConnect\(web3auth, method, emailHint/);
  assert.match(src, /endSession: endRestoredWeb3AuthSession/);
  // What the helper decides is pinned by behaviour tests in web3auth-connect-sync.test.mjs;
  // this keeps the rule itself where the regression was.
  const flow = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../src/lib/web3auth-connect-flow.ts"),
    "utf8",
  );
  assert.match(flow, /shouldEndRestoredSessionBeforeConnect\(method, web3auth, sameEmail\)/);
  assert.match(flow, /await endSession\(web3auth\)/);
  assert.match(flow, /await logoutSession\(\)/);
});

test("keeping the existing wallet finishes the sign-in instead of the email form", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../src/components/wallet/WalletWeb3AuthSignIn.tsx"),
    "utf8",
  );
  assert.match(src, /keepExistingWallet[\s\S]*finishConnect\(migration\.userId, migration\.email\)/);
  assert.match(src, /finishConnect\(migration\.userId, migration\.email\)[\s\S]*navigateAfterSignIn\(returnToRef\.current\)/);
  assert.match(src, /onKeepExisting=\{\(\) => void keepExistingWallet\(\)\}/);
});

test("session user read retries while the cookie is not visible yet", async () => {
  let calls = 0;
  const user = await waitForSessionUser(
    async () => (++calls < 3 ? null : { id: "u1" }),
    [0, 1, 1, 1],
    async () => {},
  );
  assert.deepEqual(user, { id: "u1" });
  assert.equal(calls, 3);
});

test("session user read gives up and survives fetch errors", async () => {
  let calls = 0;
  const user = await waitForSessionUser(
    async () => {
      calls += 1;
      throw new Error("network");
    },
    [0, 1],
    async () => {},
  );
  assert.equal(user, null);
  assert.equal(calls, 2);
});

test("waits for the connected event after init", async () => {
  const sdk = Object.assign(new EventEmitter(), { connected: false });
  const wait = waitForWeb3AuthConnected(sdk, 1000);
  sdk.connected = true;
  sdk.emit("connected");
  assert.equal(await wait, true);
  assert.equal(sdk.listenerCount("connected"), 0);
  assert.equal(sdk.listenerCount("errored"), 0);
});

test("connection wait resolves false on error or timeout", async () => {
  const sdk = Object.assign(new EventEmitter(), { connected: false });
  const errored = waitForWeb3AuthConnected(sdk, 1000);
  sdk.emit("errored", new Error("x"));
  assert.equal(await errored, false);
  assert.equal(await waitForWeb3AuthConnected(sdk, 5), false);
  assert.equal(await waitForWeb3AuthConnected({ connected: true }, 5), true);
});

test("resume runs once while in flight", async () => {
  let runs = 0;
  let release;
  const gate = new Promise((r) => (release = r));
  const first = runResumeOnce(async () => {
    runs += 1;
    await gate;
    return "connected";
  });
  const second = runResumeOnce(async () => {
    runs += 1;
    return "other";
  });
  release();
  assert.deepEqual(await Promise.all([first, second]), ["connected", "connected"]);
  assert.equal(runs, 1);
  assert.equal(await runResumeOnce(async () => "next"), "next");
});
