import { and, count, eq } from "drizzle-orm";
import { getDbReady } from "@/db";
import { userWalletVaults } from "@/db/schema";
import { keyFromPrivate } from "@/lib/people-sign";
import {
  decryptPrivateKeyFromVault,
  deriveUserWrapKeyHex,
  encryptPrivateKeyForVault,
  readLegacyVaultPlaintext,
  warnCloudOpenFailed,
} from "@/lib/wallet-cloud-crypto";
import { bindPartnerWalletFromVault } from "@/lib/partner/service";
import { isWalletAddress, normalizeHex } from "@/lib/partner/wallet";

const MIN_VAULT_SECRET_BYTES = 32;
/** Dedicated PEOPLE_WALLET_VAULT_SECRET wrapping. v1 is AUTH_SECRET-only (legacy). */
export const WALLET_VAULT_VERSION_DEDICATED = 2;
/** Wrapping under a rotated PEOPLE_WALLET_VAULT_SECRET while PREVIOUS/NEXT is set. */
export const WALLET_VAULT_VERSION_ROTATED = 3;

export { WALLET_VAULT_REAUTH_WINDOW_MS, isAuthTimeFresh } from "@/lib/wallet-reauth-window";

let vaultSecretWarningLogged = false;

function warnVaultSecret(message: string): void {
  if (vaultSecretWarningLogged) return;
  vaultSecretWarningLogged = true;
  console.warn(`[wallet-vault] ${message}`);
}

const BUILD_OR_TEST =
  process.env.NODE_ENV === "test" || process.env.NEXT_PHASE === "phase-production-build";

function trimmedEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

function warnIfShort(secret: string, name: string): void {
  if (Buffer.byteLength(secret, "utf8") < MIN_VAULT_SECRET_BYTES) {
    warnVaultSecret(
      `${name} is shorter than ${MIN_VAULT_SECRET_BYTES} bytes; rotate it to a long random value.`,
    );
  }
}

/**
 * Optional previous wrap-key master secret. When set, `PEOPLE_WALLET_VAULT_SECRET` is the *new*
 * wrapping secret (vaultVersion 3). v2 rows unwrap with this value.
 */
function previousVaultSecret(): string | null {
  return trimmedEnv("PEOPLE_WALLET_VAULT_SECRET_PREVIOUS");
}

/**
 * Optional next wrap-key master secret. Use when the current `PEOPLE_WALLET_VAULT_SECRET` is a
 * Vercel Sensitive var that cannot be copied into PREVIOUS: keep the existing env var in place
 * (it unwraps v2) and put the owner-held new secret here.
 */
function nextVaultSecret(): string | null {
  return trimmedEnv("PEOPLE_WALLET_VAULT_SECRET_NEXT");
}

/** Dual-key rotation is active: new ciphertext uses vaultVersion 3. */
export function isVaultRotationActive(): boolean {
  return Boolean(previousVaultSecret() || nextVaultSecret());
}

/**
 * Version stamped on new vaults and targeted by migration. Stays 2 when rotation env is unset
 * so deploying this code alone does not change wrapping or row versions.
 */
export function currentVaultVersion(): 2 | 3 {
  return isVaultRotationActive() ? WALLET_VAULT_VERSION_ROTATED : WALLET_VAULT_VERSION_DEDICATED;
}

/**
 * Current wrap-key master secret. recon.md R1: a leaked `AUTH_SECRET` — which also signs every
 * session cookie — must never also derive the AES key for every wallet vault, so there is no
 * runtime fallback to it here. If `PEOPLE_WALLET_VAULT_SECRET` is unset, callers must treat the
 * vault as not configured (`isWalletVaultConfigured()` returns false, routes answer `503
 * {error:"not_configured"}`) rather than reach this function; it throws defensively if called
 * anyway, except while building/under test where no request can reach it.
 *
 * During rotation, `PEOPLE_WALLET_VAULT_SECRET_NEXT` (if set, and PREVIOUS is not) is the wrapping
 * secret; otherwise `PEOPLE_WALLET_VAULT_SECRET` is.
 */
