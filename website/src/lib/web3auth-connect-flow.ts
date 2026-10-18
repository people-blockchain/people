import { WALLET_ADAPTERS, type IProvider, type LoginMethodConfig } from "@web3auth/base";
import { withTimeout } from "@/lib/mobile-env";

export type Web3AuthLoginMethod = "google" | "email_passwordless";

type AdapterLike = { status?: string; disconnect?: (options?: { cleanup?: boolean }) => Promise<void> };

export type Web3AuthConnectable = {
  connectTo: (adapter: string, params?: Record<string, unknown>) => Promise<IProvider | null>;
  authenticateUser: () => Promise<{ idToken: string }>;
  connected?: boolean;
  provider?: IProvider | null;
  walletAdapters?: Record<string, AdapterLike | undefined>;
  logout?: () => Promise<void>;
  getUserInfo?: () => Promise<{ email?: string | null }>;
};

/** If the Web3Auth picker appears, only Google + email (hide Facebook, Reddit, Discord, etc.). */
export const AUTH_LOGIN_METHODS: LoginMethodConfig = {
  google: { name: "Google", showOnModal: true, mainOption: true },
  // Email stays available but secondary — Google is the primary / first option on mobile.
  email_passwordless: { name: "Email", showOnModal: true, mainOption: false },
  facebook: { name: "Facebook", showOnModal: false },
  reddit: { name: "Reddit", showOnModal: false },
  discord: { name: "Discord", showOnModal: false },
  twitch: { name: "Twitch", showOnModal: false },
  apple: { name: "Apple", showOnModal: false },
  github: { name: "GitHub", showOnModal: false },
  linkedin: { name: "LinkedIn", showOnModal: false },
  twitter: { name: "Twitter", showOnModal: false },
  line: { name: "Line", showOnModal: false },
  wechat: { name: "WeChat", showOnModal: false },
  kakao: { name: "Kakao", showOnModal: false },
  weibo: { name: "Weibo", showOnModal: false },
};

/**
 * `initModal` config for the Auth adapter. `showOnModal` MUST stay true: @web3auth/modal 9.x
 * skips `adapter.init()` for adapters with `showOnModal: false`, the adapter stays "not_ready",
 * and `connectTo(AUTH)` then never settles (the adapter throws before emitting any event the
 * SDK's promise listens for) — the page never redirects to Google. We never open the SDK modal;
 * `showOnDesktop` / `showOnMobile: false` keep the adapter out of its UI.
 */
export type AuthModalAdapterConfig = {
  label: string;
  showOnModal: boolean;
  showOnDesktop: boolean;
  showOnMobile: boolean;
  loginMethods: LoginMethodConfig;
};

export function buildAuthModalConfig(): Record<string, AuthModalAdapterConfig> {
  return {
    [WALLET_ADAPTERS.AUTH]: {
      label: "auth",
      showOnModal: true,
      showOnDesktop: false,
      showOnMobile: false,
      loginMethods: AUTH_LOGIN_METHODS,
    },
  };
}

/** Auth adapter status, or "missing" when it is not registered. */
export function authAdapterStatus(web3auth: Pick<Web3AuthConnectable, "walletAdapters">): string {
  const adapter = web3auth.walletAdapters?.[WALLET_ADAPTERS.AUTH];
  return adapter ? String(adapter.status ?? "unknown") : "missing";
}

/** After init the Auth adapter must be ready (or already connected from a restored session). */
export function assertAuthAdapterReady(web3auth: Pick<Web3AuthConnectable, "walletAdapters">): void {
  const status = authAdapterStatus(web3auth);
  if (status !== "ready" && status !== "connected") {
    throw new Error(`web3auth_auth_adapter_not_ready:${status}`);
  }
}

export function buildWeb3AuthConnectParams(
  method: Web3AuthLoginMethod,
  emailHint?: string,
): Record<string, unknown> {
  const params: Record<string, unknown> = { loginProvider: method };
  if (method === "email_passwordless" && emailHint) {
    params.extraLoginOptions = { login_hint: emailHint };
  }
  return params;
}

/**
 * The idToken is read with `authenticateUser()` only after `connectTo` has resolved, i.e. it is
 * minted when the flow completes. However long the popup stays open (hCaptcha, email code), its
 * `iat` is the completion time, so the server's 600s replay window is unaffected. The
 * restored-session freshness check (`isRestoredIdTokenFresh`) applies only to a reused session
 * in `beginWeb3AuthConnect`; a fresh connect reached through here is never subject to it.
 */
async function withIdToken(
  web3auth: Web3AuthConnectable,
  provider: IProvider | null | undefined,
): Promise<{ provider: IProvider; idToken: string }> {
  if (!provider) throw new Error("web3auth_connect_failed");
  const { idToken } = await web3auth.authenticateUser();
  return { provider, idToken };
}

/**
 * A restored session replays the idToken minted at the original sign-in, so it stays usable only
 * while it is younger than this. Kept under the server's `WEB3AUTH_ID_TOKEN_MAX_AGE_SEC` (600)
 * so a reused token still passes verification, clock tolerance included.
 */
