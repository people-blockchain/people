// api-cron.md M2: the durable (Postgres) fixed-window limiter shares one budget across
// instances/cold starts, unlike the module-level Map it supplements.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./fixtures/factory-icon-db-loader.mjs", import.meta.url);

const { checkDurableRateLimit, resetDurableRateLimitForTests } = await import(
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

test("subjects and namespaces have independent budgets", async () => {
  await resetDurableRateLimitForTests("test-scope");
  assert.equal(await checkDurableRateLimit("test-scope", "a", 1, 60_000), true);
  assert.equal(await checkDurableRateLimit("test-scope", "a", 1, 60_000), false);
  // A different IP still has its full budget.
  assert.equal(await checkDurableRateLimit("test-scope", "b", 1, 60_000), true);
  // A different namespace for the same subject is independent too.
  assert.equal(await checkDurableRateLimit("test-scope-other", "a", 1, 60_000), true);
});
