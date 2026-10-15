"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { useLanguage } from "@/context/LanguageContext";
import { buyCopy } from "@/lib/buy-content";
import type { SaleTrade } from "@/lib/sale/adapter";
import { intlLocale, pplCompact, usd } from "@/lib/sale/format";

/**
 * Recent buys and sells from the chain adapter, each linking into the People
 * network explorer (`PEOPLE_EXPLORER.base`) — an in-app route, same tab.
 * The adapter returns nothing until the sale contract exists, so the empty
 * state — not a sample row — is what ships today.
 */
export function TradeFeed({ trades }: { trades: SaleTrade[] }) {
  const { lang } = useLanguage();
  const t = buyCopy[lang];

  return (
    <div className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--elev-1)]" data-testid="trade-feed">
      <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
        {t.curve.feedTitle}
      </h3>

      {trades.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-3">
          {t.curve.feedEmpty}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--c-line)]">
          {trades.map((trade) => (
            <li key={trade.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    trade.kind === "buy"
                      ? "bg-value/15 text-value"
                      : "bg-warm/15 text-warm"
                  }`}
                >
                  {trade.kind === "buy" ? t.curve.feedBuy : t.curve.feedSell}
                </span>
                <span className="truncate font-mono text-xs text-ink-3">{trade.addressShort}</span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-right font-mono text-xs text-ink">
                  {usd(trade.usd, lang)}
                  <span className="block text-ink-3">{pplCompact(trade.ppl, lang)} PPL</span>
                </span>
                <Link
                  href={trade.explorerUrl}
                  aria-label={`${t.curve.feedLink} — ${new Date(trade.at).toLocaleString(intlLocale(lang))}`}
                  className="text-ink-3 transition-colors hover:text-brand"
                >
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
