"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useLanguage } from "@/context/LanguageContext";
import { WARM_SECTION } from "@/components/warm/warm-ui";
import { buyCopy } from "@/lib/buy-content";
import { CURVE } from "@/lib/sale/config";
import { countdownTo, formatOpenDate, type BuyPagePhase } from "@/lib/sale/buy-page";
import { fillCopy, pricePerPpl } from "@/lib/sale/format";
import { V2_SALE } from "@/lib/sale/v2/constants";
import { parseV2OpenDate } from "@/lib/sale/v2/stats-copy";

export const BUY_FORM_ID = "buy-form";
export const BUY_RULES_ID = "rules";

const CTA_CLASS =
  "inline-flex min-h-13 w-full max-w-sm items-center justify-center rounded-full bg-brand px-7 py-3.5 text-center text-base font-semibold leading-snug text-brand-ink shadow-[0_14px_36px_-16px_rgba(3,105,161,0.8)] transition hover:brightness-110 sm:w-auto sm:max-w-none";

/**
 * The page's one main action. Before opening it leads to verification (the
 * first days are verified-only), while the sale runs it jumps to the form, and
 * after the sale it points at the sell-back rules.
 */
export function BuyCta({ phase, testId }: { phase: BuyPagePhase; testId: string }) {
  const { lang } = useLanguage();
  const t = buyCopy[lang].hero;
  const vars = { days: V2_SALE.whitelistDays };

  if (phase === "upcoming") {
    return (
      <Link href="/founders#verify" className={CTA_CLASS} data-testid={testId} data-cta="verify">
        {fillCopy(t.ctaVerify, vars)}
      </Link>
    );
  }
  const href = phase === "ended" ? `#${BUY_RULES_ID}` : `#${BUY_FORM_ID}`;
  return (
    <a href={href} className={CTA_CLASS} data-testid={testId} data-cta={phase === "ended" ? "rules" : "buy"}>
      {phase === "ended" ? t.ctaEnded : t.ctaBuy}
    </a>
  );
}

/** The sentence under the headline that changes with the sale phase. */
export function heroSub(
  t: (typeof buyCopy)["en"]["hero"],
  phase: BuyPagePhase,
  openDateText: string,
): string {
  if (phase === "whitelist") return fillCopy(t.subWhitelist, { days: V2_SALE.whitelistDays });
  if (phase === "open") return t.subOpen;
  if (phase === "ended") return t.subEnded;
  return fillCopy(t.subUpcoming, { date: openDateText });
}

function CountdownCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface px-2 py-3 text-center shadow-[var(--elev-1)]">
      <p className="font-mono text-2xl font-bold tabular-nums text-ink sm:text-3xl">{value}</p>
      <p className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">{label}</p>
    </div>
  );
}

/**
 * Days, hours and minutes to the opening date. Rendered only after mount so
 * the server and the browser never disagree about the time; no seconds, so it
 * reads as a date rather than a race.
 */
function OpeningCountdown({ openDate }: { openDate: Date }) {
  const { lang } = useLanguage();
  const t = buyCopy[lang].hero;
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const left = now === null ? null : countdownTo(openDate.getTime(), now);
  if (left?.done) {
    return (
      <p className="mx-auto mt-6 max-w-md text-sm text-ink-2" data-testid="buy-countdown-done">
        {t.countdownDone}
      </p>
    );
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="mx-auto mt-6 w-full max-w-sm" data-testid="buy-countdown" aria-live="off">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">{t.countdownLabel}</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <CountdownCell value={left ? String(left.days) : "–"} label={t.days} />
        <CountdownCell value={left ? pad(left.hours) : "–"} label={t.hours} />
        <CountdownCell value={left ? pad(left.minutes) : "–"} label={t.minutes} />
      </div>
    </div>
  );
}

/** Hero: headline, one sentence, the countdown (or live price) and one button. */
export function BuyHero({
  phase,
  openDateRaw,
  spotPriceUsd,
}: {
  phase: BuyPagePhase;
  openDateRaw: string | null | undefined;
  spotPriceUsd: number | null;
}) {
  const { lang } = useLanguage();
  const t = buyCopy[lang].hero;
  const openDate = parseV2OpenDate(openDateRaw);
  const live = phase === "whitelist" || phase === "open";

  return (
    <section
      className="border-b border-line bg-canvas-2 pt-[max(0px,env(safe-area-inset-top))]"
      aria-labelledby="buy-hero-title"
      data-testid="buy-hero"
      data-phase={phase}
    >
      <div className={`${WARM_SECTION} text-center`}>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">{t.eyebrow}</p>
        <h1
          id="buy-hero-title"
          className="mx-auto mt-3 max-w-3xl text-[clamp(2rem,8vw,3.5rem)] font-bold leading-[1.05] tracking-tight text-ink"
        >
          {t.headline}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ink-2 sm:text-lg">
          {t.lead} {heroSub(t, phase, formatOpenDate(openDate, lang))}
        </p>

        {phase === "upcoming" ? <OpeningCountdown openDate={openDate} /> : null}

        <div className="mt-7 flex justify-center">
          <BuyCta phase={phase} testId="buy-hero-cta" />
        </div>

        {phase === "upcoming" ? (
          <p className="mt-4 text-sm text-ink-3" data-testid="buy-hero-price">
            {fillCopy(t.startPrice, { price: pricePerPpl(CURVE.startPriceUsd, lang) })}
          </p>
        ) : live && spotPriceUsd !== null ? (
          <p className="mt-4 text-sm font-medium text-ink-2" data-testid="buy-hero-price">
            {fillCopy(t.livePrice, { price: pricePerPpl(spotPriceUsd, lang) })}
          </p>
        ) : null}
      </div>
    </section>
  );
}
