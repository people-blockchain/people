/**
 * Pure bonding-curve math for the PPL sale. No I/O, no React, no env reads —
 * every function here is a function of its arguments and `CURVE`, so the
 * numbers on `/buy` can be checked against `ppl-curve-final.md` in a unit test
 * (`curve.test.ts`).
 *
 * Model (owner-approved 2026-10-15):
 *   x               = PPL sold, in millions
 *   price(x)        = p0 · e^(k·x)                      [USD per PPL]
 *   raised(x)       = (p0/k) · (e^(k·x) − 1) · 1e6      [USD, the integral]
 *   soldFor(raised) = ln(1 + raised·k / (p0·1e6)) / k   [the inverse]
 */

import { CURVE } from "./config";

const { supplyPpl, startPriceUsd: P0, k } = CURVE;

const PPL_PER_MILLION = 1_000_000;

function clampSold(soldPpl: number): number {
  if (!Number.isFinite(soldPpl) || soldPpl <= 0) return 0;
  return Math.min(soldPpl, supplyPpl);
}

/** Spot price in USD per PPL after `soldPpl` have been sold. */
export function spotPriceUsd(soldPpl: number): number {
  const x = clampSold(soldPpl) / PPL_PER_MILLION;
  return P0 * Math.exp(k * x);
}

/** Total USD the curve has taken in (net reserve) at `soldPpl` sold. */
export function raisedUsd(soldPpl: number): number {
  const x = clampSold(soldPpl) / PPL_PER_MILLION;
  return (P0 / k) * (Math.exp(k * x) - 1) * PPL_PER_MILLION;
}

/** Inverse of `raisedUsd` with no supply clamp — lets callers see an overrun. */
function soldPplForRaisedUsdUnclamped(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return (Math.log(1 + (usd * k) / (P0 * PPL_PER_MILLION)) / k) * PPL_PER_MILLION;
}

/** Inverse of `raisedUsd`: how many PPL are sold once `usd` has been raised. */
export function soldPplForRaisedUsd(usd: number): number {
  return Math.min(soldPplForRaisedUsdUnclamped(usd), supplyPpl);
}

/** The whole curve if every PPL were sold. Graduation happens well before this. */
export function maxRaiseUsd(): number {
  return raisedUsd(supplyPpl);
}

/** PPL sold, spot price and raise at the graduation point. */
export function graduation(): { raisedUsd: number; soldPpl: number; priceUsd: number } {
  const soldPpl = soldPplForRaisedUsd(CURVE.graduationRaiseUsd);
  return { raisedUsd: CURVE.graduationRaiseUsd, soldPpl, priceUsd: spotPriceUsd(soldPpl) };
}

export type BuyQuote = {
  /** USD actually spent (less than requested only if the curve runs out of PPL). */
  usdIn: number;
  /** PPL received. */
  pplOut: number;
  /** usdIn / pplOut. */
  avgPriceUsd: number;
  /** Spot price before the trade. */
  priceBeforeUsd: number;
  /** Spot price the next buyer sees. */
  priceAfterUsd: number;
  /** True when the requested amount was trimmed to the remaining supply. */
  partial: boolean;
};

/**
 * What `usdIn` buys at `soldPpl` already sold. Integrating the curve, not
 * multiplying by the spot price: the price rises inside the trade itself.
 */
export function quoteBuy(soldPpl: number, usdIn: number): BuyQuote {
  const sold = clampSold(soldPpl);
  const priceBeforeUsd = spotPriceUsd(sold);
  if (!Number.isFinite(usdIn) || usdIn <= 0 || sold >= supplyPpl) {
    return {
      usdIn: 0,
      pplOut: 0,
      avgPriceUsd: priceBeforeUsd,
      priceBeforeUsd,
      priceAfterUsd: priceBeforeUsd,
      partial: sold >= supplyPpl,
    };
  }
  const reserveBefore = raisedUsd(sold);
  const soldAfterRaw = soldPplForRaisedUsdUnclamped(reserveBefore + usdIn);
  const soldAfter = Math.min(soldAfterRaw, supplyPpl);
  const partial = soldAfterRaw > supplyPpl;
  const pplOut = soldAfter - sold;
  const spent = partial ? raisedUsd(supplyPpl) - reserveBefore : usdIn;
  return {
    usdIn: spent,
    pplOut,
    avgPriceUsd: pplOut > 0 ? spent / pplOut : priceBeforeUsd,
    priceBeforeUsd,
    priceAfterUsd: spotPriceUsd(soldAfter),
    partial,
  };
}

export type SellQuote = {
  pplIn: number;
  /** USD the curve releases before the sell fee. */
  grossUsd: number;
  /** Sell fee, which goes to PPL buyback. */
  feeUsd: number;
  /** USD the seller receives. */
  netUsd: number;
  priceBeforeUsd: number;
  priceAfterUsd: number;
};

/** Selling `pplIn` back into the curve walks the same curve back down. */
export function quoteSell(soldPpl: number, pplIn: number, sellFeePct: number): SellQuote {
  const sold = clampSold(soldPpl);
  const priceBeforeUsd = spotPriceUsd(sold);
  const amount = Math.min(Math.max(Number.isFinite(pplIn) ? pplIn : 0, 0), sold);
  if (amount <= 0) {
    return { pplIn: 0, grossUsd: 0, feeUsd: 0, netUsd: 0, priceBeforeUsd, priceAfterUsd: priceBeforeUsd };
  }
  const soldAfter = sold - amount;
  const grossUsd = raisedUsd(sold) - raisedUsd(soldAfter);
  const feeUsd = grossUsd * (sellFeePct / 100);
  return {
    pplIn: amount,
    grossUsd,
    feeUsd,
    netUsd: grossUsd - feeUsd,
    priceBeforeUsd,
    priceAfterUsd: spotPriceUsd(soldAfter),
  };
}

export type CurvePoint = { soldPpl: number; raisedUsd: number; priceUsd: number };

/**
 * Evenly spaced samples along the raise axis, for the chart. Sampling on
 * raise (not on PPL) keeps the x axis linear in dollars, which is the axis
 * the page labels.
 */
export function curveSamplesByRaise(toRaiseUsd: number, points = 72): CurvePoint[] {
  const max = Math.min(Math.max(toRaiseUsd, 0), maxRaiseUsd());
  return Array.from({ length: points + 1 }, (_, i) => {
    const r = (max * i) / points;
    const soldPpl = soldPplForRaisedUsd(r);
    return { soldPpl, raisedUsd: r, priceUsd: spotPriceUsd(soldPpl) };
  });
}

/** Price and PPL sold at each milestone marker, computed from the formula only. */
export function milestones(): CurvePoint[] {
  return CURVE.milestoneRaisesUsd.map((raise) => {
    const soldPpl = soldPplForRaisedUsd(raise);
    return { soldPpl, raisedUsd: raise, priceUsd: spotPriceUsd(soldPpl) };
  });
}

/** 0–1 progress towards graduation. */
export function graduationProgress(raisedSoFarUsd: number): number {
  if (!Number.isFinite(raisedSoFarUsd) || raisedSoFarUsd <= 0) return 0;
  return Math.min(raisedSoFarUsd / CURVE.graduationRaiseUsd, 1);
}
