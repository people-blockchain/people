import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./fixtures/discover-follow-test-loader.mjs", import.meta.url);

const { resetDurableRateLimitForTests } = await import("../src/lib/durable-rate-limit.ts");
const { DISCOVER_SCORING } = await import("../src/lib/discover/scoring-config.ts");
const { POST } = await import("../src/app/api/discover/projects/[id]/follow/route.ts");

const limit = DISCOVER_SCORING.rateLimits.followsPerUserPerHour;
const params = { params: Promise.resolve({ id: "proj-1" }) };

test("discover follow returns 429 after the hourly durable budget is exhausted", async () => {
  await resetDurableRateLimitForTests("discover-follow");
  const request = new Request("http://localhost/api/discover/projects/proj-1/follow", {
    method: "POST",
  });
  for (let i = 0; i < limit; i += 1) {
    const res = await POST(request, params);
    assert.equal(res.status, 200, `request ${i + 1} should succeed`);
  }
  const limited = await POST(request, params);
  assert.equal(limited.status, 429);
  const body = await limited.json();
  assert.equal(body.error, "rate_limited");
});
