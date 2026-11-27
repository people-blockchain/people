import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateFactoryKey } from "./people-sign.ts";
import { LEGACY_ADDRESS_MISMATCH } from "./turnkey-constants.ts";
import {
  describeImportCompleteConflict,
  resolveImportedVaultAddress,
  sanitizeImportFailureCode,
  sanitizeImportStage,
} from "./turnkey-import.ts";
import { evmAddressFromPublicKey, legacyAddressFromPublicKey } from "./wallet-address-scheme.ts";

async function withAddressScheme<T>(scheme: "evm" | "legacy", fn: () => T | Promise<T>): Promise<T> {
  const prevChain = process.env.NEXT_PUBLIC_CHAIN;
  const prevFlag = process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES;
  try {
    if (scheme === "legacy") {
      process.env.NEXT_PUBLIC_CHAIN = "people-node";
      delete process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES;
    } else {
      process.env.NEXT_PUBLIC_CHAIN = "cosmos-evm";
      process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES = "evm";
    }
    return await fn();
  } finally {
    if (prevChain === undefined) delete process.env.NEXT_PUBLIC_CHAIN;
    else process.env.NEXT_PUBLIC_CHAIN = prevChain;
    if (prevFlag === undefined) delete process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES;
    else process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES = prevFlag;
  }
}

describe("import complete conflict reporting", () => {
  it("logs mismatch vs error code with a sanitized stage", () => {
    assert.deepEqual(describeImportCompleteConflict({ mismatch: true }), {
      reason: LEGACY_ADDRESS_MISMATCH,
      stage: "match",
      mismatch: true,
    });
    assert.deepEqual(
      describeImportCompleteConflict({
        error: "invalid_stamp",
        stage: "stamp",
        stampLength: 0,
        stampPrefix: "",
        stampFormat: "empty",
      }),
      {
        reason: "invalid_stamp",
        stage: "stamp",
        mismatch: false,
        stampLength: 0,
        stampFormat: "empty",
      },
    );
    assert.deepEqual(describeImportCompleteConflict({ error: "stamp_no_key", stage: "stamp" }), {
      reason: "stamp_no_key",
      stage: "stamp",
      mismatch: false,
    });
    assert.deepEqual(describeImportCompleteConflict({ error: "decrypt_failed", stage: "decrypt" }), {
      reason: "decrypt_failed",
      stage: "decrypt",
      mismatch: false,
    });
    assert.equal(describeImportCompleteConflict({}), null);
    assert.equal(sanitizeImportStage("stamp"), "stamp");
    assert.equal(sanitizeImportStage("nope"), "unknown");
    assert.equal(sanitizeImportFailureCode("stamp_no_key"), "stamp_no_key");
    assert.equal(sanitizeImportFailureCode("not a code!!"), "import_failed");
  });
});

describe("imported Turnkey address vs vault address schemes", () => {
  it("persists the live EVM address when scheme is evm", async () => {
    await withAddressScheme("evm", () => {
      const key = generateFactoryKey();
      const legacy = legacyAddressFromPublicKey(key.publicKey).toLowerCase();
      const evm = evmAddressFromPublicKey(key.publicKey).toLowerCase();
      assert.notEqual(legacy, evm);
      assert.equal(
        resolveImportedVaultAddress({
          expectedAddress: legacy,
          importedAddress: evm,
          publicKey: key.publicKey,
        }),
        evm,
      );
      assert.equal(
        resolveImportedVaultAddress({
          expectedAddress: evm,
          importedAddress: evm,
          publicKey: key.publicKey,
        }),
        evm,
      );
      assert.equal(
        resolveImportedVaultAddress({
          expectedAddress: legacy,
          importedAddress: legacy,
          publicKey: key.publicKey,
        }),
        evm,
      );
      assert.throws(
        () =>
          resolveImportedVaultAddress({
            expectedAddress: legacy,
            importedAddress: evm,
          }),
        /legacy_address_mismatch/,
      );
    });
  });

  it("keeps the vault sha256 address when scheme is legacy", async () => {
    await withAddressScheme("legacy", () => {
      const key = generateFactoryKey();
      const legacy = legacyAddressFromPublicKey(key.publicKey).toLowerCase();
      const evm = evmAddressFromPublicKey(key.publicKey).toLowerCase();
      assert.notEqual(legacy, evm);
      assert.equal(
        resolveImportedVaultAddress({
          expectedAddress: legacy,
          importedAddress: evm,
          publicKey: key.publicKey,
        }),
        legacy,
      );
      assert.equal(
        resolveImportedVaultAddress({
          expectedAddress: evm,
          importedAddress: evm,
          publicKey: key.publicKey,
        }),
        evm,
      );
    });
  });
});
