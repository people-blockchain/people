import { test } from "node:test";
import assert from "node:assert/strict";
import {
  earlyEntryMultiplier,
  EARLY_MULTIPLIER_TIER_1,
  EARLY_MULTIPLIER_TIER_2,
  EARLY_MULTIPLIER_TIER_3,
  EARLY_MULTIPLIER_DEFAULT,
  EARLY_TIER_1_MAX,
  EARLY_TIER_2_MAX,
  EARLY_TIER_3_MAX,
  FOUNDER_ACTION_CONFIG,
  FOUNDER_STAKE_MIN_PPL,
  FOUNDER_SWAP_MIN_PPL,
  normalizeCountryCode,
} from "../src/lib/founders/config.ts";
import { computePointsAward } from "../src/lib/founders/points.ts";
import {
  stakeMeetsMinimumAmount,
  swapMeetsMinimumAmount,
  isClosedInteractionClique,
} from "../src/lib/founders/antibot.ts";
import { estimatePplPerPoint, formatPplPerPointEstimate } from "../src/lib/founders/season-pool.ts";
import { isFounderVerifiedForFreeIcons, verificationPointsFactor } from "../src/lib/founders/verification.ts";
import {
  applyEarlySaleFee,
  canAccrueFounderRewards,
  computeUnlockedPersonalReward,
  earlySaleFeeBps,
  FOUNDER_STAKING_UNSTAKE_WAIT_DAYS,
  instantUnlockPortion,
  validatorAprWithFounderStakeBonus,
  weeklyVestSlice,
} from "../src/lib/founders/reward-rules.ts";

test("early entry multipliers follow plan tiers", () => {
  assert.equal(earlyEntryMultiplier(1), EARLY_MULTIPLIER_TIER_1);
  assert.equal(earlyEntryMultiplier(EARLY_TIER_1_MAX), EARLY_MULTIPLIER_TIER_1);
  assert.equal(earlyEntryMultiplier(EARLY_TIER_1_MAX + 1), EARLY_MULTIPLIER_TIER_2);
  assert.equal(earlyEntryMultiplier(EARLY_TIER_2_MAX), EARLY_MULTIPLIER_TIER_2);
  assert.equal(earlyEntryMultiplier(EARLY_TIER_2_MAX + 1), EARLY_MULTIPLIER_TIER_3);
  assert.equal(earlyEntryMultiplier(EARLY_TIER_3_MAX), EARLY_MULTIPLIER_TIER_3);
  assert.equal(earlyEntryMultiplier(EARLY_TIER_3_MAX + 1), EARLY_MULTIPLIER_DEFAULT);
});

test("normalizeCountryCode accepts ISO alpha-2", () => {
  assert.equal(normalizeCountryCode("ge"), "GE");
  assert.equal(normalizeCountryCode(" US "), "US");
  assert.equal(normalizeCountryCode("USA"), null);
  assert.equal(normalizeCountryCode("XX"), null);
});

test("computePointsAward applies verification factor, multiplier, and caps", () => {
  const actionConfig = FOUNDER_ACTION_CONFIG.swap;
  const first = computePointsAward({
    configBasePoints: actionConfig.basePoints,
    verificationFactor: 1,
    entryMultiplier: 5,
    actionConfig,
    alreadyTodayActionCount: 0,
    alreadyTodayPreMultiplierBase: 0,
  });
  assert.equal(first.ok, true);
  if (first.ok) assert.equal(first.awardedPoints, 250);

  const half = computePointsAward({
    configBasePoints: actionConfig.basePoints,
    verificationFactor: 0.5,
    entryMultiplier: 5,
    actionConfig,
    alreadyTodayActionCount: 0,
    alreadyTodayPreMultiplierBase: 0,
  });
  assert.equal(half.ok, true);
  if (half.ok) assert.equal(half.awardedPoints, 125);

  const capped = computePointsAward({
    configBasePoints: actionConfig.basePoints,
    verificationFactor: 1,
    entryMultiplier: 5,
    actionConfig,
    alreadyTodayActionCount: actionConfig.dailyCap,
    alreadyTodayPreMultiplierBase: 0,
  });
  assert.equal(capped.ok, false);
  if (!capped.ok) assert.equal(capped.reason, "action_cap");
});

