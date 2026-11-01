"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useLanguage } from "@/context/LanguageContext";
import { partnerCopy } from "@/lib/partner/copy";
import { walletUxCopy } from "@/lib/wallet-ux-copy";
import { isWeb3AuthActive } from "@/lib/web3auth-config";
import { WalletCloudSignIn } from "./WalletCloudSignIn";

const WalletWeb3AuthSignIn = dynamic(
  () => import("./WalletWeb3AuthSignIn").then((m) => m.WalletWeb3AuthSignIn),
  { ssr: false },
);

export function UnifiedWalletAuthPanel({
  onConnected,
  autoConnect = false,
  showAgreement = false,
  showExplainer = true,
  onOpenImport,
}: {
  onConnected?: () => void;
  autoConnect?: boolean;
  showAgreement?: boolean;
  showExplainer?: boolean;
  onOpenImport?: () => void;
}) {
  const { lang } = useLanguage();
  const c = walletUxCopy(lang);
  const t = partnerCopy[lang];
  const mpcActive = isWeb3AuthActive();
  const explainer = mpcActive ? c.modalExplainerMpc : c.modalExplainer;

  return (
    <div className="space-y-4" data-testid="unified-wallet-auth">
      {showExplainer ? (
        <p className="text-sm leading-relaxed text-ink-2" data-testid="wallet-modal-explainer">
          {explainer}
        </p>
      ) : null}
      {mpcActive ? (
        <WalletWeb3AuthSignIn onConnected={onConnected} autoConnect={autoConnect} onOpenImport={onOpenImport} />
      ) : (
        <WalletCloudSignIn onConnected={onConnected} autoConnect={autoConnect} onOpenImport={onOpenImport} />
      )}
      {showAgreement ? (
        <p className="text-center text-xs leading-relaxed text-ink-3">
          {t.signInAgreementBefore}
          <Link href="/terms" className="text-brand hover:underline">
            {t.signInTermsLink}
          </Link>
          {t.signInAgreementAnd}
          <Link href="/privacy" className="text-brand hover:underline">
            {t.signInPrivacyLink}
          </Link>
          {t.signInAgreementAfter}
        </p>
      ) : null}
    </div>
  );
}
