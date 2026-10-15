"use client";

import { useLanguage } from "@/context/LanguageContext";
import { Reveal } from "@/components/motion/Reveal";
import { WARM_SECTION, WarmSection } from "@/components/warm/warm-ui";
import { buyCopy } from "@/lib/buy-content";
import { CURVE } from "@/lib/sale/config";
import { fillCopy, pricePerPpl } from "@/lib/sale/format";

import { BuyForm } from "./BuyForm";
import { CurveChart } from "./CurveChart";
import { SaleFaq } from "./SaleFaq";
import { SaleStatsPanel } from "./SaleStatsPanel";
import { SaleTimeline } from "./SaleTimeline";
import { SaleTransparency } from "./SaleTransparency";
import { SmallPrint, FootnoteRef } from "./SmallPrint";
import { StickyBuyBar } from "./StickyBuyBar";
import { TradeFeed } from "./TradeFeed";
import { WhatYouGet } from "./WhatYouGet";
import { useSaleData } from "./useSaleData";

const BOTTOM_FORM_ID = "buy-now";

/** `/buy` — the PPL sale page. */
export function BuyPage() {
  const { lang } = useLanguage();
  const t = buyCopy[lang];
  const { stats, trades } = useSaleData();

  const isRtl = lang === "ar";

  return (
    <div data-testid="buy-page" dir={isRtl ? "rtl" : "ltr"} className={isRtl ? "buy-page-rtl" : undefined}>
      {/* 1 — Hero: the pitch and the stats on the left, the form on the right */}
      <section className="border-b border-line bg-canvas-2" aria-labelledby="buy-hero-title">
        <div className={`${WARM_SECTION} grid items-start gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">
              {t.hero.eyebrow}
            </p>
            <h1
              id="buy-hero-title"
              className="mt-2 text-[clamp(1.75rem,6vw,3rem)] font-bold leading-[1.08] tracking-tight text-ink"
            >
              {t.hero.headline}
            </h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-2 sm:text-lg">
              {t.hero.sub}
              <FootnoteRef marker="*" />
            </p>

            <div className="mt-7">
              <SaleStatsPanel stats={stats} />
            </div>
          </div>

          <div className="lg:sticky lg:top-24">
            <BuyForm soldPpl={stats.soldPpl} testId="buy-form-hero" />
          </div>
        </div>
      </section>

      {/* 2 — The curve itself, plus the live trade feed */}
      <WarmSection
        id="curve"
        eyebrow={t.curve.eyebrow}
        title={t.curve.title}
        lead={fillCopy(t.curve.lead, { start: pricePerPpl(CURVE.startPriceUsd, lang) })}
      >
        <div className="mt-8 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <Reveal>
            <CurveChart stats={stats} />
          </Reveal>
          <Reveal delay={80}>
            <TradeFeed trades={trades} />
          </Reveal>
        </div>

        {/* Owner decision 2026-10-16: the scope of the cap is stated in full
            size, never as small print. */}
        <Reveal>
          <p
            data-testid="cap-scope"
            className="mt-5 rounded-2xl border border-brand/40 bg-brand/5 px-5 py-4 text-sm font-medium leading-relaxed text-ink sm:text-base"
          >
            {fillCopy(t.curve.capScope, { ceiling: pricePerPpl(CURVE.ceilingPriceUsd, lang) })}
            <FootnoteRef marker="*" />
          </p>
        </Reveal>
      </WarmSection>

      {/* 3 — What a purchase gets you */}
      <WarmSection
        id="what-you-get"
        eyebrow={t.whatYouGet.eyebrow}
        title={t.whatYouGet.title}
        tone="canvas-2"
      >
        <Reveal>
          <WhatYouGet />
        </Reveal>
      </WarmSection>

      {/* 4 — Order of events */}
      <WarmSection id="timeline" eyebrow={t.timeline.eyebrow} title={t.timeline.title}>
        <Reveal>
          <SaleTimeline />
        </Reveal>
      </WarmSection>

      {/* 5 — The sale contract, the split of the raise, the reviews, the allocation */}
      <WarmSection
        id="transparency"
        eyebrow={t.transparency.eyebrow}
        title={t.transparency.title}
        lead={t.transparency.lead}
        tone="canvas-2"
      >
        <Reveal>
          <SaleTransparency stats={stats} />
        </Reveal>
      </WarmSection>

      {/* 6 — FAQ (risks live in the small print at the foot of the page) */}
      <WarmSection id="faq" eyebrow={t.faq.eyebrow} title={t.faq.title}>
        <Reveal>
          <SaleFaq />
        </Reveal>
      </WarmSection>

      {/* 7 — Bottom CTA: the same form, the same price */}
      <section
        id={BOTTOM_FORM_ID}
        className="scroll-mt-20 border-t border-line bg-canvas-2"
        aria-labelledby="buy-bottom-title"
      >
        <div className={`${WARM_SECTION} grid items-center gap-8 lg:grid-cols-2`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">
              {t.bottomCta.eyebrow}
            </p>
            <h2 id="buy-bottom-title" className="mt-2 text-2xl font-bold leading-tight text-ink sm:text-3xl">
              {t.bottomCta.title}
            </h2>
            <p className="mt-3 text-sm text-ink-2 sm:text-base">{t.bottomCta.lead}</p>
            {/* Just the price here — the full stat grid already ran in the hero. */}
            <div className="mt-6 inline-flex flex-col rounded-2xl border border-brand/40 bg-brand/5 px-5 py-4">
              <span className="text-xs font-medium text-ink-3">{t.stats.price}</span>
              <span className="mt-0.5 font-mono text-2xl font-bold text-brand">
                {stats.spotPriceUsd === null
                  ? t.stats.notOpenYet
                  : pricePerPpl(stats.spotPriceUsd, lang)}
              </span>
              <span className="mt-1 text-[11px] text-ink-3">
                {fillCopy(t.stats.priceStartHint, {
                  start: pricePerPpl(CURVE.startPriceUsd, lang),
                })}
              </span>
            </div>
          </div>
          <BuyForm soldPpl={stats.soldPpl} testId="buy-form-bottom" />
        </div>
      </section>

      <div className={`${WARM_SECTION} !py-8`}>
        <SmallPrint />
      </div>

      {/* Mobile-only sticky CTA; adds room so it never covers the small print. */}
      <div className="h-20 sm:hidden" aria-hidden="true" />
      <StickyBuyBar stats={stats} targetId={BOTTOM_FORM_ID} />
    </div>
  );
}
