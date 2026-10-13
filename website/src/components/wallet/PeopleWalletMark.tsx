"use client";

import { useLanguage } from "@/context/LanguageContext";
import { walletUxCopy } from "@/lib/wallet-ux-copy";

export function PeopleWalletMark({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const { lang } = useLanguage();
  const c = walletUxCopy(lang);
  const icon = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-11 w-11" : "h-9 w-9";
  const text = size === "sm" ? "text-sm" : size === "lg" ? "text-xl" : "text-base";
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/icon-192.png" alt="" className={`${icon} rounded-xl shadow-sm`} width={44} height={44} />
      <span className={`font-bold tracking-tight text-ink ${text}`}>{c.brandName}</span>
    </div>
  );
}
