"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { walletUxCopy } from "@/lib/wallet-ux-copy";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIosStandaloneCapable() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream;
}

export function WalletInstallButton() {
  const { lang } = useLanguage();
  const c = walletUxCopy(lang);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }
    const onBip = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const onInstall = useCallback(async () => {
    if (isIosStandaloneCapable()) {
      setIosHint(true);
      return;
    }
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferred(null);
  }, [deferred]);

  if (installed) return null;

  const showInstall = Boolean(deferred) || isIosStandaloneCapable();
  if (!showInstall) return null;

  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-4">
      <button
        type="button"
        data-testid="wallet-install-button"
        onClick={() => void onInstall()}
        className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-ink"
      >
        {c.installApp}
      </button>
      {iosHint ? (
        <p className="mt-3 text-xs leading-relaxed text-ink-2">
          <span className="font-semibold text-ink">{c.installIosTitle}</span>
          <br />
          {c.installIosStep}
        </p>
      ) : null}
    </div>
  );
}
