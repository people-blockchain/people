import { NextResponse } from "next/server";
import { ANALYTICS_VIEW_COOKIE } from "@/lib/analytics/auth-token";
import { resolveAnalyticsShareLink } from "@/lib/analytics/view-link";
import {
  ANALYTICS_SURFACE_COOKIE,
  ANALYTICS_VIEWER_HTTP_HEADERS,
} from "@/lib/analytics/view-path";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

function withViewerHeaders(response: NextResponse): NextResponse {
  for (const header of ANALYTICS_VIEWER_HTTP_HEADERS) {
    response.headers.set(header.key, header.value);
  }
  return response;
}

/** Validates share link, sets HttpOnly digest cookie, redirects to secret viewer path (no token in URL). */
export async function GET(request: Request, { params }: Params) {
  const { token } = await params;
  const resolved = resolveAnalyticsShareLink(request.url, token);
  if (!resolved.ok) {
    return withViewerHeaders(new NextResponse("Not Found", { status: 404 }));
  }

  const response = NextResponse.redirect(resolved.redirectTo, 303);
  response.cookies.set(ANALYTICS_VIEW_COOKIE, resolved.viewCookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: resolved.maxAgeSec,
  });
  response.cookies.set(ANALYTICS_SURFACE_COOKIE, "1", {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: resolved.maxAgeSec,
  });
  return withViewerHeaders(response);
}
