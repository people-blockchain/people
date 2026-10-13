import { and, eq, gt, sql } from "drizzle-orm";
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

/** Counts rows for this user+route within the window; returns true when still within budget. */
export async function checkDurableWrapKeyRateLimit(
  userId: string,
  route: string,
  maxPerWindow: number,
  windowMs: number,
): Promise<boolean> {
  const db = await getDbReady();
  const since = new Date(Date.now() - windowMs);
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(walletVaultAccessLogs)
    .where(
      and(
        eq(walletVaultAccessLogs.userId, userId),
        eq(walletVaultAccessLogs.route, route),
        gt(walletVaultAccessLogs.createdAt, since),
      ),
    );
  const count = Number(rows[0]?.count ?? 0);
  return count < maxPerWindow;
}
