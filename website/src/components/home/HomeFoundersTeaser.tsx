"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { homePublic } from "@/lib/home-public-content";
import { foundersPublic } from "@/lib/founders-public-content";
import { formatFounderDisplayNumber } from "@/lib/founders/format-founder-number";

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ""));
}

export function HomeFoundersTeaser() {
  const { lang } = useLanguage();
  const teaser = homePublic[lang].foundersTeaser;
  const founderCopy = foundersPublic[lang];
  const [verifiedCount, setVerifiedCount] = useState<number | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/founders/stats", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { verifiedCount?: number };
      if (typeof data.verifiedCount === "number") setVerifiedCount(data.verifiedCount);
    } catch {
      /* keep fallback title */
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const title = useMemo(() => {
    if (!teaser) return "";
    if (verifiedCount !== null && teaser.titleWithNumber) {
      return fill(teaser.titleWithNumber, {
        n: formatFounderDisplayNumber(verifiedCount + 1, lang),
      });
    }
    return teaser.titleFallback ?? founderCopy.heroTitleFallback;
  }, [teaser, verifiedCount, lang, founderCopy.heroTitleFallback]);

  if (!teaser) return null;

  return (
    <section className="border-b border-line bg-canvas-2">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">{teaser.eyebrow}</p>
          <h2 className="mt-2 text-xl font-bold sm:text-2xl">{title}</h2>
          <p className="mt-2 text-sm text-ink-2 sm:text-base">{teaser.lead}</p>
        </div>
        <Link
          href={teaser.href}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-ink"
        >
          {teaser.cta}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
