import { createHash } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { getDbReady } from "@/db";
import { userWalletVaults } from "@/db/schema";
import { keyFromPrivate } from "@/lib/people-sign";
import {
  decryptPrivateKeyFromVault,
  deriveUserWrapKeyHex,
  encryptPrivateKeyForVault,
  VaultSchemaError,
  warnCloudOpenFailed,
} from "@/lib/wallet-cloud-crypto";
import { bindPartnerWalletFromVault } from "@/lib/partner/service";
import { isWalletAddress, normalizeHex } from "@/lib/partner/wallet";
import {
  addressMatchesPublicKey,
  evmAddressFromPublicKey,
  legacyAddressFromPublicKey,
} from "@/lib/wallet-address-scheme";

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

/** Opaque row id for migrate diagnostics. Never the raw userId. */
export function hashVaultRowId(userId: string): string {
  return createHash("sha256").update(userId, "utf8").digest("hex").slice(0, 16);
}

export type VaultSecretSlot = "auth_secret" | "dedicated" | "previous" | "next";
export type VaultDecryptProbeResult = "unset" | "ok" | "fail" | "address_mismatch" | "invalid_key";

/**
 * Master secret that unwraps ciphertext *already stored* at `vaultVersion`.
 * During NEXT rotation, v2 stays on `PEOPLE_WALLET_VAULT_SECRET` (the old env); v3 uses NEXT.
 * Unmigrated rows must never be handed the current wrapping secret.
 */
export function unwrapMasterSecretForVaultVersion(vaultVersion: number): string | null {
  if (vaultVersion === 1) return legacyWalletVaultMasterSecret();
  if (vaultVersion === WALLET_VAULT_VERSION_DEDICATED) {
    const previous = previousVaultSecret();
    if (previous) return previous;
    return trimmedEnv("PEOPLE_WALLET_VAULT_SECRET");
  }
  return currentVaultSecretOrNull();
}

export function expectedSecretSlotForVaultVersion(vaultVersion: number): VaultSecretSlot {
  if (vaultVersion === 1) return "auth_secret";
  if (vaultVersion === WALLET_VAULT_VERSION_DEDICATED) {
    return previousVaultSecret() ? "previous" : "dedicated";
  }
  return nextVaultSecret() && !previousVaultSecret() ? "next" : "dedicated";
}

