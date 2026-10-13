"use client";

import Link from "next/link";
import { WalletGateLink } from "@/components/wallet/WalletGateLink";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { uxCopy } from "@/lib/ux-copy";
import { useLanguage } from "@/context/LanguageContext";
import { factoryCopy } from "@/lib/factory-content";
import type { FactoryPublicConfig } from "@/lib/factory-config";
import { Chip, Eyebrow } from "@/components/ui/primitives";

/** Icon badge tints, matching the colored icon badges on the homepage "what you can do" cards. */
const CARD_ICON_WRAP = "grid h-11 w-11 shrink-0 place-items-center rounded-2xl";
const TOKEN_ICON = (
  <span className={`${CARD_ICON_WRAP} bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200`}>
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-1.1A3.5 3.5 0 0 1 8.5 13h2a1.5 1.5 0 1 0 1.5-1.5 3.5 3.5 0 0 1-1-6.9V3.5h2v1.1A3.5 3.5 0 0 1 15.5 8h-2A1.5 1.5 0 1 0 12 9.5a3.5 3.5 0 0 1 1 6.9V17Z" />
    </svg>
  </span>
);
const NFT_ICON = (
  <span className={`${CARD_ICON_WRAP} bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200`}>
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Zm3 3v3h4V8H7Zm6 0v1.5h4V8h-4Zm0 3.5V13h4v-1.5h-4ZM7 14v1.5h10V14H7Z" />
    </svg>
  </span>
);
const CONTRACT_ICON = (
  <span className={`${CARD_ICON_WRAP} bg-violet-100 text-violet-800 dark:bg-violet-400/15 dark:text-violet-200`}>
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M8.7 15.9 4.8 12l3.9-3.9-1.4-1.4L2 12l5.3 5.3 1.4-1.4Zm6.6 0 3.9-3.9-3.9-3.9 1.4-1.4L22 12l-5.3 5.3-1.4-1.4Z" />
    </svg>
  </span>
);

export function FactoryHub() {
  const { lang } = useLanguage();
  const t = factoryCopy[lang];
  const [config, setConfig] = useState<FactoryPublicConfig | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void fetch("/api/factory/config")
      .then((res) => res.json())
      .then((data: FactoryPublicConfig) => setConfig(data))
      .catch(() => setFailed(true));
  }, []);

  return (
    <section className="relative mx-auto max-w-5xl overflow-hidden px-4 py-12 sm:px-6 lg:px-8">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(45%_70%_at_85%_0%,rgba(245,158,11,0.14),transparent_70%),radial-gradient(35%_55%_at_0%_10%,rgba(3,105,161,0.10),transparent_70%)] dark:bg-[radial-gradient(45%_70%_at_85%_0%,rgba(251,191,36,0.12),transparent_70%),radial-gradient(35%_55%_at_0%_10%,rgba(76,196,248,0.12),transparent_70%)]"
        aria-hidden="true"
      />
      <div className="relative">
      <Eyebrow>{t.hub.tag}</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold tracking-tight text-ink">{t.hub.title}</h1>
      <p className="mt-3 max-w-2xl text-lead text-ink-2">{t.hub.subtitle}</p>
      {config ? (
        <p className="mt-4">
          <Chip tone={config.networkStatus === "testnet" ? "value" : "warm"}>
            {config.networkStatus === "testnet" ? t.hub.statusTestnet : t.hub.statusUnavailable}
          </Chip>
        </p>
      ) : (
        <p className="mt-4">
          <Chip tone={failed ? "warm" : "neutral"}>
            {failed ? t.hub.statusUnavailable : uxCopy[lang].checking}
          </Chip>
        </p>
      )}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/create/token"
          className="surface-elevated flex flex-col rounded-3xl p-6 transition-colors hover:border-line-strong"
        >
          {TOKEN_ICON}
          <span className="mono-label mt-4 text-brand">{t.tokenNav}</span>
          <p className="mt-2 text-sm text-ink-2">{t.token.lead}</p>
          <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand">
            {t.hub.tokenCta}
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
        <Link
          href="/create/nft"
          className="surface-elevated flex flex-col rounded-3xl p-6 transition-colors hover:border-line-strong"
        >
          {NFT_ICON}
          <span className="mono-label mt-4 text-warm">{t.nftNav}</span>
          <p className="mt-2 text-sm text-ink-2">{t.nft.lead}</p>
          <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand">
            {t.hub.nftCta}
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
        <Link
          href="/create/contract"
          className="surface-elevated flex flex-col rounded-3xl p-6 transition-colors hover:border-line-strong sm:col-span-2"
        >
          {CONTRACT_ICON}
          <span className="mono-label mt-4 text-brand">{t.contractNav}</span>
          <p className="mt-2 text-sm text-ink-2">{t.contractLead}</p>
          <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand">
            {t.hub.contractCta}
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      </div>
      <p className="mt-6 flex flex-wrap gap-4 text-sm font-semibold">
        <Link href="/fees" className="text-brand hover:underline">
          {t.feesLink}
        </Link>
        <WalletGateLink className="text-brand hover:underline" connectLabel={t.form.wallet}>
          {t.form.wallet}
        </WalletGateLink>
        <Link href="/explorer" className="text-brand hover:underline">
          Explorer
        </Link>
      </p>
      </div>
    </section>
  );
}
