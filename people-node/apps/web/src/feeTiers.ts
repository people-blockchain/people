export type FeeTier = "economy" | "normal" | "fast";

export function feeForTier(baseFee: number, tier: FeeTier): number {
  const base = Math.max(0, baseFee);
  const raw = tier === "economy" ? base * 0.7 : tier === "fast" ? base * 1.8 : base;
  return Math.round(raw * 1000) / 1000;
}

/** Rough inclusion window in blocks for UI copy. */
export function inclusionBlocksForTier(tier: FeeTier, mempoolSize = 0): { min: number; max: number } {
  if (tier === "fast") {
    return { min: 1, max: mempoolSize > 100 ? 2 : 1 };
  }
  if (tier === "economy") {
    return { min: 2, max: mempoolSize > 50 ? 6 : 4 };
  }
  return { min: 1, max: mempoolSize > 50 ? 3 : 2 };
}

export function estimateInclusionSeconds(
  tier: FeeTier,
  blockIntervalMs = 3000,
  mempoolSize = 0
): { minSec: number; maxSec: number } {
  const blocks = inclusionBlocksForTier(tier, mempoolSize);
  const interval = Math.max(1000, blockIntervalMs) / 1000;
  return {
    minSec: Math.round(blocks.min * interval),
    maxSec: Math.round(blocks.max * interval)
  };
}

export function classifyFeeTier(fee: number, baseFee: number): FeeTier {
  if (fee + 1e-9 < baseFee * 0.85) {
    return "economy";
  }
  if (fee >= baseFee * 1.4) {
    return "fast";
  }
  return "normal";
}
