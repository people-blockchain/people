// Regression tests for the cloud wallet client's error classification. The owner's sign-in bug
// was reachable because `/api/wallet/vault/wrap-key`'s 401 `reauth_required` had no client-side
// handling at all — every route failure collapsed into one generic error. These tests pin the
// route status/body -> WalletCloudError.code mapping so a future refactor can't silently drop it.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as secp from "@noble/secp256k1";

import {
  WalletCloudError,
  isWalletCloudErrorCode,
  fetchVaultRecord,
  unlockCloudVaultSession,
  ensureCloudWalletSession,
  formatSignInRateLimited,
  cloudRestoreBlockedUntil,
  cloudSessionMayRestore,
} from "../src/lib/wallet-cloud-client.ts";
import { deriveUserWrapKeyHex, encryptPrivateKeyForVault } from "../src/lib/wallet-cloud-crypto.ts";
import { addressFromPublicKey } from "../src/lib/partner/wallet.ts";

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("isWalletCloudErrorCode only matches a WalletCloudError with the given code", () => {
  assert.equal(isWalletCloudErrorCode(new WalletCloudError("reauth_required"), "reauth_required"), true);
  assert.equal(isWalletCloudErrorCode(new WalletCloudError("reauth_required"), "unauthorized"), false);
  assert.equal(isWalletCloudErrorCode(new Error("reauth_required"), "reauth_required"), false);
  assert.equal(isWalletCloudErrorCode(null, "reauth_required"), false);
});

test("fetchVaultRecord: 404 means no vault yet, not an error", async () => {
  globalThis.fetch = async () => new Response(null, { status: 404 });
  assert.equal(await fetchVaultRecord(), null);
});

test("fetchVaultRecord: a non-2xx body's {error} code survives as WalletCloudError.code", async () => {
  globalThis.fetch = async () => jsonResponse(401, { error: "reauth_required" });
  await assert.rejects(
    () => fetchVaultRecord(),
    (err) => isWalletCloudErrorCode(err, "reauth_required"),
  );
});

test("fetchVaultRecord: a body with no {error} falls back to the call-site label", async () => {
  globalThis.fetch = async () => jsonResponse(500, {});
  await assert.rejects(
    () => fetchVaultRecord(),
    (err) => isWalletCloudErrorCode(err, "vault_load_failed"),
  );
});

test("unlockCloudVaultSession: wrap-key's reauth_required propagates before the vault is even read", async () => {
  let vaultFetched = false;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/wrap-key")) return jsonResponse(401, { error: "reauth_required" });
    vaultFetched = true;
    return jsonResponse(200, {});
  };
  await assert.rejects(
    () => unlockCloudVaultSession("user-1"),
    (err) => isWalletCloudErrorCode(err, "reauth_required"),
  );
  assert.equal(vaultFetched, false);
});

test("unlockCloudVaultSession: a payload that won't decrypt with this wrap key is invalid_ciphertext, not a crash", async () => {
  const realWrapKeyHex = await deriveUserWrapKeyHex("real-secret", "user-2");
  const wrongWrapKeyHex = await deriveUserWrapKeyHex("wrong-secret", "user-2");
  const privateKey = bytesToHex(secp.utils.randomSecretKey());
  const encryptedPrivateKey = await encryptPrivateKeyForVault(privateKey, realWrapKeyHex);

  globalThis.fetch = async (url) => {
    if (String(url).includes("/wrap-key")) return jsonResponse(200, { wrapKeyHex: wrongWrapKeyHex });
    return jsonResponse(200, {
      address: "0x" + "11".repeat(20),
      publicKey: "02" + "22".repeat(32),
      encryptedPrivateKey,
    });
  };
  await assert.rejects(
    () => unlockCloudVaultSession("user-2"),
    (err) => isWalletCloudErrorCode(err, "invalid_ciphertext"),
  );
});

