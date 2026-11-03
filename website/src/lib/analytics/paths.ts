import {
  isAnalyticsViewInternalPath,
  isLegacyAnalyticsStatsPath,
  pathnameMatchesAnalyticsViewSlug,
  ANALYTICS_SURFACE_COOKIE,
} from "./view-path";

/** Paths excluded from first-party analytics (admin + secret viewer). */
export function isAnalyticsExcludedPathname(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  if (path.startsWith("/admin")) return true;
  if (isLegacyAnalyticsStatsPath(path)) return true;
  if (isAnalyticsViewInternalPath(path)) return true;
  if (pathnameMatchesAnalyticsViewSlug(path)) return true;
  return false;
}

function analyticsViewerSurfaceCookieSet(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((part) => part.trim() === `${ANALYTICS_SURFACE_COOKIE}=1`);
}

const ALLOWED_QUERY_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "kol",
]);

/**
 * Stored path: pathname only plus allowed attribution query params (utm_*, ref, kol).
 */
export function normalizeAnalyticsStoredPath(pathname: string, search = ""): string {
  const base = pathname.split("?")[0] ?? pathname;
  if (isAnalyticsExcludedPathname(base)) {
    return base;
  }
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (!raw) return base;
  const params = new URLSearchParams(raw);
  const kept = new URLSearchParams();
  for (const [key, value] of params) {
    if (ALLOWED_QUERY_KEYS.has(key) && value) kept.set(key, value);
  }
  const q = kept.toString();
  return q ? `${base}?${q}` : base;
}

export function shouldSkipAnalyticsForPath(pathname: string): boolean {
  if (isAnalyticsExcludedPathname(pathname)) return true;
  if (analyticsViewerSurfaceCookieSet()) return true;
  return false;
}
