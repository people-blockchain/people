import { AsyncLocalStorage } from "node:async_hooks";
import type { Adapter, AdapterUser } from "next-auth/adapters";

/**
 * A stale Auth.js JWT session must not turn a *different* identity into an account link.
 *
 * `@auth/core` decodes the session cookie in `handleLoginOrRegister` and, when the incoming
 * OAuth provider account is not linked yet, calls `linkAccount({ ..., userId: sessionUser.id })`
 * without comparing emails. On a shared browser that silently attaches the new Google identity
 * to whoever was signed in before and keeps their session — the reported incident.
 *
 * The OAuth callback has the incoming provider profile only inside `callbacks.signIn`, which runs
 * before `handleLoginOrRegister`. We record that identity in per-request async context, then make
 * the session user lookup return `null` when the recorded identity belongs to a different email.
 * Auth.js then continues as if the request were signed out: it resumes/creates the incoming user
 * (B) and issues a JWT for B, replacing the stale cookie.
 *
 * When the incoming provider account is already linked (to the session user or to someone else),
 * the session user is kept: normal re-login still works, and Auth.js raises its own
 * `OAuthAccountNotLinked` error instead of silently switching accounts.
 */

export type IncomingSignInIdentity = {
  /** Lowercased, trimmed email of the identity being authenticated. */
  email: string;
  provider: string;
  providerAccountId: string;
};

type RequestContext = {
  incoming?: IncomingSignInIdentity;
};

const requestContext = new AsyncLocalStorage<RequestContext>();

/** Scope one auth route request so the adapter wrapper can see the incoming identity. */
export function runWithIncomingSignInContext<T>(fn: () => T): T {
  return requestContext.run({}, fn);
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

/**
 * Record the identity from an Auth.js `signIn` callback. Only OAuth/OIDC and email (magic link)
 * sign-ins carry an identity that can be merged onto an existing session; credentials and
 * Web3Auth already replace `token.sub` on their own.
 */
export function recordIncomingSignInFromCallback(params: {
  user?: { email?: string | null } | null;
  account?: {
    provider?: string | null;
    providerAccountId?: string | null;
    type?: string | null;
  } | null;
  profile?: { email?: string | null } | null;
}): void {
  const context = requestContext.getStore();
  if (!context) return;

  const { account } = params;
  if (!account?.type || !account.provider || !account.providerAccountId) return;
  if (account.type !== "oauth" && account.type !== "oidc" && account.type !== "email") return;

  const email = normalizeEmail(params.profile?.email ?? params.user?.email);
  if (!email) return;

  context.incoming = {
    email,
    provider: account.provider,
    providerAccountId: account.providerAccountId,
  };
}

/**
 * Wrap an adapter so `getUser(session.sub)` ignores a session that belongs to a different
 * identity than the one currently authenticating. Returning `null` makes `@auth/core` treat the
 * callback as signed out, which is both required for the switch and safe: the stale session
 * cookie is overwritten by the JWT issued for the identity that actually signed in.
 */
export function wrapSessionIdentityAdapter(base: Adapter): Adapter {
  return {
    ...base,
    async getUser(id): Promise<AdapterUser | null> {
      const user = base.getUser ? await base.getUser(id) : null;
      const incoming = requestContext.getStore()?.incoming;
      if (!user || !incoming) return user;

      // Same verified email: keep the existing user so `allowDangerousEmailAccountLinking`
      // (guarded by blocksDangerousAccountLink) still links Google + magic link together.
      if (normalizeEmail(user.email) === incoming.email) return user;

      // A different email. If the provider account is already linked to someone, keep the
      // session user so Auth.js surfaces OAuthAccountNotLinked rather than merging.
      const linked = base.getUserByAccount
        ? await base.getUserByAccount({
            provider: incoming.provider,
            providerAccountId: incoming.providerAccountId,
          })
        : null;
      if (linked) return user;

      return null;
    },
  };
}
