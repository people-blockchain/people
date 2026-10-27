"use client";

import { useLanguage } from "@/context/LanguageContext";
import { buyCopy } from "@/lib/buy-content";
import type { SaleStats } from "@/lib/sale/adapter";
import { SALE } from "@/lib/sale/config";
import { fillCopy, formatMonths, intlLocale } from "@/lib/sale/format";
import type { SalePhase } from "@/lib/sale/sale-state";
import type { V2Phase } from "@/lib/sale/v2/constants";
import { statsCopyKeys } from "@/lib/sale/v2/logic";
import { resolveStatsStatus, v2SaleWindowValue } from "@/lib/sale/v2/stats-copy";


type Stat = { key: string; label: string; value: string; hint: string; accent?: boolean };

type V2Stats = {
  enabled: boolean;
  phase: V2Phase | null;
  spotPriceUsd: number | null;
  openDate?: string | null;
};

/**
 * Live figures from the chain adapter. Every value is either a real reading or
 * an em dash — nothing here is simulated while the sale contract is undeployed.
 */
export function SaleStatsPanel({
  stats,
  phase = "closed",
  v2,
}: {
  stats: SaleStats;
  phase?: SalePhase;
  v2?: V2Stats;
}) {
  const { lang } = useLanguage();
  const t = buyCopy[lang];
  const s = t.stats;

  const none = s.none;
  const v2Enabled = v2?.enabled === true;
  const keys = statsCopyKeys({
    v2Enabled,
    phase: v2?.phase ?? null,
    legacyOpen: phase === "open",
  });
  const spotPriceUsd = v2Enabled ? (v2?.spotPriceUsd ?? null) : stats.spotPriceUsd;

  const endsText = stats.endsAt
    ? new Intl.DateTimeFormat(intlLocale(lang), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(stats.endsAt))
    : none;

  const status = resolveStatsStatus({ copy: t, lang, keys, v2Enabled, spotPriceUsd });

  const rows: Stat[] = [
    {
      key: "price",
      label: status.label,
      value: status.value,
      hint: status.hint,
      accent: true,
    },
    keys.window === "open" && !v2Enabled
      ? { key: "window", label: s.saleWindow, value: endsText, hint: s.endsByHint }
      : {
          key: "window",
          label: s.saleWindow,
          value: v2Enabled
            ? v2SaleWindowValue({ copy: t, lang, openDate: v2?.openDate })
            : fillCopy(s.saleWindowValue, { term: formatMonths(SALE.saleTermMonths, lang) }),
          hint: s.saleWindowHint,
        },
  ];

  return (
    <div data-testid="sale-stats">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
          {t.hero[keys.eyebrow]}
        </h2>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className={`min-w-0 rounded-2xl border p-3.5 ${
              row.accent ? "border-brand/40 bg-brand/5" : "border-line bg-surface"
            }`}
          >
            <dt className="text-xs font-medium text-ink-3">{row.label}</dt>
            <dd
              className={`mt-1 font-mono font-bold leading-tight break-words [overflow-wrap:anywhere] ${
                row.accent ? "text-lg text-brand sm:text-xl" : "text-sm text-ink sm:text-base"
              }`}
            >
              <bdi dir="auto">{row.value}</bdi>
            </dd>
            {row.hint ? <p className="mt-1 text-[11px] leading-snug text-ink-3">{row.hint}</p> : null}
          </div>
        ))}
      </dl>
    </div>
  );
}
