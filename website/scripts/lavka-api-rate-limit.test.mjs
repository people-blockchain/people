import assert from "node:assert/strict";
import test from "node:test";
import { resetRateLimitStoresForTests } from "../src/lib/api-rate-limit.ts";
import { lavkaRateLimitAllowed } from "../src/lib/lavka/api-rate-limit.ts";

test("lavka verify routes allow a per-user burst then reject", () => {
  resetRateLimitStoresForTests();
  const user = "user-1";
  for (let i = 0; i < 30; i++) {
    assert.equal(lavkaRateLimitAllowed(user), true, `request ${i + 1} should be allowed`);
  }
  assert.equal(lavkaRateLimitAllowed(user), false);
});

test("the lavka budget is per user, not global", () => {
  resetRateLimitStoresForTests();
  for (let i = 0; i < 30; i++) lavkaRateLimitAllowed("user-a");
  assert.equal(lavkaRateLimitAllowed("user-a"), false);
  // Another verified human is unaffected by the first user's exhausted budget.
  assert.equal(lavkaRateLimitAllowed("user-b"), true);
});

test("the budget is shared across all four verify routes (same namespace)", () => {
  resetRateLimitStoresForTests();
  const user = "user-shared";
  // Each helper call stands in for one of redeem/escrow/programs/merchant.
  for (let i = 0; i < 15; i++) {
    assert.equal(lavkaRateLimitAllowed(user), true);
    assert.equal(lavkaRateLimitAllowed(user), true);
  }
  assert.equal(lavkaRateLimitAllowed(user), false);
});
