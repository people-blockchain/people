/**
 * api-cron.md M1: admin access used to be decided by `session.user.email` alone against
 * `DISCOVER_ADMIN_EMAILS`. Email is not a stable identity — a Web3Auth login could attach to an
 * existing account by email (see web3auth-auth.ts) and inherit admin rights from it.
 *
 * Admins are now identified by **userId** (`DISCOVER_ADMIN_USER_IDS`). The email list is kept
 * only as a migration fallback, and only for a session that actually signed in with Google:
 * the Google provider's `profile()` (auth.config.ts) already throws unless Google reported
 * `email_verified === true`, so a Google session is the one provider where "this email is
 * verified" is guaranteed by the auth flow itself, not by a claim we have to trust from an
 * arbitrary upstream.
 *
 * This module is deliberately dependency-free (no `@/auth` import): `admin.ts` pulls in the
 * Auth.js singleton, and `auth.config.ts`/`web3auth-auth.ts` need the pure identity check
 * without creating an import cycle.
 */

function csvSet(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

/** Primary admin allowlist: stable Auth.js user ids. */
export function discoverAdminUserIds(): Set<string> {
  return csvSet(process.env.DISCOVER_ADMIN_USER_IDS);
}

/** Legacy admin allowlist: emails, only honoured for verified Google sessions. */
export function discoverAdminEmails(): Set<string> {
  return new Set([...csvSet(process.env.DISCOVER_ADMIN_EMAILS)].map((email) => email.toLowerCase()));
}

/**
 * Pure admin decision from whatever identity the session carries.
 * - userId match wins (provider-independent).
 * - Email match is accepted only when the session signed in via Google, which guarantees a
 *   verified email. A magic-link or Web3Auth session carrying an admin email is not admin.
 */
export function isDiscoverAdminIdentity(identity: {
  userId?: string | null;
  email?: string | null;
  provider?: string | null;
}): boolean {
  const ids = discoverAdminUserIds();
  if (identity.userId && ids.has(identity.userId)) return true;

  const emails = discoverAdminEmails();
  if (emails.size === 0) return false;
  if (identity.provider !== "google") return false;
  const email = identity.email?.trim().toLowerCase();
  return Boolean(email && emails.has(email));
}

/** True when the address is on the legacy admin email list, regardless of provider. */
export function isDiscoverAdminEmail(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  return discoverAdminEmails().has(normalized);
}
