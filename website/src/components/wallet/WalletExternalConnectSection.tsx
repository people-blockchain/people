"use client";

import { useEffect, useRef, useState } from "react";

const EXT_COPY: Record<string, { noApp: string; install: string; timeout: string; useGoogle: string }> = {
  en: {
    noApp: "{wallet} did not open. On a phone without the {wallet} app, install it first, or use the People Wallet above (Continue with Google) — it needs no app.",
    install: "Install {wallet}",
    timeout: "{wallet} did not answer. Close this window and try again, or use Continue with Google above.",
    useGoogle: "Use Continue with Google",
  },
  ru: {
    noApp: "{wallet} не открылся. Если на телефоне нет приложения {wallet}, сначала установите его — или используйте People Wallet выше («Продолжить с Google»), приложение не нужно.",
    install: "Установить {wallet}",
    timeout: "{wallet} не ответил. Закройте окно и попробуйте снова или войдите через Google выше.",
    useGoogle: "Войти через Google",
  },
};
const INSTALL_URL: Record<string, string> = {
  MetaMask: "https://metamask.io/download/",
  "Trust Wallet": "https://link.trustwallet.com/open_url?url=https%3A%2F%2Fwww.peopleblockchain.network%2Ffounders",
};
const EXT_CONNECT_TIMEOUT_MS = 60_000;
const APP_OPEN_GRACE_MS = 3_500;
import { Wallet } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useExternalWallet } from "@/context/ExternalWalletContext";
import { walletUxCopy } from "@/lib/wallet-ux-copy";
import { walletConnectProjectIdConfigured } from "@/lib/wallet-external-connect";
import { WALLET_APP_REDIRECT, isMobileBrowser } from "@/lib/mobile-env";

