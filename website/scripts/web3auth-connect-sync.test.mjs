import { test } from "node:test";
import assert from "node:assert/strict";
import {
  beginWeb3AuthConnect,
  endRestoredWeb3AuthSession,
  hasRestoredWeb3AuthSession,
  idTokenIssuedAtSec,
  isRestoredIdTokenFresh,
  restoredSessionEmailMatches,
  shouldEndRestoredSessionBeforeConnect,
  RESTORED_ID_TOKEN_MAX_AGE_SEC,
} from "../src/lib/web3auth-connect-flow.ts";

/** Unsigned fake JWT in the shape Web3Auth issues (only the payload matters here). */
function fakeJwt(payload) {
  const part = (value) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${part({ alg: "ES256", typ: "JWT" })}.${part(payload)}.sig`;
}

test("beginWeb3AuthConnect calls connectTo in the same synchronous turn", () => {
  let connectToSync = false;
  const mock = {
    connectTo: () => {
      connectToSync = true;
      return Promise.resolve({ request: async () => null });
    },
    authenticateUser: async () => ({ idToken: "header.payload.sig" }),
  };

  const promise = beginWeb3AuthConnect(mock, "google");
  assert.equal(connectToSync, true, "connectTo must run before the caller awaits");
  void promise;
});

test("beginWeb3AuthConnect passes loginProvider google to connectTo", async () => {
  let capturedParams;
  const mock = {
    connectTo: (_adapter, params) => {
      capturedParams = params;
      return Promise.resolve({ request: async () => null });
    },
    authenticateUser: async () => ({ idToken: "a.b.c" }),
  };

  await beginWeb3AuthConnect(mock, "google");
  assert.equal(capturedParams?.loginProvider, "google");
});

import {
  assertAuthAdapterReady,
  authAdapterStatus,
  buildAuthModalConfig,
} from "../src/lib/web3auth-connect-flow.ts";

test("Auth adapter modal config keeps showOnModal true (modal 9.x skips init otherwise)", () => {
  const auth = buildAuthModalConfig().auth;
  assert.ok(auth, "config is keyed by WALLET_ADAPTERS.AUTH");
  assert.equal(auth.showOnModal, true);
  assert.equal(auth.showOnDesktop, false);
  assert.equal(auth.showOnMobile, false);
  assert.equal(auth.loginMethods.google.showOnModal, true);
  assert.equal(auth.loginMethods.facebook.showOnModal, false);
});

test("assertAuthAdapterReady rejects a not-ready or missing Auth adapter", () => {
  assert.doesNotThrow(() => assertAuthAdapterReady({ walletAdapters: { auth: { status: "ready" } } }));
  assert.doesNotThrow(() => assertAuthAdapterReady({ walletAdapters: { auth: { status: "connected" } } }));
  assert.throws(
    () => assertAuthAdapterReady({ walletAdapters: { auth: { status: "not_ready" } } }),
    /web3auth_auth_adapter_not_ready:not_ready/,
  );
  assert.throws(() => assertAuthAdapterReady({ walletAdapters: {} }), /not_ready:missing/);
  assert.equal(authAdapterStatus({}), "missing");
});

test("beginWeb3AuthConnect fails fast instead of calling connectTo on a not-ready adapter", async () => {
  let called = false;
  const mock = {
    connectTo: () => {
      called = true;
      return new Promise(() => {});
    },
    authenticateUser: async () => ({ idToken: "a.b.c" }),
    walletAdapters: { auth: { status: "not_ready" } },
  };
  await assert.rejects(beginWeb3AuthConnect(mock, "google"), /web3auth_auth_adapter_not_ready:not_ready/);
  assert.equal(called, false);
});

test("beginWeb3AuthConnect reuses a restored session instead of a second connectTo", async () => {
  let called = false;
  const provider = { request: async () => null };
  const mock = {
    connected: true,
    provider,
    connectTo: () => {
      called = true;
      return new Promise(() => {});
    },
    authenticateUser: async () => ({ idToken: "x.y.z" }),
    walletAdapters: { auth: { status: "connected" } },
  };
  const result = await beginWeb3AuthConnect(mock, "google");
  assert.equal(called, false);
  assert.equal(result.provider, provider);
  assert.equal(result.idToken, "x.y.z");
});

test("idTokenIssuedAtSec reads a numeric iat and returns null for anything unreadable", () => {
  assert.equal(idTokenIssuedAtSec(fakeJwt({ iat: 1_700_000_000 })), 1_700_000_000);
  assert.equal(idTokenIssuedAtSec(fakeJwt({ iat: "1700000000" })), null);
  assert.equal(idTokenIssuedAtSec(fakeJwt({ iat: Number.NaN })), null);
  assert.equal(idTokenIssuedAtSec(fakeJwt({})), null);
  assert.equal(idTokenIssuedAtSec("not-a-jwt"), null);
  assert.equal(idTokenIssuedAtSec("x.!!!.sig"), null);
  assert.equal(idTokenIssuedAtSec(fakeJwt("not-an-object")), null);
});

test("isRestoredIdTokenFresh compares the replay window, unreadable iat counts as fresh", () => {
  const now = 1_700_000_000;
  assert.equal(isRestoredIdTokenFresh(fakeJwt({ iat: now - 60 }), now), true);
  assert.equal(isRestoredIdTokenFresh(fakeJwt({ iat: now - RESTORED_ID_TOKEN_MAX_AGE_SEC + 1 }), now), true);
  // Exactly at the window boundary counts as stale, so a reuse can never race the server check.
  assert.equal(isRestoredIdTokenFresh(fakeJwt({ iat: now - RESTORED_ID_TOKEN_MAX_AGE_SEC }), now), false);
  assert.equal(isRestoredIdTokenFresh(fakeJwt({ iat: now - 3600 }), now), false);
  // Unchanged behaviour for the tokens we cannot date.
  assert.equal(isRestoredIdTokenFresh("x.y.z", now), true);
  assert.equal(RESTORED_ID_TOKEN_MAX_AGE_SEC < 600, true, "must stay under the server window");
});

test("a restored session with a fresh token is reused without connectTo", async () => {
  const nowSec = Date.now() / 1000;
  const fresh = fakeJwt({ iat: Math.floor(nowSec) });
  let called = false;
  const provider = { request: async () => null };
  const mock = {
    connected: true,
    provider,
    connectTo: () => {
      called = true;
      return new Promise(() => {});
    },
    authenticateUser: async () => ({ idToken: fresh }),
    walletAdapters: { auth: { status: "connected" } },
  };
  const result = await beginWeb3AuthConnect(mock, "google");
  assert.equal(called, false);
  assert.equal(result.provider, provider);
  assert.equal(result.idToken, fresh);
});

test("a restored session with a stale token is ended, then a fresh login connects", async () => {
  const stale = fakeJwt({ iat: Math.floor(Date.now() / 1000) - 3600 });
  const fresh = fakeJwt({ iat: Math.floor(Date.now() / 1000) });
  const tokens = [stale, fresh];
  const adapter = { status: "connected", disconnect: async () => { adapter.status = "ready"; } };
  let connectToRan = false;
  const mock = {
    connected: true,
    provider: { request: async () => null },
    logout: async () => { throw new Error("Wallet is not connected"); },
    walletAdapters: { auth: adapter },
    connectTo: () => {
      connectToRan = true;
      return Promise.resolve({ request: async () => null });
    },
    authenticateUser: async () => ({ idToken: tokens.shift() }),
  };
  const result = await beginWeb3AuthConnect(mock, "google");
  assert.equal(adapter.status, "ready", "the stale session must be ended first");
  assert.equal(connectToRan, true, "a fresh login has to run");
  assert.equal(result.idToken, fresh, "the new login's token, not the replayed one");
});

test("an email sign-in ends a restored session first; Google keeps resuming through it", () => {
  // The email flow has to reach Web3Auth (that is what sends the login code), so the stale
  // session is ended before connectTo; Google's click is a credential the user already owns.
  const provider = { request: async () => null };
  const restored = { connected: true, provider, walletAdapters: { auth: { status: "connected" } } };
  const fresh = { connected: false, provider: null, walletAdapters: { auth: { status: "ready" } } };
  assert.equal(shouldEndRestoredSessionBeforeConnect("email_passwordless", restored), true);
  assert.equal(shouldEndRestoredSessionBeforeConnect("email_passwordless", restored, true), false);
  assert.equal(shouldEndRestoredSessionBeforeConnect("email_passwordless", fresh), false);
  assert.equal(shouldEndRestoredSessionBeforeConnect("google", restored), false);
  assert.equal(shouldEndRestoredSessionBeforeConnect("google", fresh), false);
});

test("an adapter rehydrated as connected counts as a restored session even if `connected` is false", () => {
  // Live regression after #206: `web3auth_auth_adapter_not_ready:connected` on every email
  // sign-in after a Google login in the same browser. The adapter said "connected" while the
  // SDK flag was still false, so the session was never ended.
  const half = { connected: false, provider: null, walletAdapters: { auth: { status: "connected" } } };
  assert.equal(hasRestoredWeb3AuthSession(half), true);
  // No provider: it cannot be reused, so it must be ended for either method.
  assert.equal(shouldEndRestoredSessionBeforeConnect("email_passwordless", half), true);
  assert.equal(shouldEndRestoredSessionBeforeConnect("google", half), true);
});

test("endRestoredWeb3AuthSession falls back to the adapter disconnect, then connectTo can run", async () => {
  const adapter = { status: "connected", disconnect: async () => { adapter.status = "ready"; } };
  let connectToRan = false;
  const mock = {
    connected: false,
    provider: null,
    logout: async () => { throw new Error("Wallet is not connected"); },
    walletAdapters: { auth: adapter },
    connectTo: () => { connectToRan = true; return Promise.resolve({ request: async () => null }); },
    authenticateUser: async () => ({ idToken: "fresh.token.sig" }),
  };
  await endRestoredWeb3AuthSession(mock);
  assert.equal(adapter.status, "ready");
  const result = await beginWeb3AuthConnect(mock, "email_passwordless", "user@example.com");
  assert.equal(connectToRan, true);
  assert.equal(result.idToken, "fresh.token.sig");
});

test("a restored session for the same email is reused for an email click", async () => {
  const provider = { request: async () => null };
  const mock = {
    connected: true,
    provider,
    getUserInfo: async () => ({ email: "User@Example.com" }),
    connectTo: () => { throw new Error("must reuse"); },
    authenticateUser: async () => ({ idToken: "restored.token.sig" }),
    walletAdapters: { auth: { status: "connected" } },
  };
  assert.equal(await restoredSessionEmailMatches(mock, "user@example.com"), true);
  assert.equal(await restoredSessionEmailMatches(mock, "other@example.com"), false);
  const result = await beginWeb3AuthConnect(mock, "email_passwordless", "user@example.com", { reuseRestored: true });
  assert.equal(result.provider, provider);
});

test("an email sign-in goes to connectTo with login_hint, never to a restored session", async () => {
  let capturedParams;
  const provider = { request: async () => null };
  const mock = {
    connected: true,
    provider,
    connectTo: (_adapter, params) => {
      capturedParams = params;
      return Promise.resolve({ request: async () => null });
    },
    authenticateUser: async () => ({ idToken: "email.token.sig" }),
    walletAdapters: { auth: { status: "ready" } },
  };

  const result = await beginWeb3AuthConnect(mock, "email_passwordless", "test@example.com");
  assert.equal(capturedParams?.loginProvider, "email_passwordless");
  assert.deepEqual(capturedParams?.extraLoginOptions, { login_hint: "test@example.com" });
  assert.equal(result.idToken, "email.token.sig", "the fresh login's token, not the restored one");
});

test("an email sign-in on a still-connected adapter fails fast instead of reusing it", async () => {
  // The caller must end the restored session first; a silent reuse here is exactly the bug
  // where the vault/migration check ran before any email auth (and no code was sent).
  const mock = {
    connected: true,
    provider: { request: async () => null },
    connectTo: () => {
      throw new Error("connectTo must not run on a connected adapter");
    },
    authenticateUser: async () => ({ idToken: "x.y.z" }),
    walletAdapters: { auth: { status: "connected" } },
  };
  await assert.rejects(
    beginWeb3AuthConnect(mock, "email_passwordless", "test@example.com"),
    /web3auth_auth_adapter_not_ready:connected/,
  );
});

test("beginWeb3AuthConnect calls connectTo synchronously when the adapter is ready", () => {
  let sync = false;
  const mock = {
    connectTo: () => {
      sync = true;
      return new Promise(() => {});
    },
    authenticateUser: async () => ({ idToken: "a.b.c" }),
    walletAdapters: { auth: { status: "ready" } },
  };
  void beginWeb3AuthConnect(mock, "google");
  assert.equal(sync, true);
});

import {
  SDK_MODAL_CONTAINER_ID,
  SDK_MODAL_STYLE_ID,
  hideWeb3AuthModal,
  suppressWeb3AuthModal,
} from "../src/lib/web3auth-connect-flow.ts";

test("hideWeb3AuthModal injects one style hiding the SDK modal container", () => {
  const nodes = [];
  const doc = {
    getElementById: (id) => nodes.find((n) => n.id === id) ?? null,
    createElement: () => ({ id: "", textContent: "" }),
    head: { appendChild: (n) => nodes.push(n) },
  };
  hideWeb3AuthModal(doc);
  hideWeb3AuthModal(doc);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].id, SDK_MODAL_STYLE_ID);
  assert.match(nodes[0].textContent, new RegExp(`#${SDK_MODAL_CONTAINER_ID}\\{display:none!important`));
});

