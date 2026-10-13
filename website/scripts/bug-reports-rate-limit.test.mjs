import assert from "node:assert/strict";
import test from "node:test";
import { checkSlidingWindowRateLimit, resetRateLimitStoresForTests } from "../src/lib/api-rate-limit.ts";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

test("POST /api/bugs allows 5 submissions per hour per user, then rejects", () => {
  resetRateLimitStoresForTests();
  const userId = "bug-rl-user-1";
  for (let i = 0; i < 5; i++) {
    assert.equal(checkSlidingWindowRateLimit("bugs-submit-hour", userId, 5, HOUR_MS), true);
  }
  assert.equal(checkSlidingWindowRateLimit("bugs-submit-hour", userId, 5, HOUR_MS), false);
});

test("the hourly and daily bug-report limits are independent per-user buckets", () => {
  resetRateLimitStoresForTests();
  const userId = "bug-rl-user-2";
  const otherUser = "bug-rl-user-3";
  for (let i = 0; i < 20; i++) {
    assert.equal(checkSlidingWindowRateLimit("bugs-submit-day", userId, 20, DAY_MS), true);
  }
  assert.equal(checkSlidingWindowRateLimit("bugs-submit-day", userId, 20, DAY_MS), false);
  // A different user has their own bucket and is unaffected.
  assert.equal(checkSlidingWindowRateLimit("bugs-submit-day", otherUser, 20, DAY_MS), true);
});
