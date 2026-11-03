/**
 * Public-site presentation constants for the selling landing.
 *
 * These numbers mirror approved / runtime economics for display only.
 * This file does not change protocol, Token Factory, BondingCurveEngine,
 * Growth Pool settlement, fee routing, or referral engines.
 */

/** Mandatory Token Factory community allocation at launch (always credited to the token's community vault). */
export const TOKEN_COMMUNITY_ALLOCATION_PCT = 10;

/**
 * Public headline cap when the creator chooses curve leftovers for the community pool at launch.
 * Not guaranteed on every launch (default leftover mode burns unsold curve tokens).
 */
export const TOKEN_COMMUNITY_SHARE_MAX_PCT = 27;

/** Rounded public estimate of curve leftovers that may join the pool (~⅙ of supply in typical migration math). */
export const TOKEN_COMMUNITY_CURVE_LEFTOVER_APPROX_PCT = 17;

/**
 * Headline percentage for hero stats, diagrams, and OG labels ("Up to 27%").
 * Distinct from the guaranteed launch slice (`TOKEN_COMMUNITY_ALLOCATION_PCT`).
 */
export const TOKEN_COMMUNITY_SHARE_PCT = TOKEN_COMMUNITY_SHARE_MAX_PCT;

export const TOKEN_COMMUNITY_SHARE_HEADLINE = `Up to ${TOKEN_COMMUNITY_SHARE_MAX_PCT}%` as const;

/** Owner-approved EN explanation (locale JSON should mirror; asserted in copy guards). */
export const TOKEN_COMMUNITY_SHARE_EXPLANATION_EN =
  "10% of every new token goes to its community pool at launch, guaranteed. The rest of the curve leftovers (~17%) goes to the community pool or is burned — the creator chooses once at launch.";

export const TOKEN_COMMUNITY_TIMELOCK_NOTE_EN =
  "The pool is governed by the PEOPLE timelock and paid out to verified people over time, not instantly; this is not a yield promise.";

/** Public copy uses "Up to 27%", not bare "27%" or open-ended "27%+". */
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
