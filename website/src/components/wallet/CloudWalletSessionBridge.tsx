"use client";

import { useCallback, useEffect, useRef } from "react";
import { useWallet } from "@/context/WalletContext";
import { fetchAuthSessionUser, ensureCloudWalletSession, isCloudSessionId, WalletCloudError } from "@/lib/wallet-cloud-client";
import { warnCloudOpenFailed } from "@/lib/wallet-cloud-crypto";
import { rememberAuthEmail } from "@/lib/wallet-auth-storage";
import { isUserDisconnected } from "@/lib/wallet-disconnect";

/**
 * After partner / magic-link / Web3Auth login, restore the cloud People Wallet in memory
 * so swap/factory and partner portal share the same embedded session.
 *
 * Retries on pageshow / visibility / focus: Android often returns to a document whose first
 * vault fetch raced a cold network and left the header on "Connect wallet" until a reload.
 */
export function CloudWalletSessionBridge() {
  const { session, connectCloud, markSessionHydrated } = useWallet();
  const inFlight = useRef(false);
  const needsReauth = useRef(false);
  // The vault lookup below is async; a local session restored from the tab store on load
  // (E2E-H2) must win that race instead of being silently replaced by the cloud wallet.
  const latestSession = useRef(session);
  useEffect(() => {
    latestSession.current = session;
  }, [session]);

  const tryRestore = useCallback(() => {
    if (isUserDisconnected()) return;
    if (latestSession.current) return;
    if (inFlight.current) return;
    // A session cookie past the 15-minute wrap-key window cannot reopen the vault by itself;
    // retrying on every focus/visibility change only floods the route with 401s. The user
    // re-opens it through the sign-in card, which re-establishes a fresh session.
    if (needsReauth.current) return;
    inFlight.current = true;
    void (async () => {
      try {
        const user = await fetchAuthSessionUser();
        if (!user) return;
        rememberAuthEmail(user.email);
        try {
          const cloud = await ensureCloudWalletSession(user);
          if (latestSession.current) return;
          await connectCloud(cloud);
          try {
            const synced = await fetch("/api/partner/wallet/sync-vault", { method: "POST", credentials: "include" });
            if (!synced.ok) {
              warnCloudOpenFailed({ code: "partner_sync_failed", stage: "partner_sync", vaultPresent: true, retried: false });
            }
          } catch {
            warnCloudOpenFailed({ code: "partner_sync_failed", stage: "partner_sync", vaultPresent: true, retried: false });
          }
        } catch (err) {
          const code = err instanceof WalletCloudError ? err.code : "unknown";
          if (code === "reauth_required" || code === "unauthorized") needsReauth.current = true;
          if (!(err instanceof WalletCloudError) || !err.logged) {
            warnCloudOpenFailed({ code, stage: "session_bridge", vaultPresent: false, retried: false });
          }
        }
      } finally {
        inFlight.current = false;
        markSessionHydrated();
      }
    })();
  }, [connectCloud, markSessionHydrated]);

  useEffect(() => {
    tryRestore();
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) tryRestore();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") tryRestore();
    };
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tryRestore);
    return () => {
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tryRestore);
    };
  }, [tryRestore]);

  useEffect(() => {
    if (session && isCloudSessionId(session.id) && session.kind !== "cloud") {
      void connectCloud({ ...session, kind: "cloud", userId: session.id.replace(/^cloud:/, "") }).catch((err) => {
        if (!(err instanceof WalletCloudError) || !err.logged) {
          warnCloudOpenFailed({ code: "session_open_failed", stage: "persist_session", vaultPresent: true, retried: false });
        }
      });
    }
  }, [session, connectCloud]);

  return null;
}
