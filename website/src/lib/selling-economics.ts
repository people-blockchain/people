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
 * Community share of a standard launch as presented to the public: the 10%
 * launch allocation **plus** the ~16.7% of unsold bonding-curve inventory that
 * P0-4 routes into the token's own community pool (not the treasury, not a
 * burn) when the curve migrates. Rounded to 27 for display.
 *
 * The 10% launch allocation is still the protocol rule and stays
 * `TOKEN_COMMUNITY_ALLOCATION_PCT`; this constant is the headline figure the
 * site, litepaper and tokenomics copy use for the community share.
 */
export const TOKEN_COMMUNITY_SHARE_PCT = 10;

/**
 * Docs (`TOKEN-ECONOMY.md` §4, `ECONOMICS.md` §9) confirm a mandatory 10%
 * Community Pool allocation at launch; the P0-4 decision adds the unsold
 * curve remainder (~16.7%) to the same pool at migration, so the public figure
 * is the fixed 10% share, not an open-ended "10%+" or "10%+" range.
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
