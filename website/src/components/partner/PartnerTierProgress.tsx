"use client";

import { partnerCopy } from "@/lib/partner/copy";
import { useLanguage } from "@/context/LanguageContext";
import { type KolTierProgress } from "@/lib/partner/commission";

export function PartnerTierProgress({ tier }: { tier: KolTierProgress }) {
  const { lang } = useLanguage();
  const c = partnerCopy[lang];
  const usdcPct = (tier.usdcRateBps / 100).toFixed(tier.usdcRateBps % 100 === 0 ? 0 : 2);

  return (
    <section className="surface-elevated rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink">{c.tierSectionTitle}</h2>
          <p className="mt-1 text-sm text-ink-2">{c.tierSectionSubtitle}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-2 text-right">
          <p className="text-xs uppercase tracking-wide text-ink-3">{c.tierCurrentRate}</p>
          <p className="mt-0.5 font-mono text-base font-bold text-brand">
            {usdcPct}% {c.tierUsdcSuffix} <span className="text-ink">{c.tierPplSuffix}</span>
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-brand bg-surface-2 p-3 text-xs">
        <p className="font-semibold text-ink">{c.tier1Name}</p>
        <p className="mt-1 font-mono text-ink-3">{c.tier1Range}</p>
        <p className="mt-2 text-ink-2">{c.tierMaxReached}</p>
      </div>
    </section>
  );
}
