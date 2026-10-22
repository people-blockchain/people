import { and, eq, sql } from "drizzle-orm";
import { getDbReady } from "@/db";
import { factoryIconDailyUsage } from "@/db/schema";
import {
  ICON_GEN_FREE_PER_DAY,
  readIconGenGlobalDailyCap,
} from "./factory-icon-config.ts";

/**
 * api-cron.md M2: counters are durable (Postgres) rather than module-level `Map`s. The old
 * counters were scoped to one process, so on Vercel the daily free quota and the global cap
 * were multiplied by the number of warm instances and reset on every cold start.
 *
 * `walletAddress = "*"` is the all-wallets global row (no real wallet takes that value).
 */
const GLOBAL_USAGE_KEY = "*";

export function utcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function normalizeWallet(wallet: string): string {
  return wallet.trim().toLowerCase();
}

async function readUsageCount(dayKey: string, walletAddress: string): Promise<number> {
  const db = await getDbReady();
  const rows = await db
    .select({ usedCount: factoryIconDailyUsage.usedCount })
    .from(factoryIconDailyUsage)
    .where(
      and(
        eq(factoryIconDailyUsage.dayKey, dayKey),
        eq(factoryIconDailyUsage.walletAddress, walletAddress)
      )
    )
    .limit(1);
  return Number(rows[0]?.usedCount ?? 0);
}

export async function getWalletIconGenCountForDay(wallet: string, day = utcDayKey()): Promise<number> {
  return readUsageCount(day, normalizeWallet(wallet));
}

export async function getGlobalIconGenCountForDay(day = utcDayKey()): Promise<number> {
  return readUsageCount(day, GLOBAL_USAGE_KEY);
}

/**
 * M20-4: free generations are a founder perk. `freeEligible` must be the server-side
 * verification check (`isWalletFreeIconEligible`), and it defaults to false so a caller that
 * forgets to pass it fails closed (paid) rather than handing out free generations.
 */
export function freeIconGensRemainingFromCount(used: number, freeEligible = false): number {
  if (!freeEligible) return 0;
  return Math.max(0, ICON_GEN_FREE_PER_DAY - used);
}

export async function freeIconGensRemaining(
  wallet: string,
  day = utcDayKey(),
  freeEligible = false
): Promise<number> {
  if (!freeEligible) return 0;
  return freeIconGensRemainingFromCount(await getWalletIconGenCountForDay(wallet, day), true);
}

export type QuotaDecision =
  | { allowed: true; charge: "free" | "paid"; freeRemainingAfter: number }
  | { allowed: false; reason: "global_cap" | "payment_required" };

export async function previewIconGenQuota(
  wallet: string,
  day = utcDayKey(),
  freeEligible = false
): Promise<QuotaDecision> {
  const globalCap = readIconGenGlobalDailyCap();
  if ((await getGlobalIconGenCountForDay(day)) >= globalCap) {
    return { allowed: false, reason: "global_cap" };
  }
  const freeLeft = freeIconGensRemainingFromCount(
    await getWalletIconGenCountForDay(wallet, day),
    freeEligible
  );
  if (freeLeft > 0) {
    return { allowed: true, charge: "free", freeRemainingAfter: freeLeft - 1 };
  }
  return { allowed: false, reason: "payment_required" };
}

export type IconGenReservation =
  | { ok: true; charge: "free" | "paid"; freeRemainingAfter: number }
  | { ok: false; reason: "global_cap" | "payment_required" };

/**
 * AUDIT M2: reserve a batch *before* generating, atomically. `previewIconGenQuota` is only a
 * read, so N parallel requests could all pass it and then all consume. Here each counter is a
 * single conditional upsert (`… DO UPDATE SET usedCount = usedCount + 1 WHERE usedCount < cap
 * RETURNING`), so at most `cap` concurrent callers win; both rows move inside one transaction so
 * a lost free-slot race also rolls back the global slot. Undo with `releaseIconGenSlot` if the
 * batch then fails.
 */
