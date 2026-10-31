import { and, eq } from "drizzle-orm";
import { getDbReady, isDatabaseConfigured } from "@/db";
import { evmLogScanCursors } from "@/db/schema";
import { warnCatalog } from "@/lib/evm/catalog-log";

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

async function readCursorRow(address: string, topic: string): Promise<{ lastBlock: number; logs: unknown[] } | null> {
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
    return { lastBlock, logs: Array.isArray(row.logs) ? row.logs : [] };
  } catch (error) {
    // Optional optimization only — callers fall back to a full scan.
    warnCatalog("cursor read", error);
    return null;
  }
}

async function writeCursorRow(address: string, topic: string, lastBlock: number, logs: readonly unknown[]): Promise<boolean> {
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
  } catch (error) {
    // Optional optimization only — a DB error must never fail the catalog scan.
    warnCatalog("cursor write", error);
    return false;
  }
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
  const row = await readCursorRow(address, topic);
  return row ? { lastBlock: row.lastBlock, logs: row.logs as LogScanLog[] } : null;
}

export async function writeLogScanCursor(
  address: string,
  topic: string,
  lastBlock: number,
  logs: readonly LogScanLog[],
): Promise<boolean> {
  return writeCursorRow(address, topic, lastBlock, logs);
}

/**
 * The last good token catalog lives in the same `evm_log_scan_cursor` table under a reserved,
 * non-address key (no schema change): a cold server instance serves it instead of a bare static
 * list while its own scan is still running.
 */
const CATALOG_SNAPSHOT_ADDRESS = "catalog:tokens";
const CATALOG_SNAPSHOT_TOPIC = "last-good-v1";

export async function readCatalogSnapshot(): Promise<unknown[] | null> {
  const row = await readCursorRow(CATALOG_SNAPSHOT_ADDRESS, CATALOG_SNAPSHOT_TOPIC);
  return row ? row.logs : null;
}

export async function writeCatalogSnapshot(tip: number, rows: readonly unknown[]): Promise<boolean> {
  return writeCursorRow(CATALOG_SNAPSHOT_ADDRESS, CATALOG_SNAPSHOT_TOPIC, Math.max(0, tip), rows);
}