test("unlockCloudVaultSession: a correctly-decrypted key that doesn't match the stored address is address_mismatch", async () => {
  const wrapKeyHex = await deriveUserWrapKeyHex("real-secret", "user-3");
  const privateKey = bytesToHex(secp.utils.randomSecretKey());
  const publicKey = bytesToHex(secp.getPublicKey(secp.etc.hexToBytes(privateKey), true));
  const actualAddress = addressFromPublicKey(publicKey);
  const encryptedPrivateKey = await encryptPrivateKeyForVault(privateKey, wrapKeyHex);
  const unrelatedAddress = actualAddress === "0x" + "ff".repeat(20) ? "0x" + "ee".repeat(20) : "0x" + "ff".repeat(20);

  globalThis.fetch = async (url) => {
    if (String(url).includes("/wrap-key")) return jsonResponse(200, { wrapKeyHex });
    return jsonResponse(200, { address: unrelatedAddress, publicKey, encryptedPrivateKey });
  };
  await assert.rejects(
    () => unlockCloudVaultSession("user-3"),
    (err) => isWalletCloudErrorCode(err, "address_mismatch"),
  );
});

test("fetchVaultRecord keeps Retry-After on a rate_limited error", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "rate_limited", retryAfter: 125 }), {
      status: 429,
      headers: { "content-type": "application/json", "Retry-After": "125" },
    });
  await assert.rejects(
    () => fetchVaultRecord(),
    (err) => {
      assert.ok(err instanceof WalletCloudError);
      assert.equal(err.code, "rate_limited");
      assert.equal(err.retryAfterSeconds, 125);
      return true;
    },
  );
});

test("formatSignInRateLimited fills the wait, rounded up to at least one minute", () => {
  assert.equal(formatSignInRateLimited("Wait {minutes} minutes", 90), "Wait 2 minutes");
  assert.equal(formatSignInRateLimited("Wait {minutes} minutes", 60), "Wait 1 minutes");
  assert.equal(formatSignInRateLimited("Wait {minutes} minutes", null), "Wait 1 minutes");
});

test("a rate-limited cloud restore stays paused until Retry-After elapses", () => {
  const now = 1_000_000;
  const until = cloudRestoreBlockedUntil(new WalletCloudError("rate_limited", 30), now);
  assert.equal(until, now + 30_000);
  assert.equal(cloudSessionMayRestore(until, now), false);
  assert.equal(cloudSessionMayRestore(until, until), true);
  assert.equal(cloudRestoreBlockedUntil(new WalletCloudError("reauth_required"), now), null);
});

test("ensureCloudWalletSession reuses a vault record instead of reading it again", async () => {
  const wrapKeyHex = await deriveUserWrapKeyHex("real-secret", "user-prefetch");
  const privateKey = bytesToHex(secp.utils.randomSecretKey());
  const publicKey = bytesToHex(secp.getPublicKey(secp.etc.hexToBytes(privateKey), true));
  const address = addressFromPublicKey(publicKey);
  const encryptedPrivateKey = await encryptPrivateKeyForVault(privateKey, wrapKeyHex);
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/wrap-key")) return jsonResponse(200, { wrapKeyHex });
    throw new Error(`unexpected ${url}`);
  };
  const session = await ensureCloudWalletSession(
    { id: "user-prefetch" },
    { vault: { address, publicKey, encryptedPrivateKey } },
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/wrap-key$/);
  assert.equal(session.address.toLowerCase(), address.toLowerCase());
});

test("unlockCloudVaultSession: happy path returns the decrypted key under the stored address", async () => {
  const wrapKeyHex = await deriveUserWrapKeyHex("real-secret", "user-4");
  const privateKey = bytesToHex(secp.utils.randomSecretKey());
  const publicKey = bytesToHex(secp.getPublicKey(secp.etc.hexToBytes(privateKey), true));
  const address = addressFromPublicKey(publicKey);
  const encryptedPrivateKey = await encryptPrivateKeyForVault(privateKey, wrapKeyHex);

  globalThis.fetch = async (url) => {
    if (String(url).includes("/wrap-key")) return jsonResponse(200, { wrapKeyHex });
    return jsonResponse(200, { address, publicKey, encryptedPrivateKey });
  };
  const session = await unlockCloudVaultSession("user-4");
  assert.equal(session.address.toLowerCase(), address.toLowerCase());
  assert.equal(session.kind, "cloud");
  assert.equal(session.userId, "user-4");
});
