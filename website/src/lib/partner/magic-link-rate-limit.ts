import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { clientIpFromRequest } from "@/lib/request-client-ip";

/**
 * MF-15: every sign-in email is a paid Resend send to a third party. Limits are enforced
 * server-side, before the provider is called, per target address and per client.
 */
export const MAGIC_LINK_LIMITS = {
  perEmail: { max: 3, windowMs: 15 * 60 * 1000 },
  perEmailDay: { max: 10, windowMs: 24 * 60 * 60 * 1000 },
  perIp: { max: 10, windowMs: 15 * 60 * 1000 },
  /** Shared bucket when no trustworthy client IP exists; deliberately loose. */
  perUnknownIp: { max: 60, windowMs: 15 * 60 * 1000 },
} as const;

export function normalizeMagicLinkEmail(identifier: string): string {
  return identifier.trim().toLowerCase();
}

/**
 * Returns true when a magic-link email may be sent. Callers must NOT reveal a denial to the
 * requester (the generic "check your email" page is shown either way).
 */
export async function allowMagicLinkEmail(identifier: string, request?: Request): Promise<boolean> {
  const email = normalizeMagicLinkEmail(identifier);
  const ip = request ? clientIpFromRequest(request) : "unknown";
  const ipLimit = ip === "unknown" ? MAGIC_LINK_LIMITS.perUnknownIp : MAGIC_LINK_LIMITS.perIp;

  // Evaluate every bucket (no short-circuit) so each attempt is counted consistently.
  const results = await Promise.all([
    checkSharedRateLimit("magic-link-ip", ip, ipLimit.max, ipLimit.windowMs),
    checkSharedRateLimit(
      "magic-link-email",
      email,
      MAGIC_LINK_LIMITS.perEmail.max,
      MAGIC_LINK_LIMITS.perEmail.windowMs,
    ),
    checkSharedRateLimit(
      "magic-link-email-day",
      email,
      MAGIC_LINK_LIMITS.perEmailDay.max,
      MAGIC_LINK_LIMITS.perEmailDay.windowMs,
    ),
  ]);
  return results.every(Boolean);
}
