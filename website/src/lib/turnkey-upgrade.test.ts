import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertCanCreateTurnkeyWallet,
  decideTurnkeyOpen,
  isOrphanTurnkeySubOrg,
  mayCreateTurnkeyWallet,
  planTurnkeyBootstrap,
  shouldMountTurnkeySettingsUpgrade,
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

describe("orphan sub-org recovery", () => {
  const prompt = decideTurnkeyOpen({ hasLegacyVault: true, legacyAddress: vault, address: null });

  it("treats a row without import, wallet, or address as an orphan", () => {
    assert.equal(isOrphanTurnkeySubOrg({ address: null, importedFromVault: false, walletId: null }), true);
    assert.equal(isOrphanTurnkeySubOrg({ address: vault, importedFromVault: false, walletId: null }), false);
    assert.equal(isOrphanTurnkeySubOrg({ address: null, importedFromVault: true, walletId: null }), false);
    assert.equal(isOrphanTurnkeySubOrg({ address: null, importedFromVault: false, walletId: "w1" }), false);
    assert.equal(isOrphanTurnkeySubOrg(null), false);
  });

  it("re-bootstraps a fresh sub-org when the browser root key is gone and nothing was imported", () => {
    const plan = planTurnkeyBootstrap({
      subOrganizationId: "sub-old",
      address: null,
      importedFromVault: false,
      walletId: null,
      clientKeyIsNew: true,
      decision: prompt,
    });
    assert.deepEqual(plan, { action: "bootstrap", createWallet: false, replaceOrphan: true });
  });

  it("reuses the existing sub-org when this browser still has the root key", () => {
    const plan = planTurnkeyBootstrap({
      subOrganizationId: "sub-old",
      address: null,
      importedFromVault: false,
      walletId: null,
      clientKeyIsNew: false,
      decision: prompt,
    });
    assert.equal(plan.action, "none");
  });

  it("never replaces a sub-org that already has a Turnkey address or wallet", () => {
    const withAddress = planTurnkeyBootstrap({
      subOrganizationId: "sub-old",
      address: vault,
      importedFromVault: true,
      walletId: null,
      clientKeyIsNew: true,
      decision: decideTurnkeyOpen({ hasLegacyVault: true, legacyAddress: vault, address: vault }),
    });
    assert.equal(withAddress.action, "otp");
    const withWallet = planTurnkeyBootstrap({
      subOrganizationId: "sub-old",
      address: null,
      importedFromVault: false,
      walletId: "wallet-1",
      clientKeyIsNew: true,
      decision: prompt,
    });
    assert.equal(withWallet.action, "none");
    assert.equal(mayCreateTurnkeyWallet(prompt), false);
  });

  it("creates a new wallet only when there is no vault and no sub-org", () => {
    const plan = planTurnkeyBootstrap({
      subOrganizationId: null,
      address: null,
      importedFromVault: false,
      walletId: null,
      clientKeyIsNew: true,
      decision: decideTurnkeyOpen({ hasLegacyVault: false, legacyAddress: null, address: null }),
    });
    assert.deepEqual(plan, { action: "bootstrap", createWallet: true, replaceOrphan: false });
  });
});

describe("shouldMountTurnkeySettingsUpgrade", () => {
  it("shows Upgrade in settings for local and cloud sessions, not after a Turnkey session", () => {
    assert.equal(shouldMountTurnkeySettingsUpgrade({ providerIsTurnkey: true, sessionKind: "local" }), true);
    assert.equal(shouldMountTurnkeySettingsUpgrade({ providerIsTurnkey: true, sessionKind: "cloud" }), true);
    assert.equal(shouldMountTurnkeySettingsUpgrade({ providerIsTurnkey: true, sessionKind: "turnkey" }), false);
    assert.equal(shouldMountTurnkeySettingsUpgrade({ providerIsTurnkey: false, sessionKind: "local" }), false);
  });
});
