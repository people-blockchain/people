"use client";

import { useLanguage } from "@/context/LanguageContext";
import { walletUxCopy } from "@/lib/wallet-ux-copy";
import { walletFeatures, walletShowsSoonPlaceholders } from "@/lib/wallet-features";

function SoonBadge() {
  const { lang } = useLanguage();
  const c = walletUxCopy(lang);
  return (
    <span className="shrink-0 rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-3">
      {c.soonBadge}
    </span>
  );
}

export function WalletSoonOption({ label, testId }: { label: string; testId?: string }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      data-testid={testId}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 text-left text-sm font-semibold text-ink-2 opacity-80"
    >
      <span className="min-w-0">{label}</span>
      <SoonBadge />
    </button>
  );
}

export function WalletSoonAction({ label, testId }: { label: string; testId?: string }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      data-testid={testId}
      className="flex h-full min-h-[3.25rem] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface py-4 text-sm font-bold text-ink-2 opacity-80"
    >
      <span>{label}</span>
      <SoonBadge />
    </button>
  );
}

export function WalletConnectSoonSection() {
  const { lang } = useLanguage();
  const c = walletUxCopy(lang);
  const showGoogle = walletShowsSoonPlaceholders && !walletFeatures.googleOrEmailLogin;
  const showExternal = walletShowsSoonPlaceholders && !walletFeatures.externalWallets;
  if (!showGoogle && !showExternal) return null;
  return (
    <div className="space-y-2 border-t border-line pt-4" data-testid="wallet-connect-soon-section">
      {showGoogle ? <WalletSoonOption label={c.connectGoogleEmail} testId="wallet-soon-google-email" /> : null}
      {showExternal ? <WalletSoonOption label={c.connectExternalWallets} testId="wallet-soon-external-wallets" /> : null}
    </div>
  );
}
