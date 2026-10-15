"use client";

import Link from "next/link";
import { ArrowUpRight, ShieldCheck, Wallet } from "lucide-react";

import { useLanguage } from "@/context/LanguageContext";
import { buyCopy } from "@/lib/buy-content";
import type { SaleStats } from "@/lib/sale/adapter";
import { SALE, TEAM_VESTING, explorerAddressUrl, explorerContractUrl } from "@/lib/sale/config";
import { fillCopy, intlLocale } from "@/lib/sale/format";
import { GENESIS_ALLOCATIONS, TOTAL_SUPPLY_PPL } from "@/lib/tokenomics";

import { AllocationPie } from "./AllocationPie";
import { FootnoteRef } from "./SmallPrint";

const CARD = "rounded-3xl border border-line bg-surface p-5 shadow-[var(--elev-1)]";

/**
 * A link into the People network explorer (`PEOPLE_EXPLORER.base`), so it is an
 * in-app route and navigates in the same tab — no third-party explorer, nothing
 * to open in a new window.
 */
function ExplorerLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
    >
      {children}
      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
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
        {stats.contractAddress ? (
          <>
            <p className="mt-2 break-all font-mono text-sm text-ink">{stats.contractAddress}</p>
            <div className="mt-3 flex flex-wrap gap-4">
              <ExplorerLink href={explorerAddressUrl(stats.contractAddress)}>
                {t.transparency.explorerLink}
              </ExplorerLink>
              <ExplorerLink href={explorerContractUrl(stats.contractAddress)}>
                {t.transparency.verifiedSource}
              </ExplorerLink>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-warm/40 bg-warm/10 px-3 py-1 text-sm font-semibold text-warm">
              {t.transparency.saleContractPending}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-2">
              {t.transparency.saleContractNote}
            </p>
          </>
        )}
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
            lock: SALE.lpLockMonths,
          })}
        </p>
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
        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          {t.transparency.auditBounty}
          <FootnoteRef marker="***" />
        </p>

        <h4 className="mt-5 text-sm font-semibold text-ink">{t.transparency.vestingTitle}</h4>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          {fillCopy(t.transparency.vestingBody, {
            cliff: TEAM_VESTING.cliffMonths,
            linear: TEAM_VESTING.linearMonths,
            total: TEAM_VESTING.cliffMonths + TEAM_VESTING.linearMonths,
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
