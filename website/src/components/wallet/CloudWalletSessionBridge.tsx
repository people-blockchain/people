"use client";

import { useCallback, useEffect, useRef } from "react";
import { useWallet } from "@/context/WalletContext";
import {
  fetchAuthSessionUser,
  fetchVaultRecord,
  unlockCloudVaultSession,
  isCloudSessionId,
  isWalletCloudErrorCode,
  cloudRateLimitedUntil,
  cloudSessionMayRestore,
} from "@/lib/wallet-cloud-client";
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
  /** Ciphertext that will never decrypt should not be retried on every focus event. */
  const haltRestore = useRef(false);
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
    if (haltRestore.current) return;
    // `errorFrom` records every 429 here, including one raised by the sign-in card.
    if (!cloudSessionMayRestore(cloudRateLimitedUntil())) return;
    inFlight.current = true;
    void (async () => {
      try {
        const user = await fetchAuthSessionUser();
        if (!user) return;
        rememberAuthEmail(user.email);
        try {
          // Read only. Creating a vault belongs to the sign-in card; doing it from focus
          // events burned wrap-key and write budget for accounts that have no vault yet.
          const vault = await fetchVaultRecord();
          if (!vault) return;
          const cloud = await unlockCloudVaultSession(user.id, vault);
          if (latestSession.current) return;
          connectCloud(cloud);
          await fetch("/api/partner/wallet/sync-vault", { method: "POST", credentials: "include" });
        } catch (err) {
          const code = err instanceof Error ? err.message : "";
          if (code === "reauth_required" || code === "unauthorized") needsReauth.current = true;
          if (
            isWalletCloudErrorCode(err, "invalid_ciphertext") ||
            isWalletCloudErrorCode(err, "address_mismatch")
          ) {
            haltRestore.current = true;
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
      connectCloud({ ...session, kind: "cloud", userId: session.id.replace(/^cloud:/, "") });
    }
  }, [session, connectCloud]);

  return null;
}
