import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GENESIS_QUEST_POOL_PPL,
  GENESIS_QUEST_BUDGET_PPL,
  GENESIS_QUEST_BASE_PASSPORT_PPL,
  GENESIS_QUEST_MAX_TASK_PPL_PER_PERSON,
  computeUnlockedQuestReward,
  leaderboardPrize,
  leaderboardTotal,
  programPoolBalanced,
  unlockDate,
} from "../src/lib/founders/genesis-quest.ts";

test("budget parts add up to the 25M pool and the program stays 50M", () => {
  const { base, referral, leaderboard } = GENESIS_QUEST_BUDGET_PPL;
  assert.equal(base + referral + leaderboard, GENESIS_QUEST_POOL_PPL);
  assert.equal(GENESIS_QUEST_POOL_PPL, 25_000_000);
  assert.ok(programPoolBalanced());
  assert.ok(leaderboardTotal() <= leaderboard);
  assert.ok(GENESIS_QUEST_BASE_PASSPORT_PPL <= GENESIS_QUEST_MAX_TASK_PPL_PER_PERSON);
});

test("leaderboard prizes", () => {
  assert.equal(leaderboardPrize(1), 500_000);
  assert.equal(leaderboardPrize(10), 150_000);
  assert.equal(leaderboardPrize(100), 46_111);
  assert.equal(leaderboardPrize(101), 0);
  assert.equal(leaderboardPrize(0), 0);
});

test("unlock: nothing before 1 Apr 2027, ninths monthly to 1 Dec 2027", () => {
  assert.equal(unlockDate(0).toISOString(), "2027-04-01T00:00:00.000Z");
  assert.equal(unlockDate(8).toISOString(), "2027-12-01T00:00:00.000Z");
  const always = () => true;
  const r = (iso, active = always) =>
    computeUnlockedQuestReward({ totalReward: 9_000, now: new Date(iso), wasActiveBefore: active });
  assert.equal(r("2027-03-31T23:59:59Z"), 0);
  assert.equal(r("2027-04-01T00:00:00Z"), 1_000);
  assert.equal(r("2027-12-01T00:00:00Z"), 9_000);
  assert.equal(r("2030-01-01T00:00:00Z"), 9_000);
});

test("unlock: an inactive month keeps that ninth locked", () => {
  const got = computeUnlockedQuestReward({
    totalReward: 9_000,
    now: new Date("2027-12-01T00:00:00Z"),
    wasActiveBefore: (step) => step !== 2 && step !== 5,
  });
  assert.equal(got, 7_000);
});
