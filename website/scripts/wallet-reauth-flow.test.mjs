// A session cookie ~2 hours old still has a user id. Web3Auth then returns a fresh id_token,
// but the client used to treat "any user id" as success and call wrap-key with the old authTime.
// These tests pin the reauth clock (jwt callback) and the one-shot client flow around it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { applyAuthJwtCallback } from "../src/lib/auth-jwt-callback.ts";
import { isAuthTimeFresh } from "../src/lib/wallet-reauth-window.ts";
import { WalletCloudError, isWalletCloudErrorCode } from "../src/lib/wallet-cloud-client.ts";
import { openCloudVaultWithReauth } from "../src/lib/wallet-reauth-flow.ts";
import { waitForFreshSessionUser } from "../src/lib/web3auth-redirect-resume.ts";

const now = 1_791_890_000_000;
const twoHours = 2 * 60 * 60 * 1000;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function staleToken() {
  return { sub: "user-1", authTime: now - twoHours, provider: "web3auth" };
}

function instantWait(fetchSession, nowMs) {
  return waitForFreshSessionUser(fetchSession, [0, 0, 0], async () => {}, nowMs);
}

test("waitForFreshSessionUser keeps polling until authTime is fresh", async () => {
  const stale = { id: "user-1", authTime: now - twoHours };
  const fresh = { id: "user-1", authTime: now };
  const reads = [stale, { id: "user-1" }, fresh];
  let i = 0;
  const user = await waitForFreshSessionUser(
    async () => reads[i++] ?? null,
    [0, 0, 0, 0],
    async () => {},
    now,
  );
  assert.deepEqual(user, fresh);
  assert.equal(i, 3);
});

test("waitForFreshSessionUser reads Date.now on each poll when now is omitted", async () => {
  const original = Date.now;
  const stamps = [];
  let n = 0;
  Date.now = () => {
    const stamp = now + n * 1_000;
    n += 1;
    stamps.push(stamp);
    return stamp;
  };
  try {
    const user = await waitForFreshSessionUser(
      async () => ({ id: "user-1", authTime: now - twoHours }),
      [0, 0, 0],
      async () => {},
    );
    assert.equal(user, null);
  } finally {
    Date.now = original;
  }
  assert.equal(stamps.length, 3);
});

test("waitForFreshSessionUser gives up when the session stays stale", async () => {
  let calls = 0;
  const user = await waitForFreshSessionUser(
    async () => {
      calls += 1;
      return { id: "user-1", authTime: now - twoHours };
    },
    [0, 0],
    async () => {},
    now,
  );
  assert.equal(user, null);
  assert.equal(calls, 2);
});

test("stale session: one sign-in refreshes authTime, then wrap-key succeeds", async () => {
  const token = staleToken();
  let signIns = 0;
  let wrapKeys = 0;

  const opened = await openCloudVaultWithReauth({
    fetchSession: async () => (token.sub ? { id: token.sub, authTime: token.authTime } : null),
    idToken: "fresh-id-token",
    now,
    waitForFreshSession: instantWait,
    signInWithIdToken: async () => {
      signIns += 1;
      applyAuthJwtCallback(token, {
        user: { id: "user-1" },
        account: { provider: "web3auth" },
        trigger: "signIn",
        session: { authTime: now - twoHours },
        nowMs: now,
      });
    },
    openVault: async () => {
      wrapKeys += 1;
      if (!isAuthTimeFresh(token.authTime, now)) throw new WalletCloudError("reauth_required");
      return { ok: true };
    },
  });

  assert.equal(opened.ok, true);
  assert.equal(signIns, 1);
  assert.equal(wrapKeys, 1);
  assert.equal(token.authTime, now);
  assert.equal(isAuthTimeFresh(token.authTime, now), true);
});

test("first poll after sign-in can still be the old cookie; the next one wins", async () => {
  const previousAuthTime = now - 30_000;
  let signIns = 0;
  let signedIn = false;
  let pollsAfterSignIn = 0;
  let wrapKeys = 0;

  const opened = await openCloudVaultWithReauth({
    fetchSession: async () => {
      if (!signedIn) return { id: "user-1", authTime: previousAuthTime };
      pollsAfterSignIn += 1;
      return { id: "user-1", authTime: pollsAfterSignIn === 1 ? previousAuthTime : now };
    },
    idToken: "fresh-id-token",
    now,
    waitForFreshSession: instantWait,
    signInWithIdToken: async () => {
      signIns += 1;
      signedIn = true;
    },
    openVault: async (session) => {
      wrapKeys += 1;
      if (wrapKeys === 1) throw new WalletCloudError("reauth_required");
      assert.equal(session.authTime, now);
      return { ok: true };
    },
  });

  assert.equal(opened.ok, true);
  assert.equal(signIns, 1);
  assert.equal(pollsAfterSignIn, 2);
  assert.equal(wrapKeys, 2);
});

test("wrap-key reauth_required with a fresh-looking session retries sign-in once", async () => {
  const token = staleToken();
  const lookedFreshAt = now - 60_000;
  let signIns = 0;
  let wrapKeys = 0;
  let clientSaysFresh = true;

  const opened = await openCloudVaultWithReauth({
    fetchSession: async () => ({
      id: "user-1",
      authTime: clientSaysFresh ? lookedFreshAt : token.authTime,
    }),
    idToken: "fresh-id-token",
    now,
    waitForFreshSession: instantWait,
    signInWithIdToken: async () => {
      signIns += 1;
      clientSaysFresh = false;
      applyAuthJwtCallback(token, {
        user: { id: "user-1" },
        trigger: "signIn",
        nowMs: now,
      });
    },
    openVault: async () => {
      wrapKeys += 1;
      if (!isAuthTimeFresh(token.authTime, now)) throw new WalletCloudError("reauth_required");
      return { ok: true };
    },
  });

  assert.equal(opened.ok, true);
  assert.equal(signIns, 1);
  assert.equal(wrapKeys, 2);
});