export function WalletExternalConnectSection({
  onConnected,
  compact = false,
}: {
  onConnected?: () => void;
  compact?: boolean;
}) {
  const { lang } = useLanguage();
  const w = walletUxCopy(lang);
  const { connectInjected, connectWalletConnect, setWalletConnectHooks, signer, disconnect } = useExternalWallet();
  const rootRef = useRef<HTMLDivElement>(null);
  // "no extension" (desktop) or "app will open" (mobile) step shown before any redirect.
  const [step, setStep] = useState<{ kind: "noExtension" | "deepLink"; wallet: string; vendor: "metamask" | "trust" } | null>(null);

  // Hide the site dialog while the WalletConnect QR is on screen; bring it back if it fails.
  useEffect(() => {
    const dialog = () => rootRef.current?.closest("dialog") ?? null;
    setWalletConnectHooks({
      onOpen: () => dialog()?.close(),
      onFailed: () => {
        const d = dialog();
        if (d && !d.open) d.showModal();
      },
    });
    return () => setWalletConnectHooks({});
  }, [setWalletConnectHooks]);

  const startInjected = (vendor: "metamask" | "trust", wallet: string) => {
    const hasProvider = typeof window !== "undefined" && Boolean((window as { ethereum?: unknown }).ethereum);
    if (!hasProvider) {
      setError("");
      setStep({ kind: isMobileBrowser() ? "deepLink" : "noExtension", wallet, vendor });
      return;
    }
    void run(() => connectInjected(vendor), wallet);
  };
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [installFor, setInstallFor] = useState<string | null>(null);
  const x = EXT_COPY[lang] ?? EXT_COPY.en;
  const showWalletConnect = walletConnectProjectIdConfigured();

  const run = async (fn: () => Promise<void>, walletName: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    setInstallFor(null);
    try {
      await Promise.race([
        fn(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("ext_connect_timeout")), EXT_CONNECT_TIMEOUT_MS)),
      ]);
      onConnected?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      const code = (err as { code?: number })?.code;
      if (message === WALLET_APP_REDIRECT) {
        // Navigating to the wallet app; keep the button busy and show progress.
        setNotice(w.walletOpeningApp.replace("{wallet}", walletName));
        // A deep link to a missing app does nothing on Android: if the page is still visible
        // after a moment, say so and offer the install link plus the no-app path.
        const left = { v: false };
        const onHide = () => {
          if (document.visibilityState === "hidden") left.v = true;
        };
        document.addEventListener("visibilitychange", onHide);
        window.setTimeout(() => {
          document.removeEventListener("visibilitychange", onHide);
          if (left.v || document.visibilityState === "hidden") return;
          setNotice("");
          setError(x.noApp.replaceAll("{wallet}", walletName));
          setInstallFor(INSTALL_URL[walletName] ? walletName : null);
        }, APP_OPEN_GRACE_MS);
        return;
      }
      if (message === "ext_connect_timeout") {
        setError(x.timeout.replace("{wallet}", walletName));
        return;
      }
      setError(
        message === "no_injected_provider"
          ? w.walletErrNotInstalled.replace("{wallet}", walletName)
          : message === "walletconnect_unconfigured"
            ? w.walletErrWalletConnect
            : message === "chain_add_failed"
              ? w.walletErrChainAdd.replace("{wallet}", walletName)
              : code === 4001 || /reject|cancel|denied|closed|reset/i.test(message)
              ? w.walletErrCancelled
              : w.walletErrGeneric,
      );
    } finally {
      setBusy(false);
    }
  };

  if (signer) {
    return (
      <div className="rounded-xl border border-line bg-surface-2 p-4">
        <p className="text-sm text-ink-2">{w.externalConnected}</p>
        <p className="mt-1 break-all font-mono text-xs">{signer.address}</p>
        <button type="button" className="mt-3 text-sm text-brand" onClick={() => disconnect()}>
          {w.disconnectExternal}
        </button>
      </div>
    );
  }

  const btnClass = compact
    ? "flex items-center gap-2.5 rounded-xl border border-line px-4 py-3 text-left text-sm font-semibold hover:border-brand disabled:opacity-50"
    : "flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left text-sm font-semibold hover:border-brand disabled:opacity-50";
  const iconBadge = (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/10 text-brand" aria-hidden="true">
      <Wallet className="h-4 w-4" />
    </span>
  );

  return (
    <div ref={rootRef} className="space-y-2" data-testid="wallet-external-connect">
      {step ? (
        <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-4" data-testid="wallet-ext-step">
          <p className="text-sm text-ink">
            {step.kind === "noExtension" ? w.noExtension : w.deepLinkIntro.replaceAll("{wallet}", step.wallet)}
          </p>
          <div className="flex flex-wrap gap-2">
            {step.kind === "deepLink" ? (
              <button
                type="button"
                data-testid="wallet-ext-open"
                className="min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-ink"
                onClick={() => {
                  const { vendor, wallet } = step;
                  setStep(null);
                  void run(() => connectInjected(vendor), wallet);
                }}
              >
                {w.openWallet.replaceAll("{wallet}", step.wallet)}
              </button>
            ) : null}
            <a
              href={INSTALL_URL[step.wallet]}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold"
            >
              {step.kind === "noExtension" ? w.installMetaMask.replace("MetaMask", step.wallet) : w.install}
            </a>
            {step.kind === "noExtension" && showWalletConnect ? (
              <button
                type="button"
                className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold"
                onClick={() => {
                  setStep(null);
                  void run(connectWalletConnect, "WalletConnect");
                }}
              >
                {w.scanQr}
              </button>
            ) : null}
            {step.kind === "deepLink" ? (
              <button
                type="button"
                className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold"
                onClick={() => {
                  setStep(null);
                  document.getElementById("wallet-embedded-block")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {w.signInGoogle}
              </button>
            ) : null}
            <button type="button" className="min-h-11 rounded-xl px-4 text-sm text-ink-3" onClick={() => setStep(null)}>
              {w.back}
            </button>
          </div>
        </div>
      ) : null}
      <div className={compact ? "grid gap-2 sm:grid-cols-2" : "grid gap-2"}>
        <button
          type="button"
          disabled={busy}
          className={btnClass}
          data-testid="wallet-connect-metamask"
          onClick={() => startInjected("metamask", "MetaMask")}
        >
          {iconBadge}
          {w.connectMetaMask}
        </button>
        <button
          type="button"
          disabled={busy}
          className={btnClass}
          data-testid="wallet-connect-trust"
          onClick={() => startInjected("trust", "Trust Wallet")}
        >
          {iconBadge}
          {w.connectTrust}
        </button>
        {showWalletConnect ? (
          <button
            type="button"
            disabled={busy}
            className={btnClass}
            data-testid="wallet-connect-walletconnect"
            onClick={() => void run(connectWalletConnect, "WalletConnect")}
          >
            {iconBadge}
            {w.connectWalletConnect}
          </button>
        ) : null}
      </div>
      {notice ? <p className="text-sm text-value" role="status">{notice}</p> : null}
      {error ? <p className="text-sm text-warm" role="alert" data-testid="wallet-external-error">{error}</p> : null}
      {installFor ? (
        <a
          href={INSTALL_URL[installFor]}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="wallet-external-install"
          className="inline-flex min-h-10 items-center rounded-full border border-brand/40 px-4 text-sm font-semibold text-brand"
        >
          {x.install.replace("{wallet}", installFor)}
        </a>
      ) : null}
    </div>
  );
}
