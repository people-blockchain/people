import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ISSUER_REFERRAL_DEFAULT,
  REFERRAL_DAILY_POINTS_CAP,
  REFERRAL_L1_POINTS,
  REFERRAL_L2_BPS,
  REFERRAL_MAX_ACTIVE_INVITEES,
  REFERRAL_PPL_PER_POINT,
  REFERRAL_SEASON_1_POOL_PPL,
  REFERRAL_POOL_PPL,
  REFERRAL_VEST_WEEKS,
  applyReferralLimits,
  claimableAmount,
  computeIssuerPurchaseCredits,
  isActiveInvitee,
  isReferralActiveAction,
  l2PointsFromL1,
  normalizeIssuerReferralConfig,
  seasonPoolPoints,
  staysActiveSevenDays,
  totalVested,
  vestedReferralAmount,
  vestingScheduleBps,
  weeksSince,
} from "../src/lib/founders/referral.ts";

const active = { verified: true, walletCreated: true, realActionCount: 1, isBot: false };

test("funding: 15M referral pool, 6M season 1, 1.5% of 1B supply", () => {
  assert.equal(REFERRAL_POOL_PPL, 15_000_000);
  assert.equal(REFERRAL_POOL_PPL / 1_000_000_000, 0.015);
  assert.equal(REFERRAL_SEASON_1_POOL_PPL, 6_000_000);
  assert.ok(REFERRAL_SEASON_1_POOL_PPL < REFERRAL_POOL_PPL);
});

test("inactive invitee earns 0: each active condition is required", () => {
  assert.equal(isActiveInvitee(active), true);
  assert.equal(isActiveInvitee({ ...active, verified: false }), false, "registration only");
  assert.equal(isActiveInvitee({ ...active, walletCreated: false }), false);
  assert.equal(isActiveInvitee({ ...active, realActionCount: 0 }), false);
  assert.equal(isActiveInvitee({ ...active, isBot: true }), false);
});

test("only real testnet actions prove activity (likes, follows, invite do not)", () => {
  for (const a of ["swap", "stake", "pool_create", "nft_mint", "token_launch", "governance_vote"]) {
    assert.equal(isReferralActiveAction(a), true, a);
  }
  for (const a of ["discover_reaction", "discover_follow", "invite", "register"]) {
    assert.equal(isReferralActiveAction(a), false, a);
  }
});

test("L1 = 100 points, L2 = 30% of L1 (floored)", () => {
  assert.equal(REFERRAL_L1_POINTS, 100);
  assert.equal(REFERRAL_L2_BPS, 3000);
  assert.equal(l2PointsFromL1(100), 30);
  assert.equal(l2PointsFromL1(10), 3);
  assert.equal(l2PointsFromL1(20), 6);
  assert.equal(l2PointsFromL1(3), 0);
  assert.equal(l2PointsFromL1(0), 0);
  assert.equal(l2PointsFromL1(-5), 0);
});

test("limits: 50 active invitees per season, then rejected", () => {
  const base = {
    desiredPoints: 100,
    enforceInviteeCap: true,
    maxActiveInvitees: REFERRAL_MAX_ACTIVE_INVITEES,
    alreadyTodayPoints: 0,
    poolRemainingPoints: 1_000_000,
  };
  assert.equal(REFERRAL_MAX_ACTIVE_INVITEES, 50);
  assert.deepEqual(applyReferralLimits({ ...base, alreadyActiveInvitees: 49 }), {
    ok: true,
    points: 100,
    truncated: false,
  });
  assert.deepEqual(applyReferralLimits({ ...base, alreadyActiveInvitees: 50 }), {
    ok: false,
    reason: "invitee_cap",
  });
  // Ambassador with manual approval may exceed 50.
  assert.equal(applyReferralLimits({ ...base, alreadyActiveInvitees: 50, maxActiveInvitees: 200 }).ok, true);
  // Extras and L2 are not invitee-capped.
  assert.equal(
    applyReferralLimits({ ...base, alreadyActiveInvitees: 50, enforceInviteeCap: false }).ok,
    true,
  );
});

test("limits: daily cap equals the main program cap and truncates the last credit", () => {
  const base = {
    desiredPoints: 100,
    alreadyActiveInvitees: 0,
    enforceInviteeCap: true,
    maxActiveInvitees: 50,
    poolRemainingPoints: 1_000_000,
  };
  assert.equal(REFERRAL_DAILY_POINTS_CAP, 1_000);
  assert.deepEqual(applyReferralLimits({ ...base, alreadyTodayPoints: 950 }), {
    ok: true,
    points: 50,
    truncated: true,
  });
  assert.deepEqual(applyReferralLimits({ ...base, alreadyTodayPoints: 1_000 }), {
    ok: false,
    reason: "daily_cap",
  });
});

test("season 1 pool exhaustion: credits truncate to the remainder, then stop; no minting", () => {
  assert.equal(seasonPoolPoints(), REFERRAL_SEASON_1_POOL_PPL / REFERRAL_PPL_PER_POINT);
  let spent = seasonPoolPoints() - 130;
  const credit = () => {
    const r = applyReferralLimits({
      desiredPoints: 100,
      alreadyActiveInvitees: 0,
      enforceInviteeCap: true,
      maxActiveInvitees: 50,
      alreadyTodayPoints: 0,
      poolRemainingPoints: seasonPoolPoints() - spent,
    });
    if (r.ok) spent += r.points;
    return r;
  };
  assert.deepEqual(credit(), { ok: true, points: 100, truncated: false });
  assert.deepEqual(credit(), { ok: true, points: 30, truncated: true });
  assert.deepEqual(credit(), { ok: false, reason: "pool_empty" });
  assert.equal(spent, seasonPoolPoints(), "total spend never exceeds the pool");
});

