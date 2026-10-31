// After wrap-key 200 the client used to collapse every vault-open failure into one generic
// sign-in error, and a decrypt failure must never PUT or DELETE the stored vault.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as secp from "@noble/secp256k1";

import {
  commitCloudSession,
  createCloudVaultWallet,
  ensureCloudWalletSession,
  errorCodeFrom,
  isWalletCloudErrorCode,
  publishCloudSessionAfterPersist,
  unlockCloudVaultSession,
  WalletCloudError,
} from "../src/lib/wallet-cloud-client.ts";
import {
  decryptPrivateKeyFromVault,
  deriveUserWrapKeyHex,
  encryptPrivateKeyForVault,
  readLegacyVaultPlaintext,
  safeCloudLogCode,
  sanitizeConsoleSignInLabel,
  VaultSchemaError,
  warnCloudOpenFailed,
} from "../src/lib/wallet-cloud-crypto.ts";
import { addressFromPublicKey } from "../src/lib/partner/wallet.ts";

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function spyWarn() {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => {
    warnings.push(args);
  };
  return {
    warnings,
    restore() {
      console.warn = original;
    },
  };
}

function assertSafeWarn(warnings, code) {
  assert.ok(warnings.length >= 1, "expected a console.warn");
  for (const args of warnings) {
    assert.equal(args[0], "[wallet] cloud open failed");
    const payload = args[1];
    assert.deepEqual(Object.keys(payload).sort(), ["code", "retried", "stage", "vaultPresent"]);
    assert.equal(typeof payload.code, "string");
    assert.equal(typeof payload.stage, "string");
    assert.equal(typeof payload.vaultPresent, "boolean");
    assert.equal(typeof payload.retried, "boolean");
    const blob = JSON.stringify(args);
    assert.equal(blob.includes("0x"), false, blob);
    assert.equal(/[0-9a-fA-F]{32,}/.test(blob), false, blob);
  }
  assert.equal(warnings.at(-1)[1].code, code);
}

function installFetch({ wrapKeyHex, vaultBody, vaultStatus = 200 }) {
  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url: String(url), method });
    if (String(url).includes("/wrap-key")) return jsonResponse(200, { wrapKeyHex });
    if (method === "PUT" || method === "DELETE") return jsonResponse(500, { error: "should_not_write" });
    if (vaultStatus === 404) return new Response(null, { status: 404 });
    return jsonResponse(vaultStatus, vaultBody);
  };
  return {
    calls,
    restore() {
      globalThis.fetch = previous;
    },
  };
}

function assertNoVaultWrite(calls) {
  assert.equal(
    calls.some((call) => call.method === "PUT" || call.method === "DELETE"),
    false,
  );
}

async function wrongKeyVault() {
  const realWrapKeyHex = await deriveUserWrapKeyHex("real-secret", "user-decrypt");
  const wrongWrapKeyHex = await deriveUserWrapKeyHex("wrong-secret", "user-decrypt");
  const privateKey = bytesToHex(secp.utils.randomSecretKey());
  const encryptedPrivateKey = await encryptPrivateKeyForVault(privateKey, realWrapKeyHex);
  return {
    wrongWrapKeyHex,
    vaultBody: {
      address: "0x" + "11".repeat(20),
      publicKey: "02" + "22".repeat(32),
      encryptedPrivateKey,
    },
  };
}

test("decryptPrivateKeyFromVault: bad JSON or a non-v1 payload is VaultSchemaError, AES failure is not", async () => {
  await assert.rejects(() => decryptPrivateKeyFromVault("not-json", "ab".repeat(32)), (err) => err instanceof VaultSchemaError);
  await assert.rejects(
    () => decryptPrivateKeyFromVault(JSON.stringify({ v: 2, iv: "aa", ct: "bb" }), "ab".repeat(32)),
    (err) => err instanceof VaultSchemaError,
  );
  await assert.rejects(
    () => decryptPrivateKeyFromVault(JSON.stringify({ v: 1, ct: "abcd" }), "ab".repeat(32)),
    (err) => err instanceof VaultSchemaError,
  );
  const wrap = await deriveUserWrapKeyHex("real-secret", "user-aes");
  const other = await deriveUserWrapKeyHex("other-secret", "user-aes");
  const payload = await encryptPrivateKeyForVault(bytesToHex(secp.utils.randomSecretKey()), wrap);
  await assert.rejects(
    () => decryptPrivateKeyFromVault(payload, other),
    (err) => !(err instanceof VaultSchemaError),
  );
});

