/**
 * Public-site presentation constants for the selling landing.
 *
 * These numbers mirror approved / runtime economics for display only.
 * This file does not change protocol, Token Factory, BondingCurveEngine,
 * Growth Pool settlement, fee routing, or referral engines.
 */

/** Mandatory Token Factory community allocation of a standard launch. */
export const TOKEN_COMMUNITY_ALLOCATION_PCT = 10;

/**
 * Docs (`TOKEN-ECONOMY.md` §4, `ECONOMICS.md` §9) confirm a mandatory 10%
 * Community Pool allocation. Remaining launch percentages are provisional.
 * No approved optional extra community allocation exists, so public copy
 * must say **10%**, not "10%+".
 */
export const TOKEN_COMMUNITY_ALLOCATION_PLUS = false;

/** Approved Model A split of eligible integer network fees (percent). */
export const MODEL_A_FEE_SPLIT = [
  { id: "validators", pct: 30, tone: "brand" as const },
  { id: "community", pct: 25, tone: "value" as const },
  { id: "treasury", pct: 20, tone: "violet" as const },
  { id: "liquidity", pct: 10, tone: "warm" as const },
  { id: "growth", pct: 15, tone: "brand" as const },
  { id: "burn", pct: 0, tone: "neutral" as const },
] as const;

/**
 * Public mirror of runtime Beta Growth payout weights:
 * `GROWTH_L1_WEIGHT` / `GROWTH_L2_WEIGHT` in
 * `packages/core/src/growth-settlement.ts` in the People's node monorepo.
 *
 * Shares of the Growth reward budget (not of total network fees).
 * Growth Pool itself remains 15% of eligible fees (Model A).
 * Public surfaces expose only these two paid lines. Website does not import
 * protocol packages.
 */
export const GROWTH_L1_WEIGHT = 70;
export const GROWTH_L2_WEIGHT = 30;

export const GROWTH_PAID_LINES = [
  { id: "L1", pct: 70 }, // must equal GROWTH_L1_WEIGHT (runtime mirror)
  { id: "L2", pct: 30 }, // must equal GROWTH_L2_WEIGHT (runtime mirror)
] as const;

export const GROWTH_PAID_LINE_IDS = GROWTH_PAID_LINES.map((line) => line.id);