export function walletVaultMasterSecret(): string {
  const previous = previousVaultSecret();
  const next = nextVaultSecret();
  // PREVIOUS wins: the *current* env var is already the new secret.
  if (previous) {
    const dedicated = trimmedEnv("PEOPLE_WALLET_VAULT_SECRET");
    if (dedicated) {
      warnIfShort(dedicated, "PEOPLE_WALLET_VAULT_SECRET");
      return dedicated;
    }
  } else if (next) {
    warnIfShort(next, "PEOPLE_WALLET_VAULT_SECRET_NEXT");
    return next;
  }
  const dedicated = trimmedEnv("PEOPLE_WALLET_VAULT_SECRET");
  if (dedicated) {
    warnIfShort(dedicated, "PEOPLE_WALLET_VAULT_SECRET");
    return dedicated;
  }
  if (BUILD_OR_TEST) return "wallet-vault-build-placeholder-not-for-production";
  throw new Error("wallet_vault_not_configured");
}

/** Like `walletVaultMasterSecret()`, but never throws — used by `isWalletVaultConfigured()`. */
function currentVaultSecretOrNull(): string | null {
  const previous = previousVaultSecret();
  const next = nextVaultSecret();
  if (previous) return trimmedEnv("PEOPLE_WALLET_VAULT_SECRET");
  if (next) return next;
  return trimmedEnv("PEOPLE_WALLET_VAULT_SECRET");
}

/**
 * Secret that wrapped vaultVersion 2 rows. Only set while rotation env is present; otherwise
 * v2 is current and unwraps with `currentVaultSecretOrNull()`.
 */
function v2UnwrapSecret(): string | null {
  const previous = previousVaultSecret();
  if (previous) return previous;
  if (nextVaultSecret()) return trimmedEnv("PEOPLE_WALLET_VAULT_SECRET");
  return null;
}

/**
 * vaultVersion 1 rows were encrypted with the old AUTH_SECRET-derived key. `AUTH_SECRET` is
 * kept available *only* to decrypt-and-migrate those legacy rows onto the dedicated secret
 * (`migrateVaultIfNeeded`) — it is never used as the current secret for new reads/writes.
 */
function legacyWalletVaultMasterSecret(): string | null {
  return trimmedEnv("AUTH_SECRET");
}

export function isWalletVaultConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim() && currentVaultSecretOrNull());
}

export async function getUserWrapKeyHex(userId: string): Promise<string> {
  if (!isWalletVaultConfigured()) throw new Error("wallet_vault_not_configured");
  const secret = walletVaultMasterSecret();
  await migrateVaultIfNeeded(userId);
  return deriveUserWrapKeyHex(secret, userId);
}

type VaultRow = typeof userWalletVaults.$inferSelect;

function sourceSecretForVersion(fromVersion: number): { secret: string | null; stage: string; decryptFailedCode: string } {
  if (fromVersion === 1) {
    return {
      secret: legacyWalletVaultMasterSecret(),
      stage: "legacy_migrate",
      decryptFailedCode: "legacy_decrypt_failed",
    };
  }
  if (fromVersion === WALLET_VAULT_VERSION_DEDICATED) {
    return {
      secret: v2UnwrapSecret(),
      stage: "vault_rotate",
      decryptFailedCode: "rotate_decrypt_failed",
    };
  }
  return { secret: null, stage: "vault_rotate", decryptFailedCode: "rotate_decrypt_failed" };
}

/**
 * Re-wrap a vault onto the current master secret when its version is behind `currentVaultVersion()`.
 *
 * Server-side re-wrap is safe: the wrap key is HKDF(master, userId) and AES-GCM runs on the
 * server in the existing v1 path. The client still encrypts new vaults with the *current* wrap
 * key from GET /api/wallet/vault/wrap-key; that route migrates first, so the ciphertext the
 * browser decrypts always matches the wrap key it receives. No client dual-key handshake.
 *
 * No-op when rotation env is unset and the row is already v2 (or already at the target).
 * Decrypt / address failure leaves the row untouched.
 */