test("unlockCloudVaultSession: schema unsupported", async () => {
  const wrapKeyHex = await deriveUserWrapKeyHex("real-secret", "user-schema");
  const fetchMock = installFetch({
    wrapKeyHex,
    vaultBody: { address: "0x" + "11".repeat(20), publicKey: "02" + "ab".repeat(32), encryptedPrivateKey: "not-json" },
  });
  const spy = spyWarn();
  try {
    await assert.rejects(
      () => unlockCloudVaultSession("user-schema"),
      (err) => isWalletCloudErrorCode(err, "vault_schema_unsupported"),
    );
    assertSafeWarn(spy.warnings, "vault_schema_unsupported");
    assert.equal(spy.warnings.at(-1)[1].vaultPresent, true);
    assertNoVaultWrite(fetchMock.calls);
  } finally {
    spy.restore();
    fetchMock.restore();
  }
});

test("unlockCloudVaultSession: decrypt_failed with the wrong wrap key does not write the vault", async () => {
  const { wrongWrapKeyHex, vaultBody } = await wrongKeyVault();
  const fetchMock = installFetch({ wrapKeyHex: wrongWrapKeyHex, vaultBody });
  const spy = spyWarn();
  try {
    await assert.rejects(
      () => unlockCloudVaultSession("user-decrypt"),
      (err) => isWalletCloudErrorCode(err, "decrypt_failed"),
    );
    assertSafeWarn(spy.warnings, "decrypt_failed");
    assert.equal(spy.warnings.at(-1)[1].vaultPresent, true);
    assert.equal(spy.warnings.at(-1)[1].retried, false);
    assertNoVaultWrite(fetchMock.calls);
  } finally {
    spy.restore();
    fetchMock.restore();
  }
});

test("createCloudVaultWallet: existing vault that fails to decrypt is not PUT or DELETE", async () => {
  const { wrongWrapKeyHex, vaultBody } = await wrongKeyVault();
  const fetchMock = installFetch({ wrapKeyHex: wrongWrapKeyHex, vaultBody });
  const spy = spyWarn();
  try {
    await assert.rejects(
      () => createCloudVaultWallet("user-decrypt"),
      (err) => isWalletCloudErrorCode(err, "decrypt_failed"),
    );
    assertNoVaultWrite(fetchMock.calls);
    assertSafeWarn(spy.warnings, "decrypt_failed");
  } finally {
    spy.restore();
    fetchMock.restore();
  }
});

test("createCloudVaultWallet: unsupported schema on an existing vault is not PUT or DELETE", async () => {
  const wrapKeyHex = await deriveUserWrapKeyHex("real-secret", "user-schema");
  const fetchMock = installFetch({
    wrapKeyHex,
    vaultBody: {
      address: "0x" + "11".repeat(20),
      publicKey: "02" + "ab".repeat(32),
      encryptedPrivateKey: JSON.stringify({ v: 2, iv: "aa", ct: "bb" }),
    },
  });
  const spy = spyWarn();
  try {
    await assert.rejects(
      () => createCloudVaultWallet("user-schema"),
      (err) => isWalletCloudErrorCode(err, "vault_schema_unsupported"),
    );
    assertNoVaultWrite(fetchMock.calls);
  } finally {
    spy.restore();
    fetchMock.restore();
  }
});

