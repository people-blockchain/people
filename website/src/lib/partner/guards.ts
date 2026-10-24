import { hasControlOrBackslash, sanitizeInAppPath } from "@/lib/safe-return-path";

export const PARTNER_PATH_PREFIX = "/partner";
export const LOGIN_PATH = "/login";

/** Partner cabinet sign-in (footer, deep links). */
export const PARTNER_LOGIN_HREF = `${LOGIN_PATH}?callbackUrl=${encodeURIComponent(PARTNER_PATH_PREFIX)}`;

export function isPartnerPath(pathname: string): boolean {
  return pathname === PARTNER_PATH_PREFIX || pathname.startsWith(`${PARTNER_PATH_PREFIX}/`);
}

export function isLoginPath(pathname: string): boolean {
  return pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`);
}

function normalizeCallbackPath(callbackUrl: string | null | undefined): string | null {
  if (!callbackUrl?.trim()) return null;
  // Not trimmed: a trailing tab/newline is a control character and must be rejected, not stripped.
  const raw = callbackUrl;
  let candidate = raw;
  if (raw.startsWith("http")) {
    // Absolute URLs are only accepted as a path hand-off; control characters and backslashes
    // are rejected by `sanitizeInAppPath` below, so nothing cross-origin can survive.
    try {
      const parsed = new URL(raw);
      candidate = parsed.pathname + parsed.search;
    } catch {
      return null;
    }
  }
  const path = sanitizeInAppPath(candidate);
  if (!path) return null;
  if (isLoginPath(path.split("?")[0] ?? path)) return null;
  return path;
}

export function loginRedirectUrl(origin: string, callbackPath: string): string {
  const url = new URL(LOGIN_PATH, origin);
  const normalized = normalizeCallbackPath(callbackPath);
  if (normalized) url.searchParams.set("callbackUrl", normalized);
  return url.pathname + url.search;
}

/** Post-auth redirect from the unified sign-in page (preserves safe in-app callbacks). */
export function partnerHomeAfterLogin(callbackUrl: string | null | undefined): string {
  const normalized = normalizeCallbackPath(callbackUrl);
  if (normalized && normalized !== "/") return normalized;
  return "/wallet";
}

export function withWalletConnectFlag(path: string): string {
  const [base, query] = path.split("?");
  const params = new URLSearchParams(query ?? "");
  params.set("walletConnect", "1");
  const qs = params.toString();
  return qs ? `${base}?${qs}` : `${base}?walletConnect=1`;
}

/**
 * Auth.js `redirect` callback: keep partner paths, default successful sign-in to `/partner`.
 *
 * Always returns an absolute same-origin URL. Auth.js requires it (the value lands in
 * `Location` and in the `{ url }` JSON body of `X-Auth-Return-Redirect` responses), and
 * `next-auth/react`'s `signIn(..., { redirect: false })` parses that body with a bare
 * `new URL(data.url)` — a relative path such as `/founders` throws
 * `TypeError: Invalid URL` there, which surfaces as
 * `stage: connect_start · "/founders" cannot be parsed as a URL.` when sign-in starts on
 * any page other than `/login` (i.e. in-place sign-in on `/founders`).
 */
export function resolvePostAuthRedirectUrl(url: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  let target: URL;
  try {
    if (hasControlOrBackslash(url)) return `${base}${PARTNER_PATH_PREFIX}`;
    if (!url.startsWith("http") && !sanitizeInAppPath(url)) return `${base}${PARTNER_PATH_PREFIX}`;
    target = url.startsWith("http") ? new URL(url) : new URL(url, `${base}/`);
  } catch {
    return `${base}${PARTNER_PATH_PREFIX}`;
  }
  const origin = new URL(base).origin;
  if (target.origin !== origin) {
    return `${base}${PARTNER_PATH_PREFIX}`;
  }
  if (isLoginPath(target.pathname)) {
    return `${base}${PARTNER_PATH_PREFIX}`;
  }
  if (isPartnerPath(target.pathname)) {
    return `${base}${target.pathname}${target.search}${target.hash}`;
  }
  if (target.pathname === "/" || url === base || url === `${base}/`) {
    return `${base}/wallet`;
  }
  return `${base}${target.pathname}${target.search}${target.hash}`;
}

export function isAuthConfigured(): boolean {
  return Boolean(process.env.AUTH_SECRET?.trim() && process.env.DATABASE_URL?.trim());
}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID?.trim() && process.env.AUTH_GOOGLE_SECRET?.trim());
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.AUTH_RESEND_KEY?.trim());
}

export function isNodeConfigured(): boolean {
  return true;
}
