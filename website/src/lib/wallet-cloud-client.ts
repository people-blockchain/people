import { addressMatchesPublicKey } from "@/lib/wallet-address-scheme";
import { generateWalletKeyPair } from "@/lib/partner/wallet";
import { keyFromPrivate, type FactoryKeyPair } from "@/lib/people-sign";
import {
  decryptPrivateKeyFromVault,
  encryptPrivateKeyForVault,
} from "@/lib/wallet-cloud-crypto";
export type CloudWalletSession = {
  id: string;
  address: string;
  privateKey: string;
  publicKey: string;
  kind: "cloud";
  userId: string;
};

export type AuthSessionUser = { id: string; email?: string | null };

/**
 * A cloud-vault failure carrying the route's machine code (`reauth_required`, `unauthorized`,
 * `rate_limited`, `invalid_ciphertext`, …) so callers can react to it instead of collapsing every
 * failure into one generic "sign-in could not be completed" — the bug the owner hit, where the
 * only reachable 401 was the wrap-key reauth gate and nothing consumed it.
 */
export class WalletCloudError extends Error {
  readonly code: string;
  /** Seconds from a 429, when the route sent one. */
  readonly retryAfterSeconds: number | null;
  constructor(code: string, retryAfterSeconds: number | null = null) {
    super(code);
    this.name = "WalletCloudError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isWalletCloudErrorCode(err: unknown, code: string): boolean {
  return err instanceof WalletCloudError && err.code === code;
}

function retryAfterFrom(res: Response, body: { retryAfter?: unknown }): number | null {
  if (typeof body.retryAfter === "number" && Number.isFinite(body.retryAfter) && body.retryAfter > 0) {
    return body.retryAfter;
  }
  const header = Number(res.headers.get("Retry-After"));
  return Number.isFinite(header) && header > 0 ? header : null;
}

/** Read the route's `{error}` body, or fall back to a call-site label when it is absent. */
async function errorFrom(res: Response, fallback: string): Promise<WalletCloudError> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; retryAfter?: unknown };
  const code = typeof body.error === "string" && body.error ? body.error : fallback;
  return new WalletCloudError(code, retryAfterFrom(res, body));
}

/** Locale template uses `{minutes}`, rounded up so a short wait never displays as zero. */
export function formatSignInRateLimited(template: string, retryAfterSeconds: number | null): string {
  const seconds = retryAfterSeconds != null && retryAfterSeconds > 0 ? retryAfterSeconds : 60;
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return template.replaceAll("{minutes}", String(minutes));
}

/**
 * When a vault restore hit `rate_limited`, the session bridge must not try again until this
 * instant. Other errors return null and keep their own retry rules.
 */
export function cloudRestoreBlockedUntil(err: unknown, now = Date.now()): number | null {
  if (!isWalletCloudErrorCode(err, "rate_limited")) return null;
  const seconds =
    err instanceof WalletCloudError && err.retryAfterSeconds != null && err.retryAfterSeconds > 0
      ? err.retryAfterSeconds
      : 60;
  return now + seconds * 1000;
}

export function cloudSessionMayRestore(blockedUntil: number, now = Date.now()): boolean {
  return now >= blockedUntil;
}

async function fetchWrapKey(): Promise<string> {
  const res = await fetch("/api/wallet/vault/wrap-key", { credentials: "include" });
  if (!res.ok) {
    // 401 carries either `unauthorized` (no session) or `reauth_required` (session older than the
    // 15-minute window): the two need different recovery, so the code must survive to the caller.
    throw await errorFrom(res, "wrap_key_failed");
  }
  const data = (await res.json()) as { wrapKeyHex: string };
  return data.wrapKeyHex;
}

export type CloudVaultRecord = {
  address: string;
  publicKey: string;
  encryptedPrivateKey: string;
};

