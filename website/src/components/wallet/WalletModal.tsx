"use client";

import { useLanguage } from "@/context/LanguageContext";
import { useWalletModal } from "@/context/WalletModalContext";
import { walletCopy } from "@/lib/wallet-copy";
import { WalletDialog } from "./WalletDialog";
import { WalletConnectPanel } from "./WalletConnectPanel";
import { PeopleWalletMark } from "./PeopleWalletMark";

export function WalletModalHost() {
  const { isOpen, closeWalletModal } = useWalletModal();
  const { lang } = useLanguage();
  const t = walletCopy[lang];

  if (!isOpen) return null;

  return (
    <WalletDialog title={t.title} closeLabel={t.back} onClose={closeWalletModal} busy={false}>
      <PeopleWalletMark size="lg" className="mb-4" />
      <WalletConnectPanel onConnected={closeWalletModal} />
    </WalletDialog>
  );
}