test("update() and a plain session read leave authTime old, so wrap-key stays reauth_required", () => {
  const updated = staleToken();
  applyAuthJwtCallback(updated, {
    user: { id: "user-1" },
    trigger: "update",
    session: { authTime: now },
    nowMs: now,
  });
  assert.equal(updated.authTime, now - twoHours);
  assert.equal(isAuthTimeFresh(updated.authTime, now), false);

  const read = staleToken();
  applyAuthJwtCallback(read, { nowMs: now });
  assert.equal(read.authTime, now - twoHours);
  assert.equal(isAuthTimeFresh(read.authTime, now), false);
});

test("signUp refreshes authTime; a signIn without a user id does not", () => {
  const signedUp = staleToken();
  applyAuthJwtCallback(signedUp, { user: { id: "user-1" }, trigger: "signUp", nowMs: now });
  assert.equal(signedUp.authTime, now);

  const noUser = staleToken();
  applyAuthJwtCallback(noUser, { trigger: "signIn", session: { authTime: now }, nowMs: now });
  assert.equal(noUser.authTime, now - twoHours);
});

test("no idToken throws reauth_required and never signs in or opens the vault", async () => {
  let signIns = 0;
  let wrapKeys = 0;
  await assert.rejects(
    () =>
      openCloudVaultWithReauth({
        fetchSession: async () => ({ id: "user-1", authTime: now - twoHours }),
        idToken: null,
        now,
        waitForFreshSession: instantWait,
        signInWithIdToken: async () => {
          signIns += 1;
        },
        openVault: async () => {
          wrapKeys += 1;
          return { ok: true };
        },
      }),
    (err) => isWalletCloudErrorCode(err, "reauth_required"),
  );
  assert.equal(signIns, 0);
  assert.equal(wrapKeys, 0);
});

test("sign-in that leaves the session stale throws reauth_required once and does not loop", async () => {
  let signIns = 0;
  let wrapKeys = 0;
  await assert.rejects(
    () =>
      openCloudVaultWithReauth({
        fetchSession: async () => ({ id: "user-1", authTime: now - twoHours }),
        idToken: "fresh-id-token",
        now,
        waitForFreshSession: instantWait,
        signInWithIdToken: async () => {
          signIns += 1;
        },
        openVault: async () => {
          wrapKeys += 1;
          throw new WalletCloudError("reauth_required");
        },
      }),
    (err) => isWalletCloudErrorCode(err, "reauth_required"),
  );
  assert.equal(signIns, 1);
  assert.equal(wrapKeys, 0);
});

test("a non-reauth vault error is rethrown and does not sign in", async () => {
  let signIns = 0;
  let wrapKeys = 0;
  await assert.rejects(
    () =>
      openCloudVaultWithReauth({
        fetchSession: async () => ({ id: "user-1", authTime: now }),
        idToken: "fresh-id-token",
        now,
        waitForFreshSession: instantWait,
        signInWithIdToken: async () => {
          signIns += 1;
        },
        openVault: async () => {
          wrapKeys += 1;
          throw new WalletCloudError("rate_limited");
        },
      }),
    (err) => isWalletCloudErrorCode(err, "rate_limited"),
  );
  assert.equal(signIns, 0);
  assert.equal(wrapKeys, 1);
});

test("a vault rejection after the one reauth is not signed in again", async () => {
  const token = staleToken();
  let signIns = 0;
  let wrapKeys = 0;
  await assert.rejects(
    () =>
      openCloudVaultWithReauth({
        fetchSession: async () => ({ id: token.sub, authTime: token.authTime }),
        idToken: "fresh-id-token",
        now,
        waitForFreshSession: instantWait,
        signInWithIdToken: async () => {
          signIns += 1;
          applyAuthJwtCallback(token, { user: { id: "user-1" }, trigger: "signIn", nowMs: now });
        },
        openVault: async () => {
          wrapKeys += 1;
          throw new WalletCloudError("unauthorized");
        },
      }),
    (err) => isWalletCloudErrorCode(err, "unauthorized"),
  );
  assert.equal(signIns, 1);
  assert.equal(wrapKeys, 1);
});

test("WalletWeb3AuthSignIn waits for a fresh session and skips a stale auto-connect", () => {
  const src = readFileSync(join(root, "src/components/wallet/WalletWeb3AuthSignIn.tsx"), "utf8");
  const after = src.slice(src.indexOf("const afterWeb3AuthLogin"), src.indexOf("const navigateAfterSignIn"));
  assert.match(after, /waitForFreshSessionUser\(fetchAuthSessionUser\)/);
  assert.equal(after.includes("waitForSessionUser(fetchAuthSessionUser)"), false);
  const vaultAt = after.indexOf("if (vault)");
  const deriveAt = after.indexOf("keyPairFromWeb3AuthProvider");
  assert.ok(vaultAt !== -1 && deriveAt !== -1 && vaultAt < deriveAt);

  const finish = src.slice(src.indexOf("const finishConnect"), src.indexOf("const afterWeb3AuthLogin"));
  assert.match(finish, /openCloudVaultWithReauth\(/);
  assert.match(finish, /idToken: lastIdTokenRef\.current/);

  const auto = src.slice(src.indexOf("if (!autoConnect"));
  assert.match(auto, /if \(!isAuthTimeFresh\(user\.authTime\)\) return;/);
  assert.match(auto, /finishConnect\(user\.id, user\.email, \{ silent: true \}\)/);
});
