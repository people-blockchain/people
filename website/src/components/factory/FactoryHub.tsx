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
const ESCROW_ICON = (
  <span className={`${CARD_ICON_WRAP} bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200`}>
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4Zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8Z" />
    </svg>
  </span>
);
const CROWDFUND_ICON = (
  <span className={`${CARD_ICON_WRAP} bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-200`}>
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M16 6 18.29 8.29 13.41 13.17 9.41 9.17 2 16.59 3.41 18 9.41 12l4 4 6.3-6.29L22 12V6h-6Z" />
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
const LAVKA_ICON = (
  <span className={`${CARD_ICON_WRAP} bg-orange-100 text-orange-800 dark:bg-orange-400/15 dark:text-orange-200`}>
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M20 4H4v2l8 5 8-5V4ZM4 18h16v2H4v-2Zm0-9.5V16h16V8.5l-8 5-8-5Z" />
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

  const cards = [
    { href: "/create/token", icon: TOKEN_ICON, label: t.tokenNav, body: t.token.lead, cta: t.hub.tokenCta },
    { href: "/create/nft", icon: NFT_ICON, label: t.nftNav, body: t.nft.lead, cta: t.hub.nftCta },
    { href: "/explorer/contracts", icon: ESCROW_ICON, label: t.hub.escrowCta, body: t.hub.escrowLead, cta: t.hub.escrowCta },
    { href: "/explorer/contracts", icon: CROWDFUND_ICON, label: t.hub.crowdfundCta, body: t.hub.crowdfundLead, cta: t.hub.crowdfundCta },
    { href: "/create/contract", icon: CONTRACT_ICON, label: t.contractNav, body: t.contractLead, cta: t.hub.contractCta },
    { href: "/lavka", icon: LAVKA_ICON, label: t.hub.lavkaCta, body: t.hub.lavkaLead, cta: t.hub.lavkaCta },
  ];

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
        {cards.map((card) => (
          <Link
            key={`${card.href}-${card.cta}`}
            href={card.href}
            className="surface-elevated flex flex-col rounded-3xl p-6 transition-colors hover:border-line-strong"
          >
            {card.icon}
            <span className="mono-label mt-4 text-brand">{card.label}</span>
            <p className="mt-2 text-sm text-ink-2">{card.body}</p>
            <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand">
              {card.cta}
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        ))}
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