export const RESTORED_ID_TOKEN_MAX_AGE_SEC = 480;

/** `iat` (seconds since epoch) from a JWT payload, or null when it cannot be read. */
export function idTokenIssuedAtSec(idToken: string): number | null {
  try {
    const payload = idToken.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    // atob exists in browsers and Node; a Buffer-only decoder would not run in the page.
    const claims = JSON.parse(atob(padded)) as { iat?: unknown };
    return typeof claims.iat === "number" && Number.isFinite(claims.iat) ? claims.iat : null;
  } catch {
    return null;
  }
}

/**
 * Whether a restored session's idToken is still inside the replay window. An unreadable `iat` is
 * treated as fresh, preserving the previous reuse behaviour.
 */
export function isRestoredIdTokenFresh(
  idToken: string,
  nowSec: number = Date.now() / 1000,
  maxAgeSec: number = RESTORED_ID_TOKEN_MAX_AGE_SEC,
): boolean {
  const iat = idTokenIssuedAtSec(idToken);
  if (iat === null) return true;
  return nowSec - iat < maxAgeSec;
}

/**
 * A Web3Auth session restored from an earlier sign-in in this browser. The SDK's `connected`
 * flag and the Auth adapter's own status can disagree right after rehydration (the adapter is
 * already "connected" while `connected` is still false), so either signal counts. Treating
 * that state as "adapter not ready" broke every email sign-in after a Google login in the same
 * browser (`web3auth_auth_adapter_not_ready:connected`).
 */
export function hasRestoredWeb3AuthSession(
  web3auth: Pick<Web3AuthConnectable, "connected" | "walletAdapters">,
): boolean {
  return Boolean(web3auth.connected) || authAdapterStatus(web3auth) === "connected";
}

/** A restored session can answer a click directly only when it still has a provider. */
export function canReuseRestoredSession(
  web3auth: Pick<Web3AuthConnectable, "connected" | "walletAdapters" | "provider">,
): boolean {
  return hasRestoredWeb3AuthSession(web3auth) && Boolean(web3auth.provider);
}

/**
 * True when a restored session must be ended before this sign-in starts.
 *
 * Google resumes through a restored session that still has a provider. An email sign-in must
 * reach Web3Auth (that round trip sends the login code, and only its result may trigger the
 * vault/migration check), unless the restored session already belongs to the same email.
 */
export function shouldEndRestoredSessionBeforeConnect(
  method: Web3AuthLoginMethod,
  web3auth: Pick<Web3AuthConnectable, "connected" | "walletAdapters" | "provider">,
  sameEmail = false,
): boolean {
  if (!hasRestoredWeb3AuthSession(web3auth)) return false;
  if (!canReuseRestoredSession(web3auth)) return true;
  return method === "email_passwordless" && !sameEmail;
}

/** Whether the restored session was opened with this email (case-insensitive). Never throws. */
export async function restoredSessionEmailMatches(
  web3auth: Pick<Web3AuthConnectable, "getUserInfo">,
  email: string | undefined,
): Promise<boolean> {
  const wanted = email?.trim().toLowerCase();
  if (!wanted || typeof web3auth.getUserInfo !== "function") return false;
  try {
    const info = await web3auth.getUserInfo();
    return (info?.email ?? "").trim().toLowerCase() === wanted;
  } catch {
    return false;
  }
}

/**
 * End a restored session so `connectTo` can run: SDK logout, then the adapter's own disconnect
 * if the adapter still reports "connected" (logout is a no-op when the SDK flag is false).
 * Best-effort; never throws.
 */
export async function endRestoredWeb3AuthSession(web3auth: Web3AuthConnectable): Promise<void> {
  try {
    if (typeof web3auth.logout === "function") await web3auth.logout();
  } catch {
    /* fall through to the adapter */
  }
  const adapter = web3auth.walletAdapters?.[WALLET_ADAPTERS.AUTH];
  if (adapter && authAdapterStatus(web3auth) === "connected" && typeof adapter.disconnect === "function") {
    try {
      await adapter.disconnect({ cleanup: false });
    } catch {
      /* reported by beginWeb3AuthConnect */
    }
  }
}

/**
 * Ceiling on the restored-session pre-step (email check, SDK logout, adapter disconnect). Those
 * calls can hang on a half-restored adapter; unbounded, the click then stayed on "Signing in…"
 * forever with no connect ever started.
 */
export const RESTORED_SESSION_PREP_TIMEOUT_MS = 8_000;

export type RestoredSessionPrep = {
  /** Ends the restored SDK/adapter session (see `endRestoredWeb3AuthSession`). */
  endSession: (web3auth: Web3AuthConnectable) => Promise<void>;
  /** Ends the Web3Auth session that NextAuth also knows about (see `logoutWeb3AuthSession`). */
  logoutSession: () => Promise<void>;
  timeoutMs?: number;
};