async function migrateVaultIfNeeded(userId: string): Promise<VaultRow | null> {
  const db = await getDbReady();
  const rows = await db.select().from(userWalletVaults).where(eq(userWalletVaults.userId, userId)).limit(1);
  const vault = rows[0];
  if (!vault) return null;
  const targetVersion = currentVaultVersion();
  if (vault.vaultVersion === targetVersion || vault.vaultVersion > targetVersion) return vault;

  const fromVersion = vault.vaultVersion;
  const { secret: sourceSecret, stage, decryptFailedCode } = sourceSecretForVersion(fromVersion);
  const newSecret = currentVaultSecretOrNull();
  if (!sourceSecret || !newSecret) return vault;

  const sourceWrapKeyHex = await deriveUserWrapKeyHex(sourceSecret, userId);
  const plain = await readLegacyVaultPlaintext(
    () => decryptPrivateKeyFromVault(vault.encryptedPrivateKey, sourceWrapKeyHex),
    { stage, decryptFailedCode },
  );
  if (!plain) return vault;

  let derivedAddress: string;
  try {
    derivedAddress = keyFromPrivate(plain).address;
  } catch {
    warnCloudOpenFailed({
      code: fromVersion === 1 ? "legacy_key_invalid" : "rotate_key_invalid",
      stage,
      vaultPresent: true,
      retried: false,
    });
    return vault;
  }
  if (derivedAddress.toLowerCase() !== vault.address.trim().toLowerCase()) {
    warnCloudOpenFailed({
      code: fromVersion === 1 ? "legacy_address_mismatch" : "rotate_address_mismatch",
      stage,
      vaultPresent: true,
      retried: false,
    });
    return vault;
  }

  const newWrapKeyHex = await deriveUserWrapKeyHex(newSecret, userId);
  const encryptedPrivateKey = await encryptPrivateKeyForVault(plain, newWrapKeyHex);
  const now = new Date();
  const updated = await db
    .update(userWalletVaults)
    .set({ encryptedPrivateKey, vaultVersion: targetVersion, updatedAt: now })
    .where(vaultCasWhere(userId, fromVersion))
    .returning();
  if (!updated[0]) {
    warnCloudOpenFailed({
      code: fromVersion === 1 ? "legacy_migrate_cas" : "rotate_migrate_cas",
      stage,
      vaultPresent: true,
      retried: false,
    });
    const current = await db.select().from(userWalletVaults).where(eq(userWalletVaults.userId, userId)).limit(1);
    return current[0] ?? vault;
  }
  return updated[0];
}

/** Compare-and-swap: only a row still at `fromVersion` may move. */
export function vaultCasWhere(userId: string, fromVersion: number) {
  return and(eq(userWalletVaults.userId, userId), eq(userWalletVaults.vaultVersion, fromVersion));
}

/** Version-1 rows only. A later-version row must not be overwritten by a late v1 migration. */
export function legacyVaultCasWhere(userId: string) {
  return vaultCasWhere(userId, 1);
}

export async function loadUserWalletVault(userId: string) {
  return migrateVaultIfNeeded(userId);
}

export type VaultVersionCounts = {
  1: number;
  2: number;
  3: number;
  other: number;
  total: number;
};

export async function countWalletVaultsByVersion(): Promise<VaultVersionCounts> {
  const db = await getDbReady();
  const rows = await db
    .select({
      vaultVersion: userWalletVaults.vaultVersion,
      n: count(),
    })
    .from(userWalletVaults)
    .groupBy(userWalletVaults.vaultVersion);
  const out: VaultVersionCounts = { 1: 0, 2: 0, 3: 0, other: 0, total: 0 };
  for (const row of rows) {
    const n = Number(row.n);
    out.total += n;
    if (row.vaultVersion === 1) out[1] = n;
    else if (row.vaultVersion === 2) out[2] = n;
    else if (row.vaultVersion === 3) out[3] = n;
    else out.other += n;
  }
  return out;
}

