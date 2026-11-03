/**
 * Million Founders program pool: 5% of total supply, from the Community & rewards bucket.
 *
 * Split (owner decision, 2026-11-01):
 * - Season 1 (founder points):      15M (was 20M; 5M moved to the Genesis Quest)
 * - Referral pool (all seasons):    10M (was 15M; 5M moved to the Genesis Quest), see referral.ts
 * - Genesis Quest (2 Nov–1 Dec 2026): up to 25M, see genesis-quest.ts
 * The program total stays 50M. Nothing is minted.
 */

export const FOUNDER_PROGRAM_POOL_PPL = 50_000_000;
export const FOUNDER_SEASON_1_POOL_PPL = 15_000_000;

export function estimatePplPerPoint(seasonPoolPpl: number, totalPoints: number): number | null {
  if (!Number.isFinite(seasonPoolPpl) || seasonPoolPpl <= 0) return null;
  if (!Number.isFinite(totalPoints) || totalPoints <= 0) return null;
  return seasonPoolPpl / totalPoints;
}

export function formatPplPerPointEstimate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value >= 1) return value.toFixed(2);
  if (value >= 0.01) return value.toFixed(4);
  return value.toExponential(2);
}
