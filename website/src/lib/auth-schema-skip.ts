/**
 * With the `jwt` session strategy (see `auth.config.ts`), Auth.js answers `/api/auth/session`,
 * `/api/auth/csrf` and `/api/auth/providers` straight from the token in the request cookie — the
 * adapter and database are never consulted. The catch-all route handler used to await
 * `ensurePartnerSchema()` (91 sequential DDL statements, ~10 s on a cold lambda) before every
 * request anyway, which is what made a logged-out page's session probe so slow.
 *
 * Everything else — `/callback/google`, `/signin`, `/verify-request`, every POST — still needs the
 * tables to exist before Auth.js runs, so this predicate gates exactly those three reads and
 * nothing more. A path this does not recognise keeps the old, safe behaviour.
 */
const DB_FREE_GET_PATHS = ["/session", "/csrf", "/providers"] as const;

export function authGetNeedsSchema(pathname: string): boolean {
  return !DB_FREE_GET_PATHS.some((suffix) => pathname.endsWith(suffix));
}
