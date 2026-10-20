/**
 * Single source of truth for public tokenomics numbers and unlock math.
 * Display-only; does not change protocol economics.
 */

import { CURVE, SALE } from "./sale/config";
import { maxRaiseUsd, raisedUsd, spotPriceUsd } from "./sale/curve";
import { MODEL_A_FEE_SPLIT } from "./selling-economics";

export const TOTAL_SUPPLY_PPL = 1_000_000_000;
export const TICKER = "PPL";

export type AllocationId =
  | "community"
  | "validators"
  | "team"
  | "treasury"
  | "sale"
  | "liquidity";

export type GenesisBucket = {
  id: AllocationId;
  pct: number;
  amountPpl: number;
  color: string;
};

export const GENESIS_ALLOCATIONS: GenesisBucket[] = [
  { id: "community", pct: 35, amountPpl: 350_000_000, color: "#2dd4bf" },
  { id: "validators", pct: 20, amountPpl: 200_000_000, color: "#6366f1" },
  { id: "team", pct: 15, amountPpl: 150_000_000, color: "#f59e0b" },
  { id: "treasury", pct: 15, amountPpl: 150_000_000, color: "#a855f7" },
  { id: "sale", pct: 10, amountPpl: 100_000_000, color: "#22c55e" },
  { id: "liquidity", pct: 5, amountPpl: 50_000_000, color: "#3b82f6" },
];

/** Community + rewards fund: linear unlock over 6 years (72 months). */
const COMMUNITY_MONTHS = 72;

/** Validator pool (200M PPL): years 1–4 pay 6/5/5/4% of total supply per year (60/50/50/40M). */
const VALIDATOR_ANNUAL_PPL = [60_000_000, 50_000_000, 50_000_000, 40_000_000] as const;
const VALIDATOR_MONTHS = VALIDATOR_ANNUAL_PPL.length * 12;

/** Team (15%): 0% at launch, 6-month cliff, then 18 monthly tranches (24 months total). */
const TEAM_LAUNCH_PCT = 0;
const TEAM_CLIFF_MONTHS = 6;
const TEAM_VEST_MONTHS = 18;

/** Community sale on People: 25% at genesis, remainder over 9 monthly tranches. */
const SALE_LAUNCH_PCT = 0.25;
const SALE_VEST_MONTHS = 9;

/** LP allocation stays out of circulating supply until lock ends (2+ years). */
export const LIQUIDITY_LOCK_MONTHS = 24;

export const CIRCULATING_HORIZON_MONTHS = 120;

/**
 * Public PPL sale curve parameters — same source as `/buy` and `/api/sale`.
 * Math is exponential (`src/lib/sale/curve.ts`), not the old linear model.
 */
export const BONDING_CURVE = {
  supplyPpl: CURVE.supplyPpl,
  durationDays: SALE.durationDays,
  priceStartUsdt: CURVE.startPriceUsd,
  /** Hard ceiling on the curve only; after the sale ends the market sets price. */
  priceEndUsdt: CURVE.ceilingPriceUsd,
  /** The full curve raise if all 100M PPL sell; the sale can also end at 24 months. */
  maxRaiseUsdt: maxRaiseUsd(),
  sellFeePct: SALE.sellFeePct,
  maxPerBuyUsdt: SALE.maxPerBuyUsd,
  maxPerDayUsdt: SALE.maxPerDayUsd,
  cooldownSeconds: SALE.cooldownSeconds,
} as const;

/** Where the raise goes when the sale ends. */
export const RAISE_SPLIT = [
  { id: "liquidity", pct: SALE.liquiditySharePct },
  { id: "multisig", pct: SALE.multisigSharePct },
] as const;

export const NETWORK_FEE_SPLIT = MODEL_A_FEE_SPLIT;

export const VALIDATOR_EMISSION_SCHEDULE = VALIDATOR_ANNUAL_PPL.map((amountPpl, index) => ({
  year: index + 1,
  pctOfSupply: [6, 5, 5, 4][index],
  amountPpl,
}));

