// A session cookie ~2 hours old still has a user id. Web3Auth then returns a fresh id_token,
// but the client used to treat "any user id" as success and call wrap-key with the old authTime.
// These tests pin the reauth clock (jwt callback) and the one-shot client flow around it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { applyAuthJwtCallback } from "../src/lib/auth-jwt-callback.ts";
import { isAuthTimeFresh, WALLET_VAULT_REAUTH_WINDOW_MS } from "../src/lib/wallet-reauth-window.ts";
import { assertCloudAccount, isCloudOpenRecoveryCode, WalletCloudError, isWalletCloudErrorCode } from "../src/lib/wallet-cloud-client.ts";
import {
  createCloudVaultWithReauth,
  isIdTokenInsideReauthWindow,
  openCloudVaultWithReauth,
  putCloudVaultRecord,
} from "../src/lib/wallet-reauth-flow.ts";
import { waitForFreshSessionUser } from "../src/lib/web3auth-redirect-resume.ts";

const now = 1_791_890_000_000;
const twoHours = 2 * 60 * 60 * 1000;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function staleToken() {
  return { sub: "user-1", authTime: now - twoHours, provider: "web3auth" };
}

function idTokenAt(iatMs) {
  const payload = Buffer.from(JSON.stringify({ iat: Math.floor(iatMs / 1000) })).toString("base64url");
  return `e30.${payload}.sig`;
}

const freshIdToken = idTokenAt(now);

function instantWait(fetchSession) {
  return waitForFreshSessionUser(fetchSession, [0, 0, 0], async () => {});
}

test("waitForFreshSessionUser keeps polling until authTime is newer than the rejected one", async () => {
  const stale = { id: "user-1", authTime: now - twoHours };
  const fresh = { id: "user-1", authTime: now };
  const reads = [stale, { id: "user-1" }, fresh];
  let i = 0;
  const user = await waitForFreshSessionUser(
    async () => reads[i++] ?? null,
    [0, 0, 0, 0],
    async () => {},
    { newerThan: stale.authTime },
  );
  assert.deepEqual(user, fresh);
  assert.equal(i, 3);
});

test("waitForFreshSessionUser accepts a newer authTime when the client clock is 10 minutes fast", async () => {
  const authTime = now;
  const clientNow = now + 10 * 60 * 1000;
  assert.equal(isAuthTimeFresh(authTime, clientNow), false);
  const user = await waitForFreshSessionUser(
    async () => ({ id: "user-1", authTime }),
    [0],
    async () => {},
    { newerThan: authTime - 1_000 },
  );
  assert.equal(user?.authTime, authTime);
});

test("waitForFreshSessionUser gives up when authTime never becomes newer", async () => {
  let calls = 0;
  const user = await waitForFreshSessionUser(
    async () => {
      calls += 1;
      return { id: "user-1", authTime: now - twoHours };
    },
    [0, 0],
    async () => {},
    { newerThan: now - twoHours },
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
    idToken: freshIdToken,
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
  assert.equal(wrapKeys, 2);
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
    idToken: freshIdToken,
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
    idToken: freshIdToken,
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

test("no idToken throws reauth_required after the server rejects and never signs in", async () => {
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
          throw new WalletCloudError("reauth_required");
        },
      }),
    (err) => isWalletCloudErrorCode(err, "reauth_required"),
  );
  assert.equal(signIns, 0);
  assert.equal(wrapKeys, 1);
});

