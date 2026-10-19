import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./fixtures/factory-icon-db-loader.mjs", import.meta.url);

const { checkRateLimitDurableFirst } = await import("../src/lib/api-rate-limit.ts");
const { checkDurableRateLimit, resetDurableRateLimitForTests } = await import(
  "../src/lib/durable-rate-limit.ts",
);

test("checkRateLimitDurableFirst delegates to the durable limiter when the database is available", async () => {
  const ns = "durable-first-delegate";
  await resetDurableRateLimitForTests(ns);
  assert.equal(await checkRateLimitDurableFirst(ns, "subject-a", 2, 60_000), true);
  assert.equal(await checkRateLimitDurableFirst(ns, "subject-a", 2, 60_000), true);
  assert.equal(await checkRateLimitDurableFirst(ns, "subject-a", 2, 60_000), false);

  const mirrorNs = "durable-first-mirror";
  await resetDurableRateLimitForTests(mirrorNs);
  assert.equal(await checkDurableRateLimit(mirrorNs, "subject-a", 2, 60_000), true);
  assert.equal(await checkDurableRateLimit(mirrorNs, "subject-a", 2, 60_000), true);
  assert.equal(await checkDurableRateLimit(mirrorNs, "subject-a", 2, 60_000), false);
});
