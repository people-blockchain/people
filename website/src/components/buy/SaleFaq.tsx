"use client";

import { useLanguage } from "@/context/LanguageContext";
import { buyCopy } from "@/lib/buy-content";
import { buyCopyVars } from "@/lib/sale/buy-page";
import { fillCopy } from "@/lib/sale/format";

import { FootnoteRef } from "./SmallPrint";

/** Six short answers and the risk warning. The legal notes stay in `SmallPrint`. */
export function SaleFaq() {
  const { lang } = useLanguage();
  const t = buyCopy[lang].faq;
  const vars = buyCopyVars(lang);

  return (
    <div className="mt-8 space-y-6" data-testid="sale-faq">
      <div className="grid gap-3 md:grid-cols-2">
        {t.items.map((item) => (
          <article key={item.q} className="rounded-2xl border border-line bg-surface p-4">
            <h3 className="text-sm font-semibold text-ink">{fillCopy(item.q, vars)}</h3>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-2">{fillCopy(item.a, vars)}</p>
          </article>
        ))}
      </div>

      <div
        className="rounded-2xl border border-warm/40 bg-warm/5 px-5 py-4 text-sm leading-relaxed text-ink"
        role="note"
        data-testid="buy-risk-warning"
      >
        <p className="font-semibold">{t.riskTitle}</p>
        <p className="mt-1 text-ink-2">
          {t.riskBody}
          <FootnoteRef marker="**" />
        </p>
      </div>
    </div>
  );
}
