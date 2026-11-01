/**
 * Auth.js `jwt` callback. `authTime` is the vault reauth clock: it moves only when a provider
 * login just succeeded (`trigger` signIn or signUp, with the user id `authorize` returned).
 * A session read or a client `update()` — including any `session.authTime` the browser sends —
 * must leave the previous value in place.
 */
export type AuthJwtToken = {
  sub?: string;
  authTime?: number;
  provider?: string;
};

export function applyAuthJwtCallback<T extends AuthJwtToken>(
  token: T,
  params: {
    user?: { id?: string | null } | null;
    account?: { provider?: string | null } | null;
    trigger?: "signIn" | "signUp" | "update";
    /** Payload from `useSession().update()`. Ignored so a client cannot refresh `authTime`. */
    session?: unknown;
    nowMs?: number;
  },
): T {
  void params.session;
  const nowMs = params.nowMs ?? Date.now();
  const userId = params.user?.id;
  if (userId) token.sub = userId;
  if (userId && (params.trigger === "signIn" || params.trigger === "signUp")) {
    token.authTime = nowMs;
  }
  const provider = params.account?.provider;
  if (typeof provider === "string" && provider) token.provider = provider;
  return token;
}
