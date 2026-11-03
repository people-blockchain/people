/** Secret read-only analytics viewer URL segment (server env only — never `NEXT_PUBLIC_*`). */

export const ANALYTICS_VIEW_PATH_MIN_LENGTH = 32;
export const ANALYTICS_VIEW_INTERNAL_PREFIX = "/__people-analytics-view";
export const ANALYTICS_SURFACE_COOKIE = "people_analytics_surface";

const SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;

export const ANALYTICS_VIEWER_HTTP_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "no-store" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

export function readAnalyticsViewPathSegment(): string | null {
  const raw = process.env.ANALYTICS_VIEW_PATH?.trim();
  if (!raw || raw.length < ANALYTICS_VIEW_PATH_MIN_LENGTH) return null;
  if (!SEGMENT_PATTERN.test(raw)) return null;
  return raw;
}

export function analyticsViewPublicPath(): string | null {
  const slug = readAnalyticsViewPathSegment();
  return slug ? `/${slug}` : null;
}

export function isLegacyAnalyticsStatsPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  return path === "/stats" || path.startsWith("/stats/");
}

export function isAnalyticsViewInternalPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  return path === ANALYTICS_VIEW_INTERNAL_PREFIX || path.startsWith(`${ANALYTICS_VIEW_INTERNAL_PREFIX}/`);
}

export function pathnameMatchesAnalyticsViewSlug(pathname: string): boolean {
  const slug = readAnalyticsViewPathSegment();
  if (!slug) return false;
  const path = pathname.split("?")[0] ?? pathname;
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 1 && parts[0] === slug) return true;
  if (parts.length === 2 && parts[0] === slug) return true;
  return false;
}

export function buildAnalyticsViewRewrites(): { source: string; destination: string }[] {
  const slug = readAnalyticsViewPathSegment();
  if (!slug) return [];
  return [
    { source: `/${slug}`, destination: ANALYTICS_VIEW_INTERNAL_PREFIX },
    { source: `/${slug}/:token`, destination: `${ANALYTICS_VIEW_INTERNAL_PREFIX}/link/:token` },
  ];
}

export function buildAnalyticsViewHeaderRules(): { source: string; headers: { key: string; value: string }[] }[] {
  const slug = readAnalyticsViewPathSegment();
  if (!slug) return [];
  const headers = [...ANALYTICS_VIEWER_HTTP_HEADERS];
  return [
    { source: `/${slug}`, headers },
    { source: `/${slug}/:token`, headers },
  ];
}

/** Plain 404 for removed `/stats` URLs and direct hits on the internal rewrite target. */
export function analyticsViewerBlockedStatus(pathname: string): 404 | null {
  if (isLegacyAnalyticsStatsPath(pathname) || isAnalyticsViewInternalPath(pathname)) {
    return 404;
  }
  return null;
}
