import {
  FOUNDER_DAILY_TOTAL_CAP,
  type FounderActionConfig,
} from "./config.ts";

export type PointsAwardInput = {
  /** Config base points before verification factor. */
  configBasePoints: number;
  verificationFactor: number;
  entryMultiplier: number;
  actionConfig: FounderActionConfig;
  alreadyTodayActionCount: number;
  /** Sum of credited base points today (before entry multiplier). */
  alreadyTodayPreMultiplierBase: number;
};

export type PointsAwardResult =
  | { ok: true; creditedBase: number; awardedPoints: number }
  | { ok: false; reason: "action_cap" | "daily_total_cap" | "zero" };

export function computePointsAward(input: PointsAwardInput): PointsAwardResult {
  const {
    configBasePoints,
    verificationFactor,
    entryMultiplier,
    actionConfig,
    alreadyTodayActionCount,
    alreadyTodayPreMultiplierBase,
  } = input;

  if (configBasePoints <= 0 || verificationFactor <= 0 || entryMultiplier <= 0) {
    return { ok: false, reason: "zero" };
  }
  if (alreadyTodayActionCount >= actionConfig.dailyCap) {
    return { ok: false, reason: "action_cap" };
  }
  if (alreadyTodayPreMultiplierBase >= FOUNDER_DAILY_TOTAL_CAP) {
    return { ok: false, reason: "daily_total_cap" };
  }

  const effectiveBase = Math.floor(configBasePoints * verificationFactor);
  if (effectiveBase <= 0) {
    return { ok: false, reason: "zero" };
  }

  const roomPreMult = FOUNDER_DAILY_TOTAL_CAP - alreadyTodayPreMultiplierBase;
  const creditedBase = Math.min(effectiveBase, roomPreMult);
  if (creditedBase <= 0) {
    return { ok: false, reason: "daily_total_cap" };
  }

  const awardedPoints = Math.floor(creditedBase * entryMultiplier);
  if (awardedPoints <= 0) {
    return { ok: false, reason: "zero" };
  }
  return { ok: true, creditedBase, awardedPoints };
}
