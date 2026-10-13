import { test } from "node:test";
import assert from "node:assert/strict";
import * as secp from "@noble/secp256k1";
import {
  decryptPrivateKeyFromVault,
  deriveUserWrapKeyHex,
  encryptPrivateKeyForVault,
} from "../src/lib/wallet-cloud-crypto.ts";

test("vault encrypt/decrypt round-trip per user wrap key", async () => {
  const userId = "user-abc";
  const secret = "test-master-secret-for-hkdf-only";
  const wrap = await deriveUserWrapKeyHex(secret, userId);
  const wrap2 = await deriveUserWrapKeyHex(secret, userId);
  assert.equal(wrap, wrap2);
  const privateKey = secp.etc.bytesToHex(secp.utils.randomSecretKey());
  const payload = await encryptPrivateKeyForVault(privateKey, wrap);
  const out = await decryptPrivateKeyFromVault(payload, wrap);
  assert.equal(out, privateKey.toLowerCase().replace(/^0x/, ""));
});

test("different users get different wrap keys", async () => {
  const secret = "shared-server-secret";
  const a = await deriveUserWrapKeyHex(secret, "u1");
  const b = await deriveUserWrapKeyHex(secret, "u2");
  assert.notEqual(a, b);
});
