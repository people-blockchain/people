import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeTurnkeyWalletStatus } from "./turnkey-suborg.ts";

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
  });

  it("does not import again once an address is stored", () => {
    const status = computeTurnkeyWalletStatus(
      { ...row, address: "0x1111111111111111111111111111111111111111", importedFromVault: true },
      { address: "0x1111111111111111111111111111111111111111" },
    );
    assert.equal(status.needsImport, false);
    assert.equal(status.addressConflict, false);
    assert.equal(status.importedFromVault, true);
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
});
