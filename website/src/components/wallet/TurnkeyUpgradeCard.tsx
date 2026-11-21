"use client";

import { Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { walletUxCopy } from "@/lib/wallet-ux-copy";
import { shortWalletAddress } from "@/lib/partner/bind-errors";

export function TurnkeyUpgradeCard({
  legacyAddress,
  busy,
  error,
  onUpgrade,
  onLater,
}: {
  legacyAddress: string;
  busy: boolean;
  error?: string;
  onUpgrade: () => void;
  onLater: () => void;
}) {
  const { lang } = useLanguage();
  const c = walletUxCopy(lang);
  return (
    <div
      className="space-y-3 rounded-2xl border border-warm/40 bg-surface-2 p-4"
      data-testid="turnkey-upgrade-wallet"
    >
      <p className="text-sm font-semibold text-ink">{c.upgradeWalletTitle}</p>
      <p className="text-sm leading-relaxed text-ink-2">{c.upgradeWalletLead}</p>
      {legacyAddress ? (
        <p className="font-mono text-xs text-ink-3">
          {c.upgradeWalletAddress}: {shortWalletAddress(legacyAddress)}
        </p>
      ) : null}
      {error ? (
        <div className="space-y-2" role="alert">
          <p className="text-sm text-warm">{error}</p>
          <a href="/help" className="text-sm font-semibold text-brand hover:underline">
            {c.upgradeWalletSupport}
          </a>
        </div>
      ) : null}
      <button
        type="button"
        disabled={busy}
        data-testid="turnkey-upgrade-confirm"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-ink disabled:opacity-40"
        onClick={onUpgrade}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {c.upgradeWalletCta}
      </button>
      <button
        type="button"
        disabled={busy}
        data-testid="turnkey-upgrade-later"
        className="w-full rounded-xl border border-line px-4 py-2 text-sm"
        onClick={onLater}
      >
        {c.upgradeWalletLater}
      </button>
    </div>
  );
}
