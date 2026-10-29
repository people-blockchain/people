"use client";

import Link from "next/link";

import { useLanguage } from "@/context/LanguageContext";
import { buyCopy } from "@/lib/buy-content";
import { buyCopyVars } from "@/lib/sale/buy-page";
import { fillCopy } from "@/lib/sale/format";

/** Three steps: verify, choose amount and network, PPL on your address. */
export function HowToBuy() {
  const { lang } = useLanguage();
  const t = buyCopy[lang].how;
  const vars = buyCopyVars(lang);

  return (
    <ol className="mt-8 grid gap-3 md:grid-cols-3" data-testid="buy-how-steps">
      {t.steps.map((step, index) => (
        <li key={step.title} className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--elev-1)]">
          <p className="mono-label text-brand">{String(index + 1).padStart(2, "0")}</p>
          <h3 className="mt-1 text-base font-bold text-ink">{fillCopy(step.title, vars)}</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{fillCopy(step.body, vars)}</p>
          {index === 0 ? (
            <Link
              href="/founders#verify"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand underline-offset-2 hover:underline"
            >
              {t.verifyLink}
            </Link>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
