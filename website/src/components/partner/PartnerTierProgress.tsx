"use client";

import { PARTNER_CABINET_EN as c } from "@/lib/partner/cabinet-copy";
import { formatMicroUsd, type KolTierProgress } from "@/lib/partner/commission";

export function PartnerTierProgress({ tier }: { tier: KolTierProgress }) {
  const usdcPct = (tier.usdcRateBps / 100).toFixed(tier.usdcRateBps % 100 === 0 ? 0 : 2);
  const tiers = [
    { num: 1, title: c.tier1Name, range: c.tier1Range },
    { num: 2, title: c.tier2Name, range: c.tier2Range },
    { num: 3, title: c.tier3Name, range: c.tier3Range },
  ] as const;

  return (
    <section className="surface-elevated rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink">{c.tierSectionTitle}</h2>
          <p className="mt-1 text-sm text-ink-2">{tier.currentTierLabel}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-2 text-right">
          <p className="text-xs uppercase tracking-wide text-ink-3">{c.tierCurrentRate}</p>
          <p className="mt-0.5 font-mono text-base font-bold text-brand">
            {usdcPct}% {c.tierUsdcSuffix} <span className="text-ink">{c.tierPplSuffix}</span>
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-ink-2">
          <span>{c.tierProgressLabel}</span>
          <span className="font-mono font-semibold">{tier.progressPct}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={tier.progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={c.tierProgressLabel}
          className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full rounded-full bg-brand transition-all duration-300"
            style={{ width: `${Math.max(2, Math.min(100, tier.progressPct))}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-ink-2">
          {tier.nextTier && tier.nextTierLabel
            ? `${c.tierNextHintPrefix} ${formatMicroUsd(tier.remainingToNextTierUsdMicro)} ${c.tierNextHintSuffix} ${tier.nextTierLabel}.`
            : c.tierMaxReached}
        </p>
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        {tiers.map((item) => {
          const active = tier.currentTier === item.num;
          const unlocked = tier.currentTier >= item.num;
          return (
            <div
              key={item.num}
              className={`rounded-xl border p-3 text-xs ${
                active
                  ? "border-brand bg-surface-2 font-semibold text-ink"
                  : unlocked
                    ? "border-line bg-surface-2 text-ink-2"
                    : "border-line bg-canvas text-ink-3"
              }`}
            >
              <p className="font-semibold text-ink">{item.title}</p>
              <p className="mt-1 font-mono text-ink-3">{item.range}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
