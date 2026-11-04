"use client";

import Link from "next/link";
import { useState } from "react";
import { partnerCopy } from "@/lib/partner/copy";
import { PARTNER_CABINET_EN as c } from "@/lib/partner/cabinet-copy";
import { shortWalletAddress } from "@/lib/partner/bind-errors";
import { SignOutButton } from "@/components/partner/SignOutButton";
import { PartnerWalletSummary } from "@/components/partner/PartnerWalletSummary";
import { PartnerWalletAutoRefresh } from "@/components/partner/PartnerWalletAutoRefresh";
import { PartnerLinkGenerator } from "@/components/partner/PartnerLinkGenerator";
import { PartnerMetricsGrid } from "@/components/partner/PartnerMetricsGrid";
import { PartnerTierProgress } from "@/components/partner/PartnerTierProgress";
import { PartnerPayoutHistory } from "@/components/partner/PartnerPayoutHistory";
import { computeKolTierProgress, type KolTierProgress } from "@/lib/partner/commission";
import type {
  CabinetCommissionItem,
  CabinetMetrics,
  CabinetPayoutItem,
} from "@/lib/partner/service";
import { formatPplAmount } from "@/lib/partner/wallet-summary";

type Line = {
  userId: string;
  referralCode: string;
  email: string | null;
  walletAddress: string | null;
};

const DEFAULT_METRICS: CabinetMetrics = {
  clicks: 0,
  signUps: 0,
  buyers: 0,
  volumeUsd: "$0.00",
  volumeUsdMicro: "0",
  earnedUsdc: {
    pendingMicro: "0",
    approvedMicro: "0",
    paidMicro: "0",
    voidMicro: "0",
    totalEarnedMicro: "0",
  },
  earnedPpl: {
    pendingMicro: "0",
    approvedMicro: "0",
    paidMicro: "0",
    voidMicro: "0",
    totalEarnedMicro: "0",
  },
};

