import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { authConfig } from "@/auth.config";
import { getDb, isDatabaseConfigured } from "@/db";
import { accounts, partners, sessions, users, verificationTokens } from "@/db/schema";
import { ensurePartner } from "@/lib/partner/service";
import { wrapAuthAdapter } from "@/lib/partner/auth-adapter";

function adapter() {
  if (!isDatabaseConfigured()) return undefined;
  return wrapAuthAdapter(
    DrizzleAdapter(getDb(), {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
  );
}

/**
 * Create the partner row after Auth.js persists the user.
 * Do not call `cookies()` from `next/headers` here: Auth.js returns a raw
 * Response with Set-Cookie for the session, and mixing that with Next's
 * cookie store drops the session cookie — Google/magic-link then look like
 * they succeeded but the browser is still logged out.
 */
async function onUserReady(userId: string) {
  try {
    await ensurePartner(userId);
  } catch (error) {
    console.error(
      "[auth] ensurePartner failed",
      error instanceof Error ? error.name : typeof error,
      error instanceof Error && error.cause instanceof Error ? error.cause.name : "",
    );
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: adapter(),
  events: {
    async createUser({ user }) {
      if (user.id) await onUserReady(user.id);
    },
    async signIn({ user }) {
      if (user.id) await onUserReady(user.id);
    },
  },
});

export { partners };
