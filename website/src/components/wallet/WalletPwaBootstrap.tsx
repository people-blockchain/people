"use client";

import { useEffect } from "react";

export function WalletPwaBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/people-wallet-sw.js", { scope: "/wallet" }).catch(() => {});
  }, []);
  return null;
}