test("ensureCloudWalletSession: a present vault is opened once after wrap-key and is not rewritten", async () => {
  const { wrongWrapKeyHex, vaultBody } = await wrongKeyVault();
  const fetchMock = installFetch({ wrapKeyHex: wrongWrapKeyHex, vaultBody });
  const spy = spyWarn();
  try {
    await assert.rejects(
      () => ensureCloudWalletSession({ id: "user-decrypt" }),
      (err) => isWalletCloudErrorCode(err, "decrypt_failed"),
    );
    const vaultGets = fetchMock.calls.filter(
      (call) => call.method === "GET" && call.url.includes("/api/wallet/vault") && !call.url.includes("/wrap-key"),
    );
    assert.equal(vaultGets.length, 1);
    const wrapAt = fetchMock.calls.findIndex((call) => call.url.includes("/wrap-key"));
    const vaultAt = fetchMock.calls.findIndex(
      (call) => call.method === "GET" && call.url.includes("/api/wallet/vault") && !call.url.includes("/wrap-key"),
    );
    assert.ok(wrapAt >= 0 && wrapAt < vaultAt);
    assertNoVaultWrite(fetchMock.calls);
  } finally {
    spy.restore();
    fetchMock.restore();
  }
});

test("unlockCloudVaultSession: invalid_private_key", async () => {
  const wrapKeyHex = await deriveUserWrapKeyHex("real-secret", "user-key");
  const encryptedPrivateKey = await encryptPrivateKeyForVault("not-a-private-key", wrapKeyHex);
  const fetchMock = installFetch({
    wrapKeyHex,
    vaultBody: { address: "0x" + "11".repeat(20), publicKey: "02" + "ab".repeat(32), encryptedPrivateKey },
  });
  const spy = spyWarn();
  try {
    await assert.rejects(
      () => unlockCloudVaultSession("user-key"),
      (err) => isWalletCloudErrorCode(err, "invalid_private_key"),
    );
    assertSafeWarn(spy.warnings, "invalid_private_key");
    assertNoVaultWrite(fetchMock.calls);
  } finally {
    spy.restore();
    fetchMock.restore();
  }
});

test("unlockCloudVaultSession: address_mismatch", async () => {
  const wrapKeyHex = await deriveUserWrapKeyHex("real-secret", "user-addr");
  const privateKey = bytesToHex(secp.utils.randomSecretKey());
  const publicKey = bytesToHex(secp.getPublicKey(secp.etc.hexToBytes(privateKey), true));
  const actualAddress = addressFromPublicKey(publicKey);
  const encryptedPrivateKey = await encryptPrivateKeyForVault(privateKey, wrapKeyHex);
  const unrelatedAddress = actualAddress === "0x" + "ff".repeat(20) ? "0x" + "ee".repeat(20) : "0x" + "ff".repeat(20);
  const fetchMock = installFetch({
    wrapKeyHex,
    vaultBody: { address: unrelatedAddress, publicKey, encryptedPrivateKey },
  });
  const spy = spyWarn();
  try {
    await assert.rejects(
      () => unlockCloudVaultSession("user-addr"),
      (err) => isWalletCloudErrorCode(err, "address_mismatch"),
    );
    assertSafeWarn(spy.warnings, "address_mismatch");
    assert.equal(spy.warnings.at(-1)[1].vaultPresent, true);
  } finally {
    spy.restore();
    fetchMock.restore();
  }
});

test("unlockCloudVaultSession: vault_not_found", async () => {
  const wrapKeyHex = await deriveUserWrapKeyHex("real-secret", "user-missing");
  const fetchMock = installFetch({ wrapKeyHex, vaultStatus: 404 });
  const spy = spyWarn();
  try {
    await assert.rejects(
      () => unlockCloudVaultSession("user-missing"),
      (err) => isWalletCloudErrorCode(err, "vault_not_found"),
    );
    assertSafeWarn(spy.warnings, "vault_not_found");
    assert.equal(spy.warnings.at(-1)[1].vaultPresent, false);
    assertNoVaultWrite(fetchMock.calls);
  } finally {
    spy.restore();
    fetchMock.restore();
  }
});

test("publishCloudSessionAfterPersist: persist failure publishes nothing and throws session_open_failed", async () => {
  const spy = spyWarn();
  let published = null;
  const cloud = { id: "cloud:user_1", kind: "cloud", userId: "user_1" };
  try {
    await assert.rejects(
      () =>
        publishCloudSessionAfterPersist(
          cloud,
          async () => {
            throw new Error("storage_unavailable");
          },
          (session) => {
            published = session;
          },
        ),
      (err) => err instanceof WalletCloudError && err.code === "session_open_failed",
    );
    assert.equal(published, null);
    assert.equal(spy.warnings.at(-1)[1].code, "session_open_failed");
  } finally {
    spy.restore();
  }
});

