"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { partnerCopy } from "@/lib/partner/copy";
import { authErrorMessage } from "@/lib/partner/auth-errors";
import { useLanguage } from "@/context/LanguageContext";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { WalletConnectPanel } from "@/components/wallet/WalletConnectPanel";
import { UnifiedWalletAuthPanel } from "@/components/wallet/UnifiedWalletAuthPanel";
import { WalletSoonOption } from "@/components/wallet/WalletSoonOption";
import { WalletExternalConnectSection } from "@/components/wallet/WalletExternalConnectSection";
import { walletFeatures } from "@/lib/wallet-features";
import { walletUxCopy } from "@/lib/wallet-ux-copy";
import { isWeb3AuthActive } from "@/lib/web3auth-config";

export function LoginForm({
  errorCode,
  googleEnabled,
  magicEnabled,
  configured,
}: {
  callbackUrl: string;
  errorCode?: string;
  googleEnabled: boolean;
  magicEnabled: boolean;
  configured: boolean;
}) {
  const { lang } = useLanguage();
  const t = partnerCopy[lang];
  const w = walletUxCopy(lang);

  const errorHint = useMemo(() => {
    if (!configured) return t.notConfigured;
    return authErrorMessage(errorCode, t);
  }, [configured, errorCode, t]);

  // Web3Auth is its own sign-in path, and /login is where its mobile redirect returns to.
  const web3AuthEnabled = isWeb3AuthActive();
  const authAvailable = configured && (magicEnabled || googleEnabled || web3AuthEnabled);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-16">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_40%_at_82%_0%,rgba(245,158,11,0.14),transparent_70%),radial-gradient(38%_32%_at_4%_18%,rgba(3,105,161,0.10),transparent_70%)] dark:bg-[radial-gradient(50%_40%_at_82%_0%,rgba(251,191,36,0.12),transparent_70%),radial-gradient(38%_32%_at_4%_18%,rgba(76,196,248,0.12),transparent_70%)]"
          aria-hidden="true"
        />
        <div className="surface-elevated relative w-full max-w-lg rounded-3xl p-6 shadow-[var(--elev-1)] sm:p-8">
          <h1 className="text-h2 font-bold tracking-tight text-ink">{t.loginTitle}</h1>
          {errorHint && (
            <div
              className="mt-4 flex items-start gap-3 rounded-2xl border border-warm/40 bg-warm/10 px-4 py-3.5"
              role="note"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warm" aria-hidden="true" />
              <p className="text-sm font-medium leading-relaxed text-ink">{errorHint}</p>
            </div>
          )}

          {authAvailable ? (
            <div className="mt-6">
              <UnifiedWalletAuthPanel autoConnect showAgreement />
            </div>
          ) : null}
          {configured && !magicEnabled && !googleEnabled && !web3AuthEnabled && (
            <p className="mt-4 text-sm text-ink-3">{t.magicOff}</p>
          )}

          <div className="mt-8 border-t border-line pt-8">
            <h2 className="text-sm font-semibold text-ink">{t.localWalletHeading}</h2>
            <p className="mt-2 text-xs text-ink-3">{t.localWalletLead}</p>
            <div className="mt-4">
              <WalletConnectPanel context="sign-in-local" />
            </div>
            {walletFeatures.externalWallets ? (
              <div className="mt-4 border-t border-line pt-4">
                <WalletExternalConnectSection />
              </div>
            ) : (
              <div className="mt-4">
                <WalletSoonOption label={w.connectExternalWallets} testId="sign-in-soon-external" />
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
