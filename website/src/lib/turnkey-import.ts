import { loadTurnkeyWallet, recordLegacyImportError, saveTurnkeyWalletAddress } from "@/lib/turnkey-suborg";
import { isWalletAddress } from "@/lib/partner/wallet";
import {
  LEGACY_ADDRESS_MISMATCH,
  TURNKEY_IMPORT_STAGES,
  type TurnkeyImportStage,
} from "@/lib/turnkey-constants";
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
import { addressMatchesPublicKey } from "@/lib/wallet-address-scheme";
import { safeCloudLogCode, sanitizeConsoleSignInLabel } from "@/lib/wallet-cloud-crypto";

export { LEGACY_ADDRESS_MISMATCH } from "@/lib/turnkey-constants";
export type { TurnkeyImportStage } from "@/lib/turnkey-constants";

export function sanitizeImportStage(value: unknown): TurnkeyImportStage | "complete" | "unknown" {
  if (value === "complete") return "complete";
  if (typeof value === "string" && (TURNKEY_IMPORT_STAGES as readonly string[]).includes(value)) {
    return value as TurnkeyImportStage;
  }
  return "unknown";
}

export function sanitizeImportFailureCode(code: string): string {
  const trimmed = code.trim();
  return /^[a-z0-9_]{1,80}$/.test(trimmed) ? trimmed : "import_failed";
}

/** Client POSTs this when import fails before or during Turnkey init. Never log keys/stamps. */
export type ImportCompleteConflict = {
  reason: string;
  stage: TurnkeyImportStage | "complete" | "unknown";
  mismatch: boolean;
};

export function describeImportCompleteConflict(body: {
  mismatch?: unknown;
  error?: unknown;
  stage?: unknown;
}): ImportCompleteConflict | null {
  if (body.mismatch === true) {
    return {
      reason: LEGACY_ADDRESS_MISMATCH,
      stage: sanitizeImportStage(body.stage) === "unknown" ? "match" : sanitizeImportStage(body.stage),
      mismatch: true,
    };
  }
  if (typeof body.error === "string" && body.error.trim()) {
    return {
      reason: sanitizeImportFailureCode(body.error),
      stage: sanitizeImportStage(body.stage),
      mismatch: false,
    };
  }
  return null;
}

export function logTurnkeyImportCompleteRejected(conflict: ImportCompleteConflict): void {
  const reason = /^[A-Za-z][A-Za-z0-9_.-]{0,80}$/.test(conflict.reason)
    ? conflict.reason
    : safeCloudLogCode(conflict.reason);
  console.warn("[turnkey] import complete rejected", {
    reason,
    stage: sanitizeConsoleSignInLabel(conflict.stage),
  });
}

/**
 * Turnkey `ADDRESS_FORMAT_ETHEREUM` is keccak; a vault row may still be the legacy sha256
 * address. Both belong to the same secp256k1 key — keep the vault address so funded PPL stays put.
 */
export function resolveImportedVaultAddress(input: {
  expectedAddress: string;
  importedAddress: string;
  publicKey?: string;
}): string {
  const expected = input.expectedAddress.trim().toLowerCase();
  const imported = input.importedAddress.trim().toLowerCase();
  if (!isWalletAddress(expected) || !isWalletAddress(imported)) throw new Error("invalid_address");
  if (imported === expected) return expected;
  const publicKey = input.publicKey?.trim() ?? "";
  if (
    publicKey &&
    addressMatchesPublicKey(expected, publicKey) &&
    addressMatchesPublicKey(imported, publicKey)
  ) {
    return expected;
  }
  throw new Error(LEGACY_ADDRESS_MISMATCH);
}

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
  publicKey?: string;
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
  const importedAddress = imported.addresses[0]?.trim().toLowerCase() ?? "";
  if (!importedAddress) throw new Error("turnkey_import_no_address");
  let address: string;
  try {
    address = resolveImportedVaultAddress({
      expectedAddress: expected,
      importedAddress,
      publicKey: input.publicKey,
    });
  } catch (err) {
    if (err instanceof Error && err.message === LEGACY_ADDRESS_MISMATCH) {
      await recordLegacyImportError(input.userId, LEGACY_ADDRESS_MISMATCH);
    }
    throw err;
  }
  await saveTurnkeyWalletAddress({
    userId: input.userId,
    address,
    publicKey: input.publicKey,
    importedFromVault: true,
    legacyImportError: null,
  });
  return { address, privateKeyId: imported.privateKeyId };
}

export async function markLegacyImportMismatch(userId: string): Promise<void> {
  await recordLegacyImportError(userId, LEGACY_ADDRESS_MISMATCH);
}

export async function markLegacyImportFailure(userId: string, code: string): Promise<void> {
  await recordLegacyImportError(userId, sanitizeImportFailureCode(code));
}
