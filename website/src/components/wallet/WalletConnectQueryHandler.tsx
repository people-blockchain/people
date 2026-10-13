"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useWalletModal } from "@/context/WalletModalContext";

/** Opens the connect modal after OAuth return (`?walletConnect=1`) without a full-page login flow. */
export function WalletConnectQueryHandler() {
  const searchParams = useSearchParams();
  const { openWalletModal } = useWalletModal();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    if (searchParams.get("walletConnect") !== "1") return;
    handled.current = true;
    openWalletModal();
  }, [searchParams, openWalletModal]);

  return null;
}
