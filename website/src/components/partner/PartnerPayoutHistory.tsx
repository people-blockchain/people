"use client";

import { partnerCopy } from "@/lib/partner/copy";
import { useLanguage } from "@/context/LanguageContext";
import { shortWalletAddress } from "@/lib/partner/bind-errors";
import { formatMicroPpl, formatMicroUsd } from "@/lib/partner/commission";
import type { CabinetCommissionItem, CabinetPayoutItem } from "@/lib/partner/service";

function statusBadge(
  status: string,
  labels: Pick<
    typeof partnerCopy.en,
    "statusPaid" | "statusApproved" | "statusVoid" | "statusPending"
  >,
  voidReason?: string | null,
) {
  if (status === "paid") {
    return (
      <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
        {labels.statusPaid}
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
        {labels.statusApproved}
      </span>
    );
  }
  if (status === "void") {
    return (
      <span
        title={voidReason ?? undefined}
        className="inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800"
      >
        {labels.statusVoid}
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
      {labels.statusPending}
    </span>
  );
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

export function PartnerPayoutHistory({
  commissions,
  payouts,
}: {
  commissions: CabinetCommissionItem[];
  payouts: CabinetPayoutItem[];
}) {
  const { lang } = useLanguage();
  const c = partnerCopy[lang];
  return (
    <div className="grid gap-6">
      <section className="surface-elevated rounded-2xl p-5">
        <h2 className="text-base font-bold text-ink">{c.ledgerSectionTitle}</h2>
        <p className="mt-1 text-xs text-ink-2">{c.payoutRuleNote}</p>

        {commissions.length === 0 ? (
          <div className="mt-4 rounded-xl border border-line bg-surface-2 px-4 py-6 text-center text-sm text-ink-3">
            {c.ledgerEmpty}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-line text-ink-3">
                  <th className="py-2 pr-3 font-semibold uppercase">{c.colDate}</th>
                  <th className="px-3 py-2 font-semibold uppercase">{c.colBuyer}</th>
                  <th className="px-3 py-2 font-semibold uppercase">{c.colVolume}</th>
                  <th className="px-3 py-2 font-semibold uppercase">{c.colRate}</th>
                  <th className="px-3 py-2 font-semibold uppercase">{c.colUsdc}</th>
                  <th className="px-3 py-2 font-semibold uppercase">{c.colPpl}</th>
                  <th className="px-3 py-2 font-semibold uppercase">{c.colHoldUntil}</th>
                  <th className="py-2 pl-3 font-semibold uppercase">{c.colStatus}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {commissions.map((item) => (
                  <tr key={item.id} className="text-ink">
                    <td className="py-2.5 pr-3 font-mono">{formatShortDate(item.createdAt)}</td>
                    <td className="px-3 py-2.5 font-mono">{shortWalletAddress(item.buyerAddress)}</td>
                    <td className="px-3 py-2.5 font-mono">{formatMicroUsd(item.usdPurchaseMicro)}</td>
                    <td className="px-3 py-2.5 font-mono">
                      {(item.usdcRateBps / 100).toFixed(0)}% + {(item.pplRateBps / 100).toFixed(0)}%
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold">
                      {formatMicroUsd(item.netUsdcMicro)}
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold">
                      {formatMicroPpl(item.netPplMicro)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-ink-2">
                      {formatShortDate(item.holdUntil)}
                    </td>
                    <td className="py-2.5 pl-3">{statusBadge(item.status, c, item.voidReason)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="surface-elevated rounded-2xl p-5">
        <h2 className="text-base font-bold text-ink">{c.payoutHistoryTitle}</h2>
        <p className="mt-1 text-xs text-ink-2">{c.settlementBanner}</p>

        {payouts.length === 0 ? (
          <div className="mt-4 rounded-xl border border-line bg-surface-2 px-4 py-6 text-center text-sm text-ink-3">
            {c.payoutHistoryEmpty}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-line text-ink-3">
                  <th className="py-2 pr-3 font-semibold uppercase">{c.colPeriod}</th>
                  <th className="px-3 py-2 font-semibold uppercase">{c.colUsdc}</th>
                  <th className="px-3 py-2 font-semibold uppercase">{c.colPpl}</th>
                  <th className="px-3 py-2 font-semibold uppercase">{c.colStatus}</th>
                  <th className="py-2 pl-3 font-semibold uppercase">{c.colSettlement}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {payouts.map((batch) => (
                  <tr key={batch.id} className="text-ink">
                    <td className="py-2.5 pr-3 font-mono font-semibold">{batch.periodKey}</td>
                    <td className="px-3 py-2.5 font-mono">
                      {formatMicroUsd(batch.usdcAmountMicro)}
                    </td>
                    <td className="px-3 py-2.5 font-mono">
                      {formatMicroPpl(batch.pplAmountMicro)}
                    </td>
                    <td className="px-3 py-2.5">{statusBadge(batch.status, c)}</td>
                    <td className="py-2.5 pl-3 font-mono text-ink-2">
                      {batch.usdcTxHash ? shortWalletAddress(batch.usdcTxHash) : "—"}
                      {batch.pplTxHash ? ` / ${shortWalletAddress(batch.pplTxHash)}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
