"use client";

import { useLanguage } from "@/context/LanguageContext";
import { buyCopy } from "@/lib/buy-content";
import type { SaleStats } from "@/lib/sale/adapter";
import { CURVE, SALE } from "@/lib/sale/config";
import { fillCopy, pplCompact, pricePerPpl } from "@/lib/sale/format";

type Stat = { key: string; label: string; value: string; hint: string; accent?: boolean };

/**
 * Live figures from the chain adapter. Every value is either a real reading or
 * an em dash — nothing here is simulated while the sale contract is undeployed.
 */
export function SaleStatsPanel({ stats }: { stats: SaleStats }) {
  const { lang } = useLanguage();
  const t = buyCopy[lang];
  const s = t.stats;

  const none = s.none;

  const rows: Stat[] = [
    {
      key: "price",
      label: s.price,
      value: stats.spotPriceUsd === null ? s.notOpenYet : pricePerPpl(stats.spotPriceUsd, lang),
      hint: fillCopy(s.priceStartHint, { start: pricePerPpl(CURVE.startPriceUsd, lang) }),
      accent: true,
    },
    {
      key: "sold",
      label: s.sold,
      value: stats.soldPpl === null ? none : `${pplCompact(stats.soldPpl, lang)} PPL`,
      hint: fillCopy(s.soldTarget, { supply: pplCompact(CURVE.supplyPpl, lang) }),
    },
    {
      key: "buyers",
      label: s.buyers,
      value: stats.buyers === null ? none : stats.buyers.toLocaleString(lang),
      hint: "",
    },
    {
      key: "days",
      label: s.daysLeft,
      value: stats.daysLeft === null ? none : String(stats.daysLeft),
      hint: fillCopy(s.daysLeftTarget, { days: SALE.durationDays }),
    },
  ];

  return (
    <div data-testid="sale-stats">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
          {t.hero.statsTitle}
        </h2>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className={`rounded-2xl border p-3.5 ${
              row.accent ? "border-brand/40 bg-brand/5" : "border-line bg-surface"
            }`}
          >
            <dt className="text-xs font-medium text-ink-3">{row.label}</dt>
            <dd
              className={`mt-1 font-mono font-bold leading-tight break-words ${
                row.accent ? "text-xl text-brand sm:text-2xl" : "text-base text-ink sm:text-lg"
              }`}
            >
              {row.value}
            </dd>
            {row.hint ? <p className="mt-1 text-[11px] leading-snug text-ink-3">{row.hint}</p> : null}
          </div>
        ))}
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-ink-3">{t.hero.statsNote}</p>
    </div>
  );
}