export async function reserveIconGenSlot(
  wallet: string,
  charge: "free" | "paid",
  day = utcDayKey()
): Promise<IconGenReservation> {
  const db = await getDbReady();
  const walletAddress = normalizeWallet(wallet);
  const globalCap = readIconGenGlobalDailyCap();
  if (globalCap < 1) return { ok: false, reason: "global_cap" };

  // Thrown (and caught below) only to roll the transaction back with a reason.
  const rolledBack: { reason: "global_cap" | "payment_required" | null } = { reason: null };
  const rollback = (reason: "global_cap" | "payment_required") => {
    rolledBack.reason = reason;
    return new Error(`icon_quota_${reason}`);
  };

  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const bump = (tx: Tx, key: string, cap: number | null) =>
    tx
      .insert(factoryIconDailyUsage)
      .values({ dayKey: day, walletAddress: key, usedCount: 1 })
      .onConflictDoUpdate({
        target: [factoryIconDailyUsage.dayKey, factoryIconDailyUsage.walletAddress],
        set: {
          usedCount: sql`${factoryIconDailyUsage.usedCount} + 1`,
          updatedAt: new Date(),
        },
        ...(cap === null ? {} : { setWhere: sql`${factoryIconDailyUsage.usedCount} < ${cap}` }),
      })
      .returning({ usedCount: factoryIconDailyUsage.usedCount });

  try {
    return await db.transaction(async (tx) => {
      const globalRows = await bump(tx, GLOBAL_USAGE_KEY, globalCap);
      if (globalRows.length === 0) throw rollback("global_cap");
      // Paid batches still count on the wallet row (same as before) but are not capped by it.
      const walletRows = await bump(tx, walletAddress, charge === "free" ? ICON_GEN_FREE_PER_DAY : null);
      if (walletRows.length === 0) throw rollback("payment_required");
      const used = Number(walletRows[0].usedCount);
      return {
        ok: true as const,
        charge,
        freeRemainingAfter: charge === "free" ? Math.max(0, ICON_GEN_FREE_PER_DAY - used) : 0,
      };
    });
  } catch (error) {
    if (rolledBack.reason) return { ok: false, reason: rolledBack.reason };
    throw error;
  }
}

/** Give back a slot taken by `reserveIconGenSlot` when the batch it guarded did not happen. */
export async function releaseIconGenSlot(wallet: string, day = utcDayKey()): Promise<void> {
  const db = await getDbReady();
  const walletAddress = normalizeWallet(wallet);
  for (const key of [walletAddress, GLOBAL_USAGE_KEY]) {
    await db
      .update(factoryIconDailyUsage)
      .set({
        usedCount: sql`GREATEST(${factoryIconDailyUsage.usedCount} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(and(eq(factoryIconDailyUsage.dayKey, day), eq(factoryIconDailyUsage.walletAddress, key)));
  }
}

/**
 * Record one consumed batch: one row per wallet plus the shared global row. Upsert keeps the
 * increment atomic across instances. `_charge` is retained for call-site symmetry and future
 * per-charge accounting; today free and paid both count against the global daily cap.
 */
export async function consumeIconGenSlot(
  wallet: string,
  _charge: "free" | "paid",
  day = utcDayKey()
): Promise<void> {
  const db = await getDbReady();
  const walletAddress = normalizeWallet(wallet);
  for (const key of [walletAddress, GLOBAL_USAGE_KEY]) {
    await db
      .insert(factoryIconDailyUsage)
      .values({ dayKey: day, walletAddress: key, usedCount: 1 })
      .onConflictDoUpdate({
        target: [factoryIconDailyUsage.dayKey, factoryIconDailyUsage.walletAddress],
        set: {
          usedCount: sql`${factoryIconDailyUsage.usedCount} + 1`,
          updatedAt: new Date(),
        },
      });
  }
}
