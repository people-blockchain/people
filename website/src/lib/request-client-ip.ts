import { isIP } from "node:net";

/** Enable only behind an ingress which overwrites the forwarding headers. */
export function trustProxyHeaders(): boolean {
  return process.env.TRUST_PROXY_HEADERS === "1";
}

function firstIp(header: string | null): string {
  const first = header?.split(",")[0]?.trim() ?? "";
  return isIP(first) ? first : "";
}

/** Cloudflare sets `cf-ray` on every proxied request; use it before trusting CF IP headers. */
export function requestCameViaCloudflare(headers: Headers): boolean {
  return Boolean(headers.get("cf-ray")?.trim());
}

function cloudflareClientIp(headers: Headers): string {
  if (!requestCameViaCloudflare(headers)) return "";
  return (
    firstIp(headers.get("cf-connecting-ip")) ||
    firstIp(headers.get("true-client-ip")) ||
    ""
  );
}

function vercelOrTrustedProxyIp(headers: Headers): string {
  if (process.env.VERCEL) {
    return (
      firstIp(headers.get("x-vercel-forwarded-for")) ||
      firstIp(headers.get("x-forwarded-for")) ||
      firstIp(headers.get("x-real-ip")) ||
      ""
    );
  }
  if (!trustProxyHeaders()) return "";
  const real = firstIp(headers.get("x-real-ip"));
  if (real) return real;
  return firstIp(headers.get("x-forwarded-for"));
}

/**
 * Best-effort client IP for rate-limit keys and audit logs.
 *
 * Order: Cloudflare (`cf-connecting-ip`, `true-client-ip`) when `cf-ray` is present;
 * then Vercel (`x-vercel-forwarded-for`, first `x-forwarded-for`, `x-real-ip`) on Vercel;
 * else trusted-proxy `x-real-ip` / `x-forwarded-for` when `TRUST_PROXY_HEADERS=1`.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const viaCf = cloudflareClientIp(headers);
  if (viaCf) return viaCf;
  const viaPlatform = vercelOrTrustedProxyIp(headers);
  if (viaPlatform) return viaPlatform;
  return "unknown";
}

export function clientIpFromRequest(request: Request): string {
  return clientIpFromHeaders(request.headers);
}