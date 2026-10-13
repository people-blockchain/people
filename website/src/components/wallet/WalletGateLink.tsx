"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import { uxCopy } from "@/lib/ux-copy";
import { ConnectWalletButton } from "./ConnectWalletButton";

/** Dashboard link when connected; opens WalletModal when not. */
export function WalletGateLink({
  children,
  className,
  connectLabel,
  asButton = false,
}: {
  children?: ReactNode;
  className?: string;
  connectLabel?: string;
  asButton?: boolean;
}) {
  const { lang } = useLanguage();
  const u = uxCopy[lang];
  const { session } = useWallet();

  if (session) {
    return (
      <Link href="/wallet" className={className}>
        {children ?? u.myWallet}
      </Link>
    );
  }

  if (asButton) {
    return (
      <ConnectWalletButton className={className}>
        {connectLabel ?? children ?? u.connectWallet}
      </ConnectWalletButton>
    );
  }

  return (
    <ConnectWalletButton variant="link" className={className}>
      {connectLabel ?? children ?? u.connectWallet}
    </ConnectWalletButton>
  );
}
