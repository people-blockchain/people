import { loadTurnkeyWallet, recordLegacyImportError, saveTurnkeyWalletAddress } from "@/lib/turnkey-suborg";
import { isWalletAddress } from "@/lib/partner/wallet";
import { LEGACY_ADDRESS_MISMATCH } from "@/lib/turnkey-constants";
import { forwardStampedTurnkeyActivity } from "@/lib/turnkey-relay";
import { parseImportBundle, parseImportedKey } from "@/lib/turnkey-server";
import {
  assertStampedImportActivity,
  IMPORT_PRIVATE_KEY_PATH,
  IMPORT_PRIVATE_KEY_TYPE,
  INIT_IMPORT_PATH,
  INIT_IMPORT_PRIVATE_KEY_TYPE,
  parseClientStampedActivity,
} from "@/lib/turnkey-stamp";

export { LEGACY_ADDRESS_MISMATCH } from "@/lib/turnkey-constants";

export async function describeTurnkeyImportTarget(userId: string): Promise<{
  organizationId: string;
  turnkeyUserId: string;
}> {
  const row = await loadTurnkeyWallet(userId);
  if (!row) throw new Error("turnkey_suborg_missing");
  if (!row.turnkeyUserId) throw new Error("turnkey_user_missing");
  return {
    organizationId: row.subOrganizationId,
    turnkeyUserId: row.turnkeyUserId,
  };
}

export async function initTurnkeyPrivateKeyImport(
  userId: string,
  stampedInput?: unknown,
): Promise<{
  importBundle?: string;
  organizationId: string;
  turnkeyUserId: string;
}> {
  const target = await describeTurnkeyImportTarget(userId);
  if (stampedInput === undefined || stampedInput === null || Object.keys(stampedInput as object).length === 0) {
    return target;
  }
  const stamped = parseClientStampedActivity(stampedInput);
  assertStampedImportActivity(stamped.stampedBody, {
    type: INIT_IMPORT_PRIVATE_KEY_TYPE,
    organizationId: target.organizationId,
    userId: target.turnkeyUserId,
  });
  const response = await forwardStampedTurnkeyActivity({
    path: INIT_IMPORT_PATH,
    stamped,
  });
  return {
    importBundle: parseImportBundle(response),
    organizationId: target.organizationId,
    turnkeyUserId: target.turnkeyUserId,
  };
}

export async function completeTurnkeyPrivateKeyImport(input: {
  userId: string;
  expectedAddress: string;
  stampedInput: unknown;
}): Promise<{ address: string; privateKeyId: string }> {
  const expected = input.expectedAddress.trim().toLowerCase();
  if (!isWalletAddress(expected)) throw new Error("invalid_address");
  const target = await describeTurnkeyImportTarget(input.userId);
  const stamped = parseClientStampedActivity(input.stampedInput);
  assertStampedImportActivity(stamped.stampedBody, {
    type: IMPORT_PRIVATE_KEY_TYPE,
    organizationId: target.organizationId,
    userId: target.turnkeyUserId,
  });
  const response = await forwardStampedTurnkeyActivity({
    path: IMPORT_PRIVATE_KEY_PATH,
    stamped,
  });
  const imported = parseImportedKey(response);
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
