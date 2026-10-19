"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { useLanguage } from "@/context/LanguageContext";
import { useExternalWalletOptional } from "@/context/ExternalWalletContext";
import { buyCopy } from "@/lib/buy-content";
import { ensurePeopleChain, readInjectedProvider } from "@/lib/evm/client";
import { CURVE, SALE } from "@/lib/sale/config";
import { graduation } from "@/lib/sale/curve";
import { fillCopy, pricePerPpl, usd, usdCompact } from "@/lib/sale/format";

/**
 * Reuses `ensurePeopleChain` — the same call the wallet and factory pages make
 * — so the chain parameters offered here can never drift from the rest of the
 * site.
 */
function AddPeopleNetworkButton() {
  const { lang } = useLanguage();
  const t = buyCopy[lang];
  const externalWallet = useExternalWalletOptional();
  const [state, setState] = useState<"idle" | "done" | "error">("idle");

  const add = async () => {
    const provider =
      externalWallet?.signer?.kind === "injected"
        ? externalWallet.signer.provider
        : readInjectedProvider("any");
    if (!provider) {
      setState("error");
      return;
    }
    try {
      await ensurePeopleChain(provider);
      setState("done");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => void add()}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-5 text-sm font-semibold text-ink transition hover:border-brand hover:text-brand"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t.faq.addNetworkCta}
      </button>
      {state === "done" ? <p className="mt-2 text-xs text-value">{t.faq.addNetworkDone}</p> : null}
      {state === "error" ? <p className="mt-2 text-xs text-warm">{t.faq.addNetworkError}</p> : null}
    </div>
  );
}

/** The "how do I add the People network" question, which carries the button. */
const ADD_NETWORK_FAQ_INDEX = 3;

/**
 * FAQ and the pump.fun comparison table.
 *
 * No risk or legal statements live here any more (owner decision 2026-10-16):
 * they are in `SmallPrint` at the foot of the page, referenced by asterisk.
 */
export function SaleFaq() {
  const { lang } = useLanguage();
  const t = buyCopy[lang];
  const grad = graduation();

  const vars = {
    fee: `${SALE.sellFeePct}%`,
    ceiling: pricePerPpl(CURVE.ceilingPriceUsd, lang),
    graduation: usdCompact(CURVE.graduationRaiseUsd, lang),
    graduationPrice: pricePerPpl(grad.priceUsd, lang),
    verified: SALE.fullMainnetVerifiedPeople.toLocaleString(lang),
    months: SALE.fullMainnetMaxMonths,
    saleMonths: SALE.durationMonths,
    perBuy: usd(SALE.maxPerBuyUsd, lang),
    perDay: usd(SALE.maxPerDayUsd, lang),
    cooldown: SALE.cooldownSeconds,
    lock: SALE.lpLockMonths,
  };

  return (
    <div className="mt-8 space-y-8" data-testid="sale-faq">
      {/* Q&A */}
      <div className="grid gap-3 sm:grid-cols-2">
        {t.faq.items.map((item, index) => (
          <details
            key={item.q}
            className="group rounded-2xl border border-line bg-surface p-4 open:shadow-[var(--elev-1)]"
            open={index === 0}
          >
            <summary className="cursor-pointer list-none text-sm font-semibold text-ink marker:hidden">
              <span className="flex items-start justify-between gap-3">
                {fillCopy(item.q, vars)}
                <span
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-ink-3 transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </span>
            </summary>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-2">{fillCopy(item.a, vars)}</p>
            {index === ADD_NETWORK_FAQ_INDEX ? <AddPeopleNetworkButton /> : null}
          </details>
        ))}
      </div>

      {/* pump.fun comparison */}
      <div>
        <h3 className="text-base font-bold text-ink">{t.faq.pumpTitle}</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2">{t.faq.pumpLead}</p>

        {/* Cards on small screens, a table from md up — both from the same rows. */}
        <ul className="mt-4 grid gap-3 md:hidden">
          {t.faq.pumpRows.map((row) => (
            <li key={row.problem} className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-sm font-bold text-ink">{row.problem}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{fillCopy(row.what, vars)}</p>
              <p className="mt-2.5 rounded-xl bg-value/10 px-3 py-2 text-sm leading-relaxed text-ink-2">
                {fillCopy(row.ours, vars)}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-4 hidden overflow-hidden rounded-2xl border border-line md:block">
          <table className="w-full border-collapse text-start text-sm">
            <thead>
              <tr className="bg-surface-2">
                {t.faq.pumpCols.map((col) => (
                  <th key={col} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-3">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.faq.pumpRows.map((row) => (
                <tr key={row.problem} className="border-t border-line align-top">
                  <td className="w-1/5 px-4 py-3 font-semibold text-ink">{row.problem}</td>
                  <td className="w-2/5 px-4 py-3 leading-relaxed text-ink-3">
                    {fillCopy(row.what, vars)}
                  </td>
                  <td className="w-2/5 px-4 py-3 leading-relaxed text-ink-2">
                    {fillCopy(row.ours, vars)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
