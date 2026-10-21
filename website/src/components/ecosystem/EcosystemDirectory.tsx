"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { Chip, Eyebrow } from "@/components/ui/primitives";
import {
  ECOSYSTEM_CATEGORIES,
  ECOSYSTEM_PRODUCTS,
  ecosystemPublic,
  type EcosystemStatus,
} from "@/lib/ecosystem-content";

function statusBadgeClass(status: EcosystemStatus): string {
  if (status === "testnet") {
    return "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200";
  }
  return "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200";
}

export function EcosystemDirectory() {
  const { lang } = useLanguage();
  const t = ecosystemPublic[lang];

  return (
    <div className="relative isolate mx-auto max-w-5xl overflow-hidden px-4 py-10 sm:px-6 lg:py-14">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 bg-[radial-gradient(45%_70%_at_85%_0%,rgba(245,158,11,0.14),transparent_70%),radial-gradient(35%_55%_at_0%_10%,rgba(3,105,161,0.10),transparent_70%)] dark:bg-[radial-gradient(45%_70%_at_85%_0%,rgba(251,191,36,0.12),transparent_70%),radial-gradient(35%_55%_at_0%_10%,rgba(76,196,248,0.12),transparent_70%)]"
        aria-hidden="true"
      />
      <Eyebrow tone="brand">{t.eyebrow}</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold tracking-tight text-ink">{t.meta.title}</h1>
      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-2">{t.intro}</p>

      {ECOSYSTEM_CATEGORIES.map((category) => {
        const products = ECOSYSTEM_PRODUCTS.filter((product) => product.category === category);
        if (products.length === 0) return null;

        return (
          <section key={category} className="mt-12">
            <div className="flex items-center gap-4">
              <h2 className="text-h3 font-bold text-ink">{t.categories[category]}</h2>
              <span className="h-px flex-1 bg-line" aria-hidden="true" />
            </div>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {products.map((product) => {
                const copy = t.items[product.id as keyof typeof t.items];
                const linkClass =
                  "inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline";
                const arrowClass = "h-4 w-4 shrink-0 rtl:-scale-x-100";

                return (
                  <li
                    key={product.id}
                    className="surface-elevated flex flex-col rounded-2xl border border-line p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 font-mono text-lg font-bold text-brand"
                      >
                        {product.monogram}
                      </span>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(product.status)}`}
                      >
                        {t.statusLabels[product.status]}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-ink">{product.name}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-2">{copy.summary}</p>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
                      <Chip tone={product.label === "built_by_people" ? "brand" : "neutral"}>
                        {t.labelBadges[product.label]}
                      </Chip>
                      {product.external ? (
                        <a
                          href={product.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={linkClass}
                        >
                          {t.openLabel}
                          <ArrowUpRight className={arrowClass} aria-hidden="true" />
                        </a>
                      ) : (
                        <Link href={product.href} className={linkClass}>
                          {t.openLabel}
                          <ArrowRight className={arrowClass} aria-hidden="true" />
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
