import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addressFromPublicKey,
  buildWalletBindMessage,
  buildWalletBindProof,
  generateWalletKeyPair,
  signWalletMessage,
  verifyWalletProof,
} from "./wallet.ts";

test("wallet proof verifies a secp256k1 signature over the PEOPLE challenge", () => {
  const keys = generateWalletKeyPair();
  const message = buildWalletBindMessage({
    email: "partner@example.com",
    nonce: "nonce-1",
    issuedAt: "2026-01-01T00:00:00.000Z",
    origin: "https://www.peopleblockchain.network",
  });
  const signed = signWalletMessage(keys.privateKey, message);
  assert.equal(signed.address, keys.address);
  assert.equal(signed.address, addressFromPublicKey(keys.publicKey));
  const result = verifyWalletProof({
    address: signed.address,
    publicKey: signed.publicKey,
    signature: signed.signature,
    message,
  });
  assert.deepEqual(result, { ok: true, address: keys.address, publicKey: keys.publicKey });
});

test("buildWalletBindProof matches verify endpoint expectations", () => {
  const keys = generateWalletKeyPair();
  const message = buildWalletBindMessage({
    email: "bind@example.com",
    nonce: crypto.randomUUID(),
    issuedAt: new Date().toISOString(),
    origin: "https://www.peopleblockchain.network",
  });
  const proof = buildWalletBindProof(keys.privateKey, message);
  assert.equal(proof.address, keys.address);
  const verified = verifyWalletProof(proof);
  assert.deepEqual(verified, { ok: true, address: keys.address, publicKey: keys.publicKey });
});

test("wallet proof rejects a tampered message and a mismatched address", () => {
  const keys = generateWalletKeyPair();
  const message = buildWalletBindMessage({
    email: "a@example.com",
    nonce: "n",
    issuedAt: "t",
    origin: "https://example.com",
  });
  const signed = signWalletMessage(keys.privateKey, message);
  const badMessage = verifyWalletProof({
    ...signed,
    message: `${message}\nextra`,
  });
  assert.equal(badMessage.ok, false);
  const other = generateWalletKeyPair();
  const mismatch = verifyWalletProof({
    address: other.address,
    publicKey: signed.publicKey,
    signature: signed.signature,
    message,
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.error, "address_mismatch");
});
