"use client";

import { signOutPartner } from "@/app/partner/actions";
import { partnerCopy } from "@/lib/partner/copy";
import { useLanguage } from "@/context/LanguageContext";
import {
  clearExternalWalletPersistence,
  logoutWeb3AuthSession,
  markUserDisconnected,
} from "@/lib/wallet-disconnect";

export function SignOutButton() {
  const { lang } = useLanguage();
  const t = partnerCopy[lang];

  async function handleSignOut() {
    // wallet-sessions.md #4: signing out of /partner used to leave the wallet session (Web3Auth
    // SDK state + wagmi/WalletConnect persistence) live. Clear it before the server-side
    // sign-out, the same way the full wallet disconnect flow does, without requiring the
    // WalletContext provider (which /partner does not mount).
    markUserDisconnected();
    clearExternalWalletPersistence();
    await logoutWeb3AuthSession();
    await signOutPartner();
  }

  return (
    <form action={handleSignOut}>
      <button
        type="submit"
        className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-2"
      >
        {t.signOut}
      </button>
    </form>
  );
}
