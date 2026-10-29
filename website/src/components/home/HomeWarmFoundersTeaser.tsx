"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { homeWarmCopy } from "@/lib/home-warm-content";
import { foundersPromoCopy } from "@/lib/founders-promo-content";
import { formatFounderDisplayNumber } from "@/lib/founders/format-founder-number";
import { FounderCard } from "@/components/founders/FounderCard";
import { CountUpNumber, WARM_PRIMARY_BTN, fill } from "@/components/warm/warm-ui";
import { Reveal } from "@/components/motion/Reveal";

const STATS_POLL_MS = 30_000;

/**
 * Compact teaser of the /founders hero: the same flip card, the next founder
 * number, and the live founder count when the stats endpoint answers with real
 * data. Without it the count line is not rendered at all — never zeroed.
 */
export function HomeWarmFoundersTeaser() {
  const { lang } = useLanguage();
  const t = homeWarmCopy(lang).foundersTeaser;
  const cardCopy = foundersPromoCopy(lang);
  const [verifiedCount, setVerifiedCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/founders/stats", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { verifiedCount?: number };
      if (typeof data.verifiedCount === "number" && Number.isFinite(data.verifiedCount)) {
        setVerifiedCount(data.verifiedCount);
      }
    } catch {
      /* keep the count hidden */
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), STATS_POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const title =
    verifiedCount === null
      ? t.title
      : fill(t.titleWithNumber, { n: formatFounderDisplayNumber(verifiedCount + 1, lang) });

  return (
    <section id="home-founders" data-testid="home-warm-founders" aria-labelledby="home-founders-title">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid items-center gap-8 rounded-[28px] border border-line bg-canvas-2 p-6 sm:p-10 lg:grid-cols-[1.15fr_0.85fr]">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">{t.eyebrow}</p>
            <h2 id="home-founders-title" className="mt-2 text-2xl font-bold leading-tight text-ink sm:text-3xl">
              {title}
            </h2>
            <p className="mt-3 max-w-xl text-sm text-ink-2 sm:text-base">{t.lead}</p>

            {verifiedCount !== null ? (
              <p
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink"
                data-testid="home-warm-founders-live"
              >
                <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-value opacity-60 motion-reduce:hidden" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-value" />
                </span>
                <span className="font-normal text-ink-2">{t.liveCountLabel}:</span>
                <CountUpNumber value={verifiedCount} lang={lang} className="font-mono" />
              </p>
            ) : null}

            <p className="mt-4 text-sm text-ink-3">{t.cardHint}</p>

            <Link
              href={t.href === "/founders" ? "/bounty" : t.href}
              className={`${WARM_PRIMARY_BTN} mt-6 w-full sm:w-auto`}
              data-testid="home-warm-founders-cta"
            >
              {t.cta}
            </Link>
          </Reveal>

          <Reveal delay={120} className="flex justify-center lg:justify-end">
            <FounderCard founder={null} t={cardCopy} lang={lang} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