test("sign-in that leaves the session stale throws reauth_required once and does not loop", async () => {
  let signIns = 0;
  let wrapKeys = 0;
  await assert.rejects(
    () =>
      openCloudVaultWithReauth({
        fetchSession: async () => ({ id: "user-1", authTime: now - twoHours }),
        idToken: freshIdToken,
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
  assert.equal(wrapKeys, 1);
});

test("a non-reauth vault error is rethrown and does not sign in", async () => {
  let signIns = 0;
  let wrapKeys = 0;
  await assert.rejects(
    () =>
      openCloudVaultWithReauth({
        fetchSession: async () => ({ id: "user-1", authTime: now }),
        idToken: freshIdToken,
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
        idToken: freshIdToken,
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
  assert.equal(wrapKeys, 2);
});

const newVaultKey = { address: "0xabc", publicKey: "pub", privateKey: "pk" };

function createVaultArgs(overrides) {
  return {
    deriveKey: async () => newVaultKey,
    encryptPrivateKey: async (privateKey, wrapKeyHex) => `enc:${privateKey}:${wrapKeyHex}`,
    fetchWrapKey: async () => "aa".repeat(32),
    putVault: async () => ({ ok: true, status: 200 }),
    fetchSession: async () => ({ id: "user-1", authTime: now }),
    idToken: freshIdToken,
    now,
    waitForFreshSession: instantWait,
    signInWithIdToken: async () => {},
    ...overrides,
  };
}

test("new vault: stale session answers wrap-key reauth_required, one sign-in, then one PUT and wrap-key 200", async () => {
  const token = staleToken();
  let signIns = 0;
  let puts = 0;
  let wrapCalls = 0;
  let wrapOk = 0;
  let putBody = null;

  await createCloudVaultWithReauth(
    createVaultArgs({
      fetchSession: async () => ({ id: token.sub, authTime: token.authTime }),
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
      fetchWrapKey: async () => {
        wrapCalls += 1;
        // The wrap-key route answers reauth_required while authTime is outside the window.
        if (!isAuthTimeFresh(token.authTime, now)) throw new WalletCloudError("reauth_required");
        wrapOk += 1;
        return "bb".repeat(32);
      },
      putVault: async (body) => {
        puts += 1;
        putBody = body;
        return { ok: true, status: 200 };
      },
    }),
  );

  assert.equal(signIns, 1);
  assert.equal(puts, 1);
  assert.equal(wrapCalls, 2);
  assert.equal(wrapOk, 1);
  assert.deepEqual(putBody, {
    address: "0xabc",
    publicKey: "pub",
    encryptedPrivateKey: `enc:pk:${"bb".repeat(32)}`,
  });
});

test("new vault: session that stays stale after sign-in throws reauth_required once and does not PUT", async () => {
  let signIns = 0;
  let puts = 0;
  let wrapCalls = 0;
  await assert.rejects(
    () =>
      createCloudVaultWithReauth(
        createVaultArgs({
          fetchSession: async () => ({ id: "user-1", authTime: now - twoHours }),
          signInWithIdToken: async () => {
            signIns += 1;
          },
          fetchWrapKey: async () => {
            wrapCalls += 1;
            throw new WalletCloudError("reauth_required");
          },
          putVault: async () => {
            puts += 1;
            return { ok: true, status: 200 };
          },
        }),
      ),
    (err) => isWalletCloudErrorCode(err, "reauth_required"),
  );
  assert.equal(signIns, 1);
  assert.equal(puts, 0);
  assert.equal(wrapCalls, 1);
});

test("new vault: no idToken throws reauth_required and never signs in", async () => {
  let signIns = 0;
  let puts = 0;
  let wrapCalls = 0;
  await assert.rejects(
    () =>
      createCloudVaultWithReauth(
        createVaultArgs({
          fetchSession: async () => ({ id: "user-1", authTime: now - twoHours }),
          idToken: null,
          signInWithIdToken: async () => {
            signIns += 1;
          },
          fetchWrapKey: async () => {
            wrapCalls += 1;
            throw new WalletCloudError("reauth_required");
          },
          putVault: async () => {
            puts += 1;
            return { ok: true, status: 200 };
          },
        }),
      ),
    (err) => isWalletCloudErrorCode(err, "reauth_required"),
  );
  assert.equal(signIns, 0);
  assert.equal(puts, 0);
  assert.equal(wrapCalls, 1);
});

test("new vault: rate_limited from wrap-key is rethrown and does not sign in", async () => {
  let signIns = 0;
  let puts = 0;
  let wrapCalls = 0;
  await assert.rejects(
    () =>
      createCloudVaultWithReauth(
        createVaultArgs({
          signInWithIdToken: async () => {
            signIns += 1;
          },
          fetchWrapKey: async () => {
            wrapCalls += 1;
            throw new WalletCloudError("rate_limited");
          },
          putVault: async () => {
            puts += 1;
            return { ok: true, status: 200 };
          },
        }),
      ),
    (err) => isWalletCloudErrorCode(err, "rate_limited"),
  );
  assert.equal(signIns, 0);
  assert.equal(puts, 0);
  assert.equal(wrapCalls, 1);
});

test("new vault: PUT 409 means the vault already exists and is not an error", async () => {
  let signIns = 0;
  await createCloudVaultWithReauth(
    createVaultArgs({
      signInWithIdToken: async () => {
        signIns += 1;
      },
      putVault: async () => ({ ok: false, status: 409, error: "already_exists" }),
    }),
  );
  assert.equal(signIns, 0);
});

test("WalletWeb3AuthSignIn waits for a newer session and does not gate auto-connect on the client clock", () => {
  const src = readFileSync(join(root, "src/components/wallet/WalletWeb3AuthSignIn.tsx"), "utf8");
  const after = src.slice(src.indexOf("const afterWeb3AuthLogin"), src.indexOf("const navigateAfterSignIn"));
  assert.match(after, /waitForFreshSessionUser\(/);
  assert.match(after, /newerThan: previousAuthTime/);
  assert.equal(after.includes("waitForSessionUser(fetchAuthSessionUser)"), false);
  assert.equal(after.includes("isAuthTimeFresh"), false);
  const vaultAt = after.indexOf("if (vault)");
  const deriveAt = after.indexOf("keyPairFromWeb3AuthProvider");
  assert.ok(vaultAt !== -1 && deriveAt !== -1 && vaultAt < deriveAt);
  assert.match(after, /createCloudVaultWithReauth\(/);
  assert.match(after, /idToken: lastIdTokenRef\.current/);
  assert.equal(after.includes("fetchWrapKey()"), false);

  const finish = src.slice(src.indexOf("const finishConnect"), src.indexOf("const afterWeb3AuthLogin"));
  assert.match(finish, /openCloudVaultWithReauth\(/);
  assert.match(finish, /idToken: lastIdTokenRef\.current/);
  assert.match(finish, /assertCloudAccount\(session\.id, userId\)/);
  assert.equal(finish.includes("session.id || userId"), false);

  const auto = src.slice(src.indexOf("if (!autoConnect"));
  assert.equal(/isAuthTimeFresh\(user\.authTime\)/.test(auto), false);
  assert.match(auto, /finishConnect\(user\.id, user\.email, \{ silent: true \}\)/);
});

test("client clock 10 minutes fast still opens a fresh session without signing in again", async () => {
  const authTime = now;
  const clientNow = now + 10 * 60 * 1000;
  assert.equal(isAuthTimeFresh(authTime, clientNow), false);
  let signIns = 0;
  let opens = 0;
  const opened = await openCloudVaultWithReauth({
    fetchSession: async () => ({ id: "user-1", authTime }),
    idToken: freshIdToken,
    now: clientNow,
    waitForFreshSession: instantWait,
    signInWithIdToken: async () => {
      signIns += 1;
    },
    openVault: async (session) => {
      opens += 1;
      assert.equal(session.authTime, authTime);
      return { ok: true };
    },
  });
  assert.equal(opened.ok, true);
  assert.equal(signIns, 0);
  assert.equal(opens, 1);
});

test("idToken iat older than the reauth window is not reused", async () => {
  const issuedAt = now - WALLET_VAULT_REAUTH_WINDOW_MS - 1_000;
  assert.equal(isIdTokenInsideReauthWindow(idTokenAt(issuedAt), now), false);
  assert.equal(isIdTokenInsideReauthWindow(freshIdToken, now), true);
  assert.equal(isIdTokenInsideReauthWindow("not-a-jwt", now), false);
  let signIns = 0;
  let opens = 0;
  await assert.rejects(
    () =>
      openCloudVaultWithReauth({
        fetchSession: async () => ({ id: "user-1", authTime: now - twoHours }),
        idToken: idTokenAt(issuedAt),
        now,
        waitForFreshSession: instantWait,
        signInWithIdToken: async () => {
          signIns += 1;
        },
        openVault: async () => {
          opens += 1;
          throw new WalletCloudError("reauth_required");
        },
      }),
    (err) => isWalletCloudErrorCode(err, "reauth_required"),
  );
  assert.equal(signIns, 0);
  assert.equal(opens, 1);
});

test("address_taken is a typed error and does not create another key", async () => {
  let derived = 0;
  let puts = 0;
  await assert.rejects(
    () =>
      createCloudVaultWithReauth(
        createVaultArgs({
          deriveKey: async () => {
            derived += 1;
            return newVaultKey;
          },
          putVault: async () => {
            puts += 1;
            return { ok: false, status: 409, error: "address_taken" };
          },
        }),
      ),
    (err) => isWalletCloudErrorCode(err, "address_taken"),
  );
  assert.equal(derived, 1);
  assert.equal(puts, 1);
  assert.equal(isCloudOpenRecoveryCode("address_taken"), true);
});

test("putCloudVaultRecord keeps already_exists and address_taken distinct", async () => {
  const original = globalThis.fetch;
  const body = { address: "0xabc", publicKey: "pub", encryptedPrivateKey: "ct" };
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "address_taken" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    const taken = await putCloudVaultRecord(body);
    assert.equal(taken.ok, false);
    assert.equal(taken.status, 409);
    assert.equal(taken.error, "address_taken");

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "already_exists" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    const exists = await putCloudVaultRecord(body);
    assert.equal(exists.ok, false);
    assert.equal(exists.error, "already_exists");
  } finally {
    globalThis.fetch = original;
  }
});

test("account_mismatch when the session id is not the Web3Auth user", () => {
  assert.equal(assertCloudAccount("user-1", "user-1"), "user-1");
  assert.throws(
    () => assertCloudAccount("other-user", "user-1"),
    (err) => isWalletCloudErrorCode(err, "account_mismatch"),
  );
});
