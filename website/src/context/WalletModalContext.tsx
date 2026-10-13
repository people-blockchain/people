"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { walletModalReducer } from "@/lib/wallet-modal-state";
import { useWallet } from "@/context/WalletContext";
import { clearUserDisconnected } from "@/lib/wallet-disconnect";
import { isWeb3AuthActive } from "@/lib/web3auth-config";

interface WalletModalContextValue {
  isOpen: boolean;
  openWalletModal: () => void;
  closeWalletModal: () => void;
}

const WalletModalContext = createContext<WalletModalContextValue | null>(null);

export function WalletModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, dispatch] = useReducer(walletModalReducer, false);
  const { session } = useWallet();

  const openWalletModal = useCallback(() => {
    clearUserDisconnected();
    // Start loading the sign-in SDK with the click, not after the modal has rendered.
    if (isWeb3AuthActive()) void import("@/lib/web3auth-client").then((m) => m.warmWeb3Auth());
    dispatch({ type: "open" });
  }, []);
  const closeWalletModal = useCallback(() => dispatch({ type: "close" }), []);

  useEffect(() => {
    if (session && isOpen) {
      dispatch({ type: "close" });
    }
  }, [session, isOpen]);

  const value = useMemo(
    () => ({ isOpen, openWalletModal, closeWalletModal }),
    [isOpen, openWalletModal, closeWalletModal]
  );

  return <WalletModalContext.Provider value={value}>{children}</WalletModalContext.Provider>;
}

export function useWalletModal() {
  const ctx = useContext(WalletModalContext);
  if (!ctx) throw new Error("WalletModalProvider required");
  return ctx;
}
