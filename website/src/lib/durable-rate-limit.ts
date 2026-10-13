import { lt, sql } from "drizzle-orm";
import { getDbReady } from "@/db";
import { apiRateLimits } from "@/db/schema";

/**
 * api-cron.md M2: Postgres-backed fixed-window rate limiter for routes where the in-process
 * `checkSlidingWindowRateLimit` is not enough. That limiter lives in a module-level `Map`, so
 * every Vercel instance and every cold start begins with a clean budget — the effective limit
 * is (configured limit × instances). Here each bucket is a single row keyed by
 * `namespace:subject:windowStart`; the upsert is one atomic increment, so concurrent requests
 * on different instances still share one counter.
 *
 * Fixed window (not sliding) is deliberate: it is one row per subject per window instead of a
 * per-request event log, and for abuse mitigation the boundary burst is an acceptable trade.
 *
 * Throws if the database is unreachable — callers decide whether to fail open to the in-memory
 * limiter or closed.
 */
export async function checkDurableRateLimit(
  namespace: string,
  subject: string,
  maxPerWindow: number,
  windowMs: number
): Promise<boolean> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const bucketKey = `${namespace}:${subject}:${windowStart}`;
  const expiresAt = new Date(windowStart + windowMs * 2);
  const db = await getDbReady();
  const [row] = await db
    .insert(apiRateLimits)
    .values({ bucketKey, count: 1, expiresAt })
    .onConflictDoUpdate({
      target: apiRateLimits.bucketKey,
      set: { count: sql`${apiRateLimits.count} + 1` },
    })
    .returning({ count: apiRateLimits.count });
  const count = Number(row?.count ?? 1);
  // Expired windows are never read again; sweep them opportunistically instead of on a cron.
  if (Math.random() < 0.01) {
    try {
      await db.delete(apiRateLimits).where(lt(apiRateLimits.expiresAt, new Date()));
    } catch (error) {
      console.warn(
        "[durable-rate-limit] cleanup failed",
        error instanceof Error ? error.message : error
      );
    }
  }
  return count <= maxPerWindow;
}

/** @internal test hook — clear one namespace's buckets. */
export async function resetDurableRateLimitForTests(namespace: string): Promise<void> {
  const db = await getDbReady();
  await db.delete(apiRateLimits).where(sql`${apiRateLimits.bucketKey} LIKE ${`${namespace}:%`}`);
}
