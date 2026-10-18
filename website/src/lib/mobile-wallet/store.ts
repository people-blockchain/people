import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { apiRateLimits, mobileWalletSessions } from "@/db/schema";
import { GatewayError, type GatewayRecord, type GatewayStore } from "./service";

/** Dedicated shared JSONB state. No DDL/bootstrap/migration executes through this adapter. */
export class PostgresGatewayStore implements GatewayStore {
  async insert(record: GatewayRecord) {
    const db = getDb();
    await db.insert(mobileWalletSessions).values({ id: record.id, data: record, expiresAt: new Date(record.expiresAt) });
    await db.delete(mobileWalletSessions).where(lt(mobileWalletSessions.expiresAt, new Date()));
  }
  async read(id: string) {
    const db = getDb();
    const rows = await db.select().from(mobileWalletSessions).where(eq(mobileWalletSessions.id, id)).limit(2);
    if (rows.length > 1) throw new GatewayError("storage_unavailable", 503);
    return rows.length ? rows[0].data as GatewayRecord : null;
  }
  async replace(before: GatewayRecord, after: GatewayRecord) {
    const db = getDb();
    const result = await db.update(mobileWalletSessions).set({ data: after, expiresAt: new Date(after.expiresAt) })
      .where(and(eq(mobileWalletSessions.id, before.id), eq(mobileWalletSessions.data, before)))
      .returning({ id: mobileWalletSessions.id });
    return result.length === 1;
  }
}

/** Explicit development/tests only. Never selected as a production fallback. */
export class DevelopmentGatewayStore implements GatewayStore {
  private records = new Map<string, string>();
  async insert(record: GatewayRecord) {
    if (this.records.has(record.id) || this.records.size >= 256) throw new GatewayError("development_store_full", 503);
    this.records.set(record.id, JSON.stringify(record));
  }
  async read(id: string) { const raw = this.records.get(id); return raw ? JSON.parse(raw) as GatewayRecord : null; }
  async replace(before: GatewayRecord, after: GatewayRecord) {
    if (this.records.get(before.id) !== JSON.stringify(before)) return false;
    this.records.set(before.id, JSON.stringify(after)); return true;
  }
}

/** Reuse the existing durable rate table without invoking runtime schema bootstrap. */
export async function checkGatewayRateLimit(namespace: string, subject: string, budget: number, windowMs: number) {
  const now = Date.now(), start = Math.floor(now / windowMs) * windowMs;
  const rows = await getDb().insert(apiRateLimits).values({
    bucketKey: `${namespace}:${subject}:${start}`, count: 1, expiresAt: new Date(start + windowMs * 2),
  }).onConflictDoUpdate({ target: apiRateLimits.bucketKey, set: { count: sql`${apiRateLimits.count} + 1` } })
    .returning({ count: apiRateLimits.count });
  return rows.length === 1 && Number.isSafeInteger(rows[0].count) && rows[0].count > 0 && rows[0].count <= budget;
}
