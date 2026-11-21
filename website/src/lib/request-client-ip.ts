import { isIP } from "node:net";
import { isCloudflareIp } from "@/lib/cloudflare-ip-ranges";

/** Enable only behind an ingress which overwrites the forwarding headers. */
export function trustProxyHeaders(): boolean {
  return process.env.TRUST_PROXY_HEADERS === "1";
}

/**
 * After orange-cloud, set on Vercel so `cf-connecting-ip` / `cf-ipcountry` are honored
 * only when the immediate hop is a Cloudflare published range.
 */
export function trustCloudflareHeaders(): boolean {
  return process.env.TRUST_CLOUDFLARE_HEADERS === "1";
}

function firstIp(header: string | null): string {
  const first = header?.split(",")[0]?.trim() ?? "";
  return isIP(first) ? first : "";
}

/** TCP peer Vercel saw (CF edge when proxied through orange-cloud). */
export function vercelImmediateHop(headers: Headers): string {
  return firstIp(headers.get("x-real-ip")) || firstIp(headers.get("x-vercel-forwarded-for")) || "";
}

/**
 * `cf-*` headers are only trusted on Vercel when `TRUST_CLOUDFLARE_HEADERS=1` and the
 * immediate hop is in Cloudflare's published IP ranges — never from `cf-ray` alone.
 */
export function cloudflareHeadersTrusted(headers: Headers): boolean {
  if (!process.env.VERCEL || !trustCloudflareHeaders()) return false;
  const hop = vercelImmediateHop(headers);
  if (!hop) return false;
  return isCloudflareIp(hop);
}

/** @deprecated Use `cloudflareHeadersTrusted`. */
export function requestCameViaCloudflare(headers: Headers): boolean {
  return cloudflareHeadersTrusted(headers);
}

function cloudflareClientIp(headers: Headers): string {
  if (!cloudflareHeadersTrusted(headers)) return "";
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
 * On Vercel: when `TRUST_CLOUDFLARE_HEADERS=1` and the immediate hop is a Cloudflare
 * range, use `cf-connecting-ip` / `true-client-ip`; otherwise platform headers as before.
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