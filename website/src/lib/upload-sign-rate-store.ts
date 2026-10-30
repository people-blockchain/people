import { lt, sql } from "drizzle-orm";
import { getDbReady } from "@/db";
import { uploadSignRates } from "@/db/schema";
import { rateLimitKey } from "./api-rate-limit.ts";

type Bucket = { count: number; expiresAt: number };

const memory = new Map<string, Bucket>();

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

function bucketKey(subject: string, windowStart: number): string {
  return `${rateLimitKey(subject)}:${windowStart}`;
}

function sweepMemory(now: number): void {
  for (const [key, row] of memory) {
    if (row.expiresAt <= now) memory.delete(key);
  }
}

function allowMemory(key: string, limit: number, expiresAt: number, now: number): boolean {
  sweepMemory(now);
  const row = memory.get(key) ?? { count: 0, expiresAt };
  row.count += 1;
  row.expiresAt = expiresAt;
  memory.set(key, row);
  return row.count <= limit;
}

async function allowDatabase(key: string, limit: number, expiresAt: number, now: number): Promise<boolean> {
  const db = await getDbReady();
  await db.delete(uploadSignRates).where(lt(uploadSignRates.expiresAt, new Date(now)));
  const [row] = await db
    .insert(uploadSignRates)
    .values({ bucketKey: key, count: 1, expiresAt: new Date(expiresAt) })
    .onConflictDoUpdate({
      target: uploadSignRates.bucketKey,
      set: { count: sql`${uploadSignRates.count} + 1` },
    })
    .returning({ count: uploadSignRates.count });
  return Number(row?.count ?? 1) <= limit;
}

/**
 * One slot in the direct-upload sign budget. The database is the source of truth when
 * configured, so a new server process does not start the count over.
 */
export async function allowDirectUploadSignIp(subject: string, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = bucketKey(subject, windowStart);
  const expiresAt = windowStart + windowMs * 2;
  if (memoryOnly()) return allowMemory(key, limit, expiresAt, now);
  try {
    return await allowDatabase(key, limit, expiresAt, now);
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
