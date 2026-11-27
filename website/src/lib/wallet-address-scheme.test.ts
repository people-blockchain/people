import assert from "node:assert/strict";
import test from "node:test";
import { generateFactoryKey } from "./people-sign.ts";
import {
  evmAddressFromPublicKey,
  legacyAddressFromPublicKey,
  liveSchemeVaultAddress,
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

test("liveSchemeVaultAddress remaps sha256 vault rows only in evm scheme", () => {
  const prev = process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES;
  const prevChain = process.env.NEXT_PUBLIC_CHAIN;
  const pk = generateFactoryKey().publicKey;
  const legacy = legacyAddressFromPublicKey(pk);
  const evm = evmAddressFromPublicKey(pk);
  try {
    process.env.NEXT_PUBLIC_CHAIN = "cosmos-evm";
    process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES = "evm";
    assert.equal(
      liveSchemeVaultAddress({ storedAddress: legacy, publicKey: pk }).toLowerCase(),
      evm.toLowerCase(),
    );
    process.env.NEXT_PUBLIC_CHAIN = "people-node";
    delete process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES;
    assert.equal(
      liveSchemeVaultAddress({ storedAddress: legacy, publicKey: pk }).toLowerCase(),
      legacy.toLowerCase(),
    );
  } finally {
    if (prev !== undefined) process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES = prev;
    else delete process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES;
    if (prevChain !== undefined) process.env.NEXT_PUBLIC_CHAIN = prevChain;
    else delete process.env.NEXT_PUBLIC_CHAIN;
  }
});