export function PartnerCabinet({
  email,
  referralCode,
  kolCode: initialKolCode = null,
  referralLink,
  referredBy,
  walletAddress,
  metrics: initialMetrics,
  tier: initialTier,
  commissions: initialCommissions = [],
  payouts: initialPayouts = [],
  l1,
  l2,
  protocolStatus,
  protocolNote,
  pplBalance,
  claims,
  claimsNote,
}: {
  email: string | null;
  referralCode: string;
  kolCode?: string | null;
  referralLink: string;
  referredBy: { referralCode: string; email: string | null } | null;
  walletAddress: string | null;
  metrics?: CabinetMetrics;
  tier?: KolTierProgress;
  commissions?: CabinetCommissionItem[];
  payouts?: CabinetPayoutItem[];
  l1: Line[];
  l2: Line[];
  protocolStatus: "connected" | "disconnected";
  protocolNote: string | null;
  pplBalance: number | null;
  claims: { key: string; amount: number; status: string; level?: number; epoch?: number }[];
  claimsNote: string | null;
}) {
  // Strictly English-only copy for the partner & KOL cabinet
  const t = partnerCopy.en;

  const baseOrigin = referralLink.split("/?ref=")[0] || "https://www.peopleblockchain.network";
  const [kolCode, setKolCode] = useState<string | null>(initialKolCode);
  const [metrics, setMetrics] = useState<CabinetMetrics>(
    initialMetrics ?? { ...DEFAULT_METRICS, signUps: l1.length },
  );
  const [tier, setTier] = useState<KolTierProgress>(
    initialTier ?? computeKolTierProgress(BigInt(0)),
  );
  const [commissions, setCommissions] = useState<CabinetCommissionItem[]>(initialCommissions);
  const [payouts, setPayouts] = useState<CabinetPayoutItem[]>(initialPayouts);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const handleRefreshCabinet = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch("/api/partner/cabinet", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        cabinet?: {
          kolCode?: string | null;
          metrics?: CabinetMetrics;
          tier?: KolTierProgress;
          commissions?: CabinetCommissionItem[];
          payouts?: CabinetPayoutItem[];
        };
      } | null;
      if (!res.ok || !data?.ok || !data.cabinet) {
        setRefreshError(c.refreshError);
        return;
      }
      if (data.cabinet.kolCode !== undefined) setKolCode(data.cabinet.kolCode);
      if (data.cabinet.metrics) setMetrics(data.cabinet.metrics);
      if (data.cabinet.tier) setTier(data.cabinet.tier);
      if (data.cabinet.commissions) setCommissions(data.cabinet.commissions);
      if (data.cabinet.payouts) setPayouts(data.cabinet.payouts);
    } catch {
      setRefreshError(c.refreshError);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6">
      <PartnerWalletAutoRefresh walletAddress={walletAddress} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mono-label text-warm">{c.eyebrow}</p>
          <h1 className="mt-2 text-h2 font-bold text-ink">{c.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-2">{c.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefreshCabinet}
            disabled={refreshing}
            aria-busy={refreshing}
            className="rounded-xl border border-line bg-surface-2 px-3.5 py-2 text-xs font-semibold text-ink transition hover:border-brand disabled:opacity-50"
          >
            {refreshing ? c.refreshingButton : c.refreshButton}
          </button>
          <SignOutButton />
        </div>
      </header>

      {refreshError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-800"
        >
          <span>{refreshError}</span>
          <button
            type="button"
            onClick={handleRefreshCabinet}
            className="font-semibold underline"
          >
            {c.tryAgain}
          </button>
        </div>
      )}

      <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs leading-relaxed text-ink-2">
        {c.settlementBanner}
      </p>

      <PartnerLinkGenerator
        referralCode={referralCode}
        initialKolCode={kolCode}
        referralLink={referralLink}
        origin={baseOrigin}
      />

      <PartnerMetricsGrid metrics={metrics} />

      <PartnerTierProgress tier={tier} />

      <PartnerPayoutHistory commissions={commissions} payouts={payouts} />

      <section className="surface-elevated rounded-2xl p-5">
        <h2 className="text-base font-bold text-ink">{t.profile}</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-3">{t.email}</dt>
            <dd className="mt-1 font-mono text-sm text-ink">{email ?? t.none}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-3">{t.yourCode}</dt>
            <dd className="mt-1 font-mono text-sm text-ink">{referralCode}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-3">{t.referredBy}</dt>
            <dd className="mt-1 text-sm text-ink-2">
              {referredBy ? referredBy.email || referredBy.referralCode : t.none}
            </dd>
          </div>
        </dl>
      </section>

      <section className="surface-elevated rounded-2xl p-5">
        <h2 className="text-base font-bold text-ink">{t.wallet}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.walletAutoLead}</p>
        {walletAddress ? (
          <div className="mt-4 rounded-xl border border-line bg-surface-2 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-ink-3">{t.bound}</p>
            <p className="mt-1 font-mono text-sm text-value">{shortWalletAddress(walletAddress)}</p>
            <PartnerWalletSummary address={walletAddress} t={t} />
            <Link href="/wallet" className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">
              {t.openWalletCta}
            </Link>
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-3">{t.walletProvisioning}</p>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ReferralList title={t.l1} empty={t.emptyLine} rows={l1} />
        <ReferralList title={t.l2} empty={t.emptyLine} rows={l2} />
      </section>

      <section className="surface-elevated rounded-2xl p-5">
        <h2 className="text-base font-bold text-ink">{t.accruals}</h2>
        <p className="mt-2 text-sm text-ink-2">{t.footerNote}</p>
        {protocolStatus !== "connected" && (
          <p className="mt-3 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink-3">
            {protocolNote ?? t.protocolOff}
          </p>
        )}
        {!walletAddress && protocolStatus === "connected" && (
          <p className="mt-3 text-sm text-ink-3">{t.noWallet}</p>
        )}
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-3">{t.pplBalance}</dt>
            <dd className="mt-1 font-mono text-lg text-ink">
              {pplBalance === null ? t.disconnected : formatPplAmount(pplBalance)}
            </dd>
          </div>
        </dl>
        <h3 className="mt-4 text-sm font-semibold text-ink">{t.claimStatus}</h3>
        {claimsNote && <p className="mt-2 text-sm text-ink-3">{claimsNote}</p>}
        {claims.length === 0 && !claimsNote && <p className="mt-2 text-sm text-ink-3">{t.noClaims}</p>}
        {claims.length > 0 && (
          <ul className="mt-3 space-y-2">
            {claims.map((claim) => (
              <li key={claim.key} className="rounded-xl border border-line px-3 py-2 text-sm">
                <span className="font-mono text-ink">{claim.amount} PPL</span>
                <span className="ml-2 text-ink-3">{claim.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ReferralList({ title, empty, rows }: { title: string; empty: string; rows: Line[] }) {
  return (
    <section className="surface-elevated rounded-2xl p-5">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.userId} className="rounded-xl border border-line px-3 py-2 text-sm">
              <p className="font-medium text-ink">{row.email ?? row.referralCode}</p>
              <p className="font-mono text-xs text-ink-3">
                {row.walletAddress ? shortWalletAddress(row.walletAddress) : row.referralCode}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
