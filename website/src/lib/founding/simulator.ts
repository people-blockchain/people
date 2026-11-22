/**
 * Pure, deterministic math for the Founding 1,000 Bonding-Curve & Season 1 Pool-Share Simulator.
 * Reuses the canonical bonding curve formula from `src/lib/sale/curve.ts` (`CURVE` from `src/lib/sale/config.ts`).
 *
 * Honesty rules:
 * - No fixed secondary-market price or financial yield/profit promise.
 * - Relative curve price index (`spotPrice / startPrice`) illustrates the bonding-curve mechanism:
 *   "The earlier you buy, the lower the price. Every purchase moves the curve up."
 * - Season 1 pool-share calculation is strictly `yourPoints / totalPoints × 6,000,000 PPL`.
 */

import { CURVE } from "../sale/config.ts";
import { raisedUsd, spotPriceUsd } from "../sale/curve.ts";

export const SEASON_1_BOUNTY_POOL_PPL = 6_000_000;
export const DEFAULT_SIMULATOR_ENTRY_PCT = 15;
export const DEFAULT_SIMULATOR_USER_POINTS = 2_500;
export const DEFAULT_SIMULATOR_TOTAL_POINTS = 2_500_000;
export const MIN_SIMULATOR_TOTAL_POINTS = 10_000;
export const MAX_SIMULATOR_TOTAL_POINTS = 100_000_000;

export type CurveEntrySimulation = {
  /** Slider position 0..100 representing percentage of curve supply entered before you. */
  entryProgressPct: number;
  /** PPL already sold on the curve at that point. */
  soldPplAtEntry: number;
  /** Relative price index vs curve start (1.00x at 0%, 50.00x at 100% of curve supply). */
  priceIndexMultiple: number;
  /** Relative PPL per unit spent vs curve start (100% at 0%, 2% at 100%). */
  relativePplPerDollarPct: number;
  /** Spot curve formula output in USD per PPL from `spotPriceUsd(soldPpl)`. */
  curveFormulaSpotUsd: number;
  /** Net reserve raised at this curve point in USD from `raisedUsd(soldPpl)`. */
  curveReserveUsd: number;
};

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Computes relative bonding-curve metrics at `entryProgressPct` (0% to 100% of the curve).
 */
export function simulateCurveEntry(entryProgressPct: number): CurveEntrySimulation {
  const pct = clampNumber(entryProgressPct, 0, 100);
  const soldPplAtEntry = (pct / 100) * CURVE.supplyPpl;
  const startSpot = spotPriceUsd(0);
  const currentSpot = spotPriceUsd(soldPplAtEntry);
  const priceIndexMultiple = startSpot > 0 ? currentSpot / startSpot : 1;
  const relativePplPerDollarPct = priceIndexMultiple > 0 ? (1 / priceIndexMultiple) * 100 : 100;

  return {
    entryProgressPct: pct,
    soldPplAtEntry,
    priceIndexMultiple,
    relativePplPerDollarPct,
    curveFormulaSpotUsd: currentSpot,
    curveReserveUsd: raisedUsd(soldPplAtEntry),
  };
}

export type PoolShareSimulation = {
  userPoints: number;
  totalPoints: number;
  poolPpl: number;
  /** `userPoints / totalPoints` in [0, 1]. */
  shareRatio: number;
  /** `shareRatio * 100` in [0, 100]. */
  sharePercent: number;
  /** `userPoints / totalPoints * poolPpl` (6,000,000 PPL). */
  estimatedPoolSharePpl: number;
};

/**
 * Honest Season 1 pool-share calculation:
 *   `your points / total points × 6,000,000 PPL`
 * Ensures `totalPoints` is at least `max(1, userPoints)` so a single participant's share never exceeds 100%.
 */
export function simulateSeason1PoolShare(
  userPoints: number,
  totalPoints: number,
  poolPpl: number = SEASON_1_BOUNTY_POOL_PPL,
): PoolShareSimulation {
  const safePool = Number.isFinite(poolPpl) && poolPpl > 0 ? poolPpl : SEASON_1_BOUNTY_POOL_PPL;
  const safeUser = Math.max(0, Number.isFinite(userPoints) ? userPoints : 0);
  const rawTotal = Number.isFinite(totalPoints) && totalPoints > 0 ? totalPoints : DEFAULT_SIMULATOR_TOTAL_POINTS;
  const safeTotal = Math.max(1, safeUser, rawTotal);

  const shareRatio = safeUser === 0 ? 0 : Math.min(1, safeUser / safeTotal);
  const sharePercent = shareRatio * 100;
  const estimatedPoolSharePpl = shareRatio * safePool;

  return {
    userPoints: safeUser,
    totalPoints: safeTotal,
    poolPpl: safePool,
    shareRatio,
    sharePercent,
    estimatedPoolSharePpl,
  };
}
