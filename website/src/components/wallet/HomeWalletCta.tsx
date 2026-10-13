"use client";

import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import { homePublic } from "@/lib/home-public-content";
import { OpenSignInModalButton } from "@/components/wallet/OpenSignInModalButton";

/**
 * Homepage hero / footer: sign-in modal or /wallet when already connected.
 *
 * `label` overrides the default home copy (the redesigned homepage calls the
 * same action "Try the testnet"); omitting it keeps the original wording used
 * elsewhere on the site.
 */
export function HomeWalletCta({
  className,
  label,
  "data-testid": testId = "home-wallet-auth-cta",
}: {
  className?: string;
  label?: string;
  "data-testid"?: string;
}) {
  const { lang } = useLanguage();
  const { session } = useWallet();
  const t = homePublic[lang].hero;

  if (session) {
    return (
      <Link href="/wallet" className={className} data-testid="home-open-wallet">
        {label ?? t.ctaWallet}
      </Link>
    );
  }

  return (
    <OpenSignInModalButton className={className} data-testid={testId}>
      {label ?? t.ctaWalletAuth}
    </OpenSignInModalButton>
  );
}
