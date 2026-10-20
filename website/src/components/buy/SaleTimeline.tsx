"use client";

import { useLanguage } from "@/context/LanguageContext";
import { buyCopy } from "@/lib/buy-content";
import { CURVE, SALE } from "@/lib/sale/config";
import { curveEnd } from "@/lib/sale/curve";
import { fillCopy, pplCompact, pricePerPpl, usdCompact } from "@/lib/sale/format";

/** Curve → sale end → full mainnet → unsold PPL. Four steps, no dates invented. */
export function SaleTimeline() {
  const { lang } = useLanguage();
  const t = buyCopy[lang];
  const end = curveEnd();

  const vars = {
    supply: `${pplCompact(CURVE.supplyPpl, lang)}`,
    start: pricePerPpl(CURVE.startPriceUsd, lang),
    ceiling: pricePerPpl(CURVE.ceilingPriceUsd, lang),
    saleMonths: SALE.durationMonths,
    endRaise: usdCompact(end.raisedUsd, lang),
    liquidityShare: `${SALE.liquiditySharePct}%`,
    multisigShare: `${SALE.multisigSharePct}%`,
    lock: SALE.lpLockMonths,
    verified: SALE.fullMainnetVerifiedPeople.toLocaleString(lang),
    months: SALE.fullMainnetMaxMonths,
  };

  return (
    <ol className="mt-8 grid gap-0 sm:grid-cols-2 lg:grid-cols-4" data-testid="sale-timeline">
      {t.timeline.steps.map((step, index) => (
        <li key={step.title} className="relative pb-8 ps-8 sm:pb-0 sm:ps-0 sm:pe-5 sm:pt-10">
          {/* Rail: vertical on mobile, horizontal from sm up. */}
          <span
            aria-hidden="true"
            className="absolute start-[7px] top-4 h-full w-px bg-line sm:start-0 sm:top-[7px] sm:h-px sm:w-full"
          />
          <span
            aria-hidden="true"
            className={`absolute start-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 sm:top-0 ${
              index === 0
                ? "border-brand bg-brand"
                : index === t.timeline.steps.length - 1
                  ? "border-line-strong bg-canvas"
                  : "border-brand bg-canvas"
            }`}
          />
          <p className="mono-label text-ink-3">{String(index + 1).padStart(2, "0")}</p>
          <h3 className="mt-1 text-base font-bold text-ink">{fillCopy(step.title, vars)}</h3>
          <p className="mt-2 pe-1 text-sm leading-relaxed text-ink-2">{fillCopy(step.body, vars)}</p>
        </li>
      ))}
    </ol>
  );
}