export type VaultBulkMigrateResult = {
  dryRun: boolean;
  currentVersion: 2 | 3;
  rotationActive: boolean;
  counts: VaultVersionCounts;
  migrated: number;
  skipped: number;
  failed: number;
};

/**
 * Bulk re-wrap every row behind `currentVaultVersion()`. Dry-run returns counts only and
 * writes nothing. Live mode is the same per-row CAS as lazy migration on wrap-key / vault GET.
 */
export async function migrateAllWalletVaults(options?: { dryRun?: boolean }): Promise<VaultBulkMigrateResult> {
  const dryRun = options?.dryRun === true;
  const currentVersion = currentVaultVersion();
  const rotationActive = isVaultRotationActive();
  const db = await getDbReady();
  const rows = await db
    .select({
      userId: userWalletVaults.userId,
      vaultVersion: userWalletVaults.vaultVersion,
    })
    .from(userWalletVaults);

  if (dryRun) {
    return {
      dryRun: true,
      currentVersion,
      rotationActive,
      counts: await countWalletVaultsByVersion(),
      migrated: 0,
      skipped: 0,
      failed: 0,
    };
  }

  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.vaultVersion === currentVersion || row.vaultVersion > currentVersion) {
      skipped += 1;
      continue;
    }
    const beforeVersion = row.vaultVersion;
    const after = await migrateVaultIfNeeded(row.userId);
    if (!after || after.vaultVersion === beforeVersion) {
      failed += 1;
      continue;
    }
    migrated += 1;
  }
  return {
    dryRun: false,
    currentVersion,
    rotationActive,
    counts: await countWalletVaultsByVersion(),
    migrated,
    skipped,
    failed,
  };
}

export type VaultUpsertInput = {
  address: string;
  publicKey: string;
  encryptedPrivateKey: string;
};

export async function verifyVaultPayload(userId: string, input: VaultUpsertInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const address = input.address.trim().toLowerCase();
  const publicKey = normalizeHex(input.publicKey);
  if (!isWalletAddress(address) || publicKey.length < 66) {
    return { ok: false, error: "invalid_input" };
  }
  let privateKey: string;
  try {
    const wrapKeyHex = await getUserWrapKeyHex(userId);
    privateKey = await decryptPrivateKeyFromVault(input.encryptedPrivateKey, wrapKeyHex);
  } catch {
    return { ok: false, error: "invalid_ciphertext" };
  }
  const derived = keyFromPrivate(privateKey);
  if (derived.address.toLowerCase() !== address) {
    return { ok: false, error: "address_mismatch" };
  }
  if (normalizeHex(derived.publicKey) !== publicKey) {
    return { ok: false, error: "public_key_mismatch" };
  }
  return { ok: true };
}

export async function createUserWalletVault(userId: string, input: VaultUpsertInput) {
  const verified = await verifyVaultPayload(userId, input);
  if (!verified.ok) return verified;

  const db = await getDbReady();
  const existing = await loadUserWalletVault(userId);
  if (existing) {
    return { ok: false as const, error: "already_exists" as const, vault: existing };
  }

  const address = input.address.trim().toLowerCase();
  const taken = await db
    .select({ userId: userWalletVaults.userId })
    .from(userWalletVaults)
    .where(eq(userWalletVaults.address, address))
    .limit(1);
  if (taken[0] && taken[0].userId !== userId) {
    return { ok: false as const, error: "address_taken" as const };
  }

  const now = new Date();
  await db.insert(userWalletVaults).values({
    userId,
    address,
    publicKey: normalizeHex(input.publicKey),
    encryptedPrivateKey: input.encryptedPrivateKey,
    vaultVersion: currentVaultVersion(),
    createdAt: now,
    updatedAt: now,
  });

  const bind = await bindPartnerWalletFromVault(userId, address, normalizeHex(input.publicKey));
  if (!bind.ok) {
    return { ok: false as const, error: bind.error };
  }

  return { ok: true as const, address };
}
