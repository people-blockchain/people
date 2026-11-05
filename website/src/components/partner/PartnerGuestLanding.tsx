"use client";

import Link from "next/link";
import { partnerCopy } from "@/lib/partner/copy";
import { useLanguage } from "@/context/LanguageContext";
import { PARTNER_LOGIN_HREF } from "@/lib/partner/guards";

export function PartnerGuestLanding() {
  const { lang } = useLanguage();
  const t = partnerCopy[lang];

  const tiers = [
    { title: t.tier1Name, range: t.tier1Range },
    { title: t.tier2Name, range: t.tier2Range },
    { title: t.tier3Name, range: t.tier3Range },
  ] as const;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">{t.eyebrow}</p>
        <h1 className="mt-3 text-h2 font-bold text-ink">{t.guestLandingTitle}</h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-2">{t.guestLandingLead}</p>
      </header>

      <section className="surface-elevated rounded-2xl p-5">
        <h2 className="text-base font-bold text-ink">{t.tierSectionTitle}</h2>
        <p className="mt-2 text-sm text-ink-2">{t.tierSectionSubtitle}</p>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {tiers.map((item) => (
            <div key={item.title} className="rounded-xl border border-line bg-surface-2 p-3 text-xs">
              <p className="font-semibold text-ink">{item.title}</p>
              <p className="mt-1 font-mono text-ink-3">{item.range}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Link
          href={PARTNER_LOGIN_HREF}
          className="inline-flex items-center justify-center rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        >
          {t.guestSignInCta}
        </Link>
      </div>

      <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs leading-relaxed text-ink-2">
        {t.guestWalletHint}
      </p>
      <p className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950">
        {t.guestPreSaleNote}
      </p>
    </div>
  );
}