test("stay_7d needs a real action at least 7 days after activation", () => {
  const day = 24 * 60 * 60 * 1000;
  const t0 = Date.UTC(2026, 0, 1);
  assert.equal(staysActiveSevenDays(t0, [t0]), false);
  assert.equal(staysActiveSevenDays(t0, [t0 + 6 * day]), false);
  assert.equal(staysActiveSevenDays(t0, [t0, t0 + 7 * day]), true);
});

test("vesting: 10% liquid at once, 90% weekly over 52 weeks, exact total", () => {
  const total = BigInt(1_000_000);
  assert.equal(REFERRAL_VEST_WEEKS, 52);
  assert.equal(vestedReferralAmount(total, 0), BigInt(100_000));
  assert.equal(vestedReferralAmount(total, 26), BigInt(100_000) + BigInt(450_000));
  assert.equal(vestedReferralAmount(total, 51) < total, true);
  assert.equal(vestedReferralAmount(total, 52), total);
  assert.equal(vestedReferralAmount(total, 500), total);
  // monotonic
  let prev = BigInt(0);
  for (let w = 0; w <= 60; w += 1) {
    const v = vestedReferralAmount(BigInt(12_345_679), w);
    assert.ok(v >= prev);
    prev = v;
  }
  const sched = vestingScheduleBps();
  assert.equal(sched[0].cumulativeBps, 1000);
  assert.equal(sched.at(-1).cumulativeBps, 10_000);
  assert.equal(sched.length, 53);
});

test("vesting claims: per-credit schedule, claimable never double counts", () => {
  const week = 7 * 24 * 60 * 60 * 1000;
  const t0 = Date.UTC(2026, 0, 1);
  const credits = [{ amount: BigInt(520_000), startMs: t0 }];
  assert.equal(weeksSince(t0, t0 + 2 * week + 1), 2);
  assert.equal(totalVested(credits, t0), BigInt(52_000));
  const at2 = totalVested(credits, t0 + 2 * week);
  assert.equal(at2, BigInt(52_000) + (BigInt(468_000) * BigInt(2)) / BigInt(52));
  assert.equal(claimableAmount(credits, BigInt(0), t0 + 2 * week), at2);
  assert.equal(claimableAmount(credits, at2, t0 + 2 * week), BigInt(0));
  assert.equal(claimableAmount(credits, at2 + BigInt(1), t0 + 2 * week), BigInt(0));
});

test("issuer option is OFF by default and needs an explicit opt-in", () => {
  assert.deepEqual(ISSUER_REFERRAL_DEFAULT, { enabled: false, allocationBps: 0, l1Bps: 0 });
  assert.deepEqual(normalizeIssuerReferralConfig({}), ISSUER_REFERRAL_DEFAULT);
  assert.deepEqual(normalizeIssuerReferralConfig({ enabled: false, allocationBps: 500 }), ISSUER_REFERRAL_DEFAULT);
  assert.deepEqual(normalizeIssuerReferralConfig({ enabled: "yes" }), ISSUER_REFERRAL_DEFAULT);
  const on = normalizeIssuerReferralConfig({ enabled: true });
  assert.equal(on.enabled, true);
  assert.equal(on.allocationBps, 500, "+5% example default");
  assert.equal(normalizeIssuerReferralConfig({ enabled: true, allocationBps: 0 }), null);
  assert.equal(normalizeIssuerReferralConfig({ enabled: true, allocationBps: 5000 }), null);
  assert.equal(normalizeIssuerReferralConfig({ enabled: true, l1Bps: 1.5 }), null);
});

test("issuer purchases: same 2 levels, L2 = 30% of L1, bounded by the allocation", () => {
  const credits = computeIssuerPurchaseCredits({
    purchaseAmount: BigInt(10_000),
    l1Bps: 500,
    remainingAllocation: BigInt(1_000_000),
    hasL2Beneficiary: true,
  });
  assert.deepEqual(credits, [
    { level: 1, amount: BigInt(500) },
    { level: 2, amount: BigInt(150) },
  ]);
  assert.deepEqual(
    computeIssuerPurchaseCredits({
      purchaseAmount: BigInt(10_000),
      l1Bps: 500,
      remainingAllocation: BigInt(1_000_000),
      hasL2Beneficiary: false,
    }),
    [{ level: 1, amount: BigInt(500) }],
  );
  const tight = computeIssuerPurchaseCredits({
    purchaseAmount: BigInt(10_000),
    l1Bps: 500,
    remainingAllocation: BigInt(560),
    hasL2Beneficiary: true,
  });
  assert.deepEqual(tight, [
    { level: 1, amount: BigInt(500) },
    { level: 2, amount: BigInt(60) },
  ]);
  assert.deepEqual(
    computeIssuerPurchaseCredits({
      purchaseAmount: BigInt(10_000),
      l1Bps: 500,
      remainingAllocation: BigInt(0),
      hasL2Beneficiary: true,
    }),
    [],
  );
});
