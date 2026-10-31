import { addressMatchesPublicKey } from "@/lib/wallet-address-scheme";
import { generateWalletKeyPair } from "@/lib/partner/wallet";
import { keyFromPrivate, type FactoryKeyPair } from "@/lib/people-sign";
import {
  decryptPrivateKeyFromVault,
  encryptPrivateKeyForVault,
  safeCloudLogCode,
  VaultSchemaError,
  warnCloudOpenFailed,
} from "@/lib/wallet-cloud-crypto";
import { isAuthTimeFresh } from "@/lib/wallet-reauth-window";
export type CloudWalletSession = {
  id: string;
  address: string;
  privateKey: string;
  publicKey: string;
  kind: "cloud";
  userId: string;
};

export type AuthSessionUser = { id: string; email?: string | null; authTime?: number };

/** Outcome of checking a just-refreshed Auth.js session before retrying the vault open. */
export type CloudSessionRetryDecision = "ok" | "unauthorized" | "reauth_required";

/**
 * After Web3Auth re-sign-in, retry the vault only when the session has a user id and an authTime
 * inside the reauth window. No id is anonymous (`unauthorized`); a missing or stale authTime is
 * the same gate the wrap-key route enforces (`reauth_required`).
 */
export function cloudSessionRetryDecision(
  session: { id?: string | null; authTime?: number | null } | null | undefined,
  nowMs: number = Date.now(),
): CloudSessionRetryDecision {
  if (!session?.id) return "unauthorized";
  if (!isAuthTimeFresh(session.authTime, nowMs)) return "reauth_required";
  return "ok";
}

/**
 * A cloud-vault failure carrying a machine code (`reauth_required`, `decrypt_failed`,
 * `vault_schema_unsupported`, …) so callers can react to it instead of collapsing every
 * failure into one generic "sign-in could not be completed". Server routes still answer
 * `invalid_ciphertext`; that string is not a client code.
 */
export class WalletCloudError extends Error {
  readonly code: string;
  /** True once `failCloudOpen` has written the safe console warning. */
  readonly logged: boolean;
  constructor(code: string, options?: { logged?: boolean }) {
    super(code);
    this.name = "WalletCloudError";
    this.code = code;
    this.logged = options?.logged === true;
  }
}

export type CloudOpenOptions = { retried?: boolean; vaultPresent?: boolean };

type VaultRecord = {
  address: string;
  publicKey: string;
  encryptedPrivateKey: string;
};

function cloudOpenFlags(options: CloudOpenOptions | undefined, vaultPresent: boolean) {
  return { vaultPresent, retried: options?.retried === true };
}

function failCloudOpen(code: string, stage: string, flags: { vaultPresent: boolean; retried: boolean }): never {
  warnCloudOpenFailed({ code, stage, vaultPresent: flags.vaultPresent, retried: flags.retried });
  throw new WalletCloudError(code, { logged: true });
}

function failVaultDecrypt(err: unknown, flags: { vaultPresent: boolean; retried: boolean }): never {
  if (err instanceof VaultSchemaError) failCloudOpen("vault_schema_unsupported", "vault_schema", flags);
  failCloudOpen("decrypt_failed", "decrypt", flags);
}

export function isWalletCloudErrorCode(err: unknown, code: string): boolean {
  return err instanceof WalletCloudError && err.code === code;
}

/** Failures whose copy points at the existing import / encrypted-backup screen. */
export function isCloudOpenRecoveryCode(code: string): boolean {
  return (
    code === "decrypt_failed" ||
    code === "vault_schema_unsupported" ||
    code === "address_mismatch" ||
    code === "address_taken" ||
    code === "session_open_failed"
  );
}

/**
 * The Auth.js session and the Web3Auth user must be the same account. Opening the vault for
 * `session.id` while remembering email and other fields for a different `userId` would attach
 * the wrong wallet.
 */
export function assertCloudAccount(sessionId: string, userId: string): string {
  if (sessionId !== userId) throw new WalletCloudError("account_mismatch");
  return sessionId;
}

/** Read the route's `{error}` body, or fall back to a call-site label when it is absent. */
export async function errorCodeFrom(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  const raw = typeof body.error === "string" && body.error ? body.error : fallback;
  return safeCloudLogCode(raw);
}

export async function fetchWrapKey(options?: CloudOpenOptions): Promise<string> {
  const res = await fetch("/api/wallet/vault/wrap-key", { credentials: "include" });
  if (!res.ok) {
    // 401 carries either `unauthorized` (no session) or `reauth_required` (session older than the
    // 5-minute reauth window): the two need different recovery, so the code must survive to the caller.
    const code = await errorCodeFrom(res, "wrap_key_failed");
    failCloudOpen(code, "wrap_key", cloudOpenFlags(options, false));
  }
  const data = (await res.json()) as { wrapKeyHex: string };
  return data.wrapKeyHex;
}

export async function fetchVaultRecord(options?: CloudOpenOptions): Promise<VaultRecord | null> {
  const res = await fetch("/api/wallet/vault", { credentials: "include" });
  if (res.status === 404) return null;
  if (!res.ok) {
    const code = await errorCodeFrom(res, "vault_load_failed");
    failCloudOpen(code, "vault_fetch", cloudOpenFlags(options, false));
  }
  return (await res.json()) as VaultRecord;
}

