/**
 * PplCurveHubV2 sale constants.
 *
 * The contract is a separate deployment from the original curve hub. Keep every
 * public number here so the panel, the tests and the copy cannot drift apart.
 */

export const V2_SALE = {
  /** Verified people only for the first 7 days after the contract opens. */
  whitelistDays: 7,
  /** Each purchase unlocks sell-back after this hold. */
  holdDays: 30,
  minPerBuyUsd: 10,
  maxPerBuyUsd: 500,
  maxPerDayUsd: 2_000,
  /** Minimum gap between two purchases for the same address (`BUY_COOLDOWN`). */
  cooldownSeconds: 60,
  /** 1% slippage on the estimated PPL output. */
  slippageBps: 100,
  /** Share of each purchase kept in the hub as the sell-back reserve (`RESERVE_BPS`, SPEC D1). */
  reserveSharePct: 50,
  /** Treasury / owner Safe threshold (SPEC D1: 2-of-3). */
  treasurySigners: { m: 2, n: 3 },
  /** Public notice before the reserve can move to liquidity (`LIQUIDITY_RELEASE_DELAY`, SPEC §5.4). */
  releaseNoticeDays: 30,
} as const;

export const V2_PHASES = {
  NotOpen: 0,
  Whitelist: 1,
  Open: 2,
  Expired: 3,
  Graduated: 4,
} as const;

export type V2Phase = (typeof V2_PHASES)[keyof typeof V2_PHASES];

export const V2_PHASE_NAMES: Record<V2Phase, "not-open" | "whitelist" | "open" | "expired" | "graduated"> = {
  0: "not-open",
  1: "whitelist",
  2: "open",
  3: "expired",
  4: "graduated",
};

export const V2_PREVIEW_STATES = ["unverified", "verified", "success", "partial"] as const;
export type V2PreviewState = (typeof V2_PREVIEW_STATES)[number];

export function isV2PreviewState(value: unknown): value is V2PreviewState {
  return typeof value === "string" && (V2_PREVIEW_STATES as readonly string[]).includes(value);
}