test("suppressWeb3AuthModal closes the SDK modal on connecting/connected/errored", () => {
  const listeners = {};
  let closed = 0;
  suppressWeb3AuthModal({
    loginModal: { closeModal: () => closed++ },
    on: (event, fn) => {
      listeners[event] = fn;
    },
  });
  assert.deepEqual(Object.keys(listeners).sort(), ["connected", "connecting", "errored"]);
  const initial = closed;
  listeners.connected();
  listeners.errored();
  assert.equal(closed, initial + 2);
});

test("suppressWeb3AuthModal tolerates an unmounted modal", () => {
  suppressWeb3AuthModal({
    loginModal: {
      closeModal: () => {
        throw new Error("no modal");
      },
    },
    on: () => {},
  });
});

import {
  prepareRestoredSessionForConnect,
  RESTORED_SESSION_PREP_TIMEOUT_MS,
} from "../src/lib/web3auth-connect-flow.ts";
import { SIGN_IN_POPUP_TIMEOUT_MS } from "../src/lib/mobile-env.ts";

const RESTORED = {
  connected: true,
  provider: { request: async () => null },
  getUserInfo: async () => ({ email: "user@example.com" }),
  walletAdapters: { auth: { status: "connected" } },
};

test("prepareRestoredSessionForConnect touches nothing without a restored session", async () => {
  let ended = 0;
  const fresh = { connected: false, provider: null, walletAdapters: { auth: { status: "ready" } } };
  const reuse = await prepareRestoredSessionForConnect(fresh, "google", undefined, {
    endSession: async () => {
      ended += 1;
    },
    logoutSession: async () => {
      ended += 1;
    },
  });
  assert.equal(reuse, undefined);
  assert.equal(ended, 0);
});

