/** Mobile-browser detection and wallet-app deep links (no window access — pass inputs in). */

export function isMobileUserAgent(ua: string, maxTouchPoints = 0): boolean {
  if (/Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(ua)) return true;
  // iPadOS reports a desktop Safari UA with touch support.
  return /Macintosh/i.test(ua) && maxTouchPoints > 1;
}

export function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return isMobileUserAgent(navigator.userAgent, navigator.maxTouchPoints);
}

/**
 * Web3Auth sign-in uses a full-page redirect instead of a popup. Mobile, plus Android Chrome in
 * "Desktop site" mode, which sends a desktop Linux UA but still has a touch screen.
 */
export function prefersRedirectSignIn(ua: string, maxTouchPoints = 0): boolean {
  if (isMobileUserAgent(ua, maxTouchPoints)) return true;
  return /Linux|X11/i.test(ua) && !/CrOS/i.test(ua) && maxTouchPoints > 0;
}

export function shouldUseRedirectSignIn(): boolean {
  if (typeof navigator === "undefined") return false;
  return prefersRedirectSignIn(navigator.userAgent, navigator.maxTouchPoints);
}

export type WalletAppVendor = "metamask" | "trust";

/** Page URL → deep link that reopens the same page inside the wallet's in-app browser. */
export function walletAppDeepLink(vendor: WalletAppVendor, pageUrl: string): string {
  if (vendor === "metamask") {
    const u = new URL(pageUrl);
    return `https://metamask.app.link/dapp/${u.host}${u.pathname}${u.search}`;
  }
  return `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(pageUrl)}`;
}

/** Thrown after navigating to a wallet app; the UI shows "Opening…", not an error. */
export const WALLET_APP_REDIRECT = "wallet_app_redirect";

export const SIGN_IN_STEP_TIMEOUT_MS = 30_000;
/**
 * No visible progress for this long → the card offers a Retry next to "Taking longer than usual".
 * Advisory only: the attempt keeps running (a popup may still be in its hCaptcha / email-code
 * pages, which a person can legitimately spend minutes in), and only a click retires it.
 */
export const SIGN_IN_SLOW_NOTICE_MS = 20_000;
/** Web3Auth SDK load + `initModal` (project-config fetch, adapter init). */
export const WEB3AUTH_INIT_TIMEOUT_MS = 15_000;
/** Mobile: tap → the page starts navigating to the Web3Auth / Google page. */
export const REDIRECT_START_TIMEOUT_MS = 15_000;
/**
 * Desktop popup: a ceiling on how long `connectTo` may stay unsettled. Generous on purpose —
 * the Web3Auth window shows an hCaptcha (1–2 min) and then the email-code page, all inside the
 * popup. A person who closes the popup does not wait for this: the SDK's PopupHandler observes
 * the closed window and rejects `connectTo` almost immediately (see the comment at the timeout
 * in WalletWeb3AuthSignIn), so this only bounds a window left open.
 */
export const SIGN_IN_POPUP_TIMEOUT_MS = 15 * 60_000;

export class TimeoutError extends Error {
  constructor(label = "timeout") {
    super(label);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label = "timeout"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

type LeaveEvents = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export type RedirectWatch<T> = {
  promise: Promise<T>;
  /** Stop all timers and listeners (e.g. the page came back from bfcache). */
  cancel: () => void;
};

/**
 * Bound a full-page sign-in redirect. `flow` normally never settles (the page leaves first), so:
 * - no navigation within `startMs` → reject with TimeoutError(`startLabel`);
 * - once the page starts leaving (`beforeunload` / `pagehide`), call `onLeave` and wait at most
 *   `leaveGraceMs` more — a page still alive after that did not actually navigate.
 */
export function watchRedirectStart<T>(
  flow: Promise<T>,
  {
    target,
    startMs = REDIRECT_START_TIMEOUT_MS,
    leaveGraceMs = SIGN_IN_STEP_TIMEOUT_MS,
    startLabel = "web3auth_redirect_start_timeout",
    leaveLabel = "web3auth_redirect_stalled",
    onLeave,
  }: {
    target: LeaveEvents;
    startMs?: number;
    leaveGraceMs?: number;
    startLabel?: string;
    leaveLabel?: string;
    onLeave?: () => void;
  },
): RedirectWatch<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let left = false;
  let done = false;
  let rejectWatch: (err: unknown) => void = () => {};

  const cleanup = () => {
    done = true;
    if (timer !== undefined) clearTimeout(timer);
    target.removeEventListener("beforeunload", handleLeave);
    target.removeEventListener("pagehide", handleLeave);
  };
  function handleLeave() {
    if (left || done) return;
    left = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      cleanup();
      rejectWatch(new TimeoutError(leaveLabel));
    }, leaveGraceMs);
    onLeave?.();
  }

  const promise = new Promise<T>((resolve, reject) => {
    rejectWatch = reject;
    timer = setTimeout(() => {
      cleanup();
      reject(new TimeoutError(startLabel));
    }, startMs);
    target.addEventListener("beforeunload", handleLeave);
    target.addEventListener("pagehide", handleLeave);
    flow.then(
      (value) => {
        if (done) return;
        cleanup();
        resolve(value);
      },
      (err) => {
        if (done) return;
        cleanup();
        reject(err);
      },
    );
  });

  return { promise, cancel: cleanup };
}

/**
 * `connect_start` runs until the popup/redirect settles; `connect_finishing` covers the work left
 * afterwards (NextAuth sign-in, vault check, cloud connect) — without it the card kept saying
 * `connect_start` long after the code was accepted (the reported hang).
 */
export type SignInStage = "sdk_init" | "connect_start" | "connect_finishing" | "redirect_pending";

/** Debug line under the sign-in buttons: current stage, or the stage + label that failed. */
export function formatSignInStage(stage: SignInStage | null, failure?: string | null): string | null {
  if (failure) return stage ? `stage: ${stage} · ${failure}` : `failed: ${failure}`;
  return stage ? `stage: ${stage}` : null;
}

/**
 * The stage/failure line above is an internal machine label (e.g. "stage: connect_start") meant
 * for debugging, not for the sign-in card a normal user sees. Only show it when the page was
 * opened with `?debug=1` (or `#debug=1`); everyone else still gets it in `console.debug`.
 */
export function isSignInDebugEnabled(search: string, hash: string = ""): boolean {
  const query = new URLSearchParams(search.replace(/^\?/, ""));
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  return query.get("debug") === "1" || fragment.get("debug") === "1";
}

/** Short machine label of a sign-in error for logs and the stage line. */
export function signInErrorLabel(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  return typeof err === "string" ? err : "unknown_error";
}
