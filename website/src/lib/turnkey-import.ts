import { getTurnkeyApi } from "@/lib/turnkey-server";
import { loadTurnkeyWallet, recordLegacyImportError, saveTurnkeyWalletAddress } from "@/lib/turnkey-suborg";
import { isWalletAddress } from "@/lib/partner/wallet";
import { LEGACY_ADDRESS_MISMATCH } from "@/lib/turnkey-constants";

export { LEGACY_ADDRESS_MISMATCH } from "@/lib/turnkey-constants";

export async function initTurnkeyPrivateKeyImport(userId: string): Promise<{
  importBundle: string;
  organizationId: string;
  turnkeyUserId: string;
}> {
  const row = await loadTurnkeyWallet(userId);
  if (!row) throw new Error("turnkey_suborg_missing");
  if (!row.turnkeyUserId) throw new Error("turnkey_user_missing");
  const api = await getTurnkeyApi();
  const { importBundle } = await api.initImportPrivateKey({
    organizationId: row.subOrganizationId,
    userId: row.turnkeyUserId,
  });
  return {
    importBundle,
    organizationId: row.subOrganizationId,
    turnkeyUserId: row.turnkeyUserId,
  };
}

export async function completeTurnkeyPrivateKeyImport(input: {
  userId: string;
  encryptedBundle: string;
  expectedAddress: string;
}): Promise<{ address: string; privateKeyId: string }> {
  const expected = input.expectedAddress.trim().toLowerCase();
  if (!isWalletAddress(expected)) throw new Error("invalid_address");
  const row = await loadTurnkeyWallet(input.userId);
  if (!row) throw new Error("turnkey_suborg_missing");
  if (!row.turnkeyUserId) throw new Error("turnkey_user_missing");
  const api = await getTurnkeyApi();
  const imported = await api.importPrivateKey({
    organizationId: row.subOrganizationId,
    userId: row.turnkeyUserId,
    encryptedBundle: input.encryptedBundle,
    privateKeyName: "PEOPLE Wallet",
  });
  const address = imported.addresses[0]?.trim().toLowerCase();
  if (!address) throw new Error("turnkey_import_no_address");
  if (address !== expected) {
    await recordLegacyImportError(input.userId, LEGACY_ADDRESS_MISMATCH);
    throw new Error(LEGACY_ADDRESS_MISMATCH);
  }
  await saveTurnkeyWalletAddress({
    userId: input.userId,
    address,
    importedFromVault: true,
    legacyImportError: null,
  });
  return { address, privateKeyId: imported.privateKeyId };
}

export async function markLegacyImportMismatch(userId: string): Promise<void> {
  await recordLegacyImportError(userId, LEGACY_ADDRESS_MISMATCH);
}

export async function markLegacyImportFailure(userId: string, code: string): Promise<void> {
  const safe = /^[a-z0-9_]{1,80}$/.test(code) ? code : "import_failed";
  await recordLegacyImportError(userId, safe);
}
