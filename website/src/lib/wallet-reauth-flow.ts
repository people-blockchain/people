import { WalletCloudError, type AuthSessionUser } from "@/lib/wallet-cloud-client";
import { isAuthTimeFresh } from "@/lib/wallet-reauth-window";
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
 * Open the cloud vault, signing in at most once when the session's authTime is stale or the
 * vault answers reauth_required / unauthorized. After that sign-in, a cookie is accepted only
 * when its authTime is strictly newer than the rejected session's (if that was a number) and
 * still inside the reauth window at the moment it is checked — a not-yet-updated cookie must
 * not win the first poll. No idToken and a session that never becomes fresh both throw
 * reauth_required — the UI asks the user to sign in. There is no loop.
 */
export async function openCloudVaultWithReauth<T>(args: {
  openVault: (session: AuthSessionUser) => Promise<T>;
  signInWithIdToken: (idToken: string) => Promise<void>;
  fetchSession: () => Promise<AuthSessionUser | null>;
  idToken?: string | null;
  now?: number;
  waitForFreshSession?: (
    fetchSession: () => Promise<AuthSessionUser | null>,
    nowMs?: number,
  ) => Promise<AuthSessionUser | null>;
}): Promise<T> {
  const waitForFresh =
    args.waitForFreshSession ??
    ((fetchSession: () => Promise<AuthSessionUser | null>, nowMs?: number) =>
      waitForFreshSessionUser(fetchSession, SESSION_USER_RETRY_DELAYS_MS, undefined, nowMs));

  let reauthDone = false;

  function clock(): number {
    return args.now ?? Date.now();
  }

  async function readSession(): Promise<AuthSessionUser | null> {
    try {
      return await args.fetchSession();
    } catch {
      return null;
    }
  }

  async function reauth(rejected: AuthSessionUser | null): Promise<AuthSessionUser> {
    if (reauthDone || !args.idToken) throw new WalletCloudError("reauth_required");
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
    }, args.now);
    if (!fresh?.id || !isAuthTimeFresh(fresh.authTime, clock())) {
      throw new WalletCloudError("reauth_required");
    }
    return fresh;
  }

  let session = await readSession();
  if (!session?.id || !isAuthTimeFresh(session.authTime, clock())) {
    session = await reauth(session);
  }

  try {
    return await args.openVault(session);
  } catch (err) {
    if (reauthDone || !args.idToken || !VAULT_REAUTH_CODES.has(cloudFailureCode(err))) throw err;
    const fresh = await reauth(session);
    return await args.openVault(fresh);
  }
}
