import { and, desc, eq, gt, notInArray, sql } from "drizzle-orm";
import { getDbReady } from "@/db";
import { walletVaultAccessLogs } from "@/db/schema";

/**
 * recon.md R1: durable, DB-backed record of wrap-key access attempts (who/when/outcome, never
 * key material) and a durable rate limit layered on top of the existing in-memory one. The
 * in-memory limiter resets on every deploy/restart and gives no audit trail across instances;
 * this is the forensic/containment backstop.
 *
 * A failed insert is thrown. The wrap-key route fails closed on that error so an attempt that
 * was not recorded cannot be treated as if it had been counted.
 */
export async function recordWalletVaultAccess(params: {
  userId: string;
  route: string;
  outcome: string;
  ip?: string | null;
}): Promise<void> {
  const db = await getDbReady();
  await db.insert(walletVaultAccessLogs).values({
    userId: params.userId,
    route: params.route,
    outcome: params.outcome,
    ip: params.ip ?? null,
  });
}

/** Replace the provisional outcome written by {@link reserveWalletVaultWrapKeyAttempt}. */
export async function setWalletVaultAccessOutcome(id: string, outcome: string): Promise<void> {
  const db = await getDbReady();
  const rows = await db
    .update(walletVaultAccessLogs)
    .set({ outcome })
    .where(eq(walletVaultAccessLogs.id, id))
    .returning({ id: walletVaultAccessLogs.id });
  if (rows.length !== 1) throw new Error("wallet vault access log update failed");
}

/**
 * Every wrap-key attempt inside the window counts, including `ok` and `reauth_required`.
 * `rate_limited` is the rejection itself and must not push the window forward. A success does
 * not clear or shorten the window. Vault reads are a different route and never count here.
 */
const WRAP_KEY_IGNORED_OUTCOMES = ["rate_limited"] as const;

export type WrapKeyRateLimitVerdict = {
  allowed: boolean;
  /** Seconds until the request that still fills the ceiling leaves the window. Zero when allowed. */
  retryAfterSeconds: number;
};

/**
 * `timestamp without time zone` comes back as a Date on a typed column select. A raw aggregate
 * can still be a zone-less string; that string is UTC wall time, not the process local zone.
 */
function asEpochMs(value: unknown): number | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const hasZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
  const iso = hasZone ? raw : `${raw.replace(" ", "T")}Z`;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? time : null;
}

type AccessLogReader = {
  select: Awaited<ReturnType<typeof getDbReady>>["select"];
};

function countedWhere(userId: string, route: string, since: Date) {
  return and(
    eq(walletVaultAccessLogs.userId, userId),
    eq(walletVaultAccessLogs.route, route),
    gt(walletVaultAccessLogs.createdAt, since),
    notInArray(walletVaultAccessLogs.outcome, [...WRAP_KEY_IGNORED_OUTCOMES]),
  );
}

/**
 * `count < max` is the pre-insert reading: this many rows are already stored, so another one
 * still fits. Callers that insert first compare with `<=` instead.
 */
async function wrapKeyVerdict(
  db: AccessLogReader,
  userId: string,
  route: string,
  maxPerWindow: number,
  windowMs: number,
): Promise<WrapKeyRateLimitVerdict> {
  const since = new Date(Date.now() - windowMs);
  const where = countedWhere(userId, route, since);
  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(walletVaultAccessLogs)
    .where(where);
  const count = Number(countRow?.count ?? 0);
  if (count < maxPerWindow) return { allowed: true, retryAfterSeconds: 0 };

  // The row that still fills the ceiling is the maxPerWindow-th newest, not the oldest in the
  // window. Once that one ages out, fewer than maxPerWindow counted rows remain.
  const [boundary] = await db
    .select({ createdAt: walletVaultAccessLogs.createdAt })
    .from(walletVaultAccessLogs)
    .where(where)
    .orderBy(desc(walletVaultAccessLogs.createdAt), desc(walletVaultAccessLogs.id))
    .offset(Math.max(0, maxPerWindow - 1))
    .limit(1);
  const oldest = boundary?.createdAt instanceof Date ? boundary.createdAt.getTime() : asEpochMs(boundary?.createdAt);
  const retryAfterSeconds =
    oldest == null
      ? Math.max(1, Math.ceil(windowMs / 1000))
      : Math.max(1, Math.ceil((oldest + windowMs - Date.now()) / 1000));
  return { allowed: false, retryAfterSeconds };
}

export async function checkDurableWrapKeyRateLimitDetail(
  userId: string,
  route: string,
  maxPerWindow: number,
  windowMs: number,
): Promise<WrapKeyRateLimitVerdict> {
  const db = await getDbReady();
  return wrapKeyVerdict(db, userId, route, maxPerWindow, windowMs);
}

/** True while this user is still inside the wrap-key budget (successes and failures together). */
export async function checkDurableWrapKeyRateLimit(
  userId: string,
  route: string,
  maxPerWindow: number,
  windowMs: number,
): Promise<boolean> {
  return (await checkDurableWrapKeyRateLimitDetail(userId, route, maxPerWindow, windowMs)).allowed;
}

/**
 * Insert this attempt before counting it, under a per-user advisory lock, so two concurrent
 * requests cannot both observe "one slot left". The row starts as `pending` (it counts). When
 * it does not fit, it is rewritten to `rate_limited` in the same transaction so the rejection
 * itself does not extend the ceiling. The caller then sets `ok` or `reauth_required`.
 */
export async function reserveWalletVaultWrapKeyAttempt(params: {
  userId: string;
  route: string;
  ip?: string | null;
  maxPerWindow: number;
  windowMs: number;
}): Promise<{ id: string; allowed: boolean; retryAfterSeconds: number }> {
  const db = await getDbReady();
  const id = crypto.randomUUID();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`wallet-vault-wrap:${params.userId}`}))`);
    await tx.insert(walletVaultAccessLogs).values({
      id,
      userId: params.userId,
      route: params.route,
      outcome: "pending",
      ip: params.ip ?? null,
    });
    const since = new Date(Date.now() - params.windowMs);
    const [countRow] = await tx
      .select({ count: sql<number>`count(*)` })
      .from(walletVaultAccessLogs)
      .where(countedWhere(params.userId, params.route, since));
    const count = Number(countRow?.count ?? 0);
    if (count <= params.maxPerWindow) return { id, allowed: true, retryAfterSeconds: 0 };
    await tx
      .update(walletVaultAccessLogs)
      .set({ outcome: "rate_limited" })
      .where(eq(walletVaultAccessLogs.id, id));
    const blocked = await wrapKeyVerdict(tx, params.userId, params.route, params.maxPerWindow, params.windowMs);
    return { id, allowed: false, retryAfterSeconds: blocked.retryAfterSeconds };
  });
}
