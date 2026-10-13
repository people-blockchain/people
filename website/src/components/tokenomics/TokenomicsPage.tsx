"use client";

import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { tokenomicsCopy } from "@/lib/tokenomics-content";
import {
  NETWORK_FEE_SPLIT,
  formatPpl,
  formatUsdt,
  publicPurchaseTable,
  TOTAL_SUPPLY_PPL,
} from "@/lib/tokenomics";
import { Eyebrow } from "@/components/ui/primitives";
import { FeeSplitDonut } from "@/components/visuals/FeeSplitDonut";
import { AllocationDonut } from "./AllocationDonut";
import { CirculatingSupplyChart } from "./CirculatingSupplyChart";
import { BondingCurveChart } from "./BondingCurveChart";
import { PplSaleCheckout } from "@/components/sale/PplSaleCheckout";

export function TokenomicsPage() {
  const { lang } = useLanguage();
  const t = tokenomicsCopy[lang];
  const purchaseRows = publicPurchaseTable();

  return (
    <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Eyebrow>{t.tag}</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold tracking-tight text-ink">{t.title}</h1>
      <p className="mt-3 text-lead text-ink-2">{t.lead}</p>

      <p
        className="mt-6 rounded-2xl border border-warm/40 bg-warm/10 px-4 py-3 text-sm font-medium text-ink"
        role="note"
      >
        {t.banner}
      </p>

      <section className="mt-12" id="supply">
        <h2 className="text-h3 font-bold text-ink">{t.supplyTitle}</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">{t.supplyBody}</p>
        <p className="mt-4 font-mono text-2xl font-semibold tabular-nums text-brand">
          {TOTAL_SUPPLY_PPL.toLocaleString("en-US")} PPL
        </p>
        <p className="mt-4 rounded-xl border border-line bg-surface p-4 text-sm text-ink-2">{t.testnetNote}</p>
      </section>

      <section className="mt-14" id="emission">
        <h2 className="text-h3 font-bold text-ink">{t.emissionTitle}</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">{t.emissionLead}</p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-2">
          {t.emissionBullets.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
          <h3 className="font-semibold text-ink">{t.launchOrderTitle}</h3>
          <p className="mt-2 text-sm text-ink-2">{t.launchOrderBody}</p>
        </div>
      </section>

      <section className="mt-14" id="allocation">
        <h2 className="text-h3 font-bold text-ink">{t.allocationTitle}</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">{t.allocationLead}</p>
        <div className="mt-8">
          <AllocationDonut copy={t} />
        </div>
      </section>

      <section className="mt-14" id="circulating">
        <h2 className="text-h3 font-bold text-ink">{t.circulatingTitle}</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">{t.circulatingLead}</p>
        <div className="mt-6">
          <CirculatingSupplyChart axisLabel={t.monthAxis} />
        </div>
      </section>

      <section className="mt-14" id="sale">
        <h2 className="text-h3 font-bold text-ink">{t.saleTitle}</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">{t.saleLead}</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div id="sale-pay" className="rounded-2xl border border-line bg-surface p-4 sm:col-span-2 space-y-3">
            <h3 className="font-semibold text-ink">{t.salePayTitle}</h3>
            <p className="mt-2 text-sm text-ink-2">{t.salePayBody}</p>
            <PplSaleCheckout compact />
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <h3 className="font-semibold text-ink">{t.saleDeliveryTitle}</h3>
            <p className="mt-2 text-sm text-ink-2">{t.saleDeliveryBody}</p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-line bg-surface p-5">
          <h3 className="font-semibold text-ink">{t.curveTitle}</h3>
          <p className="mt-2 text-sm text-ink-2">{t.curveLead}</p>
          <BondingCurveChart />
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
          <h3 className="font-semibold text-ink">{t.unsoldTitle}</h3>
          <p className="mt-2 text-sm text-ink-2">{t.unsoldBody}</p>
        </div>

        <h3 className="mt-8 text-base font-bold text-ink">{t.purchaseTitle}</h3>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-ink-3">
              <tr>
                <th className="px-4 py-3">{t.purchaseCols.sold}</th>
                <th className="px-4 py-3">{t.purchaseCols.price}</th>
                <th className="px-4 py-3">{t.purchaseCols.tranche}</th>
                <th className="px-4 py-3">{t.purchaseCols.cumulative}</th>
              </tr>
            </thead>
            <tbody>
              {purchaseRows.map((row) => (
                <tr key={row.soldPct} className="border-t border-line">
                  <td className="px-4 py-3 font-mono tabular-nums">{Math.round(row.soldPct * 100)}%</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-brand">{formatUsdt(row.priceUsdt)}</td>
                  <td className="px-4 py-3 font-mono tabular-nums">{formatPpl(row.tranchePpl)}</td>
                  <td className="px-4 py-3 font-mono tabular-nums">{formatUsdt(row.cumulativeUsdt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 rounded-2xl border border-line bg-surface p-5">
          <h3 className="font-semibold text-ink">{t.raiseTitle}</h3>
          <p className="mt-2 text-sm text-ink-2">{t.raiseLead}</p>
          <ul className="mt-4 space-y-3">
            {t.raiseRows.map((row) => (
              <li key={row.label} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="font-semibold text-ink">{row.label}</span>
                <span className="font-mono text-brand">{row.pct}</span>
                <span className="text-ink-2">— {row.detail}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink-3">{t.safeNote}</p>
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
          <h3 className="font-semibold text-ink">{t.restrictionsTitle}</h3>
          <p className="mt-2 text-sm text-ink-2">{t.restrictionsBody}</p>
        </div>
      </section>

      <section className="mt-14" id="fees">
        <h2 className="text-h3 font-bold text-ink">{t.feeTitle}</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">{t.feeLead}</p>
        <FeeSplitDonut
          title={t.feeTitle}
          slices={NETWORK_FEE_SPLIT.map((row) => ({
            id: row.id,
            pct: row.pct,
            label: t.feeSliceLabels[row.id] ?? row.id,
          }))}
        />
        <p className="mt-4 text-sm text-ink-3">{t.feeNote}</p>
        <p className="mt-4 text-sm">
          <Link href="/fees" className="font-semibold text-brand hover:underline">
            {t.pplFeeTariffsLink}
          </Link>
        </p>
        <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
          <h3 className="font-semibold text-ink">{t.buybackTitle}</h3>
          <p className="mt-2 text-sm text-ink-2">{t.buybackBody}</p>
          <p className="mt-3 text-sm">
            <Link href="/explorer" className="font-semibold text-brand hover:underline">
              {t.explorerLink}
            </Link>
          </p>
        </div>
      </section>

      <section className="mt-14" id="contracts">
        <h2 className="text-h3 font-bold text-ink">{t.contractsTitle}</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">{t.contractsLead}</p>
        <ul className="mt-6 space-y-3">
          {t.contractRows.map((row) => (
            <li
              key={row.name}
              className="flex flex-col gap-1 rounded-xl border border-line bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="text-sm font-medium text-ink">{row.name}</span>
              <span className="font-mono text-xs text-ink-3">{row.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-12 text-sm">
        <Link href="/docs" className="font-semibold text-brand hover:underline">
          {t.backToDocsLink}
        </Link>
      </p>
    </article>
  );
}
