import { eq } from "drizzle-orm";
import { getDbReady } from "@/db";
import { userWalletVaults } from "@/db/schema";
import { keyFromPrivate } from "@/lib/people-sign";
import {
  decryptPrivateKeyFromVault,
  deriveUserWrapKeyHex,
  encryptPrivateKeyForVault,
} from "@/lib/wallet-cloud-crypto";
import { bindPartnerWalletFromVault } from "@/lib/partner/service";
import { isWalletAddress, normalizeHex } from "@/lib/partner/wallet";

const MIN_VAULT_SECRET_BYTES = 32;
export { WALLET_VAULT_REAUTH_WINDOW_MS, isAuthTimeFresh } from "@/lib/wallet-reauth-window";

let vaultSecretWarningLogged = false;

function warnVaultSecret(message: string): void {
  if (vaultSecretWarningLogged) return;
  vaultSecretWarningLogged = true;
  console.warn(`[wallet-vault] ${message}`);
}

const BUILD_OR_TEST =
  process.env.NODE_ENV === "test" || process.env.NEXT_PHASE === "phase-production-build";

/**
 * Current wrap-key master secret. recon.md R1: a leaked `AUTH_SECRET` — which also signs every
 * session cookie — must never also derive the AES key for every wallet vault, so there is no
 * runtime fallback to it here. If `PEOPLE_WALLET_VAULT_SECRET` is unset, callers must treat the
 * vault as not configured (`isWalletVaultConfigured()` returns false, routes answer `503
 * {error:"not_configured"}`) rather than reach this function; it throws defensively if called
 * anyway, except while building/under test where no request can reach it.
 */
export function walletVaultMasterSecret(): string {
  const dedicated = process.env.PEOPLE_WALLET_VAULT_SECRET?.trim();
  if (dedicated) {
    if (Buffer.byteLength(dedicated, "utf8") < MIN_VAULT_SECRET_BYTES) {
      warnVaultSecret(
        `PEOPLE_WALLET_VAULT_SECRET is shorter than ${MIN_VAULT_SECRET_BYTES} bytes; rotate it to a long random value.`,
      );
    }
    return dedicated;
  }
  if (BUILD_OR_TEST) return "wallet-vault-build-placeholder-not-for-production";
  throw new Error("wallet_vault_not_configured");
}

/** Like `walletVaultMasterSecret()`, but never throws — used by `isWalletVaultConfigured()`. */
function currentVaultSecretOrNull(): string | null {
  const dedicated = process.env.PEOPLE_WALLET_VAULT_SECRET?.trim();
  return dedicated || null;
}

/**
 * vaultVersion 1 rows were encrypted with the old AUTH_SECRET-derived key. `AUTH_SECRET` is
 * kept available *only* to decrypt-and-migrate those legacy rows onto the dedicated secret
 * (`migrateLegacyVaultIfNeeded`) — it is never used as the current secret for new reads/writes.
 */
function legacyWalletVaultMasterSecret(): string | null {
  return process.env.AUTH_SECRET?.trim() || null;
}

export function isWalletVaultConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim() && currentVaultSecretOrNull());
}

export async function getUserWrapKeyHex(userId: string): Promise<string> {
  if (!isWalletVaultConfigured()) throw new Error("wallet_vault_not_configured");
  const secret = walletVaultMasterSecret();
  await migrateLegacyVaultIfNeeded(userId);
  return deriveUserWrapKeyHex(secret, userId);
}

/**
 * One-time upgrade for vaults created before `PEOPLE_WALLET_VAULT_SECRET` was required: decrypt
 * with the old AUTH_SECRET-derived key and re-encrypt with the dedicated one. No-op once done
 * (vaultVersion becomes 2) or if there is nothing to migrate.
 */
async function migrateLegacyVaultIfNeeded(userId: string) {
  const db = await getDbReady();
  const rows = await db.select().from(userWalletVaults).where(eq(userWalletVaults.userId, userId)).limit(1);
  const vault = rows[0];
  if (!vault || vault.vaultVersion !== 1) return vault ?? null;
  const legacySecret = legacyWalletVaultMasterSecret();
  const newSecret = currentVaultSecretOrNull();
  // Without the dedicated secret there is nothing safe to migrate onto yet — wait for it.
  if (!legacySecret || !newSecret) return vault;
  const legacyWrapKeyHex = await deriveUserWrapKeyHex(legacySecret, userId);
  const plain = await decryptPrivateKeyFromVault(vault.encryptedPrivateKey, legacyWrapKeyHex).catch(() => null);
  if (!plain) return vault;
  const newWrapKeyHex = await deriveUserWrapKeyHex(newSecret, userId);
  const encryptedPrivateKey = await encryptPrivateKeyForVault(plain, newWrapKeyHex);
  const now = new Date();
  await db
    .update(userWalletVaults)
    .set({ encryptedPrivateKey, vaultVersion: 2, updatedAt: now })
    .where(eq(userWalletVaults.userId, userId));
  return { ...vault, encryptedPrivateKey, vaultVersion: 2, updatedAt: now };
}

export async function loadUserWalletVault(userId: string) {
  return migrateLegacyVaultIfNeeded(userId);
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
    vaultVersion: 2, // encrypted with the dedicated PEOPLE_WALLET_VAULT_SECRET; 1 is legacy-only.
    createdAt: now,
    updatedAt: now,
  });

  const bind = await bindPartnerWalletFromVault(userId, address, normalizeHex(input.publicKey));
  if (!bind.ok) {
    return { ok: false as const, error: bind.error };
  }

  return { ok: true as const, address };
}
