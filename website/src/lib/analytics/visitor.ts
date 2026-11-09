import { createHash } from "node:crypto";

/** UTC date key YYYY-MM-DD for daily salt rotation. */
export function analyticsDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function analyticsSaltSecret(): string {
  const fromEnv = process.env.ANALYTICS_SALT_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ANALYTICS_SALT_SECRET is required in production");
  }
  return "dev-analytics-salt-not-for-production";
}

/**
 * Daily rotating visitor id — salted hash of IP + UA. Raw IP is never stored.
 */
export function visitorIdFromIpUa(ip: string, userAgent: string, dayKey = analyticsDayKey()): string {
  const salt = analyticsSaltSecret();
  const material = `${dayKey}:${salt}:${ip}:${userAgent}`;
  return createHash("sha256").update(material, "utf8").digest("hex").slice(0, 32);
}

/** @internal test hook */
export function resetAnalyticsSaltSecretForTests(secret: string | undefined): () => void {
  const prev = process.env.ANALYTICS_SALT_SECRET;
  if (secret === undefined) delete process.env.ANALYTICS_SALT_SECRET;
  else process.env.ANALYTICS_SALT_SECRET = secret;
  return () => {
    if (prev === undefined) delete process.env.ANALYTICS_SALT_SECRET;
    else process.env.ANALYTICS_SALT_SECRET = prev;
  };
}