test("verification points factor", () => {
  assert.equal(verificationPointsFactor(0), 0);
  assert.equal(verificationPointsFactor(1), 0.5);
  assert.equal(verificationPointsFactor(2), 1);
});

// M20-4: free icon generations are only for founders verified via Telegram (level 1) or a
// strong/human check such as Human Passport (level 2).
test("free icon generations require a verified founder level", () => {
  assert.equal(isFounderVerifiedForFreeIcons(0), false);
  assert.equal(isFounderVerifiedForFreeIcons(1), true);
  assert.equal(isFounderVerifiedForFreeIcons(2), true);
});

test("swap minimum and season pool estimate", () => {
  assert.equal(swapMeetsMinimumAmount(FOUNDER_SWAP_MIN_PPL), true);
  assert.equal(swapMeetsMinimumAmount(FOUNDER_SWAP_MIN_PPL - 0.01), false);
  assert.equal(estimatePplPerPoint(20_000_000, 1_000_000), 20);
  assert.equal(formatPplPerPointEstimate(20), "20.00");
});

test("stake minimum matches swap's anti-farming bar and has a daily cap", () => {
  assert.equal(stakeMeetsMinimumAmount(FOUNDER_STAKE_MIN_PPL), true);
  assert.equal(stakeMeetsMinimumAmount(FOUNDER_STAKE_MIN_PPL - 0.01), false);
  assert.equal(FOUNDER_ACTION_CONFIG.stake.dailyCap, 3);
});

test("unbonding wait matches the chain's 21-day staking.params.unbonding_time", () => {
  assert.equal(FOUNDER_STAKING_UNSTAKE_WAIT_DAYS, 21);
});

test("closed discover pair with only each other is treated as clique", () => {
  const graph = new Map([
    ["a", new Set(["b"])],
    ["b", new Set(["a"])],
  ]);
  assert.equal(isClosedInteractionClique(graph, "a", "b"), true);
});

test("founder registration uses entry multiplier from founder number", () => {
  const founderNumber = 42_000;
  const multiplier = earlyEntryMultiplier(founderNumber);
  assert.equal(multiplier, 3);
});

test("without PoH nothing accrues", () => {
  assert.equal(canAccrueFounderRewards(false), false);
  assert.equal(
    computeUnlockedPersonalReward({
      totalReward: 1000,
      pohVerified: false,
      weeksElapsed: 10,
      isWeekActive: () => true,
    }),
    0,
  );
});

test("mainnet vesting: 10% instant plus weekly 90% when active", () => {
  const total = 10_000;
  assert.equal(instantUnlockPortion(total), 1000);
  assert.equal(weeklyVestSlice(total), (9000 / 52));
  const unlocked = computeUnlockedPersonalReward({
    totalReward: total,
    pohVerified: true,
    weeksElapsed: 4,
    isWeekActive: () => true,
  });
  assert.equal(unlocked, 1000 + 4 * weeklyVestSlice(total));
});

test("activity pause skips inactive weeks", () => {
  const total = 5200;
  const slice = weeklyVestSlice(total);
  const unlocked = computeUnlockedPersonalReward({
    totalReward: total,
    pohVerified: true,
    weeksElapsed: 4,
    isWeekActive: (w) => w !== 2,
  });
  assert.equal(unlocked, instantUnlockPortion(total) + 3 * slice);
});

test("early sale fee is 10% on day 0 and 0% on day 30", () => {
  assert.equal(earlySaleFeeBps(0), 1000);
  assert.equal(earlySaleFeeBps(30), 0);
  assert.equal(earlySaleFeeBps(15), 500);
  const sale = applyEarlySaleFee(1000, 0);
  assert.equal(sale.feeToCommunityPool, 100);
  assert.equal(sale.netToSeller, 900);
});

test("founder staking bonus adds 25% to APR rate", () => {
  assert.equal(validatorAprWithFounderStakeBonus(800), 1000);
  assert.equal(validatorAprWithFounderStakeBonus(400), 500);
});
