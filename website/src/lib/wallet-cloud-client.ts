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
  constructor(code: string) {
    super(code);
    this.name = "WalletCloudError";
    this.code = code;
  }
}

export function isWalletCloudErrorCode(err: unknown, code: string): boolean {
  return err instanceof WalletCloudError && err.code === code;
}

/** Read the route's `{error}` body, or fall back to a call-site label when it is absent. */
async function errorCodeFrom(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return typeof body.error === "string" && body.error ? body.error : fallback;
}

async function fetchWrapKey(): Promise<string> {
  const res = await fetch("/api/wallet/vault/wrap-key", { credentials: "include" });
  if (!res.ok) {
    // 401 carries either `unauthorized` (no session) or `reauth_required` (session older than the
    // 15-minute window): the two need different recovery, so the code must survive to the caller.
    throw new WalletCloudError(await errorCodeFrom(res, "wrap_key_failed"));
  }
  const data = (await res.json()) as { wrapKeyHex: string };
  return data.wrapKeyHex;
}

export async function fetchVaultRecord(): Promise<{
  address: string;
  publicKey: string;
  encryptedPrivateKey: string;
} | null> {
  const res = await fetch("/api/wallet/vault", { credentials: "include" });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new WalletCloudError(await errorCodeFrom(res, "vault_load_failed"));
  }
  return (await res.json()) as {
    address: string;
    publicKey: string;
    encryptedPrivateKey: string;
  };
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

export async function unlockCloudVaultSession(userId: string): Promise<CloudWalletSession> {
  const wrapKeyHex = await fetchWrapKey();
  const vault = await fetchVaultRecord();
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
    return unlockCloudVaultSession(userId);
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
    throw new WalletCloudError(await errorCodeFrom(res, "vault_create_failed"));
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

export async function ensureCloudWalletSession(user: AuthSessionUser): Promise<CloudWalletSession> {
  const vault = await fetchVaultRecord();
  if (vault) return unlockCloudVaultSession(user.id);
  return createCloudVaultWallet(user.id);
}

export async function exportCloudPrivateKey(session: CloudWalletSession): Promise<string> {
  if (session.kind !== "cloud" || !session.userId) throw new Error("not_cloud");
  const wrapKeyHex = await fetchWrapKey();
  const vault = await fetchVaultRecord();
  if (!vault) throw new WalletCloudError("vault_not_found");
  return decryptPrivateKeyFromVault(vault.encryptedPrivateKey, wrapKeyHex);
}
