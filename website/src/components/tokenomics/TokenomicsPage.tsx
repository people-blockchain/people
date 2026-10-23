"use client";

import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { tokenomicsCopy } from "@/lib/tokenomics-content";
import { NETWORK_FEE_SPLIT, TOTAL_SUPPLY_PPL } from "@/lib/tokenomics";
import { Eyebrow } from "@/components/ui/primitives";
import { FeeSplitDonut } from "@/components/visuals/FeeSplitDonut";
import { AllocationDonut } from "./AllocationDonut";
import { CirculatingSupplyChart } from "./CirculatingSupplyChart";
import { BondingCurveChart } from "./BondingCurveChart";
import { publicPurchaseTable } from "@/lib/tokenomics";
import { CURVE } from "@/lib/sale/config";
import { pricePerPpl, usd } from "@/lib/sale/format";

export function TokenomicsPage() {
  const { lang } = useLanguage();
  const t = tokenomicsCopy[lang];

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
        <div className="mt-6 rounded-2xl border border-brand/30 bg-brand/5 p-5" role="note">
          <h3 className="font-semibold text-ink">{t.salePublicTitle}</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.salePublicBody}</p>
          <p className="mt-3 text-sm">
            <Link href="/buy" className="font-semibold text-brand hover:underline">
              {t.salePublicCta}
            </Link>
          </p>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div id="sale-pay" className="rounded-2xl border border-line bg-surface p-4 sm:col-span-2 space-y-3">
            <h3 className="font-semibold text-ink">{t.salePayTitle}</h3>
            <p className="mt-2 text-sm text-ink-2">{t.salePayBody}</p>
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
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-ink-2">
            {t.saleCurveBullets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[280px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-ink-3">
                  <th className="py-2 pr-3 font-semibold">{t.curveTableSold}</th>
                  <th className="py-2 pr-3 font-semibold">{t.curveTablePrice}</th>
                  <th className="py-2 font-semibold">{t.curveTableRaised}</th>
                </tr>
              </thead>
              <tbody>
                {publicPurchaseTable().map((row) => {
                  const unreachable = row.cumulativeUsdt > CURVE.graduationRaiseUsd;
                  return (
                    <tr
                      key={row.soldPct}
                      className={`border-b border-line/60 ${unreachable ? "text-ink-3 opacity-70" : "text-ink-2"}`}
                    >
                      <td className="py-2 pr-3">{Math.round(row.soldPct * 100)}%</td>
                      <td className="py-2 pr-3"><bdi dir="ltr">{pricePerPpl(row.priceUsdt, lang)}</bdi></td>
                      <td className="py-2">
                        <bdi dir="ltr">{usd(row.cumulativeUsdt, lang)}</bdi>
                        {unreachable ? <span className="ms-1 text-xs">*</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink-3">* {t.curveTableUnreachable}</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
          <h3 className="font-semibold text-ink">{t.unsoldTitle}</h3>
          <p className="mt-2 text-sm text-ink-2">{t.unsoldBody}</p>
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
          <p className="mt-2 text-sm text-ink-2">{t.buybackNote}</p>
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
