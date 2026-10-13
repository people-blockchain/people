import { isIP } from "node:net";

/** Enable only behind an ingress which overwrites the forwarding headers. */
export function trustProxyHeaders(): boolean {
  return process.env.TRUST_PROXY_HEADERS === "1";
}

/**
 * Best-effort client IP for rate-limit keys and audit logs. On Vercel the platform sets
 * `x-vercel-forwarded-for` to the real client IP and does not let the client override it, so
 * it is trusted there (signalled by the platform's own `VERCEL` env var). `X-Forwarded-For`/
 * `X-Real-IP` are client controlled unless a trusted ingress overwrites them, so they are only
 * consulted when TRUST_PROXY_HEADERS=1; otherwise callers get a shared "unknown" bucket that
 * cannot be rotated by the client. Prefer keying on the authenticated user id.
 */
export function clientIpFromRequest(request: Request): string {
  if (process.env.VERCEL) {
    const vercel = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "";
    if (isIP(vercel)) return vercel;
  }
  if (!trustProxyHeaders()) return "unknown";
  const real = request.headers.get("x-real-ip")?.trim() ?? "";
  if (isIP(real)) return real;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return isIP(forwarded) ? forwarded : "unknown";
}
