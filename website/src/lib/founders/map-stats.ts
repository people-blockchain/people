import { and, count, desc, eq, gte, isNotNull } from "drizzle-orm";
import { getDbReady } from "@/db";
import { founders } from "@/db/schema";
import { FOUNDER_GOAL, normalizeCountryCode } from "./config.ts";
import {
  buildMapStatsFromCounts,
  type FounderCountryStat,
  type FounderMapStats,
  type RawFounderMapRow,
} from "./map-aggregate.ts";
import { VERIFICATION_LEVEL_TELEGRAM_PHONE } from "./verification.ts";

export type { FounderCountryStat, FounderMapStats, RawFounderMapRow };
export {
  aggregateVerifiedFounders,
  emptyFounderMapStats,
  isVerifiedFounderForMap,
} from "./map-aggregate.ts";

function isConnectionClosed(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return (
    e?.code === "CONNECTION_CLOSED" ||
    /CONNECTION_CLOSED|connection.*closed/i.test(e?.message ?? "")
  );
}

function verifiedFounderSqlFilter() {
  return and(
    isNotNull(founders.verifiedAt),
    eq(founders.isBot, false),
    gte(founders.verificationLevel, VERIFICATION_LEVEL_TELEGRAM_PHONE),
  );
}

async function readFounderMapStatsFromDb(): Promise<FounderMapStats> {
  const db = await getDbReady();
  const grouped = await db
    .select({
      countryCode: founders.countryCode,
      count: count(),
    })
    .from(founders)
    .where(verifiedFounderSqlFilter())
    .groupBy(founders.countryCode)
    .orderBy(desc(count()), founders.countryCode);

  const counts = new Map<string, number>();
  for (const row of grouped) {
    const code = typeof row.countryCode === "string" ? normalizeCountryCode(row.countryCode) : null;
    const n = Number(row.count ?? 0);
    if (!code || !Number.isFinite(n) || n <= 0) continue;
    counts.set(code, (counts.get(code) ?? 0) + n);
  }

  return buildMapStatsFromCounts(counts, FOUNDER_GOAL);
}

/**
 * Live aggregate of verified founders and their self-declared ISO country codes.
 * Reads directly from `founders` (the table written by `registerFounder` and `updateFounderCountry`),
 * never selects personal columns, and never fabricates numbers when empty.
 */
export async function getFounderMapStats(): Promise<FounderMapStats> {
  try {
    return await readFounderMapStatsFromDb();
  } catch (error) {
    if (!isConnectionClosed(error)) throw error;
    return await readFounderMapStatsFromDb();
  }
}
