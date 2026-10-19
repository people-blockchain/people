import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./fixtures/durable-rate-limit-throw-loader.mjs", import.meta.url);

const { checkRateLimitDurableFirst, resetRateLimitStoresForTests } = await import(
  "../src/lib/api-rate-limit.ts",
);

test("checkRateLimitDurableFirst falls back to in-memory when durable throws", async () => {
  resetRateLimitStoresForTests();
  const ns = "durable-first-fallback";
  const subject = "1.2.3.4";
  for (let i = 0; i < 3; i += 1) {
    assert.equal(await checkRateLimitDurableFirst(ns, subject, 3, 60_000), true);
  }
  assert.equal(await checkRateLimitDurableFirst(ns, subject, 3, 60_000), false);
});