test("prepareRestoredSessionForConnect ends a restored session the click must not reuse", async () => {
  const calls = [];
  const adapter = { status: "connected", disconnect: async () => (adapter.status = "ready") };
  const mock = { ...RESTORED, walletAdapters: { auth: adapter } };
  const reuse = await prepareRestoredSessionForConnect(mock, "email_passwordless", "other@example.com", {
    endSession: async (web3auth) => {
      calls.push("end");
      await endRestoredWeb3AuthSession(web3auth);
    },
    logoutSession: async () => {
      calls.push("logout");
    },
  });
  assert.deepEqual(calls, ["end", "logout"]);
  assert.equal(reuse, undefined, "a fresh connect has to run");
  assert.equal(adapter.status, "ready", "the adapter was actually disconnected");
});

test("prepareRestoredSessionForConnect reuses a same-email restored session without logging out", async () => {
  let loggedOut = false;
  const reuse = await prepareRestoredSessionForConnect(RESTORED, "email_passwordless", "User@Example.com", {
    endSession: async () => {},
    logoutSession: async () => {
      loggedOut = true;
    },
  });
  assert.equal(reuse, true);
  assert.equal(loggedOut, false);
});

test("prepareRestoredSessionForConnect lets Google resume through a restored session", async () => {
  let ended = 0;
  const reuse = await prepareRestoredSessionForConnect(RESTORED, "google", undefined, {
    endSession: async () => {
      ended += 1;
    },
    logoutSession: async () => {
      ended += 1;
    },
  });
  assert.equal(reuse, undefined, "beginWeb3AuthConnect reuses it from the method, not this flag");
  assert.equal(ended, 0);
});

