/** Preliminary program pool — 5% of emission from Community & rewards bucket. */

export const FOUNDER_PROGRAM_POOL_PPL = 50_000_000;
export const FOUNDER_SEASON_1_POOL_PPL = 20_000_000;

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
