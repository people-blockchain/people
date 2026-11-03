import { cookies } from "next/headers";
import { isDiscoverAdmin } from "@/lib/discover/admin";
import {
  ANALYTICS_VIEW_COOKIE,
  analyticsViewCookieMatches,
  analyticsViewTokenFromAuthorization,
  analyticsViewTokenMatches,
} from "@/lib/analytics/auth-token";

export type AnalyticsViewer = "admin" | "token" | null;

export async function resolveAnalyticsViewer(req: Request): Promise<AnalyticsViewer> {
  if (await isDiscoverAdmin()) return "admin";
  const bearer = analyticsViewTokenFromAuthorization(req.headers.get("authorization"));
  if (analyticsViewTokenMatches(bearer)) return "token";
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(ANALYTICS_VIEW_COOKIE)?.value;
  if (analyticsViewCookieMatches(cookieToken)) return "token";
  return null;
}

/** Server component gate for the secret analytics viewer (admin session or valid view cookie). */
export async function hasAnalyticsViewerAccess(): Promise<boolean> {
  const viewer = await resolveAnalyticsViewer(new Request("http://localhost"));
  return viewer !== null;
}
