import { BONDING_CURVE, bondingCurveCostUsdt, bondingCurvePriceUsdt } from "@/lib/tokenomics";
import { SALE } from "@/lib/sale/config";

export const SALE_MIN_USDT = SALE.minPerBuyUsd;
export const SALE_MAX_USDT = SALE.maxPerBuyUsd;

export function soldPplFromOrders(totalSoldPpl: number): number {
  return Math.min(Math.max(totalSoldPpl, 0), BONDING_CURVE.supplyPpl);
}

export function quotePplForUsdt(soldPpl: number, usdtBudget: number): { pplOut: number; usdtUsed: number; spotUsdt: number } {
  const sold = soldPplFromOrders(soldPpl);
  const budget = Math.min(Math.max(usdtBudget, 0), SALE_MAX_USDT);
  if (budget < SALE_MIN_USDT) {
    return { pplOut: 0, usdtUsed: 0, spotUsdt: bondingCurvePriceUsdt(sold) };
  }
  const remaining = BONDING_CURVE.supplyPpl - sold;
  if (remaining <= 0) {
    return { pplOut: 0, usdtUsed: 0, spotUsdt: bondingCurvePriceUsdt(sold) };
  }
  let lo = 0;
  let hi = remaining;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const cost = bondingCurveCostUsdt(sold, mid);
    if (cost <= budget) lo = mid;
    else hi = mid - 1;
  }
  const pplOut = lo;
  const usdtUsed = pplOut > 0 ? bondingCurveCostUsdt(sold, pplOut) : 0;
  return { pplOut, usdtUsed, spotUsdt: bondingCurvePriceUsdt(sold + pplOut) };
}

/** Unique payment amount in stablecoin micro-units (6 decimals). */
export function uniquePaymentMicroUsdt(baseMicro: bigint, orderSalt: number): bigint {
  const jitter = BigInt((orderSalt % 97_000) + 1_000); // 0.001000 – 0.097999 USDT
  return baseMicro + jitter;
}

export function microUsdtToDecimal(micro: bigint): string {
  const whole = micro / BigInt(1_000_000);
  const frac = (micro % BigInt(1_000_000)).toString().padStart(6, "0");
  return `${whole}.${frac}`.replace(/\.?0+$/, "") || "0";
}

export function decimalUsdtToMicro(amount: number): bigint {
  return BigInt(Math.round(amount * 1_000_000));
}
