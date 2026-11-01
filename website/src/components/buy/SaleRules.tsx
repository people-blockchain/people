"use client";

import { useState } from "react";
import { ArrowUpRight, ShieldCheck } from "lucide-react";

import { useLanguage } from "@/context/LanguageContext";
import { buyCopy } from "@/lib/buy-content";
import { AI_REVIEW_REPORTS } from "@/lib/sale/config";
import { buyCopyVars, type BuyPagePhase } from "@/lib/sale/buy-page";
import { fillCopy, usd } from "@/lib/sale/format";

import { FootnoteRef } from "./SmallPrint";

const CARD = "rounded-3xl border border-line bg-surface p-5 shadow-[var(--elev-1)]";

/** External link (new tab) to the block explorer. */
function ExplorerLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand hover:underline"
    >
      {children}
      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  );
}

function ContractAddress({ address, explorerUrl }: { address: string; explorerUrl: string | null }) {
  const { lang } = useLanguage();
  const t = buyCopy[lang].rules;
  const [copied, setCopied] = useState(false);
  return (
    <div data-testid="sale-contract-address">
      <p className="break-all font-mono text-xs text-ink" dir="ltr">
        {address}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          className="min-h-11 text-sm font-semibold text-brand"
          onClick={() => {
            void navigator.clipboard?.writeText(address).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? t.copied : t.copy}
        </button>
        {explorerUrl ? <ExplorerLink href={explorerUrl}>{t.explorerLink}</ExplorerLink> : null}
      </div>
    </div>
  );
}

/**
 * The rules, each in a sentence or two, with numbers from the V2 contract
 * constants. "Available today" is a live contract reading or an honest
 * "not available" — never an estimate.
 */
export function SaleRules({
  phase,
  sellBackClosed,
  sellBackTodayUsd,
  contractAddress,
  explorerUrl,
}: {
  phase: BuyPagePhase;
  /** Reserve moved to liquidity: sell-back closed for good (graduation alone does not close it). */
  sellBackClosed: boolean;
  sellBackTodayUsd: number | null;
  contractAddress: string | null;
  explorerUrl: string | null;
}) {
  const { lang } = useLanguage();
  const t = buyCopy[lang].rules;
  const vars = buyCopyVars(lang);

  const today =
    phase === "upcoming"
      ? fillCopy(t.todayUpcoming, vars)
      : sellBackClosed
        ? t.todayClosed
        : sellBackTodayUsd !== null
          ? fillCopy(t.todayLive, { amount: usd(sellBackTodayUsd, lang) })
          : t.todayUnknown;

  return (
    <div className="mt-8 space-y-4" data-testid="sale-rules">
      <ul className="grid gap-4 sm:grid-cols-2">
        {t.items.map((item) => (
          <li key={item.title} className={CARD}>
            <h3 className="text-base font-bold text-ink">{fillCopy(item.title, vars)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{fillCopy(item.body, vars)}</p>
          </li>
        ))}
      </ul>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-brand/40 bg-brand/5 p-5" data-testid="sellback-today">
          <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">{t.todayTitle}</h3>
          <p className="mt-2 text-sm font-medium leading-relaxed text-ink sm:text-base">{today}</p>
        </div>

        <div className={CARD}>
          <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">{t.contractTitle}</h3>
          <div className="mt-2">
            {contractAddress ? (
              <ContractAddress address={contractAddress} explorerUrl={explorerUrl} />
            ) : (
              <p className="text-sm leading-relaxed text-ink-2">{t.contractPending}</p>
            )}
          </div>
          <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-ink-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-value" aria-hidden="true" />
            <span>
              {t.auditLine}
              <FootnoteRef marker="***" />
            </span>
          </p>
          {AI_REVIEW_REPORTS.length > 0 ? (
            <p className="mt-2 text-sm text-ink-2">
              {t.reviewReports.split("{links}")[0]}
              {AI_REVIEW_REPORTS.map((report, i) => (
                <span key={report.url}>
                  {i > 0 ? ", " : ""}
                  <a href={report.url} target="_blank" rel="noopener noreferrer" className="underline">
                    {report.label}
                  </a>
                </span>
              ))}
            </p>
          ) : null}
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.auditBounty}</p>
        </div>
      </div>

      <details className={`${CARD} text-sm text-ink-2`} data-testid="sale-rules-details">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink">{t.detailsToggle}</summary>
        <ul className="mt-2 list-disc space-y-1.5 ps-5 leading-relaxed">
          {t.details.map((line) => (
            <li key={line}>{fillCopy(line, vars)}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