export async function fetchVaultRecord(): Promise<CloudVaultRecord | null> {
  const res = await fetch("/api/wallet/vault", { credentials: "include" });
  if (res.status === 404) return null;
  if (!res.ok) throw await errorFrom(res, "vault_load_failed");
  return (await res.json()) as CloudVaultRecord;
}

/** Authenticated vault summary for migration UI (address only). */
export async function fetchVaultRecordClient(): Promise<{ address: string } | null> {
  const vault = await fetchVaultRecord();
  return vault ? { address: vault.address } : null;
}

export async function fetchAuthSessionUser(): Promise<AuthSessionUser | null> {
  const res = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
  if (!res.ok) return null;
  // Auth.js answers `null` (valid JSON) when nobody is signed in.
  const data = (await res.json().catch(() => null)) as { user?: AuthSessionUser | null } | null;
  return data?.user?.id ? data.user : null;
}

export function cloudSessionId(userId: string): string {
  return `cloud:${userId}`;
}

export function isCloudSessionId(id: string): boolean {
  return id.startsWith("cloud:");
}

export async function unlockCloudVaultSession(
  userId: string,
  existing?: CloudVaultRecord,
): Promise<CloudWalletSession> {
  const wrapKeyHex = await fetchWrapKey();
  const vault = existing ?? (await fetchVaultRecord());
  if (!vault) throw new WalletCloudError("vault_not_found");
  let privateKey: string;
  try {
    privateKey = await decryptPrivateKeyFromVault(vault.encryptedPrivateKey, wrapKeyHex);
  } catch {
    // A stored payload that will not decrypt with this user's wrap key: a legacy/rotated secret or
    // a corrupt row. Distinct from a network failure, and never the user's fault.
    throw new WalletCloudError("invalid_ciphertext");
  }
  const key = keyFromPrivate(privateKey);
  if (!addressMatchesPublicKey(vault.address, key.publicKey)) {
    throw new WalletCloudError("address_mismatch");
  }
  return {
    id: cloudSessionId(userId),
    address: key.address,
    privateKey: key.privateKey,
    publicKey: key.publicKey,
    kind: "cloud",
    userId,
  };
}

export async function createCloudVaultWallet(userId: string): Promise<CloudWalletSession> {
  const existing = await fetchVaultRecord();
  if (existing) {
    return unlockCloudVaultSession(userId, existing);
  }
  const wrapKeyHex = await fetchWrapKey();
  const generated = generateWalletKeyPair();
  const encryptedPrivateKey = await encryptPrivateKeyForVault(generated.privateKey, wrapKeyHex);
  const res = await fetch("/api/wallet/vault", {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      address: generated.address,
      publicKey: generated.publicKey,
      encryptedPrivateKey,
    }),
  });
  if (res.status === 409) {
    return unlockCloudVaultSession(userId);
  }
  if (!res.ok) {
    throw await errorFrom(res, "vault_create_failed");
  }
  const key: FactoryKeyPair = {
    privateKey: generated.privateKey,
    publicKey: generated.publicKey,
    address: generated.address,
  };
  return {
    id: cloudSessionId(userId),
    address: key.address,
    privateKey: key.privateKey,
    publicKey: key.publicKey,
    kind: "cloud",
    userId,
  };
}

export async function ensureCloudWalletSession(
  user: AuthSessionUser,
  options?: { vault?: CloudVaultRecord | null },
): Promise<CloudWalletSession> {
  const vault = options && "vault" in options ? (options.vault ?? null) : await fetchVaultRecord();
  if (vault) return unlockCloudVaultSession(user.id, vault);
  return createCloudVaultWallet(user.id);
}

export async function exportCloudPrivateKey(session: CloudWalletSession): Promise<string> {
  if (session.kind !== "cloud" || !session.userId) throw new Error("not_cloud");
  const wrapKeyHex = await fetchWrapKey();
  const vault = await fetchVaultRecord();
  if (!vault) throw new WalletCloudError("vault_not_found");
  return decryptPrivateKeyFromVault(vault.encryptedPrivateKey, wrapKeyHex);
}
