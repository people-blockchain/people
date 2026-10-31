/**
 * Mobile Web3Auth sign-in uses a full-page redirect (popups are blocked or orphaned on Android
 * Chrome). These helpers carry the attempt across the redirect and finish it on the return page.
 * No React and no window access here — callers pass storage / location in.
 */

import { isSafeInAppPath } from "@/lib/safe-return-path";
import { migrateWebsiteStorage } from "@/lib/storage-migration";

export const PENDING_KEY = "people_web3auth_pending";
export const PENDING_MAX_AGE_MS = 10 * 60_000;
/** Where a finished sign-in lands when it started on the login page itself. */
export const RESUME_FALLBACK_PATH = "/wallet";

export type PendingRedirect = { returnTo: string; at: number };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function isSafeReturnPath(path: unknown): path is string {
  return isSafeInAppPath(path);
}

export function writePendingRedirect(storage: StorageLike, returnTo: string, now = Date.now()): void {
  try {
    storage.setItem(PENDING_KEY, JSON.stringify({ returnTo, at: now }));
  } catch {
    /* storage blocked: the return page still resumes from the redirect result itself */
  }
}

export function readPendingRedirect(storage: StorageLike, now = Date.now()): PendingRedirect | null {
  try {
    migrateWebsiteStorage(storage);
    const raw = storage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingRedirect;
    if (typeof parsed?.at !== "number" || now - parsed.at > PENDING_MAX_AGE_MS) return null;
    return isSafeReturnPath(parsed.returnTo) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPendingRedirect(storage: StorageLike): void {
  try {
    storage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** Read and remove in one step, so only one mounted sign-in form resumes the attempt. */
export function takePendingRedirect(storage: StorageLike, now = Date.now()): PendingRedirect | null {
  const pending = readPendingRedirect(storage, now);
  clearPendingRedirect(storage);
  return pending;
}

/** Query/hash keys Web3Auth's redirect carries its login result in. */
export const WEB3AUTH_REDIRECT_RESULT_KEYS = ["b64Params", "sessionId"] as const;

/** True when the URL carries a Web3Auth redirect result (read it before the SDK strips it). */
export function hasWeb3AuthRedirectResult(search: string, hash: string): boolean {
  const query = new URLSearchParams(search.replace(/^\?/, ""));
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  return WEB3AUTH_REDIRECT_RESULT_KEYS.some((key) => query.has(key) || fragment.has(key));
}

/**
 * Same check for a server-rendered page's `searchParams` (no `location.hash` there — Web3Auth
 * puts its result in the query string on this redirect, so that is what the server ever needs
 * to see).
 */
export function hasWeb3AuthRedirectResultInParams(
  params: Record<string, string | string[] | undefined>,
): boolean {
  return WEB3AUTH_REDIRECT_RESULT_KEYS.some((key) => params[key] !== undefined);
}

/**
 * Page to open after a resumed sign-in. Never stay on /login: honour its safe `callbackUrl`,
 * otherwise open the wallet.
 */
export function resolveResumeTarget(returnTo: string | null | undefined, fallback = RESUME_FALLBACK_PATH): string {
  if (!isSafeReturnPath(returnTo)) return fallback;
  const url = new URL(returnTo, "https://people.invalid");
  if (url.pathname !== "/login" && !url.pathname.startsWith("/login/")) return returnTo;
  const callback = url.searchParams.get("callbackUrl");
  if (isSafeReturnPath(callback) && !callback.startsWith("/login")) return callback;
  return fallback;
}

/**
 * Where an in-page (popup) sign-in must send the browser once it finishes. Same rule as the
 * redirect resume, but the caller is already on the page the attempt started on, so a target
 * equal to the current path means "stay" (`null`): the wallet modal on /wallet or /founders
 * must close in place instead of reloading the route. The only real move is off /login, which
 * has no client-side redirect of its own (its `SignedInRedirect` runs at load time only).
 */
export function resolvePostSignInNavigation(
  currentPath: string,
  returnTo?: string | null,
  fallback = RESUME_FALLBACK_PATH,
): string | null {
  const target = resolveResumeTarget(returnTo ?? currentPath, fallback);
  return target === currentPath ? null : target;
}

/** Delays between `/api/auth/session` reads right after sign-in (the cookie can lag on mobile). */
export const SESSION_USER_RETRY_DELAYS_MS = [0, 250, 600, 1200, 2000] as const;

export async function waitForSessionUser<T>(
  fetchUser: () => Promise<T | null>,
  delaysMs: readonly number[] = SESSION_USER_RETRY_DELAYS_MS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T | null> {
  for (const delay of delaysMs) {
    if (delay > 0) await sleep(delay);
    const user = await fetchUser().catch(() => null);
    if (user) return user;
  }
  return null;
}

export type FreshSessionWait = {
  /**
   * Accept a session only when its authTime is strictly newer than this rejected value.
   * The vault reauth window stays on the server: a fast client clock must not reject a
   * session the server just issued. Omit it to accept the first session that has a user id.
   */
  newerThan?: number | null;
};

/**
 * Same bounded poll as {@link waitForSessionUser}. When `newerThan` is a number, yesterday's
 * cookie must not win: only a strictly newer authTime counts. Freshness against the wall clock
 * is the server's check (`isAuthTimeFresh` on wrap-key), not this poll.
 */
export async function waitForFreshSessionUser<T extends { id?: string | null; authTime?: number | null }>(
  fetchUser: () => Promise<T | null>,
  delaysMs: readonly number[] = SESSION_USER_RETRY_DELAYS_MS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  wait?: FreshSessionWait,
): Promise<T | null> {
  const newerThan = wait?.newerThan;
  for (const delay of delaysMs) {
    if (delay > 0) await sleep(delay);
    const user = await fetchUser().catch(() => null);
    if (!user?.id) continue;
    if (typeof newerThan !== "number") return user;
    if (typeof user.authTime === "number" && user.authTime > newerThan) return user;
  }
  return null;
}

export type ConnectionEvents = {
  connected: boolean;
  on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => unknown;
};

/**
 * Resolve once the SDK reports a connection. After a redirect the session is restored during
 * init, but the "connected" event may land a tick later than `initModal` resolving.
 */
export function waitForWeb3AuthConnected(instance: ConnectionEvents, ms: number): Promise<boolean> {
  if (instance.connected) return Promise.resolve(true);
  if (!instance.on || !instance.removeListener) return Promise.resolve(false);
  const on = instance.on.bind(instance);
  const off = instance.removeListener.bind(instance);
  return new Promise<boolean>((resolve) => {
    const finish = (value: boolean) => {
      clearTimeout(timer);
      off("connected", onConnected);
      off("errored", onErrored);
      resolve(value);
    };
    const onConnected = () => finish(true);
    const onErrored = () => finish(instance.connected);
    const timer = setTimeout(() => finish(instance.connected), ms);
    on("connected", onConnected);
    on("errored", onErrored);
  });
}

let resumeInFlight: Promise<unknown> | null = null;

/**
 * Single flight per page: two mounted forms (login page + modal) must not both sign in,
 * create a vault and navigate. Later callers share the first run's result.
 */
export function runResumeOnce<T>(run: () => Promise<T>): Promise<T> {
  if (!resumeInFlight) {
    const attempt = run();
    resumeInFlight = attempt;
    attempt.then(
      () => {
        if (resumeInFlight === attempt) resumeInFlight = null;
      },
      () => {
        if (resumeInFlight === attempt) resumeInFlight = null;
      },
    );
  }
  return resumeInFlight as Promise<T>;
}
