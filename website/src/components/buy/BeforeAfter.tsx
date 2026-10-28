"use client";

import { ArrowRight } from "lucide-react";

import { useLanguage } from "@/context/LanguageContext";
import { buyCopy } from "@/lib/buy-content";
import { buyCopyVars } from "@/lib/sale/buy-page";
import { fillCopy } from "@/lib/sale/format";

/** "Before → with PEOPLE": three one-line pairs. */
export function BeforeAfter() {
  const { lang } = useLanguage();
  const t = buyCopy[lang].before;
  const vars = buyCopyVars(lang);

  return (
    <ul className="mt-8 grid gap-3" data-testid="buy-before-after">
      {t.rows.map((row) => (
        <li
          key={row.after}
          className="grid gap-3 rounded-3xl border border-line bg-surface p-4 shadow-[var(--elev-1)] sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-5 sm:p-5"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">{t.beforeLabel}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-3 sm:text-base">{fillCopy(row.before, vars)}</p>
          </div>
          <ArrowRight className="hidden h-5 w-5 shrink-0 text-ink-3 sm:block rtl:rotate-180" aria-hidden="true" />
          <div className="min-w-0 border-t border-line pt-3 sm:border-t-0 sm:pt-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand">{t.afterLabel}</p>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-ink sm:text-base">{fillCopy(row.after, vars)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
