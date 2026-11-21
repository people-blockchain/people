/**
 * Community-token bonding curve launch spot (mirrors `CurveMath.initialState` + fixed split).
 * Virtual native reserve is always 60 PPL (`PeopleConstants.VIRTUAL_NATIVE_RESERVE`).
 * Spot at open ≈ virtualNative / bondingCurveAllocation (human token units).
 */

import { launchAllocation, type PromoBps } from "@/lib/token-promo";
import { MIN_TOKEN_SUPPLY_WHOLE, wholeTokensToBaseUnits } from "@/lib/token-supply-limits";

export const VIRTUAL_NATIVE_RESERVE_PPL = 60;

export const COMMUNITY_TOKEN_DECIMALS = 6;

export type LaunchSpotPrice = {
  /** PPL per one whole token at curve open (display). */
  spotPplPerWholeToken: number;
  bondingCurveWholeTokens: bigint;
  bondingCurveBaseUnits: bigint;
  totalSupplyWhole: bigint;
};

export function bondingCurveAllocationBaseUnits(totalSupplyBaseUnits: bigint, promoBps: PromoBps = 0): bigint {
  return launchAllocation(totalSupplyBaseUnits, promoBps).bondingCurve;
}

export function launchSpotFromSupplyWhole(
  totalSupplyWhole: bigint,
  promoBps: PromoBps = 0,
): LaunchSpotPrice | null {
  if (totalSupplyWhole < BigInt(MIN_TOKEN_SUPPLY_WHOLE)) return null;
  const baseUnits = wholeTokensToBaseUnits(String(totalSupplyWhole), String(COMMUNITY_TOKEN_DECIMALS));
  if (baseUnits === null) return null;
  const curveBase = bondingCurveAllocationBaseUnits(baseUnits, promoBps);
  if (curveBase <= BigInt(0)) return null;
  const scale = BigInt(10) ** BigInt(COMMUNITY_TOKEN_DECIMALS);
  const curveWhole = curveBase / scale;
  if (curveWhole <= BigInt(0)) return null;
  const spot = VIRTUAL_NATIVE_RESERVE_PPL / Number(curveWhole);
  return {
    spotPplPerWholeToken: spot,
    bondingCurveWholeTokens: curveWhole,
    bondingCurveBaseUnits: curveBase,
    totalSupplyWhole,
  };
}

/** Inverse estimate: smallest whole supply (≥ protocol min) whose spot is at or below `targetPplPerWhole`. */
export function formatSpotPpl(value: number): string {
  if (value >= 0.01) return value.toFixed(4).replace(/\.?0+$/, "");
  if (value >= 0.0001) return value.toFixed(6).replace(/\.?0+$/, "");
  return value.toExponential(2);
}

export function supplyWholeForMaxSpotPpl(targetPplPerWhole: number, promoBps: PromoBps = 0): bigint | null {
  if (!Number.isFinite(targetPplPerWhole) || targetPplPerWhole <= 0) return null;
  // spot ≈ 60 / curveWhole; curveWhole ≈ floor(supply * 60% / 100) with promo shrinking curve only.
  const approxCurve = VIRTUAL_NATIVE_RESERVE_PPL / targetPplPerWhole;
  let supply =
    (BigInt(Math.ceil(approxCurve * (100 / 60))) + BigInt(999_999)) / BigInt(1_000_000) * BigInt(1_000_000);
  if (supply < BigInt(MIN_TOKEN_SUPPLY_WHOLE)) supply = BigInt(MIN_TOKEN_SUPPLY_WHOLE);
  // Walk supply up until spot <= target (coarser supply = lower price).
  for (let i = 0; i < 48; i += 1) {
    const spot = launchSpotFromSupplyWhole(supply, promoBps);
    if (!spot) return null;
    if (spot.spotPplPerWholeToken <= targetPplPerWhole * 1.001) return supply;
    supply += BigInt(1_000_000);
  }
  return supply;
}