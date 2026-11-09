import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextAuthRequest } from "next-auth";
import { authConfig } from "@/auth.config";
import {
  ANALYTICS_VIEWER_HTTP_HEADERS,
  analyticsViewerBlockedStatus,
} from "@/lib/analytics/view-path";
import { localeFromBuyPath } from "@/lib/locale-detect";
import { LANG_COOKIE, LANG_COOKIE_MAX_AGE } from "@/lib/preferences";
import { isLoginPath, isPartnerPath } from "@/lib/partner/guards";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE, resolveStoredReferralCookie } from "@/lib/partner/referral";

function analyticsViewerEdgeResponse(request: NextAuthRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (analyticsViewerBlockedStatus(pathname) !== 404) return null;
  const response = new NextResponse("Not Found", { status: 404 });
  for (const header of ANALYTICS_VIEWER_HTTP_HEADERS) {
    response.headers.set(header.key, header.value);
  }
  return response;
}

/**
 * Proxy only needs to decode the JWT cookie. `authConfig` includes the Resend
 * email provider, and Auth.js throws `MissingAdapter` when an email provider is
 * present without an adapter — `getSession()` then returns null even though
 * `/api/auth/session` has a user. Guest `/partner` is rendered in the page, not here.
 */
const { auth } = NextAuth({
  ...authConfig,
  providers: [],
  adapter: undefined,
  secret: process.env.AUTH_SECRET?.trim() || authConfig.secret,
});

export const proxy = auth((request: NextAuthRequest) => {
  const blocked = analyticsViewerEdgeResponse(request);
  if (blocked) return blocked;

  const { pathname } = request.nextUrl;
  const stored = resolveStoredReferralCookie(
    request.cookies.get(REFERRAL_COOKIE)?.value,
    request.nextUrl.searchParams.get("ref"),
  );

  let response: NextResponse;

  const buyLocale = localeFromBuyPath(pathname);
  if (buyLocale) {
    // `/tr/buy` → `/buy` in Turkish: the redirect keeps the query string (?ref=…)
    // and stores the language the server reads when it renders `/buy`.
    const buy = request.nextUrl.clone();
    buy.pathname = "/buy";
    response = NextResponse.redirect(buy);
    response.cookies.set(LANG_COOKIE, buyLocale, {
      path: "/",
      maxAge: LANG_COOKIE_MAX_AGE,
      sameSite: "lax",
      httpOnly: false,
      secure: request.nextUrl.protocol === "https:",
    });
  } else {
    // Signed-in visitors on /login are sent to /partner by the login page
    // itself, after it checks that the session still belongs to a real user.
    // Redirecting here on the JWT alone trapped stale sessions in a
    // /login -> /partner -> error loop and the header "Partner login" link
    // never reached the sign-in form.
    // Unauthenticated `/partner` is handled by partner/page.tsx (guest landing).
    response = NextResponse.next();
  }

  if (isPartnerPath(pathname) || isLoginPath(pathname)) {
    // Auth-dependent pages: never let a browser or the client router reuse a
    // response that was produced for a different sign-in state.
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Vary", "Cookie");
  }

  if (stored && stored !== request.cookies.get(REFERRAL_COOKIE)?.value) {
    response.cookies.set(REFERRAL_COOKIE, stored, {
      path: "/",
      maxAge: REFERRAL_COOKIE_MAX_AGE,
      sameSite: "lax",
      httpOnly: false,
      secure: request.nextUrl.protocol === "https:",
    });
  }

  return response;
});

export const config = {
  matcher: [
    "/stats",
    "/stats/:path*",
    "/__people-analytics-view",
    "/__people-analytics-view/:path*",
    "/partner/:path*",
    "/partner",
    "/login/:path*",
    "/login",
    "/",
    // The one invite link (`?ref=<code>`) also lands on these pages; store the code here too.
    "/founders",
    "/bounty",
    "/buy",
    "/(en|ru|es|pt|fr|de|it|tr|vi|id|zh|ar)/buy",
  ],
};
