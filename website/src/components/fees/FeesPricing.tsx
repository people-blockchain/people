"use client";

import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { feesCopy } from "@/lib/fees-content";
import { Eyebrow } from "@/components/ui/primitives";

export function FeesPricing() {
  const { lang } = useLanguage();
  const t = feesCopy[lang];

  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Eyebrow>{t.tag}</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold tracking-tight">{t.title}</h1>
      <p className="mt-3 text-lead text-ink-2">{t.lead}</p>
      <p className="mt-2 text-sm text-ink-3">{t.approvedNote}</p>
      <div className="mt-8 overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-ink-3">
            <tr>
              <th className="px-4 py-3 font-semibold">{t.tableColOperation}</th>
              <th className="px-4 py-3 font-semibold">{t.tableColTariff}</th>
              <th className="hidden px-4 py-3 font-semibold sm:table-cell">
                {t.tableColNote}
              </th>
            </tr>
          </thead>
          <tbody>
            {t.table.map((row) => (
              <tr key={row.operation} className="border-t border-line">
                <td className="px-4 py-3 font-medium text-ink">{row.operation}</td>
                <td className="px-4 py-3 font-mono tabular-nums text-brand">{row.amount}</td>
                <td className="hidden px-4 py-3 text-ink-2 sm:table-cell">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-sm text-ink-2">{t.contractNote}</p>
      <p className="mt-2 text-sm text-ink-3">{t.modelANote}</p>
      <p className="mt-2 text-sm text-ink-3">{t.payOptionsNote}</p>
      <p className="mt-2 text-sm text-ink-3">{t.stableFeeNetworkNote}</p>
      <div className="mt-8 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-base font-bold text-ink">{t.growthReferralTitle}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.growthReferralBody}</p>
      </div>
      <p className="mt-6 flex flex-wrap gap-4 text-sm font-semibold">
        <Link href="/create/contract" className="text-brand hover:underline">
          {t.createContractLink}
        </Link>
        <Link href="/create" className="text-brand hover:underline">
          Token Factory
        </Link>
      </p>
    </section>
  );
}
