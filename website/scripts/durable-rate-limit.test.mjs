// api-cron.md M2: the durable (Postgres) fixed-window limiter shares one budget across
// instances/cold starts, unlike the module-level Map it supplements.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./fixtures/factory-icon-db-loader.mjs", import.meta.url);

const { checkDurableRateLimit, checkDurableRateLimitDetail, resetDurableRateLimitForTests } = await import(
  "../src/lib/durable-rate-limit.ts"
);

test("a subject gets exactly maxPerWindow requests per window", async () => {
  await resetDurableRateLimitForTests("test-budget");
  for (let i = 0; i < 3; i += 1) {
    assert.equal(
      await checkDurableRateLimit("test-budget", "1.2.3.4", 3, 60_000),
      true,
      `request ${i} should be within budget`
    );
  }
  assert.equal(await checkDurableRateLimit("test-budget", "1.2.3.4", 3, 60_000), false);
});

test("checkDurableRateLimitDetail reports how many seconds remain in the fixed window", async () => {
  await resetDurableRateLimitForTests("test-detail");
  const allowed = await checkDurableRateLimitDetail("test-detail", "subject-a", 1, 60_000);
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.retryAfterSeconds, 0);
  const denied = await checkDurableRateLimitDetail("test-detail", "subject-a", 1, 60_000);
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfterSeconds >= 1 && denied.retryAfterSeconds <= 60);
  // A different subject still has a full window.
  const other = await checkDurableRateLimitDetail("test-detail", "subject-b", 1, 60_000);
  assert.equal(other.allowed, true);
  assert.equal(other.retryAfterSeconds, 0);
});

test("subjects and namespaces have independent budgets", async () => {
  await resetDurableRateLimitForTests("test-scope");
  assert.equal(await checkDurableRateLimit("test-scope", "a", 1, 60_000), true);
  assert.equal(await checkDurableRateLimit("test-scope", "a", 1, 60_000), false);
  // A different IP still has its full budget.
  assert.equal(await checkDurableRateLimit("test-scope", "b", 1, 60_000), true);
  // A different namespace for the same subject is independent too.
  assert.equal(await checkDurableRateLimit("test-scope-other", "a", 1, 60_000), true);
});
