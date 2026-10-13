/**
 * WEB-M2 — user-authored Discover content is capped server-side (length per field, screenshot
 * count) and project creation is rate-limited per user and per IP. The caps are tested as a pure
 * function and again through createProject(), so the check cannot be dropped by a new caller.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./fixtures/referral-db-loader.mjs", import.meta.url);

let db, schema, limits, service, scoring, rateLimit;

before(async () => {
  ({ getDbReady: globalThis.__getDb } = await import("./fixtures/referral-pglite-db.mjs"));
  db = await globalThis.__getDb();
  schema = await import("../src/db/schema.ts");
  limits = await import("../src/lib/discover/field-limits.ts");
  service = await import("../src/lib/discover/service.ts");
  scoring = await import("../src/lib/discover/scoring-config.ts");
  rateLimit = await import("../src/lib/api-rate-limit.ts");
});

const base = {
  title: "t",
  idea: "i",
  audience: "a",
  whyToken: "w",
  tokenAssetId: "asset",
  tokenLink: "https://example.com/token",
};

test("field caps accept exactly the limit and reject one character more", () => {
  const L = limits.DISCOVER_FIELD_LIMITS;
  assert.equal(limits.firstProjectFieldError({ ...base, title: "x".repeat(L.title) }), null);
  assert.equal(
    limits.firstProjectFieldError({ ...base, title: "x".repeat(L.title + 1) }),
    "invalid_title",
  );
  assert.equal(
    limits.firstProjectFieldError({ ...base, idea: "x".repeat(L.idea + 1) }),
    "invalid_idea",
  );
  assert.equal(
    limits.firstProjectFieldError({ ...base, audience: "x".repeat(L.audience + 1) }),
    "invalid_audience",
  );
  assert.equal(
    limits.firstProjectFieldError({ ...base, whyToken: "x".repeat(L.whyToken + 1) }),
    "invalid_why_token",
  );
});

test("url fields are capped without rejecting ordinary links", () => {
  const L = limits.DISCOVER_FIELD_LIMITS;
  assert.equal(limits.firstProjectFieldError({ ...base, tokenLink: `https://x.co/${"a".repeat(50)}` }), null);
  assert.equal(
    limits.firstProjectFieldError({ ...base, tokenLink: "https://x.co/" + "a".repeat(L.url) }),
    "invalid_token_link",
  );
  assert.equal(
    limits.firstProjectFieldError({ ...base, productUrl: "https://x.co/" + "a".repeat(L.url) }),
    "invalid_product_url",
  );
  assert.equal(
    limits.firstProjectFieldError({ ...base, videoUri: "https://x.co/" + "a".repeat(L.url) }),
    "invalid_video_uri",
  );
});

test("screenshot count and per-url length are capped", () => {
  const L = limits.DISCOVER_FIELD_LIMITS;
  const ok = Array.from({ length: L.screenshotCount }, (_, i) => `https://x.co/${i}`);
  assert.equal(limits.firstProjectFieldError({ ...base, screenshotUris: ok }), null);
  assert.equal(
    limits.firstProjectFieldError({ ...base, screenshotUris: [...ok, "https://x.co/extra"] }),
    "invalid_screenshots",
  );
  assert.equal(
    limits.firstProjectFieldError({
      ...base,
      screenshotUris: ["https://x.co/" + "a".repeat(L.screenshotUri)],
    }),
    "invalid_screenshots",
  );
});

test("createProject refuses over-long content even when called directly", async () => {
  const L = limits.DISCOVER_FIELD_LIMITS;
  await assert.rejects(
    () => service.createProject(null, { ...base, title: "x".repeat(L.title + 1) }),
    /invalid_title/,
  );
  // The row must not have been written.
  const rows = await db.select().from(schema.discoverProjects);
  assert.equal(rows.some((r) => r.title.startsWith("xxx")), false);
});

test("project creation has per-user and per-IP limits configured", () => {
  const r = scoring.DISCOVER_SCORING.rateLimits;
  assert.ok(r.projectsPerUserPerHour > 0 && r.projectsPerUserPerHour <= 20);
  assert.ok(r.projectsPerUserPerDay > r.projectsPerUserPerHour);
  assert.ok(r.projectsPerIpPerHour > 0);
});

test("the two creation namespaces are enforced independently (user and IP)", () => {
  rateLimit.resetRateLimitStoresForTests();
  const { projectsPerUserPerHour, projectsPerIpPerHour } = scoring.DISCOVER_SCORING.rateLimits;
  for (let i = 0; i < projectsPerUserPerHour; i++) {
    assert.equal(
      rateLimit.checkSlidingWindowRateLimit("discover-project-create", "u1", projectsPerUserPerHour, 60_000),
      true,
    );
  }
  assert.equal(
    rateLimit.checkSlidingWindowRateLimit("discover-project-create", "u1", projectsPerUserPerHour, 60_000),
    false,
  );
  // A second account from the same IP is still bounded by the IP-wide bucket.
  for (let i = 0; i < projectsPerIpPerHour; i++) {
    assert.equal(
      rateLimit.checkSlidingWindowRateLimit("discover-project-create-ip", "1.2.3.4", projectsPerIpPerHour, 60_000),
      true,
    );
  }
  assert.equal(
    rateLimit.checkSlidingWindowRateLimit("discover-project-create-ip", "1.2.3.4", projectsPerIpPerHour, 60_000),
    false,
  );
});
