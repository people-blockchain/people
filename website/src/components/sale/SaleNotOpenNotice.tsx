"use client";

import { useLanguage } from "@/context/LanguageContext";
import { tokenomicsCopy } from "@/lib/tokenomics-content";

/**
 * `/buy` renders this instead of the sale checkout: there is no public PPL
 * sale, no published price, no payment widget and no KYC flow (P0-10). The
 * wording is the same "sale closed" copy the Tokenomics page shows, so the two
 * surfaces cannot drift. The sale API routes and `src/lib/sale/*` stay in the
 * tree — only the rendered widget is switched off.
 */
export function SaleNotOpenNotice() {
  const { lang } = useLanguage();
  const t = tokenomicsCopy[lang];

  return (
    <div className="rounded-2xl border border-warm/50 bg-warm/10 p-5" role="note">
      <h2 className="font-semibold text-ink">{t.saleClosedTitle}</h2>
      <p className="mt-2 text-sm text-ink-2">{t.saleClosedBody}</p>
    </div>
  );
}
