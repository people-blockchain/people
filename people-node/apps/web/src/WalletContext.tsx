import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { bindPendingReferrer } from "./referral.js";
import type { PendingWalletReveal, SessionWallet } from "./walletSession.js";

interface WalletContextValue {
  session: SessionWallet | null;
  pendingReveal: PendingWalletReveal | null;
  openSession: (session: SessionWallet) => void;
  lockSession: () => void;
  setPendingReveal: (pending: PendingWalletReveal | null) => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionWallet | null>(null);
  const [pendingReveal, setPendingReveal] = useState<PendingWalletReveal | null>(null);

  const openSession = useCallback((next: SessionWallet) => {
    bindPendingReferrer(next.address);
    setSession(next);
  }, []);

  const value = useMemo(
    () => ({
      session,
      pendingReveal,
      openSession,
      lockSession: () => {
        setSession(null);
        setPendingReveal(null);
      },
      setPendingReveal
    }),
    [session, pendingReveal, openSession]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within WalletProvider");
  }
  return ctx;
}
