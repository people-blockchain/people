/**
 * Auth.js session-cookie names only. Chunked cookies are `name.0`, `name.1`, …
 * The helper never reads or returns cookie values.
 */
const AUTH_JS_SESSION_COOKIE_BASES = ["authjs.session-token", "__Secure-authjs.session-token"] as const;

export function isAuthJsSessionCookieName(name: string): boolean {
  for (const base of AUTH_JS_SESSION_COOKIE_BASES) {
    if (name === base) return true;
    if (!name.startsWith(`${base}.`)) continue;
    const suffix = name.slice(base.length + 1);
    if (/^\d+$/.test(suffix)) return true;
  }
  return false;
}

/**
 * Host header for a log line. Client-supplied `x-forwarded-host` is truncated and limited to
 * `[a-z0-9.:-]` so it cannot inject newlines or fill the log.
 */
export function sanitizeForwardedHost(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9.:-]/g, "").slice(0, 100);
}

/** True when the Cookie header names an Auth.js session cookie, including chunked parts. */
export function hasAuthJsSessionCookie(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    const name = (eq === -1 ? trimmed : trimmed.slice(0, eq)).trim();
    if (isAuthJsSessionCookieName(name)) return true;
  }
  return false;
}