test("publishCloudSessionAfterPersist: persist success is the only path that publishes", async () => {
  let published = null;
  const cloud = { id: "cloud:user_1", kind: "cloud", userId: "user_1" };
  await publishCloudSessionAfterPersist(
    cloud,
    async () => {},
    (session) => {
      published = session;
    },
  );
  assert.equal(published, cloud);
});

test("logged cloud codes and sign-in labels stay machine-shaped", async () => {
  assert.equal(safeCloudLogCode("session_open_failed"), "session_open_failed");
  assert.equal(safeCloudLogCode("eyJhbGciOiJIUzI1NiJ9.payload"), "unknown");
  assert.equal(safeCloudLogCode("not a code"), "unknown");
  const spy = spyWarn();
  try {
    warnCloudOpenFailed({
      code: "Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig",
      stage: "cloud_sign_in",
      vaultPresent: false,
      retried: false,
    });
    assert.equal(spy.warnings.at(-1)[1].code, "unknown");
    assert.equal(JSON.stringify(spy.warnings).includes("eyJ"), false);
    assert.equal(spy.warnings.at(-1)[1].vaultPresent, false);
  } finally {
    spy.restore();
  }
  const leaked = jsonResponse(500, { error: "eyJhbGciOiJIUzI1NiJ9.payload.sig" });
  assert.equal(await errorCodeFrom(leaked, "vault_load_failed"), "unknown");
  assert.equal(await errorCodeFrom(jsonResponse(500, { error: "reauth_required" }), "vault_load_failed"), "reauth_required");
  assert.equal(await errorCodeFrom(jsonResponse(500, {}), "vault_load_failed"), "vault_load_failed");
  assert.equal(sanitizeConsoleSignInLabel("session_open_failed"), "session_open_failed");
  assert.equal(sanitizeConsoleSignInLabel("popup_closed"), "popup_closed");
  assert.equal(
    sanitizeConsoleSignInLabel("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.sig"),
    "unknown",
  );
  assert.equal(sanitizeConsoleSignInLabel("user@example.com"), "unknown");
  assert.equal(sanitizeConsoleSignInLabel("signed in as alice"), "unknown");
});

test("commitCloudSession: persist throw is session_open_failed and the warning drops the cause", async () => {
  const spy = spyWarn();
  const leaked = "0x" + "ab".repeat(32);
  try {
    await assert.rejects(
      () => commitCloudSession(async () => {
        throw new Error(leaked);
      }),
      (err) => isWalletCloudErrorCode(err, "session_open_failed"),
    );
    assertSafeWarn(spy.warnings, "session_open_failed");
    assert.equal(spy.warnings.at(-1)[1].stage, "persist_session");
    assert.equal(JSON.stringify(spy.warnings).includes(leaked), false);
  } finally {
    spy.restore();
  }
});

test("readLegacyVaultPlaintext: decrypt failure warns and returns null without a write", async () => {
  const spy = spyWarn();
  try {
    const plain = await readLegacyVaultPlaintext(async () => {
      throw new Error("0x" + "cd".repeat(32));
    });
    assert.equal(plain, null);
    assertSafeWarn(spy.warnings, "legacy_decrypt_failed");
    assert.equal(spy.warnings.at(-1)[1].stage, "legacy_migrate");
  } finally {
    spy.restore();
  }
});

test("readLegacyVaultPlaintext: schema failure warns vault_schema_unsupported and returns null", async () => {
  const spy = spyWarn();
  try {
    const plain = await readLegacyVaultPlaintext(async () => {
      throw new VaultSchemaError();
    });
    assert.equal(plain, null);
    assertSafeWarn(spy.warnings, "vault_schema_unsupported");
  } finally {
    spy.restore();
  }
});

test("readLegacyVaultPlaintext: a successful decrypt is returned and not warned", async () => {
  const spy = spyWarn();
  try {
    const plain = await readLegacyVaultPlaintext(async () => "abc");
    assert.equal(plain, "abc");
    assert.equal(spy.warnings.length, 0);
  } finally {
    spy.restore();
  }
});