/** Authenticated vault summary for migration UI (address only). */
export async function fetchVaultRecordClient(): Promise<{ address: string } | null> {
  const vault = await fetchVaultRecord();
  return vault ? { address: vault.address } : null;
}

export async function fetchAuthSessionUser(): Promise<AuthSessionUser | null> {
  const res = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
  if (!res.ok) return null;
  // Auth.js answers `null` (valid JSON) when nobody is signed in. `authTime` sits on the session,
  // next to `user`, because the jwt/session callbacks store it there.
  const data = (await res.json().catch(() => {
    warnCloudOpenFailed({
      code: "session_read_failed",
      stage: "auth_session",
      vaultPresent: false,
      retried: false,
    });
    return null;
  })) as {
    user?: { id?: string; email?: string | null } | null;
    authTime?: unknown;
  } | null;
  const id = data?.user?.id;
  if (!id) return null;
  const authTime = typeof data?.authTime === "number" ? data.authTime : undefined;
  return { id, email: data?.user?.email, authTime };
}

export function cloudSessionId(userId: string): string {
  return `cloud:${userId}`;
}

export function isCloudSessionId(id: string): boolean {
  return id.startsWith("cloud:");
}

async function sessionFromVault(
  userId: string,
  vault: VaultRecord,
  wrapKeyHex: string,
  options?: CloudOpenOptions,
): Promise<CloudWalletSession> {
  const flags = cloudOpenFlags(options, true);
  let privateKey: string;
  try {
    privateKey = await decryptPrivateKeyFromVault(vault.encryptedPrivateKey, wrapKeyHex);
  } catch (err) {
    failVaultDecrypt(err, flags);
  }
  let key: FactoryKeyPair;
  try {
    key = keyFromPrivate(privateKey);
  } catch {
    failCloudOpen("invalid_private_key", "private_key", flags);
  }
  if (!addressMatchesPublicKey(vault.address, key.publicKey)) {
    failCloudOpen("address_mismatch", "address", flags);
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

export async function unlockCloudVaultSession(userId: string, options?: CloudOpenOptions): Promise<CloudWalletSession> {
  const wrapKeyHex = await fetchWrapKey(options);
  const vault = await fetchVaultRecord(options);
  if (!vault) failCloudOpen("vault_not_found", "vault_fetch", cloudOpenFlags(options, false));
  return sessionFromVault(userId, vault, wrapKeyHex, options);
}

export async function createCloudVaultWallet(userId: string, options?: CloudOpenOptions): Promise<CloudWalletSession> {
  const existing = await fetchVaultRecord(options);
  if (existing) {
    // The row is already there. Unlock must surface decrypt/schema/key errors.
    // Falling through to PUT would overwrite a wallet we could not open.
    return unlockCloudVaultSession(userId, options);
  }
  const wrapKeyHex = await fetchWrapKey(options);
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
    return unlockCloudVaultSession(userId, options);
  }
  if (!res.ok) {
    const code = await errorCodeFrom(res, "vault_create_failed");
    failCloudOpen(code, "vault_create", cloudOpenFlags(options, false));
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

export async function ensureCloudWalletSession(user: AuthSessionUser, options?: CloudOpenOptions): Promise<CloudWalletSession> {
  // Caller already saw a vault (the sign-in branch). Open it after wrap-key so a legacy
  // migration inside wrap-key is reflected in the ciphertext. Do not create on failure.
  if (options?.vaultPresent === true) {
    return unlockCloudVaultSession(user.id, options);
  }
  const wrapKeyHex = await fetchWrapKey(options);
  const vault = await fetchVaultRecord(options);
  if (vault) return sessionFromVault(user.id, vault, wrapKeyHex, options);
  return createCloudVaultWallet(user.id, options);
}

/** Persist step of cloud sign-in. A throw becomes `session_open_failed` and is logged without the cause. */
export async function commitCloudSession(persist: () => Promise<void>, options?: CloudOpenOptions): Promise<void> {
  try {
    await persist();
  } catch {
    failCloudOpen("session_open_failed", "persist_session", {
      vaultPresent: options?.vaultPresent !== false,
      retried: options?.retried === true,
    });
  }
}

/**
 * Publish an in-memory cloud session only after the strict persist write succeeds.
 * A storage failure throws `session_open_failed` and never calls `publish`.
 */
export async function publishCloudSessionAfterPersist<T>(
  cloud: T,
  persist: (cloud: T) => Promise<void>,
  publish: (cloud: T) => void,
): Promise<void> {
  await commitCloudSession(() => persist(cloud));
  publish(cloud);
}

export async function exportCloudPrivateKey(session: CloudWalletSession): Promise<string> {
  if (session.kind !== "cloud" || !session.userId) throw new Error("not_cloud");
  const wrapKeyHex = await fetchWrapKey();
  const vault = await fetchVaultRecord();
  if (!vault) failCloudOpen("vault_not_found", "vault_fetch", { vaultPresent: false, retried: false });
  try {
    return await decryptPrivateKeyFromVault(vault.encryptedPrivateKey, wrapKeyHex);
  } catch (err) {
    failVaultDecrypt(err, { vaultPresent: true, retried: false });
  }
}
