"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import { walletCopy } from "@/lib/wallet-copy";
import {
  assertCloudAccount,
  ensureCloudWalletSession,
  fetchAuthSessionUser,
  fetchVaultRecordClient,
  isCloudOpenRecoveryCode,
  WalletCloudError,
} from "@/lib/wallet-cloud-client";
import { sanitizeConsoleSignInLabel, warnCloudOpenFailed } from "@/lib/wallet-cloud-crypto";
import { createCloudVaultWithReauth, openCloudVaultWithReauth } from "@/lib/wallet-reauth-flow";
import { runParticipantRegistration } from "@/lib/participant-registration";
import { networkJson } from "@/lib/network-client";
import {
  formatContinueAsLabel,
  readLastAuthEmail,
  readLastAuthMethod,
  rememberAuthEmail,
  rememberAuthMethod,
  type LastAuthMethod,
} from "@/lib/wallet-auth-storage";
import { walletUxCopy } from "@/lib/wallet-ux-copy";
import {
  beginWeb3AuthConnect,
  consumeWeb3AuthRedirectResult,
  getWeb3Auth,
  keyPairFromWeb3AuthProvider,
  canReuseRestoredSession,
  endRestoredWeb3AuthSession,
  hasRestoredWeb3AuthSession,
  isRestoredIdTokenFresh,
  prepareRestoredSessionForConnect,
  RESTORED_SESSION_PREP_TIMEOUT_MS,
  type Web3AuthInstance,
} from "@/lib/web3auth-client";
import { createSignInAttempts, type SignInAttempts } from "@/lib/sign-in-attempt";
import {
  clearPendingRedirect,
  resolvePostSignInNavigation,
  runResumeOnce,
  SESSION_USER_RETRY_DELAYS_MS,
  takePendingRedirect,
  waitForFreshSessionUser,
  waitForWeb3AuthConnected,
  writePendingRedirect,
} from "@/lib/web3auth-redirect-resume";
import { clearUserDisconnected, isUserDisconnected, logoutWeb3AuthSession } from "@/lib/wallet-disconnect";
import {
  SIGN_IN_POPUP_TIMEOUT_MS,
  SIGN_IN_SLOW_NOTICE_MS,
  SIGN_IN_STEP_TIMEOUT_MS,
  TimeoutError,
  formatSignInStage,
  isSignInDebugEnabled,
  shouldUseRedirectSignIn,
  signInErrorLabel,
  watchRedirectStart,
  withTimeout,
  type SignInStage,
} from "@/lib/mobile-env";
import { WalletVaultMigrationNotice } from "./WalletVaultMigrationNotice";

/** After the redirect the SDK restores the session during init; give its event a moment. */
const RESUME_CONNECT_GRACE_MS = 8_000;

/**
 * A restored session replays the idToken minted at the original sign-in; once it leaves the
 * server's replay window every click reusing it is rejected. End it here (best-effort, never
 * throws) so the later click can run `connectTo` from its own gesture. A restored session with
 * no provider cannot answer a click either, so it is ended too.
 */
async function endStaleRestoredSession(web3auth: Web3AuthInstance): Promise<void> {
  if (!hasRestoredWeb3AuthSession(web3auth)) return;
  if (!canReuseRestoredSession(web3auth)) {
    await endRestoredWeb3AuthSession(web3auth);
    return;
  }
  try {
    const { idToken } = await web3auth.authenticateUser();
    if (!isRestoredIdTokenFresh(idToken)) await endRestoredWeb3AuthSession(web3auth);
  } catch {
    await endRestoredWeb3AuthSession(web3auth);
  }
}

type LoginOutcome = "connected" | "migration" | "failed";

function consoleSignInLabel(err: unknown): string {
  const label = err instanceof WalletCloudError ? err.code : signInErrorLabel(err);
  return sanitizeConsoleSignInLabel(label);
}

function warnIfUnlogged(err: unknown, stage: string, vaultPresent: boolean): void {
  if (!(err instanceof WalletCloudError) || err.logged) return;
  warnCloudOpenFailed({ code: err.code, stage, vaultPresent, retried: false });
}