/**
 * Decide the `reuseRestored` flag for `beginWeb3AuthConnect`, ending a session that must not
 * answer this click. Bounded and never rejecting: cleanup is best-effort, so a hung or failing
 * logout falls through to a fresh connect (`undefined`) instead of stranding the sign-in card.
 * The abandoned step may still settle later — it only touches storage and the SDK, not the UI.
 */
export async function prepareRestoredSessionForConnect(
  web3auth: Web3AuthConnectable,
  method: Web3AuthLoginMethod,
  emailHint: string | undefined,
  { endSession, logoutSession, timeoutMs = RESTORED_SESSION_PREP_TIMEOUT_MS }: RestoredSessionPrep,
): Promise<boolean | undefined> {
  if (!hasRestoredWeb3AuthSession(web3auth)) return undefined;
  const needsCheck = method === "email_passwordless" && canReuseRestoredSession(web3auth);
  const step = (needsCheck ? restoredSessionEmailMatches(web3auth, emailHint) : Promise.resolve(false)).then(
    async (sameEmail) => {
      if (shouldEndRestoredSessionBeforeConnect(method, web3auth, sameEmail)) {
        await endSession(web3auth);
        await logoutSession();
        return undefined;
      }
      return sameEmail || undefined;
    },
  );
  try {
    return await withTimeout(step, timeoutMs, "web3auth_restored_session_prep_timeout");
  } catch {
    return undefined;
  }
}

/** Start a fresh login: guard the adapter status, then connectTo (sync) and read the idToken. */
function connectFresh(
  web3auth: Web3AuthConnectable,
  method: Web3AuthLoginMethod,
  emailHint?: string,
): Promise<{ provider: IProvider; idToken: string }> {
  if (web3auth.walletAdapters) {
    const status = authAdapterStatus(web3auth);
    if (status !== "ready") {
      return Promise.reject(new Error(`web3auth_auth_adapter_not_ready:${status}`));
    }
  }
  const params = buildWeb3AuthConnectParams(method, emailHint);
  const connectPromise = web3auth.connectTo(WALLET_ADAPTERS.AUTH, params);
  return connectPromise.then((provider) => withIdToken(web3auth, provider));
}

/**
 * Popup-safe: call connectTo synchronously from a user-gesture handler.
 *
 * Fails fast instead of hanging where the SDK would: `connectTo` on an adapter that is not
 * "ready" (or is already "connected") throws inside the adapter, and the SDK's promise never
 * settles.
 */
export function beginWeb3AuthConnect(
  web3auth: Web3AuthConnectable,
  method: Web3AuthLoginMethod,
  emailHint?: string,
  options: { reuseRestored?: boolean } = {},
): Promise<{ provider: IProvider; idToken: string }> {
  // A restored Web3Auth session: no new login, the SDK would reject it as "Already connected".
  // Google resumes through it; email only when the caller confirmed it is the same email
  // (otherwise the caller ends it first, see shouldEndRestoredSessionBeforeConnect).
  const reuse = options.reuseRestored ?? method !== "email_passwordless";
  if (reuse && canReuseRestoredSession(web3auth)) {
    return withIdToken(web3auth, web3auth.provider).then((result) => {
      // The restored session answers with the idToken from its original sign-in. Once that is
      // outside the server's replay window every reuse is rejected (iat too old), so end the
      // session and log in again instead of replaying a dead token.
      if (isRestoredIdTokenFresh(result.idToken)) return result;
      return endRestoredWeb3AuthSession(web3auth).then(() => connectFresh(web3auth, method, emailHint));
    });
  }
  return connectFresh(web3auth, method, emailHint);
}

/** Root element @web3auth/ui mounts the SDK modal into (see `w3a-parent-container` in the SDK). */
export const SDK_MODAL_CONTAINER_ID = "w3a-parent-container";
export const SDK_MODAL_STYLE_ID = "people-web3auth-modal-hide";

type StyleDocument = {
  getElementById: (id: string) => unknown;
  createElement: (tag: string) => { id: string; textContent: string | null };
  head: { appendChild: (node: never) => unknown };
};

/**
 * We drive Web3Auth headless (`connectTo`) and finish into our own wallet UI, so the SDK modal
 * must never be visible. @web3auth/ui forces `modalVisibility: true` on a non-rehydrated
 * `connected` event (exactly what a redirect return emits) and on `errored`; hiding the
 * container with CSS covers every such path without touching adapter init.
 */
export function hideWeb3AuthModal(doc: StyleDocument): void {
  if (doc.getElementById(SDK_MODAL_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = SDK_MODAL_STYLE_ID;
  style.textContent = `#${SDK_MODAL_CONTAINER_ID}{display:none!important;visibility:hidden!important;pointer-events:none!important}`;
  doc.head.appendChild(style as never);
}

export type ModalHost = {
  loginModal?: { closeModal?: () => void };
  on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
};

/** Also close the SDK modal state on every adapter event that could reopen it. */
export function suppressWeb3AuthModal(host: ModalHost): void {
  const close = () => {
    try {
      host.loginModal?.closeModal?.();
    } catch {
      /* modal not mounted */
    }
  };
  for (const event of ["connecting", "connected", "errored"]) host.on?.(event, close);
  close();
}
