import { and, desc, eq, gt, notInArray, sql } from "drizzle-orm";
import { getDbReady } from "@/db";
import { walletVaultAccessLogs } from "@/db/schema";

/**
 * recon.md R1: durable, DB-backed record of wrap-key access attempts (who/when/outcome, never
 * key material) and a durable rate limit layered on top of the existing in-memory one. The
 * in-memory limiter resets on every deploy/restart and gives no audit trail across instances;
 * this is the forensic/containment backstop.
 */
export async function recordWalletVaultAccess(params: {
  userId: string;
  route: string;
  outcome: string;
  ip?: string | null;
}): Promise<void> {
  try {
    const db = await getDbReady();
    await db.insert(walletVaultAccessLogs).values({
      userId: params.userId,
      route: params.route,
      outcome: params.outcome,
      ip: params.ip ?? null,
    });
  } catch (error) {
    // Logging must never block the actual request.
    console.warn("[wallet-vault] failed to record access log entry", error instanceof Error ? error.message : error);
  }
}

/**
 * Failures since the latest successful wrap-key (and still inside the window). `ok` resets the
 * counter and does not consume it. `rate_limited` is the rejection itself and must not push the
 * window forward. Every other outcome counts, including `reauth_required` and a decrypt or
 * unlock error if a caller records one.
 */
const WRAP_KEY_NEUTRAL_OUTCOMES = ["ok", "rate_limited"] as const;

export type WrapKeyRateLimitVerdict = {
  allowed: boolean;
  /** Seconds until the oldest counted failure leaves the window. Zero when allowed. */
  retryAfterSeconds: number;
};

function asEpochMs(value: unknown): number | null {
  if (value == null) return null;
  const time = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : null;
}

export async function checkDurableWrapKeyRateLimitDetail(
  userId: string,
  route: string,
  maxPerWindow: number,
  windowMs: number,
): Promise<WrapKeyRateLimitVerdict> {
  const db = await getDbReady();
  const since = new Date(Date.now() - windowMs);
  const [lastOk] = await db
    .select({ createdAt: walletVaultAccessLogs.createdAt })
    .from(walletVaultAccessLogs)
    .where(
      and(
        eq(walletVaultAccessLogs.userId, userId),
        eq(walletVaultAccessLogs.route, route),
        eq(walletVaultAccessLogs.outcome, "ok"),
      ),
    )
    .orderBy(desc(walletVaultAccessLogs.createdAt))
    .limit(1);
  const cutoff = lastOk && lastOk.createdAt > since ? lastOk.createdAt : since;
  const [row] = await db
    .select({
      count: sql<number>`count(*)`,
      oldest: sql<Date | string | null>`min(${walletVaultAccessLogs.createdAt})`,
    })
    .from(walletVaultAccessLogs)
    .where(
      and(
        eq(walletVaultAccessLogs.userId, userId),
        eq(walletVaultAccessLogs.route, route),
        gt(walletVaultAccessLogs.createdAt, cutoff),
        notInArray(walletVaultAccessLogs.outcome, [...WRAP_KEY_NEUTRAL_OUTCOMES]),
      ),
    );
  const count = Number(row?.count ?? 0);
  if (count < maxPerWindow) return { allowed: true, retryAfterSeconds: 0 };
  const oldest = asEpochMs(row?.oldest);
  const retryAfterSeconds =
    oldest == null
      ? Math.max(1, Math.ceil(windowMs / 1000))
      : Math.max(1, Math.ceil((oldest + windowMs - Date.now()) / 1000));
  return { allowed: false, retryAfterSeconds };
}

/** True while this user is still inside the wrap-key failure budget. */
export async function checkDurableWrapKeyRateLimit(
  userId: string,
  route: string,
  maxPerWindow: number,
  windowMs: number,
): Promise<boolean> {
  return (await checkDurableWrapKeyRateLimitDetail(userId, route, maxPerWindow, windowMs)).allowed;
}
