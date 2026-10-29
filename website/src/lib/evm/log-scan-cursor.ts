import { and, eq } from "drizzle-orm";
import { getDbReady, isDatabaseConfigured } from "@/db";
import { evmLogScanCursors } from "@/db/schema";

/** Raw `eth_getLogs` result, persisted as JSON between scans. */
export type LogScanLog = {
  address?: string;
  topics?: string[];
  data?: string;
  blockNumber?: string;
};

export type LogScanCursor = {
  /** Last fully scanned block; every window up to here is immutable and stored in `logs`. */
  lastBlock: number;
  logs: LogScanLog[];
};

function cursorAddress(address: string): string {
  return address.toLowerCase();
}

function cursorTopic(topic: string): string {
  return topic.toLowerCase();
}

/**
 * Persisted incremental log-scan cursor.
 *
 * The token catalog reads the same factory topics on every cold start. Keeping the immutable
 * windows in Postgres lets a later scan start at `lastBlock` instead of replaying the whole
 * chain history. Optional: without DATABASE_URL (or on a DB error) callers fall back to a full
 * scan exactly as before.
 */
export async function readLogScanCursor(address: string, topic: string): Promise<LogScanCursor | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const db = await getDbReady();
    const [row] = await db
      .select({ lastBlock: evmLogScanCursors.lastBlock, logs: evmLogScanCursors.logs })
      .from(evmLogScanCursors)
      .where(
        and(
          eq(evmLogScanCursors.address, cursorAddress(address)),
          eq(evmLogScanCursors.topic, cursorTopic(topic)),
        ),
      )
      .limit(1);
    if (!row) return null;
    const lastBlock = Number(row.lastBlock);
    if (!Number.isSafeInteger(lastBlock) || lastBlock < 0) return null;
    return { lastBlock, logs: Array.isArray(row.logs) ? (row.logs as LogScanLog[]) : [] };
  } catch {
    return null;
  }
}

export async function writeLogScanCursor(
  address: string,
  topic: string,
  lastBlock: number,
  logs: readonly LogScanLog[],
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  try {
    const db = await getDbReady();
    await db
      .insert(evmLogScanCursors)
      .values({
        address: cursorAddress(address),
        topic: cursorTopic(topic),
        lastBlock,
        logs,
      })
      .onConflictDoUpdate({
        target: [evmLogScanCursors.address, evmLogScanCursors.topic],
        set: { lastBlock, logs },
      });
    return true;
  } catch {
    // Optional optimization only — a DB error must never fail the catalog scan.
    return false;
  }
}
