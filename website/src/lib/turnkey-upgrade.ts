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
