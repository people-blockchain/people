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

test("unlockCloudVaultSession: a payload that won't decrypt with this wrap key is decrypt_failed, not a crash", async () => {
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
    (err) => isWalletCloudErrorCode(err, "decrypt_failed"),
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
