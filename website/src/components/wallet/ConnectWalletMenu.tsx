"use client";

import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import { useExternalWallet } from "@/context/ExternalWalletContext";
import { walletUxCopy } from "@/lib/wallet-ux-copy";
import { WalletExternalConnectSection } from "./WalletExternalConnectSection";

export function ConnectWalletMenu() {
  const { lang } = useLanguage();
  const w = walletUxCopy(lang);
  const { session } = useWallet();
  const { connectEmbedded, signer } = useExternalWallet();

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-lg font-bold">{w.connectTitle}</h2>
      <div className="mt-4">
        <WalletExternalConnectSection compact />
      </div>
      {!signer ? (
        <div className="mt-3">
          {session ? (
            <button
              type="button"
              className="w-full rounded-xl border border-brand bg-brand/10 px-4 py-3 text-left text-sm font-semibold"
              onClick={() => connectEmbedded()}
            >
              {w.connectPeopleWallet}
            </button>
          ) : (
            <Link
              href="/wallet"
              className="block rounded-xl border border-line px-4 py-3 text-left text-sm font-semibold hover:border-brand"
            >
              {w.connectPeopleWallet}
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}
