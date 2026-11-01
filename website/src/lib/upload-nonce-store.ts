import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { getDbReady } from "@/db";
import { uploadNonces } from "@/db/schema";
import { DIRECT_UPLOAD_NONCE_TTL_MS } from "./media-upload-rules.ts";

/** Keep a spent or expired nonce long enough for a late sign to report nonce_expired. */
export const UPLOAD_NONCE_EXPIRED_RETENTION_MS = 60 * 60 * 1000;

export type NonceStatus = "ok" | "nonce_used" | "nonce_expired" | "nonce_missing";

export type UploadNonceRow = {
  nonce: string;
  address: string;
  domain: string;
  expiry: string;
  expiresAt: number;
  consumed: boolean;
};

type MemoryRow = UploadNonceRow;

const memory = new Map<string, MemoryRow>();

/** `true` forces the in-process map, `false` forces the database, `null` follows DATABASE_URL. */
let forceMemory: boolean | null = null;

export class UploadNonceStoreError extends Error {
  constructor() {
    super("upload_nonce_store");
    this.name = "UploadNonceStoreError";
  }
}

function memoryOnly(): boolean {
  if (forceMemory !== null) return forceMemory;
  return !process.env.DATABASE_URL?.trim();
}

export function classifyNonce(
  row: { address: string; expiresAt: number; consumed: boolean } | null,
  address: string,
  now: number,
): NonceStatus {
  if (!row || row.address !== address) return "nonce_missing";
  if (row.consumed) return "nonce_used";
  if (row.expiresAt <= now) return "nonce_expired";
  return "ok";
}

function sweepBefore(now: number): number {
  return now - UPLOAD_NONCE_EXPIRED_RETENTION_MS;
}

function sweepMemory(now: number): void {
  if (memory.size < 5000) return;
  const cutoff = sweepBefore(now);
  for (const [key, row] of memory) {
    if (row.expiresAt <= cutoff) memory.delete(key);
  }
}

export async function issueUploadNonce(input: {
  address: string;
  domain: string;
  now?: number;
  ttlMs?: number;
}): Promise<{ nonce: string; expiry: string; domain: string }> {
  const now = input.now ?? Date.now();
  const ttlMs = input.ttlMs ?? DIRECT_UPLOAD_NONCE_TTL_MS;
  const expiresAt = now + ttlMs;
  const expiry = new Date(expiresAt).toISOString();
  const nonce = randomBytes(16).toString("hex");
  const row: UploadNonceRow = {
    nonce,
    address: input.address,
    domain: input.domain,
    expiry,
    expiresAt,
    consumed: false,
  };
  if (memoryOnly()) {
    sweepMemory(now);
    memory.set(nonce, row);
    return { nonce, expiry, domain: input.domain };
  }
  try {
    const db = await getDbReady();
    await db.delete(uploadNonces).where(lt(uploadNonces.expiresAt, new Date(sweepBefore(now))));
    await db.insert(uploadNonces).values({
      nonce,
      address: input.address,
      domain: input.domain,
      expiry,
      expiresAt: new Date(expiresAt),
    });
    return { nonce, expiry, domain: input.domain };
  } catch {
    throw new UploadNonceStoreError();
  }
}

export async function readUploadNonce(nonce: string): Promise<UploadNonceRow | null> {
  if (memoryOnly()) return memory.get(nonce) ?? null;
  try {
    const db = await getDbReady();
    const [row] = await db.select().from(uploadNonces).where(eq(uploadNonces.nonce, nonce)).limit(1);
    if (!row) return null;
    return {
      nonce: row.nonce,
      address: row.address,
      domain: row.domain,
      expiry: row.expiry,
      expiresAt: row.expiresAt.getTime(),
      consumed: row.consumedAt != null,
    };
  } catch {
    throw new UploadNonceStoreError();
  }
}

function consumeMemory(nonce: string, address: string, now: number): NonceStatus {
  const row = memory.get(nonce) ?? null;
  const status = classifyNonce(row, address, now);
  if (status !== "ok" || !row) return status;
  row.consumed = true;
  return "ok";
}

export async function consumeUploadNonce(nonce: string, address: string, now = Date.now()): Promise<NonceStatus> {
  if (memoryOnly()) return consumeMemory(nonce, address, now);
  try {
    const db = await getDbReady();
    const updated = await db
      .update(uploadNonces)
      .set({ consumedAt: new Date(now) })
      .where(
        and(
          eq(uploadNonces.nonce, nonce),
          eq(uploadNonces.address, address),
          isNull(uploadNonces.consumedAt),
          gt(uploadNonces.expiresAt, new Date(now)),
        ),
      )
      .returning({ nonce: uploadNonces.nonce });
    if (updated.length > 0) return "ok";
    const row = await readUploadNonce(nonce);
    return classifyNonce(row, address, now);
  } catch (error) {
    if (error instanceof UploadNonceStoreError) throw error;
    throw new UploadNonceStoreError();
  }
}

/** @internal test hook. `null` restores the DATABASE_URL default. */
export function setUploadNonceMemoryForTests(force: boolean | null): void {
  forceMemory = force;
}

export function resetUploadNoncesForTests(): void {
  memory.clear();
  forceMemory = true;
}
