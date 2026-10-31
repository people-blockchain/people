import { FOUNDER_GOAL, normalizeCountryCode } from "./config.ts";
import { canEarnFounderPoints, type FounderVerificationLevel } from "./verification.ts";

export type FounderCountryStat = {
  countryCode: string;
  count: number;
};

export type FounderMapStats = {
  verifiedCount: number;
  goal: number;
  countries: FounderCountryStat[];
  byCountry: Record<string, number>;
};

export type RawFounderMapRow = {
  countryCode?: string | null;
  verificationLevel?: number | null;
  verifiedAt?: Date | string | null;
  isBot?: boolean | null;
  [key: string]: unknown;
};

/**
 * Same verification gate used across the founders / transparency / referral code:
 * - not bot-flagged (`isBot === false`)
 * - completed phone or Human Passport verification (`verifiedAt != null`)
 * - holds a verified tier (`canEarnFounderPoints(verificationLevel)`, i.e. level >= 1)
 */
export function isVerifiedFounderForMap(row: RawFounderMapRow): boolean {
  if (row.isBot === true) return false;
  if (!row.verifiedAt) return false;
  const level = Number(row.verificationLevel ?? 0);
  if (!Number.isFinite(level)) return false;
  return canEarnFounderPoints(level as FounderVerificationLevel);
}

export function emptyFounderMapStats(goal = FOUNDER_GOAL): FounderMapStats {
  return {
    verifiedCount: 0,
    goal,
    countries: [],
    byCountry: {},
  };
}

export function buildMapStatsFromCounts(
  counts: ReadonlyMap<string, number>,
  goal = FOUNDER_GOAL,
): FounderMapStats {
  const countries: FounderCountryStat[] = [];
  for (const [countryCode, rawCount] of counts.entries()) {
    const n = Math.floor(Number(rawCount));
    if (!Number.isFinite(n) || n <= 0) continue;
    countries.push({ countryCode, count: n });
  }

  countries.sort((a, b) => b.count - a.count || a.countryCode.localeCompare(b.countryCode));

  const byCountry: Record<string, number> = {};
  let verifiedCount = 0;
  for (const item of countries) {
    byCountry[item.countryCode] = item.count;
    verifiedCount += item.count;
  }

  return {
    verifiedCount,
    goal,
    countries,
    byCountry,
  };
}

/**
 * Pure aggregator from raw founder rows (or pre-grouped rows) to public map stats.
 * Drops every personal field (walletAddress, userId, founderNumber, phoneHash, etc.)
 * and returns only the verified total, goal, and per-ISO-country counts.
 * Countries with small counts (including 1) are kept as-is.
 */
export function aggregateVerifiedFounders(
  rows: readonly RawFounderMapRow[],
  goal = FOUNDER_GOAL,
): FounderMapStats {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (!isVerifiedFounderForMap(row)) continue;
    const code = typeof row.countryCode === "string" ? normalizeCountryCode(row.countryCode) : null;
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  return buildMapStatsFromCounts(counts, goal);
}
