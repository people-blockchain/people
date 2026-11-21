/**
 * Decide how to open a Turnkey wallet without minting a new address for vault users.
 * Pure: no I/O, no secrets.
 */

export type TurnkeyUpgradeStatus = {
  hasLegacyVault: boolean;
  legacyAddress: string | null;
  address: string | null;
  legacyImportError?: string | null;
};

export type TurnkeyOpenDecision =
  | { action: "create_new" }
  | { action: "prompt_upgrade"; legacyAddress: string }
  | { action: "use_turnkey"; address: string }
  | { action: "keep_legacy"; reason: string; legacyAddress: string };

export type TurnkeyBootstrapPlan =
  | { action: "none" }
  | { action: "otp" }
  | { action: "bootstrap"; createWallet: boolean; replaceOrphan: boolean };

function normAddr(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export function decideTurnkeyOpen(status: TurnkeyUpgradeStatus): TurnkeyOpenDecision {
  const vault = status.hasLegacyVault ? normAddr(status.legacyAddress) : null;
  const turnkey = normAddr(status.address);
  if (vault) {
    if (turnkey && turnkey === vault) {
      return { action: "use_turnkey", address: turnkey };
    }
    if (turnkey && turnkey !== vault) {
      return {
        action: "keep_legacy",
        reason: status.legacyImportError?.trim() || "legacy_address_mismatch",
        legacyAddress: vault,
      };
    }
    return { action: "prompt_upgrade", legacyAddress: vault };
  }
  if (turnkey) return { action: "use_turnkey", address: turnkey };
  return { action: "create_new" };
}

/** Only users with no vault row may receive a newly created Turnkey address. */
export function mayCreateTurnkeyWallet(decision: TurnkeyOpenDecision): boolean {
  return decision.action === "create_new";
}

export function assertCanCreateTurnkeyWallet(hasLegacyVault: boolean, createWallet: boolean): void {
  if (hasLegacyVault && createWallet) {
    throw new Error("legacy_vault_present");
  }
}

/**
 * A sub-org row whose browser root key can be replaced: no completed import,
 * no stored address, and no Turnkey wallet. Vault users must still import the
 * same address — this never mints a new one.
 */
export function isOrphanTurnkeySubOrg(row: {
  address?: string | null;
  importedFromVault?: boolean | null;
  walletId?: string | null;
} | null | undefined): boolean {
  if (!row) return false;
  if (row.importedFromVault === true) return false;
  if (row.address?.trim()) return false;
  if (row.walletId?.trim()) return false;
  return true;
}

export function planTurnkeyBootstrap(input: {
  subOrganizationId: string | null;
  address: string | null;
  importedFromVault: boolean;
  walletId: string | null;
  clientKeyIsNew: boolean;
  decision: TurnkeyOpenDecision;
}): TurnkeyBootstrapPlan {
  const createWallet = mayCreateTurnkeyWallet(input.decision);
  if (!input.subOrganizationId) {
    return { action: "bootstrap", createWallet, replaceOrphan: false };
  }
  const orphan = isOrphanTurnkeySubOrg({
    address: input.address,
    importedFromVault: input.importedFromVault,
    walletId: input.walletId,
  });
  if (orphan && input.clientKeyIsNew) {
    return { action: "bootstrap", createWallet, replaceOrphan: true };
  }
  if (input.decision.action === "use_turnkey" && input.clientKeyIsNew) {
    return { action: "otp" };
  }
  return { action: "none" };
}
