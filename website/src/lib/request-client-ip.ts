import { isIP } from "node:net";

/** Enable only behind an ingress which overwrites the forwarding headers. */
export function trustProxyHeaders(): boolean {
  return process.env.TRUST_PROXY_HEADERS === "1";
}

function firstIp(header: string | null): string {
  const first = header?.split(",")[0]?.trim() ?? "";
  return isIP(first) ? first : "";
}

/**
 * Best-effort client IP for rate-limit keys and audit logs. On Vercel the platform sets
 * `x-vercel-forwarded-for` to the real client IP and does not let the client override it, so
 * it is trusted there (signalled by the platform's own `VERCEL` env var). If that header is
 * missing, the first `x-forwarded-for` item is used, then `x-real-ip`. Off Vercel those
 * headers are client controlled unless TRUST_PROXY_HEADERS=1; otherwise callers get a shared
 * "unknown" bucket that cannot be rotated by the client.
 */
export function clientIpFromRequest(request: Request): string {
  if (process.env.VERCEL) {
    return (
      firstIp(request.headers.get("x-vercel-forwarded-for")) ||
      firstIp(request.headers.get("x-forwarded-for")) ||
      firstIp(request.headers.get("x-real-ip")) ||
      "unknown"
    );
  }
  if (!trustProxyHeaders()) return "unknown";
  const real = firstIp(request.headers.get("x-real-ip"));
  if (real) return real;
  return firstIp(request.headers.get("x-forwarded-for")) || "unknown";
}
