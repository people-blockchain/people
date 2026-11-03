import {
  ANALYTICS_VIEW_COOKIE_MAX_AGE_SEC,
  analyticsViewTokenCookieValue,
  analyticsViewTokenMatches,
} from "./auth-token";
import { analyticsViewPublicPath, readAnalyticsViewPathSegment } from "./view-path";

export type AnalyticsShareLinkResult =
  | { ok: false }
  | {
      ok: true;
      redirectTo: string;
      viewCookieValue: string;
      maxAgeSec: number;
    };

/** Validates share link token and returns redirect target + cookie digest (no Next.js types). */
export function resolveAnalyticsShareLink(requestUrl: string, token: string): AnalyticsShareLinkResult {
  if (!readAnalyticsViewPathSegment()) return { ok: false };
  if (!analyticsViewTokenMatches(token)) return { ok: false };
  const viewerPath = analyticsViewPublicPath();
  if (!viewerPath) return { ok: false };
  return {
    ok: true,
    redirectTo: new URL(viewerPath, requestUrl).toString(),
    viewCookieValue: analyticsViewTokenCookieValue(token),
    maxAgeSec: ANALYTICS_VIEW_COOKIE_MAX_AGE_SEC,
  };
}
