import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertCanCreateTurnkeyWallet,
  decideTurnkeyOpen,
  mayCreateTurnkeyWallet,
} from "./turnkey-upgrade.ts";

const vault = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";

describe("decideTurnkeyOpen", () => {
  it("never creates a new address when a vault row exists", () => {
    const decision = decideTurnkeyOpen({
      hasLegacyVault: true,
      legacyAddress: vault,
      address: null,
    });
    assert.equal(decision.action, "prompt_upgrade");
    if (decision.action === "prompt_upgrade") assert.equal(decision.legacyAddress, vault);
    assert.equal(mayCreateTurnkeyWallet(decision), false);
  });

  it("reuses the Turnkey address when it already matches the vault", () => {
    const decision = decideTurnkeyOpen({
      hasLegacyVault: true,
      legacyAddress: vault,
      address: vault.toUpperCase(),
    });
    assert.equal(decision.action, "use_turnkey");
    assert.equal(mayCreateTurnkeyWallet(decision), false);
  });

  it("keeps legacy if Turnkey minted a different address", () => {
    const decision = decideTurnkeyOpen({
      hasLegacyVault: true,
      legacyAddress: vault,
      address: other,
    });
    assert.equal(decision.action, "keep_legacy");
    if (decision.action === "keep_legacy") {
      assert.equal(decision.reason, "legacy_address_mismatch");
      assert.equal(decision.legacyAddress, vault);
    }
    assert.equal(mayCreateTurnkeyWallet(decision), false);
  });

  it("creates a new wallet only when there is no vault", () => {
    const decision = decideTurnkeyOpen({
      hasLegacyVault: false,
      legacyAddress: null,
      address: null,
    });
    assert.equal(decision.action, "create_new");
    assert.equal(mayCreateTurnkeyWallet(decision), true);
  });
});

describe("assertCanCreateTurnkeyWallet", () => {
  it("throws legacy_vault_present instead of minting", () => {
    assert.throws(() => assertCanCreateTurnkeyWallet(true, true), /legacy_vault_present/);
    assert.doesNotThrow(() => assertCanCreateTurnkeyWallet(true, false));
    assert.doesNotThrow(() => assertCanCreateTurnkeyWallet(false, true));
  });
});
