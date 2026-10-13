"use client";

import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import { useWalletModal } from "@/context/WalletModalContext";
import { uxCopy } from "@/lib/ux-copy";
import type { ReactNode } from "react";

type Props = {
  children?: ReactNode;
  className?: string;
  variant?: "button" | "link";
  onClick?: () => void;
  "data-testid"?: string;
};

const defaultButtonClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand px-4 text-base font-semibold text-brand-ink";

export function ConnectWalletButton({
  children,
  className,
  variant = "button",
  onClick,
  "data-testid": testId = "connect-wallet-button",
}: Props) {
  const { lang } = useLanguage();
  const u = uxCopy[lang];
  const { session } = useWallet();
  const { openWalletModal } = useWalletModal();

  if (session) return null;

  const label = children ?? u.connectWallet;

  const handleClick = () => {
    onClick?.();
    openWalletModal();
  };

  if (variant === "link") {
    return (
      <button
        type="button"
        data-testid={testId}
        onClick={handleClick}
        className={className ?? "font-semibold text-brand hover:underline"}
      >
        {label}
      </button>
    );
  }

  return (
    <button type="button" data-testid={testId} onClick={handleClick} className={className ?? defaultButtonClass}>
      {label}
    </button>
  );
}
