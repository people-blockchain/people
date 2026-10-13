import { and, eq } from "drizzle-orm";
import { getDbReady, isDatabaseConfigured } from "@/db";
import { accounts, userWalletVaults, users } from "@/db/schema";

/**
 * recon.md R2 / wallet-sessions.md #1: Google's `allowDangerousEmailAccountLinking: true`
 * lets any OAuth login with a matching, Google-verified email silently attach to an existing
 * account. That is intentional and safe for a brand-new OAuth identity on an account that has
 * never created a cloud wallet (keeps magic-link + Google interchangeable for the same
 * person). It stops being safe once the account already owns a `userWalletVaults` row: an
 * attacker who controls (or later takes over) a verified email could otherwise link a new
 * Google identity onto a wallet-owning account and gain the ability to sign in as them.
 *
 * This only blocks a *new* provider+providerAccountId link. Re-login with an already-linked
 * account, and sign-up for a brand-new user, are both unaffected.
 */
export async function blocksDangerousAccountLink(params: {
  provider: string;
  providerAccountId: string;
  email: string;
}): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const db = await getDbReady();
  const email = params.email.toLowerCase();

  const existingLink = await db.query.accounts.findFirst({
    where: and(eq(accounts.provider, params.provider), eq(accounts.providerAccountId, params.providerAccountId)),
  });
  if (existingLink) return false; // normal re-login, not a new link

  const existingUser = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!existingUser) return false; // brand-new account, nothing to protect yet

  const vault = await db.query.userWalletVaults.findFirst({
    where: eq(userWalletVaults.userId, existingUser.id),
  });
  if (vault) {
    console.warn(
      "[auth] blocked a new OAuth provider link to an existing wallet-owning account",
      { provider: params.provider, email },
    );
  }
  return Boolean(vault);
}
