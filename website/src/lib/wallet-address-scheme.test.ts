import assert from "node:assert/strict";
import test from "node:test";
import {
  legacyAddressFromPublicKey,
  readWalletAddressSchemeConfig,
  walletAddressFromPublicKey,
} from "./wallet-address-scheme.ts";

test("default scheme is legacy when env unset", () => {
  const prev = process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES;
  delete process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES;
  assert.equal(readWalletAddressSchemeConfig(), "legacy");
  const pk =
    "02f9308a021258f3b6bd758258b3f7080dced6fafeb4c6ee1e74d3888b715ddc";
  assert.equal(walletAddressFromPublicKey(pk), legacyAddressFromPublicKey(pk));
  if (prev !== undefined) process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES = prev;
});
