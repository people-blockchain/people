import { auth } from "@/auth";
import { discoverAdminEmails, discoverAdminUserIds, isDiscoverAdminIdentity } from "@/lib/discover/admin-config";

/**
 * Admin access is opt-in only: without an explicit `DISCOVER_ADMIN_USER_IDS` (or legacy
 * `DISCOVER_ADMIN_EMAILS`) list nobody is an admin. A hardcoded fallback address would be a
 * public privilege-escalation target.
 *
 * api-cron.md M1: identity is the stable Auth.js `userId`. The legacy email list still works,
 * but only for Google sessions (verified email) — see admin-config.ts.
 */
export async function isDiscoverAdmin(): Promise<boolean> {
  if (discoverAdminUserIds().size === 0 && discoverAdminEmails().size === 0) return false;
  const session = await auth();
  return isDiscoverAdminIdentity({
    userId: session?.user?.id,
    email: session?.user?.email,
    provider: session?.provider,
  });
}

export { discoverAdminEmails, discoverAdminUserIds };
