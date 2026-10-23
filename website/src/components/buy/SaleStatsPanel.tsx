"use client";

import { useLanguage } from "@/context/LanguageContext";
import { buyCopy } from "@/lib/buy-content";
import type { SaleStats } from "@/lib/sale/adapter";
import { CURVE, SALE } from "@/lib/sale/config";
import { fillCopy, formatMonths, intlLocale, pricePerPpl } from "@/lib/sale/format";
import type { SalePhase } from "@/lib/sale/sale-state";

import { Num } from "./Num";

type Stat = { key: string; label: string; value: string; hint: string; accent?: boolean };

/**
 * Live figures from the chain adapter. Every value is either a real reading or
 * an em dash — nothing here is simulated while the sale contract is undeployed.
 */
export function SaleStatsPanel({ stats, phase = "closed" }: { stats: SaleStats; phase?: SalePhase }) {
  const { lang } = useLanguage();
  const t = buyCopy[lang];
  const s = t.stats;

  const none = s.none;

  const open = phase === "open";
  const endsText = stats.endsAt
    ? new Intl.DateTimeFormat(intlLocale(lang), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(stats.endsAt))
    : none;

  const rows: Stat[] = [
    open
      ? {
          key: "price",
          label: s.price,
          value: stats.spotPriceUsd === null ? s.notOpenYet : pricePerPpl(stats.spotPriceUsd, lang),
          hint: fillCopy(s.priceStartHint, { start: pricePerPpl(CURVE.startPriceUsd, lang) }),
          accent: true,
        }
      : {
          key: "price",
          label: s.saleStatus,
          value: s.notOpenYet,
          hint: fillCopy(s.startPriceOnOpen, { start: pricePerPpl(CURVE.startPriceUsd, lang) }),
          accent: true,
        },
    open
      ? { key: "window", label: s.saleWindow, value: endsText, hint: s.endsByHint }
      : {
          key: "window",
          label: s.saleWindow,
          value: fillCopy(s.saleWindowValue, { term: formatMonths(SALE.saleTermMonths, lang) }),
          hint: s.saleWindowHint,
        },
  ];

  return (
    <div data-testid="sale-stats">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
          {open ? t.hero.statsTitle : t.hero.statsTitleClosed}
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
              <Num>{row.value}</Num>
            </dd>
            {row.hint ? <p className="mt-1 text-[11px] leading-snug text-ink-3">{row.hint}</p> : null}
          </div>
        ))}
      </dl>
    </div>
  );
}
