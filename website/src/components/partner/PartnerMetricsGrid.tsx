"use client";

import { PARTNER_CABINET_EN as c } from "@/lib/partner/cabinet-copy";
import { formatMicroPpl, formatMicroUsd } from "@/lib/partner/commission";
import type { CabinetMetrics } from "@/lib/partner/service";

export function PartnerMetricsGrid({ metrics }: { metrics: CabinetMetrics }) {
  return (
    <section className="surface-elevated rounded-2xl p-5">
      <h2 className="text-base font-bold text-ink">{c.metricsSectionTitle}</h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface-2 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{c.metricClicks}</p>
          <p className="mt-1 font-mono text-2xl font-bold text-ink">
            {metrics.clicks.toLocaleString("en-US")}
          </p>
          <p className="mt-1 text-xs text-ink-3">{c.metricClicksHint}</p>
        </div>

        <div className="rounded-xl border border-line bg-surface-2 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{c.metricSignUps}</p>
          <p className="mt-1 font-mono text-2xl font-bold text-ink">
            {metrics.signUps.toLocaleString("en-US")}
          </p>
          <p className="mt-1 text-xs text-ink-3">{c.metricSignUpsHint}</p>
        </div>

        <div className="rounded-xl border border-line bg-surface-2 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{c.metricBuyers}</p>
          <p className="mt-1 font-mono text-2xl font-bold text-ink">
            {metrics.buyers.toLocaleString("en-US")}
          </p>
          <p className="mt-1 text-xs text-ink-3">{c.metricBuyersHint}</p>
        </div>

        <div className="rounded-xl border border-line bg-surface-2 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{c.metricVolume}</p>
          <p className="mt-1 font-mono text-2xl font-bold text-ink">{metrics.volumeUsd}</p>
          <p className="mt-1 text-xs text-ink-3">{c.metricVolumeHint}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface-2 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                {c.metricEarnedUsdc}
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-ink">
                {formatMicroUsd(metrics.earnedUsdc.totalEarnedMicro)}
              </p>
            </div>
            <span className="rounded-full border border-line bg-canvas px-2.5 py-0.5 font-mono text-xs text-ink-2">
              Base (USDC)
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-3">{c.metricEarnedUsdcHint}</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2.5 text-xs">
            <div>
              <dt className="text-ink-3">{c.statusPending}</dt>
              <dd className="mt-0.5 font-mono font-semibold text-ink">
                {formatMicroUsd(metrics.earnedUsdc.pendingMicro)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">{c.statusApproved}</dt>
              <dd className="mt-0.5 font-mono font-semibold text-ink">
                {formatMicroUsd(metrics.earnedUsdc.approvedMicro)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">{c.statusPaid}</dt>
              <dd className="mt-0.5 font-mono font-semibold text-ink">
                {formatMicroUsd(metrics.earnedUsdc.paidMicro)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-line bg-surface-2 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                {c.metricEarnedPpl}
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-ink">
                {formatMicroPpl(metrics.earnedPpl.totalEarnedMicro)}
              </p>
            </div>
            <span className="rounded-full border border-line bg-canvas px-2.5 py-0.5 font-mono text-xs text-ink-2">
              PEOPLE Mainnet
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-3">{c.metricEarnedPplHint}</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2.5 text-xs">
            <div>
              <dt className="text-ink-3">{c.statusPending}</dt>
              <dd className="mt-0.5 font-mono font-semibold text-ink">
                {formatMicroPpl(metrics.earnedPpl.pendingMicro)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">{c.statusApproved}</dt>
              <dd className="mt-0.5 font-mono font-semibold text-ink">
                {formatMicroPpl(metrics.earnedPpl.approvedMicro)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">{c.statusPaid}</dt>
              <dd className="mt-0.5 font-mono font-semibold text-ink">
                {formatMicroPpl(metrics.earnedPpl.paidMicro)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