function messageForCloudConnectError(
  code: string,
  copy: {
    signInFailed: string;
    signInRateLimited: string;
    signInSessionExpired: string;
    signInSessionMissing: string;
    signInDecryptFailed: string;
    signInVaultUnsupported: string;
    signInAddressMismatch: string;
    signInSessionOpenFailed: string;
  },
): string {
  if (code === "unauthorized") return copy.signInSessionMissing;
  if (code === "reauth_required") return copy.signInSessionExpired;
  if (code === "rate_limited") return copy.signInRateLimited;
  if (code === "decrypt_failed") return copy.signInDecryptFailed;
  if (code === "vault_schema_unsupported") return copy.signInVaultUnsupported;
  if (code === "address_mismatch" || code === "address_taken") return copy.signInAddressMismatch;
  if (code === "session_open_failed") return copy.signInSessionOpenFailed;
  return copy.signInFailed;
}

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function writePending(): void {
  const store = sessionStore();
  if (store) writePendingRedirect(store, `${window.location.pathname}${window.location.search}`);
}

function clearPending(): void {
  const store = sessionStore();
  if (store) clearPendingRedirect(store);
}

export function WalletWeb3AuthSignIn({
  onConnected,
  autoConnect = false,
  onOpenImport,
}: {
  onConnected?: () => void;
  autoConnect?: boolean;
  /** Opens the existing WalletConnectPanel import mode (encrypted backup or key). */
  onOpenImport?: () => void;
}) {
  const { lang } = useLanguage();
  const t = walletCopy[lang];
  const c = walletUxCopy(lang);
  const { session: walletSession, connectCloud } = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [pending, setPending] = useState<"email" | "google" | null>(null);
  const [knownEmail, setKnownEmail] = useState<string | null>(() => readLastAuthEmail());
  const lastIdTokenRef = useRef<string | null>(null);
  const [migration, setMigration] = useState<{
    vaultAddress: string;
    newAddress: string;
    userId: string;
    email?: string | null;
  } | null>(null);
  const web3authRef = useRef<Web3AuthInstance | null>(null);
  const [web3AuthReady, setWeb3AuthReady] = useState(false);
  /** The SDK did not come up (init threw, or it is not configured). Loading stays off screen. */
  const [initFailed, setInitFailed] = useState(false);
  const [initAttempt, setInitAttempt] = useState(0);
  const [redirecting, setRedirecting] = useState(false);
  const [stage, setStage] = useState<SignInStage | null>("sdk_init");
  const [failure, setFailure] = useState<string | null>(null);
  /** Nothing settled for a while: show "taking longer than usual" with a Retry, keep waiting. */
  const [slow, setSlow] = useState(false);
  const redirectWatchRef = useRef<{ cancel: () => void } | null>(null);
  const mountedRef = useRef(true);
  /** Where this attempt has to land once it finishes (a mobile redirect carries it out of band). */
  const returnToRef = useRef<string | null>(null);
  const lastAttemptRef = useRef<{
    method: "google" | "email_passwordless";
    emailHint?: string;
  } | null>(null);
  /**
   * Attempt ids + the slow-notice timer; one instance for the life of the component. The notice
   * only raises state — the attempt id decides whether it is still relevant — and the mount
   * effect below drops an armed timer when the component goes away.
   */
  const [attempts] = useState<SignInAttempts>(() =>
    createSignInAttempts(() => setSlow(true), SIGN_IN_SLOW_NOTICE_MS),
  );

  const describeError = useCallback(
    (err: unknown) => {
      // The stage line keeps the machine label visible on phones without a console.
      setFailure(consoleSignInLabel(err));
      if (err instanceof TimeoutError) {
        setErrorCode("");
        return c.signInTimeout;
      }
      const code = err instanceof WalletCloudError ? err.code : err instanceof Error && /^[a-z0-9_]+$/.test(err.message) ? err.message : "unknown";
      setErrorCode(code);
      return messageForCloudConnectError(code, c);
    },
    [c],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      attempts.clearSlowNotice();
    };
  }, [attempts]);

  const finishConnect = useCallback(
    async (
      userId: string,
      email?: string | null,
      options: { silent?: boolean; vaultPresent?: boolean } = {},
    ): Promise<boolean> => {
      // Automatic finishes (the autoConnect effect) must not put an error on the sign-in card:
      // only an attempt the user started — a click, or resuming our own redirect — may do that.
      const silent = options.silent ?? false;
      setBusy(true);
      if (!silent) {
        setError("");
        setErrorCode("");
      }
      let retried = false;
      try {
        clearUserDisconnected();
        rememberAuthEmail(email);
        if (email) setKnownEmail(email);
        const cloud = await openCloudVaultWithReauth({
          openVault: (session, attempt) => {
            retried = attempt?.retried === true;
            return ensureCloudWalletSession(
              { id: assertCloudAccount(session.id, userId) },
              { retried, vaultPresent: options.vaultPresent },
            );
          },
          signInWithIdToken: async (idToken) => {
            const again = await signIn("web3auth", { idToken, redirect: false });
            if (!again || again.error || !again.ok) throw new WalletCloudError("reauth_required");
          },
          fetchSession: fetchAuthSessionUser,
          idToken: lastIdTokenRef.current,
        });
        // Must be awaited: callers navigate (window.location.replace) right after this
        // resolves, and a reload before the session write lands is the "logged out after
        // reload" bug — see connectCloud in WalletContext.
        try {
          await connectCloud(cloud);
        } catch (err) {
          if (err instanceof WalletCloudError) throw err;
          warnCloudOpenFailed({ code: "session_open_failed", stage: "persist_session", vaultPresent: true, retried });
          throw new WalletCloudError("session_open_failed", { logged: true });
        }
        // Partner sync is bookkeeping; a slow response must not hold the wallet on "Opening…".
        void fetch("/api/partner/wallet/sync-vault", { method: "POST", credentials: "include" }).then(
          (res) => {
            if (!res.ok) {
              warnCloudOpenFailed({ code: "partner_sync_failed", stage: "partner_sync", vaultPresent: true, retried });
            }
          },
          () => {
            warnCloudOpenFailed({ code: "partner_sync_failed", stage: "partner_sync", vaultPresent: true, retried });
          },
        );
        void runParticipantRegistration(cloud.privateKey, cloud.address, {
          requestFaucet: async () => {
            await networkJson("faucet/fund", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ address: cloud.address, amount: 10 }),
            });
          },
        }).then(
          (result) => {
            if (!result.ok) {
              warnCloudOpenFailed({
                code: "participant_registration_failed",
                stage: "participant_registration",
                vaultPresent: true,
                retried,
              });
            }
          },
          () => {
            warnCloudOpenFailed({
              code: "participant_registration_failed",
              stage: "participant_registration",
              vaultPresent: true,
              retried,
            });
          },
        );
        setMigration(null);
        try {
          onConnected?.();
        } catch {
          warnCloudOpenFailed({ code: "on_connected_failed", stage: "on_connected", vaultPresent: true, retried });
          throw new WalletCloudError("on_connected_failed", { logged: true });
        }
        return true;
      } catch (err) {
        const code = err instanceof WalletCloudError ? err.code : "unknown";
        if (!(err instanceof WalletCloudError) || !err.logged) {
          warnCloudOpenFailed({
            code,
            stage: "finish_connect",
            vaultPresent: options.vaultPresent === true,
            retried,
          });
        }
        if (!silent) {
          setErrorCode(code);
          setError(messageForCloudConnectError(code, c));
        }
        return false;
      } finally {
        setBusy(false);
        setPending(null);
      }
    },
    [connectCloud, onConnected, c],
  );

  const afterWeb3AuthLogin = useCallback(
    async (idToken: string, provider: import("@web3auth/base").IProvider): Promise<LoginOutcome> => {
      lastIdTokenRef.current = idToken;
      const previous = await fetchAuthSessionUser();
      const previousAuthTime = typeof previous?.authTime === "number" ? previous.authTime : null;
      const auth = await signIn("web3auth", { idToken, redirect: false });
      if (!auth || auth.error || !auth.ok) {
        // The server rejects stale idTokens (replay window); a restored Web3Auth session keeps
        // its original token, so end it to make the next attempt a fresh login.
        if (web3authRef.current) await endRestoredWeb3AuthSession(web3authRef.current);
        await logoutWeb3AuthSession();
        const raw = auth?.error ?? "auth_sign_in_failed";
        const code = /^[a-z0-9_]+$/.test(raw) ? raw : "auth_sign_in_failed";
        warnCloudOpenFailed({ code, stage: "auth_sign_in", vaultPresent: false, retried: false });
        throw new WalletCloudError(code, { logged: true });
      }

      // The session cookie from the sign-in response can lag behind the next read on mobile.
      // A user id alone is not enough: the previous cookie is still a user, with a stale authTime.
      const user = await waitForFreshSessionUser(
        fetchAuthSessionUser,
        SESSION_USER_RETRY_DELAYS_MS,
        undefined,
        { newerThan: previousAuthTime },
      );
      if (!user?.id) {
        warnCloudOpenFailed({ code: "reauth_required", stage: "auth_session", vaultPresent: false, retried: false });
        throw new WalletCloudError("reauth_required", { logged: true });
      }

      rememberAuthEmail(user.email);
      const vault = await fetchVaultRecordClient();

      // A returning account opens the wallet already saved for it. The Web3Auth key is only
      // needed to create a vault; deriving it when a vault exists can throw before wrap-key runs.
      if (vault) {
        return (await finishConnect(user.id, user.email, { vaultPresent: true })) ? "connected" : "failed";
      }

      try {
        await createCloudVaultWithReauth({
          deriveKey: () => keyPairFromWeb3AuthProvider(provider),
          signInWithIdToken: async (token) => {
            const again = await signIn("web3auth", { idToken: token, redirect: false });
            if (!again || again.error || !again.ok) throw new WalletCloudError("reauth_required");
          },
          fetchSession: fetchAuthSessionUser,
          idToken: lastIdTokenRef.current,
        });
      } catch (err) {
        if (!(err instanceof WalletCloudError) || !err.logged) {
          const code = err instanceof WalletCloudError ? err.code : "unknown";
          warnCloudOpenFailed({ code, stage: "vault_create", vaultPresent: false, retried: false });
          throw new WalletCloudError(code, { logged: true });
        }
        throw err;
      }
      return (await finishConnect(user.id, user.email)) ? "connected" : "failed";
    },
    [finishConnect],
  );

  /**
   * Leave the page a finished sign-in started on. Both the popup and the redirect resume end
   * here; staying put leaves the sign-in panel up over a valid session, and the next click then
   * "succeeds" again without ever leaving — the loop the owner hit. Only /login actually moves:
   * anywhere else the resolved target is the current page, so the wallet modal just closes.
   */
  const navigateAfterSignIn = useCallback((returnTo?: string | null) => {
    const current = `${window.location.pathname}${window.location.search}`;
    const target = resolvePostSignInNavigation(current, returnTo);
    if (!target) return;
    console.info(`[wallet] web3auth sign-in complete, opening ${target}`);
    // replace: Back must not land on the half-finished sign-in page.
    window.location.replace(target);
  }, []);

  /**
   * The vault wallet is the one this account already has; connecting it finishes the sign-in.
   * Leaving the page afterwards is the same rule as every other finish — without it the notice
   * unmounts, the email form comes back, and "Keep" looks like it did nothing.
   */
  const keepExistingWallet = useCallback(async () => {
    if (!migration) return;
    const connected = await finishConnect(migration.userId, migration.email);
    if (connected && mountedRef.current) navigateAfterSignIn(returnToRef.current);
  }, [finishConnect, migration, navigateAfterSignIn]);

  const startConnect = useCallback(
    (method: "google" | "email_passwordless", emailHint?: string) => {
      lastAttemptRef.current = { method, emailHint };
      rememberAuthMethod(method);
      // Retire whatever is in flight: from here on every continuation of the old attempt — its
      // catch and its finally included — is ignored, so a late popup result cannot clear the busy
      // state of the attempt starting now. Its own timers are dropped, the popup just stays open.
      const attempt = attempts.begin();
      const isCurrent = () => mountedRef.current && attempts.isCurrent(attempt);
      redirectWatchRef.current?.cancel();
      redirectWatchRef.current = null;
      setSlow(false);
      setPending(method === "google" ? "google" : "email");
      setError("");
      setErrorCode("");
      setFailure(null);
      setStage("connect_start");
      setBusy(true);

      const web3auth = web3authRef.current;
      if (!web3auth) {
        setBusy(false);
        setPending(null);
        setStage(null);
        // An SDK init failure on load is silent (see the init effect); this click is the first
        // the user sees of it. Bump initAttempt so the SDK is initialised again for the retry.
        setError(t.signInOpening);
        setInitAttempt((n) => n + 1);
        return;
      }

      returnToRef.current = `${window.location.pathname}${window.location.search}`;

      // No visible progress within 20s → the card says so and offers a Retry (which starts a new
      // attempt, retiring this one). Advisory only: a popup left open keeps its own 15-min ceiling.
      attempts.armSlowNotice(attempt);

      const connect = (reuseRestored?: boolean) => {
        if (!isCurrent()) return;
        // Mobile uses a full-page redirect: remember where to come back to.
        const redirect = shouldUseRedirectSignIn();
        if (redirect) {
          writePending();
          setRedirecting(true);
        }

        // connectTo must start in this same turn (popup blockers): nothing is awaited before it.
        const flow = beginWeb3AuthConnect(web3auth, method, emailHint, { reuseRestored });
        let connectFlow: Promise<Awaited<typeof flow>>;
        if (redirect) {
          // The page should start leaving within seconds; a stall is reported after 15s, not 30.
          const watch = watchRedirectStart(flow, {
            target: window,
            onLeave: () => {
              if (isCurrent()) setStage("redirect_pending");
            },
          });
          redirectWatchRef.current = watch;
          connectFlow = watch.promise;
        } else {
          // A person can spend minutes in the popup's hCaptcha and email-code pages, so the
          // ceiling is high. A closed popup still fails fast: @web3auth/auth's PopupHandler
          // watches the opened window and, on "close", rejects handleLoginWindow with
          // LoginError.popupClosed ("login popup has been closed by the user"); auth-adapter's
          // connect surfaces that through the SDK's ERRORED event, so connectTo rejects here.
          connectFlow = withTimeout(flow, SIGN_IN_POPUP_TIMEOUT_MS, "web3auth_popup_timeout");
        }
        void connectFlow
          .then(async ({ provider, idToken }) => {
            if (!isCurrent()) return null;
            // The code was accepted: the work left (NextAuth sign-in, vault check, cloud connect)
            // runs here, and the card must say so instead of leaving `connect_start` up.
            setStage("connect_finishing");
            attempts.armSlowNotice(attempt);
            return withTimeout(
              afterWeb3AuthLogin(idToken, provider),
              SIGN_IN_STEP_TIMEOUT_MS,
              "sign_in_timeout",
            );
          })
          .then((outcome) => {
            if (!isCurrent() || outcome === null) return;
            clearPending();
            setSlow(false);
            attempts.clearSlowNotice();
            setStage(null);
            // Popup sign-in finishes in place: the page it started on (usually /login) has to
            // leave on its own, otherwise the panel stays up over a valid session and the next
            // click re-uses the cached Web3Auth session — the "login loop".
            if (outcome === "connected") navigateAfterSignIn();
          })
          .catch((err) => {
            console.error("[wallet] web3auth sign-in failed", consoleSignInLabel(err));
            warnIfUnlogged(err, "sign_in", false);
            if (!isCurrent()) return;
            clearPending();
            setSlow(false);
            attempts.clearSlowNotice();
            setError(describeError(err));
            setPending(null);
          })
          .finally(() => {
            if (!isCurrent()) return;
            attempts.clearSlowNotice();
            setSlow(false);
            redirectWatchRef.current = null;
            setBusy(false);
            setRedirecting(false);
          });
      };

      // `connectTo` can also throw synchronously (a stuck adapter): nothing awaits it then, so the
      // card would keep its busy state (and the chain would reject unhandled). Every start path
      // funnels its failures here, and the attempt id keeps a retired click out of this state.
      const failStart = (err: unknown) => {
        console.error("[wallet] web3auth connect failed to start", consoleSignInLabel(err));
        if (!isCurrent()) return;
        attempts.clearSlowNotice();
        setSlow(false);
        setError(describeError(err));
        setPending(null);
        setBusy(false);
        setRedirecting(false);
      };

      // No restored session (the usual case): connect synchronously in this turn, so connectTo
      // runs on the click's own gesture.
      if (!hasRestoredWeb3AuthSession(web3auth)) {
        try {
          connect();
        } catch (err) {
          failStart(err);
        }
        return;
      }

      // A session restored from an earlier sign-in must not answer an email click for a different
      // identity (it would run the vault/migration check before any email auth and send no code),
      // and a restored adapter without a provider cannot be reused at all: end it, then log in.
      // Bounded (8s) and it never rejects — a hung SDK logout falls through to a fresh connect
      // instead of leaving the card on "Signing in…" forever (the reported bug).
      void prepareRestoredSessionForConnect(web3auth, method, emailHint, {
        endSession: endRestoredWeb3AuthSession,
        logoutSession: logoutWeb3AuthSession,
      })
        .then((reuseRestored) => {
          if (isCurrent()) connect(reuseRestored);
        })
        .catch(failStart);
    },
    [afterWeb3AuthLogin, attempts, describeError, navigateAfterSignIn, t.signInOpening],
  );

  useEffect(() => {
    let cancelled = false;
    setWeb3AuthReady(false);
    setInitFailed(false);
    setStage("sdk_init");
    setFailure(null);
    getWeb3Auth()
      .then(async (instance) => {
        if (cancelled) return;
        web3authRef.current = instance;
        setWeb3AuthReady(Boolean(instance));
        // No instance means no usable SDK: keep the controls live so a click retries init.
        setInitFailed(!instance);
        setStage(null);
        // A failed-init click shows t.signInOpening and re-runs this effect; clear that line
        // once the SDK is actually up so the card does not keep reporting a completed retry.
        setError("");
        setErrorCode("");

        // Returning from the mobile redirect: Web3Auth restored the session during init.
        // The flag comes from the URL itself, so a lost sessionStorage entry cannot strand it.
        const store = sessionStore();
        const pendingRedirect = store ? takePendingRedirect(store) : null;
        const cameBack = consumeWeb3AuthRedirectResult();
        // Not resuming a redirect: a restored session that can answer a click directly is only
        // worth keeping while its idToken is still inside the server's replay window. End a
        // stale one (or one without a provider) now, so the next click reaches connectTo
        // synchronously — its own gesture, so the popup is not blocked.
        if (instance && !pendingRedirect && !cameBack) {
          // Automatic cleanup on load: never surfaces an error (console only), so a hard reload
          // of /wallet does not show "Sign-in could not be completed" before any click. Bounded:
          // a hung SDK call here must not also hold back a redirect resume (busy is not set yet,
          // so a stall would leave the page silently waiting).
          try {
            await withTimeout(
              endStaleRestoredSession(instance),
              RESTORED_SESSION_PREP_TIMEOUT_MS,
              "web3auth_restored_session_prep_timeout",
            );
          } catch (err) {
            console.error("[wallet] stale session cleanup failed", consoleSignInLabel(err));
          }
        }
        if (!instance || (!pendingRedirect && !cameBack)) return;
        returnToRef.current = pendingRedirect?.returnTo ?? null;

        setPending("google");
        setBusy(true);
        try {
          const outcome = await runResumeOnce(() =>
            withTimeout(
              (async (): Promise<LoginOutcome> => {
                const connected = await waitForWeb3AuthConnected(instance, RESUME_CONNECT_GRACE_MS);
                if (!connected || !instance.provider) throw new Error("web3auth_resume_not_connected");
                const provider = instance.provider;
                const { idToken } = await instance.authenticateUser();
                // Same visible phase as the popup path once the Web3Auth step answered.
                if (mountedRef.current) setStage("connect_finishing");
                return afterWeb3AuthLogin(idToken, provider);
              })(),
              SIGN_IN_STEP_TIMEOUT_MS,
              "sign_in_timeout",
            ),
          );
          if (outcome === "connected") {
            setStage(null);
            navigateAfterSignIn(pendingRedirect?.returnTo);
          }
        } catch (err) {
          console.error("[wallet] web3auth resume failed", consoleSignInLabel(err));
          warnIfUnlogged(err, "resume", false);
          if (mountedRef.current) setError(describeError(err));
        } finally {
          if (mountedRef.current) {
            setBusy(false);
            setPending(null);
          }
        }
      })
      .catch((err) => {
        // Loading the SDK is automatic: report it to the console, never on the sign-in card.
        // The failure is kept (buttons stay enabled); a click re-runs startConnect, which finds
        // no instance, shows the failure then and bumps initAttempt to try the SDK again.
        console.error("[wallet] web3auth init failed", consoleSignInLabel(err));
        if (cancelled) return;
        setWeb3AuthReady(false);
        setInitFailed(true);
        setStage(null);
      });
    return () => {
      cancelled = true;
    };
    // afterWeb3AuthLogin is stable enough; re-running init on its identity would loop sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initAttempt]);

  // Back button from the Google page restores this page from bfcache with stale "busy" state.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      redirectWatchRef.current?.cancel();
      redirectWatchRef.current = null;
      clearPending();
      setBusy(false);
      setPending(null);
      setRedirecting(false);
      setSlow(false);
      setStage(null);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const retry = useCallback(() => {
    setError("");
    setErrorCode("");
    setSlow(false);
    const last = lastAttemptRef.current;
    if (web3AuthReady && last) {
      // Also the Retry of the "taking longer than usual" notice: starting an attempt retires the
      // running one, so its late result (or its finally) can no longer clear this attempt's state.
      startConnect(last.method, last.emailHint);
      return;
    }
    setInitAttempt((n) => n + 1);
  }, [startConnect, web3AuthReady]);

  useEffect(() => {
    if (!autoConnect || walletSession || isUserDisconnected()) return;
    let cancelled = false;
    void (async () => {
      const user = await fetchAuthSessionUser();
      if (!user?.id || cancelled) return;
      // wrap-key enforces the reauth window. A fast client clock must not skip a fresh session.
      await finishConnect(user.id, user.email, { silent: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [autoConnect, walletSession, finishConnect]);

  // The SDK is a few hundred KB plus a project-config fetch: say so instead of a dead grey button.
  // A silent init failure is not a load in progress — stop the spinner and let a click retry.
  const sdkLoading = !web3AuthReady && !initFailed && !error;
  /** The controls can accept a click: the SDK is up, or a failed init will be retried on click. */
  const controlsEnabled = web3AuthReady || initFailed;
  const statusText = sdkLoading
    ? c.signInPreparing
    : busy
      ? redirecting
        ? c.signInRedirecting
        : stage === "connect_finishing"
          ? c.signInFinishing
          : t.signInOpening
      : null;
  const googleWorking = sdkLoading || pending === "google";
  const stageText = formatSignInStage(error || busy || sdkLoading ? stage : null, error ? failure : null);
  // The raw machine label (e.g. "stage: connect_start") must never leak to a normal user mid
  // sign-in; it stays in the console unless the page was opened with ?debug=1.
  const debugEnabled =
    typeof window !== "undefined" && isSignInDebugEnabled(window.location.search, window.location.hash);
  useEffect(() => {
    if (stageText) console.debug("[wallet] web3auth sign-in stage", stageText);
  }, [stageText]);

  return (
    <div className="space-y-3" data-testid="wallet-web3auth-sign-in">
      {error ? (
        <div className="space-y-2" role="alert" data-testid="wallet-sign-in-error">
          <p className="text-sm text-warm">{error}</p>
          {onOpenImport && isCloudOpenRecoveryCode(errorCode) ? (
            <button
              type="button"
              data-testid="wallet-sign-in-import"
              className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold"
              onClick={onOpenImport}
            >
              {t.import}
            </button>
          ) : null}
          <button
            type="button"
            data-testid="wallet-sign-in-retry"
            className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold"
            onClick={retry}
          >
            {c.signInRetry}
          </button>
        </div>
      ) : null}
      {statusText ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="wallet-sign-in-status"
          data-state={sdkLoading ? "loading" : "busy"}
          className="flex items-center gap-2 text-sm text-value"
        >
          <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
          {statusText}
        </p>
      ) : null}

      {stageText && debugEnabled ? (
        <p data-testid="wallet-sign-in-stage" data-stage={stage ?? ""} className="font-mono text-xs text-ink-2">
          {stageText}
        </p>
      ) : null}

      {slow && !error ? (
        <div className="space-y-2" role="status" aria-live="polite" data-testid="wallet-sign-in-slow">
          <p className="text-sm text-ink-2">{c.signInSlow}</p>
          <button
            type="button"
            data-testid="wallet-sign-in-slow-retry"
            className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold"
            onClick={retry}
          >
            {c.signInRetry}
          </button>
        </div>
      ) : null}

      {migration ? (
        <WalletVaultMigrationNotice
          vaultAddress={migration.vaultAddress}
          newAddress={migration.newAddress}
          busy={busy}
          onKeepExisting={() => void keepExistingWallet()}
        />
      ) : null}

      {!migration ? (
        <>
          <button
            type="button"
            disabled={busy || pending !== null || !controlsEnabled}
            aria-busy={googleWorking}
            data-testid="wallet-sign-in-google"
            data-state={sdkLoading ? "loading" : web3AuthReady ? "ready" : "unavailable"}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-ink ${
              googleWorking ? "cursor-wait disabled:opacity-80" : "disabled:opacity-40"
            }`}
            onClick={() => startConnect("google")}
          >
            {googleWorking ? <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" /> : null}
            {pending === "google" ? t.signingIn : t.signInGoogle}
          </button>

          {knownEmail ? (
            <button
              type="button"
              disabled={busy || pending !== null || !controlsEnabled}
              data-testid="wallet-continue-as"
              className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
              onClick={() => {
                // Prefer the last successful provider. A Google-created account must not be
                // routed into email OTP just because we remembered the email address.
                const method: LastAuthMethod = readLastAuthMethod();
                startConnect(method, method === "email_passwordless" ? knownEmail : undefined);
              }}
            >
              {pending === "email" || pending === "google"
                ? t.signingIn
                : formatContinueAsLabel(c.continueAs, knownEmail)}
            </button>
          ) : null}

          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
              if (!email) return;
              rememberAuthEmail(email);
              setKnownEmail(email);
              startConnect("email_passwordless", email);
            }}
          >
            <label className="block text-sm text-ink-2" htmlFor="wallet-web3auth-email">
              {t.signInEmailLabel}
            </label>
            <input
              id="wallet-web3auth-email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={knownEmail ?? ""}
              placeholder={t.signInEmailPlaceholder}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm"
              disabled={busy || pending !== null || !controlsEnabled}
            />
            <button
              type="submit"
              disabled={busy || pending !== null || !controlsEnabled}
              data-testid="wallet-sign-in-email"
              className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
            >
              {pending === "email" ? t.signingIn : t.signInMagicCta}
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
