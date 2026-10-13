"use client";

import type { ReactNode } from "react";
import { useWalletModal } from "@/context/WalletModalContext";

/** Opens the unified People Wallet sign-in modal (no route change). */
export function OpenSignInModalButton({
  className,
  children,
  onNavigate,
  "data-testid": dataTestId = "open-sign-in-modal",
}: {
  className?: string;
  children: ReactNode;
  onNavigate?: () => void;
  "data-testid"?: string;
}) {
  const { openWalletModal } = useWalletModal();

  return (
    <button
      type="button"
      data-testid={dataTestId}
      className={className}
      onClick={() => {
        onNavigate?.();
        openWalletModal();
      }}
    >
      {children}
    </button>
  );
}
