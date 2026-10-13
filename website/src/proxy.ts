import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextAuthRequest } from "next-auth";
import { authConfig } from "@/auth.config";
import { isLoginPath, isPartnerPath, LOGIN_PATH } from "@/lib/partner/guards";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE, resolveStoredReferralCode } from "@/lib/partner/referral";

/**
 * Proxy only needs to decode the JWT cookie. `authConfig` includes the Resend
 * email provider, and Auth.js throws `MissingAdapter` when an email provider is
 * present without an adapter — `getSession()` then returns null and `/partner`
 * always redirects to `/login` even though `/api/auth/session` has a user.
 */
const { auth } = NextAuth({
  ...authConfig,
  providers: [],
  adapter: undefined,
  secret: process.env.AUTH_SECRET?.trim() || authConfig.secret,
});

export const proxy = auth((request: NextAuthRequest) => {
  const { pathname } = request.nextUrl;
  const stored = resolveStoredReferralCode(
    request.cookies.get(REFERRAL_COOKIE)?.value,
    request.nextUrl.searchParams.get("ref"),
  );

  const session = request.auth;
  let response: NextResponse;

  if (isPartnerPath(pathname) && !session?.user) {
    const login = request.nextUrl.clone();
    login.pathname = LOGIN_PATH;
    login.search = "";
    login.searchParams.set("callbackUrl", pathname);
    response = NextResponse.redirect(login);
  } else {
    // Signed-in visitors on /login are sent to /partner by the login page
    // itself, after it checks that the session still belongs to a real user.
    // Redirecting here on the JWT alone trapped stale sessions in a
    // /login -> /partner -> error loop and the header "Partner login" link
    // never reached the sign-in form.
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
  matcher: ["/partner/:path*", "/partner", "/login/:path*", "/login", "/"],
};
