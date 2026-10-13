/**
 * Audit wallet-sessions.md #1 / recon.md R2: the Web3Auth dashboard may have more
 * verifiers/connections enabled than the ones actually exposed in this app's login UI
 * (`AUTH_LOGIN_METHODS` → google + email_passwordless only, see web3auth-connect-flow.ts /
 * web3auth-config.ts). If an operator ever enables another connection on the dashboard side
 * (Facebook/Discord/Twitter/GitHub/etc., currently `showOnModal:false` but not disabled
 * dashboard-side), a token from it must not be accepted here. `WEB3AUTH_ALLOWED_VERIFIERS`
 * lets an operator pin the exact dashboard-assigned verifier string(s) once known; until then
 * we fall back to a documented heuristic (google / email_passwordless by name) rather than a
 * guessed literal, since the real per-project verifier names are only knowable from the live
 * Web3Auth dashboard (not from this repo).
 */

/**
 * Verifier names that prove ownership of the email the token carries: Google OAuth returns a
 * verified Google address, and Web3Auth's email-passwordless (email OTP) connection can only
 * mint a session for the mailbox that received the code. Exported so the idToken verifier can
 * reuse the exact same heuristic when deciding whether an absent `email_verified` claim may be
 * treated as verified — keep the two in sync by importing, never by copying the literal.
 */
export const GOOGLE_OR_EMAIL_PASSWORDLESS_PATTERN = /google|email[-_]?passwordless/i;

const DEFAULT_ALLOWED_PATTERN = GOOGLE_OR_EMAIL_PASSWORDLESS_PATTERN;

let fallbackWarningLogged = false;

function readAllowedVerifiersEnv(): string[] | null {
  const raw = process.env.WEB3AUTH_ALLOWED_VERIFIERS?.trim();
  if (!raw) return null;
  const list = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

/**
 * Returns true when the given verifier (and/or aggregateVerifier) is allowed to bind/sign in.
 * Fails closed: an unset/unmatched value is rejected, never silently accepted.
 */
export function isVerifierAllowed(
  verifier: string | null | undefined,
  aggregateVerifier?: string | null,
): boolean {
  const candidates = [verifier, aggregateVerifier]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => value.toLowerCase());
  if (candidates.length === 0) return false;

  const allowlist = readAllowedVerifiersEnv();
  if (allowlist) {
    return candidates.some((candidate) => allowlist.includes(candidate));
  }

  if (!fallbackWarningLogged) {
    fallbackWarningLogged = true;
    console.warn(
      "[auth] WEB3AUTH_ALLOWED_VERIFIERS is not set; using a heuristic default " +
        "(google / email_passwordless by name substring). Set WEB3AUTH_ALLOWED_VERIFIERS to the " +
        "exact Web3Auth-dashboard verifier string(s) once observed in production logs to close " +
        "this down to an exact match.",
    );
  }
  const allowed = candidates.some((candidate) => DEFAULT_ALLOWED_PATTERN.test(candidate));
  if (!allowed) {
    console.warn("[auth] web3auth verifier rejected by allowlist heuristic", { verifier, aggregateVerifier });
  }
  return allowed;
}
