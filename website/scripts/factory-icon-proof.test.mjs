// api-cron.md L1: the free icon quota requires a signature proving the caller owns the wallet
// address it names.
import { test } from "node:test";
import assert from "node:assert/strict";

const { generateWalletKeyPair, signWalletMessage } = await import("../src/lib/partner/wallet.ts");
const { buildIconQuotaProofMessage, verifyIconQuotaProof, ICON_QUOTA_PROOF_MAX_AGE_MS } =
  await import("../src/lib/factory-icon-proof.ts");

function proofFor({ keyPair, nonce, issuedAt }) {
  const message = buildIconQuotaProofMessage({ wallet: keyPair.address, nonce, issuedAt });
  const signed = signWalletMessage(keyPair.privateKey, message);
  return {
    wallet: keyPair.address,
    nonce,
    issuedAt,
    publicKey: signed.publicKey,
    signature: signed.signature,
  };
}

const NONCE = "0123456789abcdef";

test("a fresh proof signed by the wallet key verifies", () => {
  const keyPair = generateWalletKeyPair();
  const proof = proofFor({ keyPair, nonce: NONCE, issuedAt: Date.now() });
  assert.deepEqual(verifyIconQuotaProof(proof), { ok: true });
});

test("a tampered signature is rejected", () => {
  const keyPair = generateWalletKeyPair();
  const proof = proofFor({ keyPair, nonce: NONCE, issuedAt: Date.now() });
  const last = proof.signature.slice(-1);
  proof.signature = proof.signature.slice(0, -1) + (last === "a" ? "b" : "a");
  assert.deepEqual(verifyIconQuotaProof(proof), { ok: false, code: "ownership_proof_invalid" });
});

test("a proof for another wallet is rejected", () => {
  const signer = generateWalletKeyPair();
  const victim = generateWalletKeyPair();
  const proof = proofFor({ keyPair: signer, nonce: NONCE, issuedAt: Date.now() });
  assert.deepEqual(verifyIconQuotaProof({ ...proof, wallet: victim.address }), {
    ok: false,
    code: "ownership_proof_invalid",
  });
});

test("a proof replayed with a different nonce is rejected", () => {
  const keyPair = generateWalletKeyPair();
  const proof = proofFor({ keyPair, nonce: NONCE, issuedAt: Date.now() });
  assert.deepEqual(verifyIconQuotaProof({ ...proof, nonce: "a-different-nonce" }), {
    ok: false,
    code: "ownership_proof_invalid",
  });
});

test("a stale proof is rejected", () => {
  const keyPair = generateWalletKeyPair();
  const proof = proofFor({
    keyPair,
    nonce: NONCE,
    issuedAt: Date.now() - ICON_QUOTA_PROOF_MAX_AGE_MS - 1_000,
  });
  assert.deepEqual(verifyIconQuotaProof(proof), { ok: false, code: "ownership_proof_expired" });
});

test("a malformed nonce is rejected before any signature work", () => {
  const keyPair = generateWalletKeyPair();
  const proof = proofFor({ keyPair, nonce: NONCE, issuedAt: Date.now() });
  assert.deepEqual(verifyIconQuotaProof({ ...proof, nonce: "short" }), {
    ok: false,
    code: "ownership_proof_invalid",
  });
});

test("missing proof fields are rejected", () => {
  assert.deepEqual(
    verifyIconQuotaProof({
      wallet: "0x1111111111111111111111111111111111111111",
      nonce: "",
      issuedAt: Number.NaN,
      publicKey: "",
      signature: "",
    }),
    { ok: false, code: "ownership_proof_invalid" }
  );
});
