"use client";

import { ArrowUpRight } from "lucide-react";

import { useLanguage } from "@/context/LanguageContext";
import { buyCopy } from "@/lib/buy-content";
import type { SaleTrade } from "@/lib/sale/adapter";
import { intlLocale, pplCompact, usd } from "@/lib/sale/format";

/**
 * Recent buys and sells from the chain adapter, each linking to the transaction on Basescan.
 * The adapter returns nothing until the sale contract exists, so the empty
 * state is what ships today.
 *
 * `examples` are only ever passed on a non-production deployment with
 * `?demo=1` (decided on the server, see `tradeDemoAllowed`). They fill the
 * empty state, never mix with real trades, carry an "Example" badge on every
 * row and have no transaction link.
 */
export function TradeFeed({ trades, examples = null }: { trades: SaleTrade[]; examples?: SaleTrade[] | null }) {
  const { lang } = useLanguage();
  const t = buyCopy[lang].feed;
  const showExamples = trades.length === 0 && examples !== null && examples.length > 0;
  const rows = showExamples ? examples : trades;

  return (
    <div
      className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--elev-1)]"
      data-testid="trade-feed"
      data-examples={showExamples ? "true" : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">{t.title}</h3>
        {showExamples ? (
          <span className="rounded-full border border-warm/50 bg-warm/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warm">
            {t.example}
          </span>
        ) : null}
      </div>
      {showExamples ? (
        <p className="mt-2 text-xs text-ink-3" data-testid="trade-feed-example-note">
          {t.exampleNote}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-3">
          {t.empty}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--c-line)]">
          {rows.map((trade) => (
            <li key={trade.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    trade.kind === "buy" ? "bg-value/15 text-value" : "bg-warm/15 text-warm"
                  }`}
                >
                  {trade.kind === "buy" ? t.buy : t.sell}
                </span>
                {showExamples ? (
                  <span
                    className="shrink-0 rounded-full border border-dashed border-line-strong px-1.5 py-0.5 text-[10px] font-semibold text-ink-3"
                    data-testid="trade-example-badge"
                  >
                    {t.example}
                  </span>
                ) : null}
                <span className="truncate font-mono text-xs text-ink-3" dir="ltr">
                  {trade.addressShort}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-end font-mono text-xs text-ink">
                  {usd(trade.usd, lang)}
                  <span className="block text-ink-3">{pplCompact(trade.ppl, lang)} PPL</span>
                </span>
                {trade.explorerUrl ? (
                  <a
                    href={trade.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${t.link} — ${new Date(trade.at).toLocaleString(intlLocale(lang))}`}
                    className="text-ink-3 transition-colors hover:text-brand"
                  >
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
