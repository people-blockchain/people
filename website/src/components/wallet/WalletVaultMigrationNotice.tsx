"use client";

import { useLanguage } from "@/context/LanguageContext";
import { walletUxCopy } from "@/lib/wallet-ux-copy";
import { shortWalletAddress } from "@/lib/partner/bind-errors";

export function WalletVaultMigrationNotice({
  vaultAddress,
  newAddress,
  busy,
  onKeepExisting,
}: {
  vaultAddress: string;
  newAddress: string;
  busy: boolean;
  onKeepExisting: () => void;
}) {
  const { lang } = useLanguage();
  const c = walletUxCopy(lang);
  return (
    <div
      className="space-y-3 rounded-2xl border border-warm/40 bg-surface-2 p-4"
      data-testid="wallet-vault-migration"
    >
      <p className="text-sm font-semibold text-ink">{c.migrationTitle}</p>
      <p className="text-sm leading-relaxed text-ink-2">{c.migrationBody}</p>
      <p className="font-mono text-xs text-ink-3">
        {c.migrationExisting}: {shortWalletAddress(vaultAddress)}
      </p>
      <p className="font-mono text-xs text-ink-3">
        {c.migrationNew}: {shortWalletAddress(newAddress)}
      </p>
      <button
        type="button"
        disabled={busy}
        className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-ink disabled:opacity-40"
        onClick={onKeepExisting}
      >
        {c.migrationKeepExisting}
      </button>
    </div>
  );
}
