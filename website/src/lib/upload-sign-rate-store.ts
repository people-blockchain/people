import { and, eq, gt, lte } from "drizzle-orm";
import { getDbReady } from "@/db";
import { uploadSignRateHits } from "@/db/schema";
import { rateLimitKey } from "./api-rate-limit.ts";

const memory = new Map<string, number[]>();

/** `true` forces the in-process map, `false` forces the database, `null` follows DATABASE_URL. */
let forceMemory: boolean | null = null;

export class UploadSignRateStoreError extends Error {
  constructor() {
    super("upload_sign_rate_store");
    this.name = "UploadSignRateStoreError";
  }
}

function memoryOnly(): boolean {
  if (forceMemory !== null) return forceMemory;
  return !process.env.DATABASE_URL?.trim();
}

/**
 * Sliding window: a hit counts until it is older than `windowMs`. The returned list includes
 * the hit being decided, so the 11th request inside the span is stored and refused.
 */
export function decideSlidingWindow(
  existing: readonly number[],
  now: number,
  windowMs: number,
  limit: number,
): { allow: boolean; hits: number[] } {
  const cutoff = now - windowMs;
  const hits = existing.filter((at) => at > cutoff);
  hits.push(now);
  return { allow: hits.length <= limit, hits };
}

function allowMemory(key: string, limit: number, windowMs: number, now: number): boolean {
  const decision = decideSlidingWindow(memory.get(key) ?? [], now, windowMs, limit);
  memory.set(key, decision.hits);
  return decision.allow;
}

async function allowDatabase(key: string, limit: number, windowMs: number, now: number): Promise<boolean> {
  const db = await getDbReady();
  const cutoff = new Date(now - windowMs);
  await db.delete(uploadSignRateHits).where(lte(uploadSignRateHits.hitAt, cutoff));
  await db.insert(uploadSignRateHits).values({ id: crypto.randomUUID(), subjectKey: key, hitAt: new Date(now) });
  const rows = await db
    .select({ id: uploadSignRateHits.id })
    .from(uploadSignRateHits)
    .where(and(eq(uploadSignRateHits.subjectKey, key), gt(uploadSignRateHits.hitAt, cutoff)));
  return rows.length <= limit;
}

/**
 * One slot in the direct-upload sign budget. Every call that reaches this function is counted.
 * The database is the source of truth when configured, so a new server process does not start over.
 */
export async function allowDirectUploadSignIp(
  subject: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<boolean> {
  const key = rateLimitKey(subject);
  if (memoryOnly()) return allowMemory(key, limit, windowMs, now);
  try {
    return await allowDatabase(key, limit, windowMs, now);
  } catch (error) {
    if (error instanceof UploadSignRateStoreError) throw error;
    throw new UploadSignRateStoreError();
  }
}

/** @internal test hook. `null` restores the DATABASE_URL default. */
export function setUploadSignRateMemoryForTests(force: boolean | null): void {
  forceMemory = force;
}

export function resetUploadSignRatesForTests(): void {
  memory.clear();
  forceMemory = true;
}
