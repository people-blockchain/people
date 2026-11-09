import { createHash, timingSafeEqual } from "node:crypto";

/** HttpOnly cookie set after visiting `/<ANALYTICS_VIEW_PATH>/<token>`; validated server-side. */
export const ANALYTICS_VIEW_COOKIE = "people_analytics_view";
export const ANALYTICS_VIEW_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 90;

export function analyticsViewTokenConfigured(): boolean {
  return Boolean(process.env.ANALYTICS_VIEW_TOKEN?.trim());
}

function digestEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** SHA-256 hex digest stored in the view cookie (raw token never stored in the browser). */
export function analyticsViewTokenCookieValue(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

/** Constant-time compare for read-only dashboard token (Bearer header / CLI). */
export function analyticsViewTokenMatches(provided: string | null | undefined): boolean {
  const expected = process.env.ANALYTICS_VIEW_TOKEN?.trim();
  if (!expected || typeof provided !== "string") return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Validates the HttpOnly cookie value (hashed token). */
export function analyticsViewCookieMatches(cookieValue: string | null | undefined): boolean {
  const expected = process.env.ANALYTICS_VIEW_TOKEN?.trim();
  if (!expected || typeof cookieValue !== "string") return false;
  return digestEqual(analyticsViewTokenCookieValue(expected), cookieValue.trim());
}

export function analyticsViewTokenFromAuthorization(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? null;
}
