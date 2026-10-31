"use client";

import { useEffect, useRef } from "react";
import { walletUxCopy } from "@/lib/wallet-ux-copy";
import { previewWalletImport } from "@/lib/wallet-seed";
import { useWalletOnboarding, type WalletOnboardingMode } from "./useWalletOnboarding";
import { WalletConnectSoonSection } from "./WalletSoonOption";
import { UnifiedWalletAuthPanel } from "./UnifiedWalletAuthPanel";
import { WalletExternalConnectSection } from "./WalletExternalConnectSection";
import { walletFeatures } from "@/lib/wallet-features";
import { readLastAuthEmail } from "@/lib/wallet-auth-storage";
import { PeopleMobileConnect } from "./PeopleMobileConnect";

export function WalletConnectPanel({
  onConnected,
  className = "",
  startMode,
  startUnlockWalletId,
  context = "modal",
  importSignal = 0,
}: {
  onConnected?: () => void;
  className?: string;
  startMode?: WalletOnboardingMode;
  startUnlockWalletId?: string;
  /** `sign-in-local` skips cloud auth (used under `/login` after the shared auth block). */
  context?: "modal" | "sign-in" | "sign-in-local";
  /** Bump to open the existing import mode from a sibling sign-in error. */
  importSignal?: number;
}) {
  const flow = useWalletOnboarding(onConnected, { startMode, startUnlockWalletId });
  const {
    lang,
    t,
    wallets,
    mode,
    setMode,
    password,
    setPassword,
    password2,
    setPassword2,
    mnemonic,
    confirmIdx,
    confirmAnswers,
    setConfirmAnswers,
    importText,
    setImportText,
    busy,
    error,
    notice,
    createStep,
    setCreateStep,
    unlockTarget,
    startCreate,
    finishCreate,
    doImport,
    doUnlock,
    pickUnlock,
    resetToHome,
    setError,
  } = flow;
  const c = walletUxCopy(lang);
  const seenImportSignal = useRef(0);
  const openImport = () => {
    setError("");
    setMode("import");
  };
  useEffect(() => {
    if (!importSignal || importSignal === seenImportSignal.current) return;
    seenImportSignal.current = importSignal;
    setError("");
    setMode("import");
  }, [importSignal, setError, setMode]);
  const importPreview = mode === "import" ? previewWalletImport(importText) : null;
  const importReady =
    Boolean(importPreview && "address" in importPreview) || importText.trim().startsWith("{");

  if (flow.session && mode === "home") {
    return null;
  }

  const showCloudAuth = context === "modal";
  const showLocalHome = context === "modal" || context === "sign-in-local";
  // An account that already has a wallet (a remembered sign-in, or a keystore on this device)
  // gets one clear path: its sign-in above / its own keystore below. Offering "Create" and
  // "Import" next to it sent founders into a second, empty wallet.
  const hasExistingWallet = wallets.length > 0 || Boolean(readLastAuthEmail());

  return (
    <div className={className}>
      {error ? (
        <p className="text-sm text-warm">
          {t.error}: {error}
        </p>
      ) : null}
      {notice ? <p className="text-sm text-value">{notice}</p> : null}

      {mode === "home" && context === "modal" && walletFeatures.externalWallets ? (
        <div className="mb-6 space-y-3" data-testid="wallet-ext-block">
          <h3 className="text-sm font-semibold text-ink">{c.extHeading}</h3>
          <WalletExternalConnectSection onConnected={onConnected} />
        </div>
      ) : null}

      {mode === "home" && showCloudAuth ? (
        <div id="wallet-embedded-block" className={walletFeatures.externalWallets ? "border-t border-line pt-5" : ""}>
          <h3 className="mb-3 text-sm font-semibold text-ink">{c.embeddedHeading}</h3>
          <UnifiedWalletAuthPanel onConnected={onConnected} autoConnect onOpenImport={openImport} />
        </div>
      ) : null}

      {mode === "home" && showLocalHome ? (
        <div className={`space-y-4 ${showCloudAuth ? "mt-6 border-t border-line pt-6" : ""}`}>
          {context === "modal" ? <h3 className="text-sm font-semibold text-ink">{c.haveExistingWallet}</h3> : null}
          {!hasExistingWallet && wallets.length === 0 ? <p className="text-sm text-ink-2">{t.noWallets}</p> : null}
          {!hasExistingWallet ? (
          <div className="flex flex-wrap gap-3" data-testid="wallet-create-import">
            <button type="button" onClick={startCreate} className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-ink">
              {t.create}
            </button>
            <button
              type="button"
              onClick={openImport}
              className="rounded-xl border border-line px-5 py-3 text-sm"
            >
              {t.import}
            </button>
          </div>
          ) : null}
          {wallets.length > 0 ? (
            <ul className="space-y-2">
              {wallets.map((wallet) => (
                <li key={wallet.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-4">
                  <span className="break-all font-mono text-xs">{wallet.address}</span>
                  <button type="button" className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm" onClick={() => pickUnlock(wallet)}>
                    {t.unlock}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {context === "modal" ? <WalletConnectSoonSection /> : null}
          <PeopleMobileConnect onConnected={onConnected} />
        </div>
      ) : null}

      {mode === "create" ? (
        <div className="space-y-4">
          {createStep === 0 ? (
            <>
              <p className="text-sm text-warm">{t.writeDown}</p>
              <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {mnemonic.split(" ").map((word, i) => (
                  <li key={i} className="rounded-xl border border-line bg-surface px-3 py-2 font-mono text-sm">
                    {i + 1}. {word}
                  </li>
                ))}
              </ol>
              <button type="button" className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-ink" onClick={() => setCreateStep(1)}>
                {t.wroteDown}
              </button>
            </>
          ) : createStep === 1 ? (
            <>
              <p className="text-sm text-ink-2">{t.confirmWords}</p>
              {confirmIdx.map((index) => (
                <label key={index} className="block text-sm">
                  {t.wordN} {index}
                  <input
                    value={confirmAnswers[index] ?? ""}
                    onChange={(event) => setConfirmAnswers((prev) => ({ ...prev, [index]: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2"
                  />
                </label>
              ))}
              <button type="button" className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-ink" onClick={() => setCreateStep(2)}>
                {t.continue}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-3">{t.passwordHint}</p>
              <label className="block text-sm">
                {t.password}
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                {t.passwordConfirm}
                <input
                  type="password"
                  value={password2}
                  onChange={(event) => setPassword2(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void finishCreate()}
                className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-ink disabled:opacity-40"
              >
                {t.create}
              </button>
            </>
          )}
          <button type="button" className="text-sm text-ink-3" onClick={resetToHome}>
            {t.back}
          </button>
        </div>
      ) : null}

      {mode === "import" ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-2">{t.importHint}</p>
          <label className="block text-sm">
            {c.restore}
            <input
              type="file"
              accept="application/json,.json"
              className="mt-2 block w-full text-sm"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  if (file.size > 1000000) {
                    setError(t.error);
                    return;
                  }
                  void file.text().then(setImportText).catch(() => setError(t.error));
                }
              }}
            />
          </label>
          <textarea
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            rows={4}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 font-mono text-xs"
          />
          {importPreview && "address" in importPreview ? (
            <p className="text-sm text-ink-2" data-testid="import-address-preview">
              {t.importAddress}
              <span className="mt-1 block break-all font-mono text-xs text-ink">{importPreview.address}</span>
            </p>
          ) : null}
          {importPreview && "error" in importPreview ? (
            <p className="text-sm text-warm">{t.importInvalidKey}</p>
          ) : null}
          <label className="block text-sm">
            {t.password}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2"
            />
          </label>
          <button
            type="button"
            disabled={busy || !importReady}
            onClick={() => void doImport()}
            className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-ink disabled:opacity-40"
          >
            {t.import}
          </button>
          <button type="button" className="block text-sm text-ink-3" onClick={resetToHome}>
            {t.back}
          </button>
        </div>
      ) : null}

      {mode === "unlock" && unlockTarget ? (
        <div className="space-y-4">
          <p className="break-all font-mono text-xs">{unlockTarget.address}</p>
          <label className="block text-sm">
            {t.password}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void doUnlock()}
            className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-ink disabled:opacity-40"
          >
            {t.unlock}
          </button>
          <button type="button" className="block text-sm text-ink-3" onClick={resetToHome}>
            {t.back}
          </button>
        </div>
      ) : null}
    </div>
  );
}
