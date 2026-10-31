import assert from "node:assert/strict";
import test from "node:test";
import {
  legacyAddressFromPublicKey,
  readWalletAddressSchemeConfig,
  walletAddressFromPublicKey,
} from "./wallet-address-scheme.ts";

test("unset canonical flag follows the chain backend", () => {
  const prev = process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES;
  const prevChain = process.env.NEXT_PUBLIC_CHAIN;
  delete process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES;
  delete process.env.NEXT_PUBLIC_CHAIN;
  try {
    assert.equal(readWalletAddressSchemeConfig(), "evm");
    process.env.NEXT_PUBLIC_CHAIN = "people-node";
    assert.equal(readWalletAddressSchemeConfig(), "legacy");
    const pk =
      "02f9308a021258f3b6bd758258b3f7080dced6fafeb4c6ee1e74d3888b715ddc";
    assert.equal(walletAddressFromPublicKey(pk), legacyAddressFromPublicKey(pk));
  } finally {
    if (prev !== undefined) process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES = prev;
    else delete process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES;
    if (prevChain !== undefined) process.env.NEXT_PUBLIC_CHAIN = prevChain;
    else delete process.env.NEXT_PUBLIC_CHAIN;
  }
});