test("a hung SDK logout times out and falls through instead of stranding the click", async () => {
  // The reported bug: a restored-session cleanup that never settles left busy/stage set forever
  // (stage connect_start) with no connect ever started — the second click worked.
  let loggedOut = false;
  const mock = { ...RESTORED, provider: null };
  const timeoutMs = 20;
  let endCalls = 0;
  const started = performance.now();
  const reuse = await prepareRestoredSessionForConnect(mock, "email_passwordless", "user@example.com", {
    endSession: () => {
      endCalls += 1;
      return new Promise(() => {});
    },
    logoutSession: async () => {
      loggedOut = true;
    },
    timeoutMs,
  });
  const elapsed = performance.now() - started;
  assert.equal(reuse, undefined);
  assert.equal(loggedOut, false);
  assert.equal(endCalls, 1, "the hung cleanup was actually started");
  // setTimeout may fire up to ~1ms early against the wall clock on loaded CI runners
  // (timer and clock granularity), so allow 2ms of slack. Since endSession never settles,
  // returning at all already proves the timeout fired; this only rules out an early bail-out.
  assert.ok(elapsed >= timeoutMs - 2, `it waited for the timeout, then gave up (${elapsed.toFixed(1)}ms)`);
});

test("a rejecting cleanup is swallowed and falls through", async () => {
  const reuse = await prepareRestoredSessionForConnect(
    { ...RESTORED, provider: null },
    "email_passwordless",
    "user@example.com",
    {
      endSession: async () => {
        throw new Error("logout_failed");
      },
      logoutSession: async () => {},
      timeoutMs: 50,
    },
  );
  assert.equal(reuse, undefined);
});

test("a restored session without a provider is ended for either method", async () => {
  let loggedOut = 0;
  for (const method of ["google", "email_passwordless"]) {
    await prepareRestoredSessionForConnect(
      { ...RESTORED, provider: null },
      method,
      undefined,
      {
        endSession: async () => {},
        logoutSession: async () => {
          loggedOut += 1;
        },
      },
    );
  }
  assert.equal(loggedOut, 2);
});

test("AUTH_LOGIN_METHODS keeps Google as the sole mainOption", async () => {
  const { AUTH_LOGIN_METHODS } = await import("../src/lib/web3auth-connect-flow.ts");
  assert.equal(AUTH_LOGIN_METHODS.google.mainOption, true);
  assert.equal(AUTH_LOGIN_METHODS.email_passwordless.mainOption, false);
  assert.equal(AUTH_LOGIN_METHODS.email_passwordless.showOnModal, true);
});

test("the restored-session prep budget stays a click, not a hang", () => {
  assert.ok(RESTORED_SESSION_PREP_TIMEOUT_MS <= 8_000);
  assert.ok(RESTORED_SESSION_PREP_TIMEOUT_MS < SIGN_IN_POPUP_TIMEOUT_MS);
});