export async function getUserWrapKeyHex(userId: string): Promise<string> {
  if (!isWalletVaultConfigured()) throw new Error("wallet_vault_not_configured");
  const { vault } = await migrateVaultIfNeeded(userId);
  const secret = vault
    ? unwrapMasterSecretForVaultVersion(vault.vaultVersion)
    : currentVaultSecretOrNull();
  if (!secret) throw new Error("wallet_vault_not_configured");
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

function logRotateRowFailed(userId: string, vaultVersion: number, code: string): void {
  console.warn("[wallet-vault] rotate row failed", {
    rowId: hashVaultRowId(userId),
    vaultVersion,
    code,
  });
}

async function decryptVaultWithSecret(
  vault: VaultRow,
  secret: string,
  decryptFailedCode: string,
): Promise<{ plain: string } | { error: string }> {
  try {
    const wrapKeyHex = await deriveUserWrapKeyHex(secret, vault.userId);
    const plain = await decryptPrivateKeyFromVault(vault.encryptedPrivateKey, wrapKeyHex);
    return { plain };
  } catch (err) {
    const error = err instanceof VaultSchemaError ? "vault_schema_unsupported" : decryptFailedCode;
    return { error };
  }
}

type MigrateVaultAttempt = {
  vault: VaultRow | null;
  error: string | null;
};

function failMigrate(vault: VaultRow, stage: string, code: string): MigrateVaultAttempt {
  warnCloudOpenFailed({ code, stage, vaultPresent: true, retried: false });
  logRotateRowFailed(vault.userId, vault.vaultVersion, code);
  return { vault, error: code };
}

/**
 * Re-wrap a vault onto the current master secret when its version is behind `currentVaultVersion()`.
 *
 * Server-side re-wrap is safe: the wrap key is HKDF(master, userId) and AES-GCM runs on the
 * server in the existing v1 path. GET /api/wallet/vault/wrap-key still migrates first, but
 * if the row cannot move it returns the wrap key for the *stored* vaultVersion — never NEXT
 * for an unmigrated v1/v2 row. No client dual-key handshake.
 *
 * No-op when rotation env is unset and the row is already v2 (or already at the target).
 * Decrypt / address failure leaves the row untouched.
 */
async function migrateVaultIfNeeded(userId: string): Promise<MigrateVaultAttempt> {
  const db = await getDbReady();
  const rows = await db.select().from(userWalletVaults).where(eq(userWalletVaults.userId, userId)).limit(1);
  const vault = rows[0];
  if (!vault) return { vault: null, error: null };
  const targetVersion = currentVaultVersion();
  if (vault.vaultVersion === targetVersion || vault.vaultVersion > targetVersion) {
    return { vault, error: null };
  }

  const fromVersion = vault.vaultVersion;
  const { secret: sourceSecret, stage, decryptFailedCode } = sourceSecretForVersion(fromVersion);
  const newSecret = currentVaultSecretOrNull();
  if (!sourceSecret) {
    return failMigrate(vault, stage, fromVersion === 1 ? "legacy_secret_missing" : "rotate_secret_missing");
  }
  if (!newSecret) {
    return failMigrate(vault, stage, "wrap_secret_missing");
  }

  const decrypted = await decryptVaultWithSecret(vault, sourceSecret, decryptFailedCode);
  if ("error" in decrypted) {
    return failMigrate(vault, stage, decrypted.error);
  }
  const plain = decrypted.plain;

  let publicKeyHex: string;
  try {
    publicKeyHex = keyFromPrivate(plain).publicKey;
  } catch {
    return failMigrate(vault, stage, fromVersion === 1 ? "legacy_key_invalid" : "rotate_key_invalid");
  }
  // Client open already accepts sha256 (pre-EVM) or keccak. Migrate used to compare
  // only the current scheme, so leftover vaults stored under the other scheme looked
  // like address_mismatch even though AES-GCM and the key were fine.
  if (!addressMatchesPublicKey(vault.address, publicKeyHex)) {
    return failMigrate(vault, stage, fromVersion === 1 ? "legacy_address_mismatch" : "rotate_address_mismatch");
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
    const latest = current[0] ?? vault;
    if (latest.vaultVersion === targetVersion) return { vault: latest, error: null };
    logRotateRowFailed(userId, latest.vaultVersion, fromVersion === 1 ? "legacy_migrate_cas" : "rotate_migrate_cas");
    return { vault: latest, error: fromVersion === 1 ? "legacy_migrate_cas" : "rotate_migrate_cas" };
  }
  return { vault: updated[0], error: null };
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
  const { vault } = await migrateVaultIfNeeded(userId);
  return vault;
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

export type VaultBulkMigrateFailure = {
  rowId: string;
  vaultVersion: number;
  code: string;
};

export type VaultAddressSchemeMatch = "evm" | "legacy" | "none";

export type VaultDecryptProbe = {
  rowId: string;
  vaultVersion: number;
  expectedSlot: VaultSecretSlot;
  probes: Record<VaultSecretSlot, VaultDecryptProbeResult>;
  /** Stored receive address (public). Lets ops compare on-chain balances without the key. */
  storedAddress: string;
  derivedEvm?: string;
  derivedLegacy?: string;
  schemeMatch?: VaultAddressSchemeMatch;
};

function schemeMatchForStoredAddress(storedAddress: string, publicKeyHex: string): VaultAddressSchemeMatch {
  const a = storedAddress.trim().toLowerCase();
  if (evmAddressFromPublicKey(publicKeyHex).toLowerCase() === a) return "evm";
  if (legacyAddressFromPublicKey(publicKeyHex).toLowerCase() === a) return "legacy";
  return "none";
}

export type VaultBulkMigrateResult = {
  dryRun: boolean;
  currentVersion: 2 | 3;
  rotationActive: boolean;
  counts: VaultVersionCounts;
  migrated: number;
  skipped: number;
  failed: number;
  failures: VaultBulkMigrateFailure[];
  decryptProbes?: VaultDecryptProbe[];
};

const VAULT_SECRET_SLOTS: VaultSecretSlot[] = ["auth_secret", "dedicated", "previous", "next"];

function secretForSlot(slot: VaultSecretSlot): string | null {
  if (slot === "auth_secret") return legacyWalletVaultMasterSecret();
  if (slot === "dedicated") return trimmedEnv("PEOPLE_WALLET_VAULT_SECRET");
  if (slot === "previous") return previousVaultSecret();
  return nextVaultSecret();
}

async function probeDecryptSlot(vault: VaultRow, secret: string | null): Promise<VaultDecryptProbeResult> {
  if (!secret) return "unset";
  const decrypted = await decryptVaultWithSecret(vault, secret, "fail");
  if ("error" in decrypted) return "fail";
  try {
    const key = keyFromPrivate(decrypted.plain);
    if (!addressMatchesPublicKey(vault.address, key.publicKey)) return "address_mismatch";
  } catch {
    return "invalid_key";
  }
  return "ok";
}

async function derivedAddressesIfDecryptable(
  vault: VaultRow,
): Promise<{ derivedEvm: string; derivedLegacy: string; schemeMatch: VaultAddressSchemeMatch } | null> {
  for (const slot of VAULT_SECRET_SLOTS) {
    const secret = secretForSlot(slot);
    if (!secret) continue;
    const decrypted = await decryptVaultWithSecret(vault, secret, "fail");
    if ("error" in decrypted) continue;
    try {
      const key = keyFromPrivate(decrypted.plain);
      return {
        derivedEvm: evmAddressFromPublicKey(key.publicKey),
        derivedLegacy: legacyAddressFromPublicKey(key.publicKey),
        schemeMatch: schemeMatchForStoredAddress(vault.address, key.publicKey),
      };
    } catch {
      continue;
    }
  }
  return null;
}

async function decryptProbesForRows(rows: VaultRow[]): Promise<VaultDecryptProbe[]> {
  const out: VaultDecryptProbe[] = [];
  for (const vault of rows) {
    const probes = {} as Record<VaultSecretSlot, VaultDecryptProbeResult>;
    for (const slot of VAULT_SECRET_SLOTS) {
      probes[slot] = await probeDecryptSlot(vault, secretForSlot(slot));
    }
    const derived = await derivedAddressesIfDecryptable(vault);
    out.push({
      rowId: hashVaultRowId(vault.userId),
      vaultVersion: vault.vaultVersion,
      expectedSlot: expectedSecretSlotForVaultVersion(vault.vaultVersion),
      probes,
      storedAddress: vault.address.trim().toLowerCase(),
      ...(derived ?? {}),
    });
  }
  return out;
}

/**
 * Bulk re-wrap every row behind `currentVaultVersion()`. Dry-run writes nothing and reports
 * per-row decrypt probes against every available secret slot. Live mode is the same per-row
 * CAS as lazy migration on wrap-key / vault GET, plus per-row failure codes (hashed row id).
 */
export async function migrateAllWalletVaults(options?: { dryRun?: boolean }): Promise<VaultBulkMigrateResult> {
  const dryRun = options?.dryRun === true;
  const currentVersion = currentVaultVersion();
  const rotationActive = isVaultRotationActive();
  const db = await getDbReady();
  const rows = await db.select().from(userWalletVaults);

  if (dryRun) {
    const decryptProbes = await decryptProbesForRows(rows);
    const failures: VaultBulkMigrateFailure[] = [];
    let skipped = 0;
    for (const probe of decryptProbes) {
      if (probe.vaultVersion === currentVersion || probe.vaultVersion > currentVersion) {
        skipped += 1;
        continue;
      }
      if (probe.probes[probe.expectedSlot] !== "ok") {
        failures.push({
          rowId: probe.rowId,
          vaultVersion: probe.vaultVersion,
          code: `decrypt_${probe.probes[probe.expectedSlot]}`,
        });
      }
    }
    return {
      dryRun: true,
      currentVersion,
      rotationActive,
      counts: await countWalletVaultsByVersion(),
      migrated: 0,
      skipped,
      failed: failures.length,
      failures,
      decryptProbes,
    };
  }

  let migrated = 0;
  let skipped = 0;
  const failures: VaultBulkMigrateFailure[] = [];
  for (const row of rows) {
    if (row.vaultVersion === currentVersion || row.vaultVersion > currentVersion) {
      skipped += 1;
      continue;
    }
    const beforeVersion = row.vaultVersion;
    const { vault: after, error } = await migrateVaultIfNeeded(row.userId);
    if (!after || after.vaultVersion === beforeVersion) {
      failures.push({
        rowId: hashVaultRowId(row.userId),
        vaultVersion: beforeVersion,
        code: error ?? "rotate_unchanged",
      });
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
    failed: failures.length,
    failures,
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
