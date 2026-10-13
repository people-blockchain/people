// recon.md R1: a sufficiently-fresh session alone used to be enough to derive the wrap key for
// 15 minutes after any sign-in. Shortened to narrow the window a stolen/replayed session cookie
// can be used to pull the wrap key. Pure (no DB imports) so pages and tests can share it.
export const WALLET_VAULT_REAUTH_WINDOW_MS = 5 * 60 * 1000;

/** The wrap key unlocks the vault ciphertext: require a sign-in within the reauth window. */
export function isAuthTimeFresh(authTime: number | null | undefined, nowMs: number = Date.now()): boolean {
  if (typeof authTime !== "number") return false;
  return nowMs - authTime <= WALLET_VAULT_REAUTH_WINDOW_MS;
}

/**
 * /login may skip itself only for a session that can still open the cloud wallet. A session
 * cookie older than the reauth window (e.g. yesterday's Google sign-in) is "signed in" for
 * Auth.js but the vault answers `reauth_required`; bouncing it to /wallet left a returning
 * user with no way to sign in again, and on mobile it dropped the Web3Auth redirect result
 * (carried in the URL hash, which the server never sees) — the 2026-10-13 login outage.
 */
export function shouldSkipLoginForSession(
  session: { userId?: string | null; authTime?: number | null } | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!session?.userId) return false;
  return isAuthTimeFresh(session.authTime, nowMs);
}
