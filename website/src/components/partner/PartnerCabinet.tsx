"use client";

import Link from "next/link";
import { useState } from "react";
import { partnerCopy } from "@/lib/partner/copy";
import { useLanguage } from "@/context/LanguageContext";
import { shortWalletAddress } from "@/lib/partner/bind-errors";
import { SignOutButton } from "@/components/partner/SignOutButton";
import { PartnerWalletSummary } from "@/components/partner/PartnerWalletSummary";
import { PartnerWalletAutoRefresh } from "@/components/partner/PartnerWalletAutoRefresh";
import { formatPplAmount } from "@/lib/partner/wallet-summary";

type Line = {
  userId: string;
  referralCode: string;
  email: string | null;
  walletAddress: string | null;
};

export function PartnerCabinet({
  email,
  referralCode,
  referralLink,
  referredBy,
  walletAddress,
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
  referralLink: string;
  referredBy: { referralCode: string; email: string | null } | null;
  walletAddress: string | null;
  l1: Line[];
  l2: Line[];
  protocolStatus: "connected" | "disconnected";
  protocolNote: string | null;
  pplBalance: number | null;
  claims: { key: string; amount: number; status: string; level?: number; epoch?: number }[];
  claimsNote: string | null;
}) {
  const { lang } = useLanguage();
  const t = partnerCopy[lang];
  const [copied, setCopied] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6">
      <PartnerWalletAutoRefresh walletAddress={walletAddress} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mono-label text-warm">Partner</p>
          <h1 className="mt-2 text-h2 font-bold text-ink">{t.cabinetTitle}</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-2">{t.growthNote}</p>
        </div>
        <SignOutButton />
      </header>

      <section className="surface-elevated rounded-2xl p-5">
        <h2 className="text-base font-bold text-ink">{t.profile}</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-3">{t.email}</dt>
            <dd className="mt-1 font-mono text-sm text-ink">{email ?? t.none}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-3">{t.yourCode}</dt>
            <dd className="mt-1 font-mono text-sm text-ink">{referralCode}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-ink-3">{t.yourLink}</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <code className="break-all text-sm text-ink-2">{referralLink}</code>
              <button
                type="button"
                className="rounded-lg border border-line px-3 py-1 text-xs font-semibold text-brand"
                onClick={async () => {
                  await navigator.clipboard.writeText(referralLink);
                  setCopied(true);
                }}
              >
                {copied ? t.copied : t.copy}
              </button>
            </dd>
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
