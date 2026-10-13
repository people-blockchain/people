// Regression: the People Wallet vault stores the key as bare hex (no `0x`),
// and `createEmbeddedWalletClient` used to pass it straight to viem's
// `privateKeyToAccount`, which throws
//   "invalid private key, expected hex or 32 bytes, got string"
// That broke every EVM write from the embedded wallet — including "Send PPL",
// which surfaced to users only as "Could not complete: invalid private key…".
import test from "node:test";
import assert from "node:assert/strict";
import { normalizePrivateKey } from "../src/lib/evm/client.ts";

const KEY = "354c6c6289e051c8ba47045aaf3762693015d3d7b729f0070fcbbb4e014634d2";
const PREFIXED = `0x${KEY}`;

test("bare hex from the vault is accepted and prefixed for viem", () => {
  assert.equal(normalizePrivateKey(KEY), PREFIXED);
});

test("already-prefixed hex is left alone (idempotent)", () => {
  assert.equal(normalizePrivateKey(PREFIXED), PREFIXED);
  assert.equal(normalizePrivateKey(normalizePrivateKey(KEY)), PREFIXED);
});

test("uppercase 0X prefix and surrounding whitespace are tolerated", () => {
  assert.equal(normalizePrivateKey(`  0X${KEY}\n`), PREFIXED);
});

test("anything that is not a 32-byte key still fails loudly", () => {
  for (const bad of ["", "0x", KEY.slice(0, 62), `${KEY}ff`, "not-a-key", "zz".repeat(32)]) {
    assert.throws(() => normalizePrivateKey(bad), /invalid_private_key/);
  }
});
