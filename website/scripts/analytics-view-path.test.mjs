import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./fixtures/referral-db-loader.mjs", import.meta.url);

const SLUG = "a".repeat(48);
const TOKEN = "view-token-secret-value-here-32chars";

const viewPath = await import("../src/lib/analytics/view-path.ts");
const { isAnalyticsExcludedPathname, shouldSkipAnalyticsForPath } = await import(
  "../src/lib/analytics/paths.ts"
);

function withEnv(pathValue, tokenValue, fn) {
  const prevPath = process.env.ANALYTICS_VIEW_PATH;
  const prevToken = process.env.ANALYTICS_VIEW_TOKEN;
  if (pathValue === undefined) delete process.env.ANALYTICS_VIEW_PATH;
  else process.env.ANALYTICS_VIEW_PATH = pathValue;
  if (tokenValue === undefined) delete process.env.ANALYTICS_VIEW_TOKEN;
  else process.env.ANALYTICS_VIEW_TOKEN = tokenValue;
  try {
    return fn();
  } finally {
    if (prevPath === undefined) delete process.env.ANALYTICS_VIEW_PATH;
    else process.env.ANALYTICS_VIEW_PATH = prevPath;
    if (prevToken === undefined) delete process.env.ANALYTICS_VIEW_TOKEN;
    else process.env.ANALYTICS_VIEW_TOKEN = prevToken;
  }
}

async function withEnvAsync(pathValue, tokenValue, fn) {
  const prevPath = process.env.ANALYTICS_VIEW_PATH;
  const prevToken = process.env.ANALYTICS_VIEW_TOKEN;
  if (pathValue === undefined) delete process.env.ANALYTICS_VIEW_PATH;
  else process.env.ANALYTICS_VIEW_PATH = pathValue;
  if (tokenValue === undefined) delete process.env.ANALYTICS_VIEW_TOKEN;
  else process.env.ANALYTICS_VIEW_TOKEN = tokenValue;
  try {
    await fn();
  } finally {
    if (prevPath === undefined) delete process.env.ANALYTICS_VIEW_PATH;
    else process.env.ANALYTICS_VIEW_PATH = prevPath;
    if (prevToken === undefined) delete process.env.ANALYTICS_VIEW_TOKEN;
    else process.env.ANALYTICS_VIEW_TOKEN = prevToken;
  }
}

test("readAnalyticsViewPathSegment requires long safe segment", () => {
  withEnv(undefined, undefined, () => {
    assert.equal(viewPath.readAnalyticsViewPathSegment(), null);
  });
  withEnv("tooshort", undefined, () => {
    assert.equal(viewPath.readAnalyticsViewPathSegment(), null);
  });
  withEnv("bad/slug/chars-are-not-allowed-in-segment!!", undefined, () => {
    assert.equal(viewPath.readAnalyticsViewPathSegment(), null);
  });
  withEnv(SLUG, undefined, () => {
    assert.equal(viewPath.readAnalyticsViewPathSegment(), SLUG);
    assert.equal(viewPath.analyticsViewPublicPath(), `/${SLUG}`);
  });
});

test("legacy /stats paths are excluded and flagged as legacy", () => {
  assert.equal(viewPath.isLegacyAnalyticsStatsPath("/stats"), true);
  assert.equal(viewPath.isLegacyAnalyticsStatsPath("/stats/abc"), true);
  assert.equal(viewPath.analyticsViewerBlockedStatus("/stats"), 404);
  assert.equal(viewPath.analyticsViewerBlockedStatus("/stats/tok"), 404);
  assert.equal(shouldSkipAnalyticsForPath("/stats"), true);
  assert.equal(shouldSkipAnalyticsForPath("/stats/secret-token"), true);
});

test("wrong slug does not match viewer path", () => {
  withEnv(SLUG, TOKEN, () => {
    assert.equal(viewPath.pathnameMatchesAnalyticsViewSlug("/not-the-viewer-slug"), false);
    assert.equal(viewPath.pathnameMatchesAnalyticsViewSlug(`/${SLUG}`), true);
    assert.equal(isAnalyticsExcludedPathname(`/${SLUG}`), true);
    assert.equal(isAnalyticsExcludedPathname(`/${SLUG}/${TOKEN}`), true);
  });
});

test("buildAnalyticsViewRewrites only when path configured", () => {
  withEnv(undefined, undefined, () => {
    assert.deepEqual(viewPath.buildAnalyticsViewRewrites(), []);
  });
  withEnv(SLUG, undefined, () => {
    const rules = viewPath.buildAnalyticsViewRewrites();
    assert.equal(rules.length, 2);
    assert.equal(rules[0]?.source, `/${SLUG}`);
    assert.equal(rules[0]?.destination, viewPath.ANALYTICS_VIEW_INTERNAL_PREFIX);
    assert.equal(rules[1]?.source, `/${SLUG}/:token`);
  });
});

test("share link resolves to secret path and digest cookie value", async () => {
  await withEnvAsync(SLUG, TOKEN, async () => {
    const { resolveAnalyticsShareLink } = await import("../src/lib/analytics/view-link.ts");
    const { analyticsViewTokenCookieValue } = await import("../src/lib/analytics/auth-token.ts");
    const resolved = resolveAnalyticsShareLink(`https://example.com/${SLUG}/${TOKEN}`, TOKEN);
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    assert.equal(resolved.redirectTo, `https://example.com/${SLUG}`);
    assert.equal(resolved.viewCookieValue, analyticsViewTokenCookieValue(TOKEN));
    assert.equal(resolveAnalyticsShareLink("https://example.com/x", "wrong-token").ok, false);
  });
});

test("direct internal viewer prefix is blocked", () => {
  assert.equal(viewPath.analyticsViewerBlockedStatus(viewPath.ANALYTICS_VIEW_INTERNAL_PREFIX), 404);
});

test("viewer unavailable without ANALYTICS_VIEW_PATH", () => {
  withEnv(undefined, TOKEN, () => {
    assert.equal(viewPath.readAnalyticsViewPathSegment(), null);
    assert.equal(viewPath.buildAnalyticsViewRewrites().length, 0);
  });
});
