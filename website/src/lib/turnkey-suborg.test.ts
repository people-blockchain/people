import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateFactoryKey } from "./people-sign.ts";
import { computeTurnkeyWalletStatus } from "./turnkey-suborg.ts";
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

const row = {
  userId: "user-1",
  subOrganizationId: "sub-1",
  turnkeyUserId: "tk-user",
  walletId: null,
  address: null as string | null,
  publicKey: null,
  importedFromVault: false,
  legacyImportError: null as string | null,
};

describe("computeTurnkeyWalletStatus", () => {
  it("marks a vault user without a Turnkey address as needing import", () => {
    const status = computeTurnkeyWalletStatus(row, { address: "0x1111111111111111111111111111111111111111" });
    assert.equal(status.needsImport, true);
    assert.equal(status.addressConflict, false);
    assert.equal(status.hasLegacyVault, true);
    assert.equal(status.subOrganizationId, "sub-1");
    assert.equal(status.orphanSubOrg, true);
    assert.equal(status.turnkeyUserId, "tk-user");
  });

  it("does not import again once an address is stored", () => {
    const status = computeTurnkeyWalletStatus(
      { ...row, address: "0x1111111111111111111111111111111111111111", importedFromVault: true },
      { address: "0x1111111111111111111111111111111111111111" },
    );
    assert.equal(status.needsImport, false);
    assert.equal(status.addressConflict, false);
    assert.equal(status.importedFromVault, true);
    assert.equal(status.orphanSubOrg, false);
  });

  it("flags a Turnkey address that does not match the vault", () => {
    const status = computeTurnkeyWalletStatus(
      { ...row, address: "0x2222222222222222222222222222222222222222" },
      { address: "0x1111111111111111111111111111111111111111" },
    );
    assert.equal(status.needsImport, false);
    assert.equal(status.addressConflict, true);
  });

  it("creates a fresh wallet when there is no vault", () => {
    const status = computeTurnkeyWalletStatus(null, null);
    assert.equal(status.needsImport, false);
    assert.equal(status.hasLegacyVault, false);
    assert.equal(status.addressConflict, false);
    assert.equal(status.subOrganizationId, null);
  });

  it("shows the live EVM address on the upgrade banner for a sha256 vault", async () => {
    await withAddressScheme("evm", () => {
      const key = generateFactoryKey();
      const legacy = legacyAddressFromPublicKey(key.publicKey);
      const evm = evmAddressFromPublicKey(key.publicKey);
      assert.notEqual(legacy.toLowerCase(), evm.toLowerCase());
      const status = computeTurnkeyWalletStatus(row, { address: legacy, publicKey: key.publicKey });
      assert.equal(status.legacyAddress?.toLowerCase(), evm.toLowerCase());
      assert.equal(status.hasLegacyVault, true);
      assert.equal(status.needsImport, true);
    });
  });

  it("keeps the stored sha256 address on the banner when scheme is legacy", async () => {
    await withAddressScheme("legacy", () => {
      const key = generateFactoryKey();
      const legacy = legacyAddressFromPublicKey(key.publicKey);
      const status = computeTurnkeyWalletStatus(row, { address: legacy, publicKey: key.publicKey });
      assert.equal(status.legacyAddress?.toLowerCase(), legacy.toLowerCase());
    });
  });

  it("does not flag a conflict after importing the live EVM form of the same vault key", async () => {
    await withAddressScheme("evm", () => {
      const key = generateFactoryKey();
      const legacy = legacyAddressFromPublicKey(key.publicKey);
      const evm = evmAddressFromPublicKey(key.publicKey);
      const status = computeTurnkeyWalletStatus(
        { ...row, address: evm.toLowerCase(), importedFromVault: true },
        { address: legacy, publicKey: key.publicKey },
      );
      assert.equal(status.addressConflict, false);
      assert.equal(status.importedFromVault, true);
      assert.equal(status.legacyAddress?.toLowerCase(), evm.toLowerCase());
      assert.equal(status.needsImport, false);
    });
  });
});
