import { encryptPrivateKeyForVault, warnCloudOpenFailed } from "@/lib/wallet-cloud-crypto";
import { errorCodeFrom, fetchWrapKey, WalletCloudError, type AuthSessionUser } from "@/lib/wallet-cloud-client";
import { WALLET_VAULT_REAUTH_WINDOW_MS } from "@/lib/wallet-reauth-window";
import { idTokenIssuedAtSec } from "@/lib/web3auth-connect-flow";
import { SESSION_USER_RETRY_DELAYS_MS, waitForFreshSessionUser } from "@/lib/web3auth-redirect-resume";

const VAULT_REAUTH_CODES = new Set(["reauth_required", "unauthorized"]);

function cloudFailureCode(err: unknown): string {
  if (err instanceof WalletCloudError) return err.code;
  return err instanceof Error ? err.message : "";
}

function numericAuthTime(session: AuthSessionUser | null): number | null {
  const authTime = session?.authTime;
  return typeof authTime === "number" && Number.isFinite(authTime) ? authTime : null;
}

/**
 * Reuse a stored idToken only while its `iat` is inside the vault reauth window.
 * An unreadable `iat` is not reused. The server still enforces its own max token age.
 */
export function isIdTokenInsideReauthWindow(idToken: string, nowMs: number): boolean {
  const iat = idTokenIssuedAtSec(idToken);
  if (iat === null) return false;
  return nowMs - iat * 1000 <= WALLET_VAULT_REAUTH_WINDOW_MS;
}

/**
 * Open the cloud vault, signing in at most once when there is no session or the vault answers
 * reauth_required / unauthorized. The reauth window is the server's check. The client only
 * requires the new authTime to be strictly newer than the rejected one, so a fast device clock
 * cannot make a fresh session look expired. An idToken is reused only while its iat is inside
 * the reauth window. No idToken and a session that never becomes newer both throw
 * reauth_required. There is no loop.
 */
export type CloudVaultOpenAttempt = { retried: boolean };

export async function openCloudVaultWithReauth<T>(args: {
  openVault: (session: AuthSessionUser, attempt?: CloudVaultOpenAttempt) => Promise<T>;
  signInWithIdToken: (idToken: string) => Promise<void>;
  fetchSession: () => Promise<AuthSessionUser | null>;
  idToken?: string | null;
  now?: number;
  waitForFreshSession?: (
    fetchSession: () => Promise<AuthSessionUser | null>,
  ) => Promise<AuthSessionUser | null>;
}): Promise<T> {
  const waitForFresh =
    args.waitForFreshSession ??
    ((fetchSession: () => Promise<AuthSessionUser | null>) =>
      waitForFreshSessionUser(fetchSession, SESSION_USER_RETRY_DELAYS_MS));

  let reauthDone = false;

  function clock(): number {
    return args.now ?? Date.now();
  }

  async function readSession(): Promise<AuthSessionUser | null> {
    try {
      return await args.fetchSession();
    } catch {
      warnCloudOpenFailed({
        code: "session_read_failed",
        stage: "auth_session",
        vaultPresent: false,
        retried: false,
      });
      return null;
    }
  }

  async function reauth(rejected: AuthSessionUser | null): Promise<AuthSessionUser> {
    if (reauthDone || !args.idToken || !isIdTokenInsideReauthWindow(args.idToken, clock())) {
      throw new WalletCloudError("reauth_required");
    }
    reauthDone = true;
    await args.signInWithIdToken(args.idToken);
    const previousAuthTime = numericAuthTime(rejected);
    const fresh = await waitForFresh(async () => {
      const session = await args.fetchSession();
      const newer =
        previousAuthTime === null ||
        (typeof session?.authTime === "number" && session.authTime > previousAuthTime);
      if (!newer) return null;
      return session;
    });
    if (!fresh?.id) throw new WalletCloudError("reauth_required");
    return fresh;
  }

  let session = await readSession();
  // A session id is enough to try the vault. wrap-key rejects an expired authTime itself.
  if (!session?.id) {
    session = await reauth(session);
  }

  try {
    return await args.openVault(session, { retried: false });
  } catch (err) {
    if (reauthDone || !args.idToken || !VAULT_REAUTH_CODES.has(cloudFailureCode(err))) throw err;
    const fresh = await reauth(session);
    return await args.openVault(fresh, { retried: true });
  }
}

export type CloudVaultKeyMaterial = {
  address: string;
  publicKey: string;
  privateKey: string;
};

export type CloudVaultPutBody = {
  address: string;
  publicKey: string;
  encryptedPrivateKey: string;
};

export type CloudVaultPutResult = { ok: boolean; status: number; error?: string };

/**
 * PUT /api/wallet/vault. Only `already_exists` is a successful 409: that row is this user's.
 * `address_taken` means the address belongs to someone else and this user has no vault.
 */
export async function putCloudVaultRecord(body: CloudVaultPutBody): Promise<CloudVaultPutResult> {
  const res = await fetch("/api/wallet/vault", {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true, status: res.status };
  const error = await errorCodeFrom(res, "vault_create_failed");
  return { ok: false, status: res.status, error };
}

/**
 * Create a vault for a new account through {@link openCloudVaultWithReauth}. The open step derives
 * the key, fetches the wrap key, encrypts, and PUTs. A stale authTime or a reauth_required /
 * unauthorized answer signs in once. `already_exists` means the vault is already there.
 * `address_taken` throws and does not create a replacement key.
 */
export async function createCloudVaultWithReauth(args: {
  deriveKey: () => Promise<CloudVaultKeyMaterial>;
  fetchWrapKey?: () => Promise<string>;
  putVault?: (body: CloudVaultPutBody) => Promise<CloudVaultPutResult>;
  encryptPrivateKey?: (privateKey: string, wrapKeyHex: string) => Promise<string>;
  signInWithIdToken: (idToken: string) => Promise<void>;
  fetchSession: () => Promise<AuthSessionUser | null>;
  idToken?: string | null;
  now?: number;
  waitForFreshSession?: (
    fetchSession: () => Promise<AuthSessionUser | null>,
  ) => Promise<AuthSessionUser | null>;
}): Promise<void> {
  const readWrapKey = args.fetchWrapKey ?? fetchWrapKey;
  const putVault = args.putVault ?? putCloudVaultRecord;
  const encrypt = args.encryptPrivateKey ?? encryptPrivateKeyForVault;

  await openCloudVaultWithReauth({
    signInWithIdToken: args.signInWithIdToken,
    fetchSession: args.fetchSession,
    idToken: args.idToken,
    now: args.now,
    waitForFreshSession: args.waitForFreshSession,
    openVault: async () => {
      const generated = await args.deriveKey();
      const wrapKeyHex = await readWrapKey();
      const encryptedPrivateKey = await encrypt(generated.privateKey, wrapKeyHex);
      const put = await putVault({
        address: generated.address,
        publicKey: generated.publicKey,
        encryptedPrivateKey,
      });
      if (put.ok || put.error === "already_exists") return;
      throw new WalletCloudError(put.error || "vault_create_failed");
    },
  });
}