/** PPL unlocked from this bucket during calendar month `month` (0 = genesis month). */
export function monthlyUnlockPpl(id: AllocationId, month: number): number {
  const bucket = GENESIS_ALLOCATIONS.find((b) => b.id === id);
  if (!bucket || month < 0) return 0;

  switch (id) {
    case "community": {
      if (month >= COMMUNITY_MONTHS) return 0;
      return bucket.amountPpl / COMMUNITY_MONTHS;
    }
    case "validators": {
      if (month >= VALIDATOR_MONTHS) return 0;
      const yearIndex = Math.floor(month / 12);
      return VALIDATOR_ANNUAL_PPL[yearIndex] / 12;
    }
    case "team": {
      const launch = bucket.amountPpl * TEAM_LAUNCH_PCT;
      const rest = bucket.amountPpl - launch;
      if (month === 0) return launch;
      if (month <= TEAM_CLIFF_MONTHS) return 0;
      const vestMonth = month - TEAM_CLIFF_MONTHS;
      if (vestMonth < 1 || vestMonth > TEAM_VEST_MONTHS) return 0;
      return rest / TEAM_VEST_MONTHS;
    }
    case "treasury":
      return 0;
    case "sale": {
      const launch = bucket.amountPpl * SALE_LAUNCH_PCT;
      const rest = bucket.amountPpl - launch;
      if (month === 0) return launch;
      if (month >= 1 && month <= SALE_VEST_MONTHS) return rest / SALE_VEST_MONTHS;
      return 0;
    }
    case "liquidity":
      if (month === 0) return bucket.amountPpl;
      return 0;
    default:
      return 0;
  }
}

/** Cumulative unlocked PPL for a bucket through end of `month` (inclusive). */
export function cumulativeUnlockPpl(id: AllocationId, month: number): number {
  let sum = 0;
  for (let m = 0; m <= month; m++) sum += monthlyUnlockPpl(id, m);
  return Math.min(sum, GENESIS_ALLOCATIONS.find((b) => b.id === id)?.amountPpl ?? 0);
}

/** Liquid circulating PPL at end of month (excludes DAO treasury and LP lock). */
export function circulatingSupplyAtMonth(month: number): number {
  let total = 0;
  for (const { id } of GENESIS_ALLOCATIONS) {
    if (id === "treasury") continue;
    const unlocked = cumulativeUnlockPpl(id, month);
    if (id === "liquidity") {
      if (month < LIQUIDITY_LOCK_MONTHS) continue;
      total += unlocked;
    } else {
      total += unlocked;
    }
  }
  return total;
}

export function circulatingSeries(maxMonth = CIRCULATING_HORIZON_MONTHS): { month: number; ppl: number }[] {
  return Array.from({ length: maxMonth + 1 }, (_, month) => ({
    month,
    ppl: circulatingSupplyAtMonth(month),
  }));
}

export function unlockSeriesForBucket(id: AllocationId, maxMonth = CIRCULATING_HORIZON_MONTHS): number[] {
  return Array.from({ length: maxMonth + 1 }, (_, month) => cumulativeUnlockPpl(id, month));
}

/** Spot USDT price after `soldPpl` tokens have been purchased on the curve. */
export function bondingCurvePriceUsdt(soldPpl: number): number {
  return spotPriceUsd(soldPpl);
}

/** USDT cost to buy `amountPpl` starting from `soldPpl` already sold. */
export function bondingCurveCostUsdt(soldPpl: number, amountPpl: number): number {
  const { supplyPpl } = BONDING_CURVE;
  const s0 = Math.min(Math.max(soldPpl, 0), supplyPpl);
  const s1 = Math.min(s0 + Math.max(amountPpl, 0), supplyPpl);
  if (s1 <= s0) return 0;
  return raisedUsd(s1) - raisedUsd(s0);
}

export function bondingCurveSamples(points = 40): { soldPct: number; priceUsdt: number }[] {
  const { supplyPpl } = BONDING_CURVE;
  return Array.from({ length: points + 1 }, (_, i) => {
    const soldPct = i / points;
    const sold = soldPct * supplyPpl;
    return { soldPct, priceUsdt: bondingCurvePriceUsdt(sold) };
  });
}

export type PurchaseRow = {
  soldPct: number;
  priceUsdt: number;
  cumulativeUsdt: number;
  tranchePpl: number;
};

export function publicPurchaseTable(): PurchaseRow[] {
  const { supplyPpl } = BONDING_CURVE;
  const marks = [0, 0.25, 0.5, 0.75, 1];
  return marks.map((soldPct, i) => {
    const soldBefore = i === 0 ? 0 : marks[i - 1] * supplyPpl;
    const soldAt = soldPct * supplyPpl;
    const tranche = soldAt - soldBefore;
    const cumulativeUsdt =
      i === 0 ? 0 : bondingCurveCostUsdt(0, soldAt);
    return {
      soldPct,
      priceUsdt: bondingCurvePriceUsdt(soldAt),
      cumulativeUsdt,
      tranchePpl: tranche,
    };
  });
}

export function formatPpl(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function formatUsdt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
