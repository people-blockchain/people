"use client";

import { useState } from "react";
import { ArrowUpRight, ShieldCheck, Wallet } from "lucide-react";

import { useLanguage } from "@/context/LanguageContext";
import { buyCopy } from "@/lib/buy-content";
import type { SaleStats } from "@/lib/sale/adapter";
import {
  AI_REVIEW_REPORTS,
  SALE,
  SALE_ADDRESSES,
  TEAM_VESTING,
  basescanAddressUrl,
  saleTokenAddress,
} from "@/lib/sale/config";
import { fillCopy, formatMonths, intlLocale } from "@/lib/sale/format";
import { GENESIS_ALLOCATIONS, TOTAL_SUPPLY_PPL } from "@/lib/tokenomics";

import { AllocationPie } from "./AllocationPie";
import { FootnoteRef } from "./SmallPrint";

const CARD = "rounded-3xl border border-line bg-surface p-5 shadow-[var(--elev-1)]";

/** External link to Basescan (opens in a new tab). */
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

/** One published address: monospace, copy button, Basescan link. */
function AddressRow({ label, address, pending, note }: { label: string; address: string | null; pending: string; note?: string }) {
  const { lang } = useLanguage();
  const t = buyCopy[lang].transparency;
  const [copied, setCopied] = useState(false);
  return (
    <div className="border-t border-line py-2.5 first:border-t-0">
      <dt className="text-xs font-medium text-ink-3">{label}</dt>
      <dd className="mt-1">
        {address ? (
          <>
            <p className="break-all font-mono text-xs text-ink" dir="ltr">{address}</p>
            {note ? <p className="text-xs text-ink-3">{note}</p> : null}
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
              <ExplorerLink href={basescanAddressUrl(address)}>{t.explorerLink}</ExplorerLink>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-2">{pending}</p>
        )}
      </dd>
    </div>
  );
}

/**
 * The sale contract, the 50/50 split of the raise, the security reviews and the
 * team's vesting.
 *
 * Deliberately absent: the project treasury — its address, its balance and the
 * endpoint a balance would be read from (owner decision 2026-10-16, the
 * treasury is internal). The split is stated in words instead.
 */
export function SaleTransparency({ stats }: { stats: SaleStats }) {
  const { lang } = useLanguage();
  const t = buyCopy[lang];
  const locale = intlLocale(lang);

  const salePct = GENESIS_ALLOCATIONS.find((bucket) => bucket.id === "sale")?.pct ?? 0;

  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-2" data-testid="sale-transparency">
      {/* Sale contract */}
      <div className={CARD}>
        <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
          {t.transparency.saleContract}
        </h3>
        {stats.contractAddress ? null : (
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.transparency.saleContractPending}</p>
        )}
        <h4 className="mt-4 text-sm font-semibold text-ink">{t.transparency.addressesTitle}</h4>
        <dl className="mt-1" data-testid="sale-addresses">
          <AddressRow label={t.transparency.addrHub} address={stats.contractAddress} pending={t.transparency.addrPending} />
          <AddressRow label={t.transparency.addrPpl} address={SALE_ADDRESSES.ppl} pending={t.transparency.addrPending} />
          <AddressRow
            label={t.transparency.addrMultisig}
            address={SALE_ADDRESSES.multisig}
            pending={t.transparency.addrPending}
            note={
              SALE_ADDRESSES.multisigThreshold
                ? fillCopy(t.transparency.addrMultisigThreshold, SALE_ADDRESSES.multisigThreshold)
                : undefined
            }
          />
          <AddressRow label={t.transparency.addrUsdc} address={saleTokenAddress("USDC")} pending="" />
          <AddressRow label={t.transparency.addrUsdt} address={saleTokenAddress("USDT")} pending="" />
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-ink-3">{t.form.phishing}</p>
      </div>

      {/* The 50/50 split, in words — no addresses */}
      <div className={CARD}>
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
            {t.transparency.fundsTitle}
          </h3>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          {fillCopy(t.transparency.fundsBody, {
            liquidityShare: `${SALE.liquiditySharePct}%`,
            multisigShare: `${SALE.multisigSharePct}%`,
            lockPeriod: formatMonths(SALE.lpLockMonths, lang),
          })}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">{t.transparency.adminPowers}</p>
      </div>

      {/* Security reviews that exist, and the team's own vesting */}
      <div className={CARD}>
        <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
          {t.transparency.auditTitle}
        </h3>
        <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-value/40 bg-value/10 px-3 py-1 text-sm font-semibold text-value">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {t.transparency.auditLine}
        </p>
        {AI_REVIEW_REPORTS.length > 0 ? (
          <p className="mt-3 text-sm text-ink-2">
            {t.transparency.reviewReports.split("{links}")[0]}
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
        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          {t.transparency.auditBounty}
          <FootnoteRef marker="***" />
        </p>

        <h4 className="mt-5 text-sm font-semibold text-ink">{t.transparency.vestingTitle}</h4>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          {fillCopy(t.transparency.vestingBody, {
            cliffPeriod: formatMonths(TEAM_VESTING.cliffMonths, lang),
            linearPeriod: formatMonths(TEAM_VESTING.linearMonths, lang),
            totalPeriod: formatMonths(TEAM_VESTING.cliffMonths + TEAM_VESTING.linearMonths, lang),
          })}
        </p>
      </div>

      {/* Allocation */}
      <div className={CARD}>
        <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
          {t.transparency.allocationTitle}
        </h3>
        <div className="mt-4">
          <AllocationPie />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-ink-3">
          {fillCopy(t.transparency.allocationNote, {
            supply: TOTAL_SUPPLY_PPL.toLocaleString(locale),
            salePct: `${salePct}%`,
          })}
        </p>
      </div>
    </div>
  );
}
