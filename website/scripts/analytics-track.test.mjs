import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./fixtures/referral-db-loader.mjs", import.meta.url);

const { parseTrackPayload } = await import("../src/lib/analytics/validate.ts");
const { detectBot } = await import("../src/lib/analytics/bots.ts");
const {
  visitorIdFromIpUa,
  analyticsDayKey,
  resetAnalyticsSaltSecretForTests,
} = await import("../src/lib/analytics/visitor.ts");
const { analyticsViewTokenMatches, analyticsViewCookieMatches, analyticsViewTokenCookieValue } =
  await import("../src/lib/analytics/auth-token.ts");
const { normalizeAnalyticsStoredPath, shouldSkipAnalyticsForPath } = await import(
  "../src/lib/analytics/paths.ts"
);

test("parseTrackPayload rejects invalid events", () => {
  assert.equal(parseTrackPayload(null).ok, false);
  assert.equal(parseTrackPayload({ sid: "short", events: [] }).ok, false);
  assert.equal(
    parseTrackPayload({
      sid: "0123456789abcdef",
      events: [{ type: "nope" }],
    }).ok,
    false,
  );
  const ok = parseTrackPayload({
    sid: "0123456789abcdef",
    events: [{ type: "pageview", path: "/buy" }],
  });
  assert.equal(ok.ok, true);
});

test("stored paths keep only utm/ref/kol query params", () => {
  assert.equal(
    normalizeAnalyticsStoredPath("/buy", "?utm_source=x&foo=bar&ref=abc"),
    "/buy?utm_source=x&ref=abc",
  );
  assert.equal(shouldSkipAnalyticsForPath("/admin/analytics"), true);
  assert.equal(shouldSkipAnalyticsForPath("/stats"), true);
});

test("parseTrackPayload rejects admin paths", () => {
  const rejected = parseTrackPayload({
    sid: "0123456789abcdef",
    events: [{ type: "pageview", path: "/admin/analytics" }],
  });
  assert.equal(rejected.ok, false);
});

test("detectBot flags common crawlers and headless hints", () => {
  assert.equal(detectBot("Mozilla/5.0 (compatible; Googlebot/2.1)").isBot, true);
  assert.equal(detectBot("Mozilla/5.0 Chrome/120 Safari/537.36").isBot, false);
  assert.equal(detectBot("Mozilla/5.0 Chrome/120", { webdriver: true }).isBot, true);
});

test("visitorId rotates with day and salt", () => {
  const restore = resetAnalyticsSaltSecretForTests("test-salt-a");
  try {
    const day = "2026-11-03";
    const a = visitorIdFromIpUa("203.0.113.1", "TestAgent/1.0", day);
    const b = visitorIdFromIpUa("203.0.113.1", "TestAgent/1.0", day);
    const c = visitorIdFromIpUa("203.0.113.2", "TestAgent/1.0", day);
    assert.equal(a, b);
    assert.notEqual(a, c);
    const nextDay = visitorIdFromIpUa("203.0.113.1", "TestAgent/1.0", "2026-11-04");
    assert.notEqual(a, nextDay);
  } finally {
    restore();
  }
  assert.match(analyticsDayKey(new Date("2026-11-03T15:00:00Z")), /^2026-11-03$/);
});

test("analyticsViewTokenMatches is constant-time safe length gate", () => {
  const prev = process.env.ANALYTICS_VIEW_TOKEN;
  process.env.ANALYTICS_VIEW_TOKEN = "expected-token-value";
  try {
    assert.equal(analyticsViewTokenMatches("expected-token-value"), true);
    assert.equal(analyticsViewTokenMatches("wrong"), false);
    assert.equal(analyticsViewTokenMatches("expected-token-value "), false);
    const digest = analyticsViewTokenCookieValue("expected-token-value");
    assert.equal(analyticsViewCookieMatches(digest), true);
    assert.equal(analyticsViewCookieMatches("deadbeef"), false);
  } finally {
    if (prev === undefined) delete process.env.ANALYTICS_VIEW_TOKEN;
    else process.env.ANALYTICS_VIEW_TOKEN = prev;
  }
});
