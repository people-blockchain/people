"use client";

import { useLanguage } from "@/context/LanguageContext";
import { Reveal } from "@/components/motion/Reveal";
import { WARM_SECTION, WarmSection } from "@/components/warm/warm-ui";
import { buyCopy } from "@/lib/buy-content";
import { CURVE } from "@/lib/sale/config";
import { fillCopy, pricePerPpl } from "@/lib/sale/format";

import { BuyForm } from "./BuyForm";
import { BuyWhyPriceRises } from "./BuyWhyPriceRises";
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
import { useSalePhase } from "@/lib/sale/sale-state";

const HERO_FORM_ID = "buy-form";

/** `/buy` — the PPL sale page. */
export function BuyPage({ initialSaleOpen }: { initialSaleOpen?: boolean }) {
  const { lang } = useLanguage();
  const t = buyCopy[lang];
  const { stats, trades } = useSaleData();
  const { phase, hubAcceptsUsdt } = useSalePhase(initialSaleOpen);
  const open = phase === "open";

  const isRtl = lang === "ar";

  return (
    <div
      data-testid="buy-page"
      dir={isRtl ? "rtl" : "ltr"}
      className={isRtl ? "buy-page-rtl" : undefined}
    >
      {/* 1 — Hero: the pitch and the stats on the left, the form on the right */}
      <section
        className="border-b border-line bg-canvas-2 pt-[max(0px,env(safe-area-inset-top))]"
        aria-labelledby="buy-hero-title"
      >
        <div className={`${WARM_SECTION} grid items-start gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:grid-rows-[auto_1fr_auto] lg:gap-10`}>
          <div className="order-1 lg:col-start-1 lg:row-start-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">
              {t.hero.eyebrow}
            </p>
            <h1
              id="buy-hero-title"
              className="mt-2 text-[clamp(1.75rem,6vw,3rem)] font-bold leading-[1.08] tracking-tight text-ink"
            >
              {open ? t.hero.headline : t.hero.headlineClosed}
            </h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-2 sm:text-lg">
              {t.hero.sub}
              <FootnoteRef marker="*" />
            </p>
          </div>

          <div
            id={HERO_FORM_ID}
            className="order-2 scroll-mt-[calc(3.5rem+0.75rem)] lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:scroll-mt-24"
          >
            <BuyForm soldPpl={stats.soldPpl} phase={phase} hubAcceptsUsdt={hubAcceptsUsdt} testId="buy-form-hero" />
          </div>

          <div className="order-3 lg:col-start-1 lg:row-start-2">
            <SaleStatsPanel stats={stats} phase={phase} />
          </div>

          <div className="order-4 lg:col-start-2 lg:row-start-3">
            <BuyWhyPriceRises phase={phase} />
          </div>
        </div>
      </section>

      {/* 2 — The curve itself, plus the live trade feed */}
      <WarmSection
        id="curve"
        eyebrow={t.curve.eyebrow}
        title={t.curve.title}
      >
        <details className="mt-4 text-sm text-ink-2" data-testid="curve-formula">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink">
            {t.curve.formulaToggle}
          </summary>
          <p className="pb-2">{fillCopy(t.curve.lead, { start: pricePerPpl(CURVE.startPriceUsd, lang) })}</p>
        </details>
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

      {/* 7 — Bottom CTA: scroll back to the single buy form in the hero */}
      <section
        id="buy-now"
        className="scroll-mt-20 border-t border-line bg-canvas-2"
        aria-labelledby="buy-bottom-title"
      >
        <div className={`${WARM_SECTION} max-w-2xl`}>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">
            {t.bottomCta.eyebrow}
          </p>
          <h2 id="buy-bottom-title" className="mt-2 text-2xl font-bold leading-tight text-ink sm:text-3xl">
            {open ? t.bottomCta.title : t.bottomCta.titleClosed}
          </h2>
          <p className="mt-3 text-sm text-ink-2 sm:text-base">{open ? t.bottomCta.lead : t.bottomCta.leadClosed}</p>
          <div className="mt-6 inline-flex flex-col rounded-2xl border border-brand/40 bg-brand/5 px-5 py-4">
            <span className="text-xs font-medium text-ink-3">{open ? t.stats.price : t.stats.saleStatus}</span>
            <span className="mt-0.5 font-mono text-2xl font-bold text-brand">
              {open && stats.spotPriceUsd !== null
                ? pricePerPpl(stats.spotPriceUsd, lang)
                : t.stats.notOpenYet}
            </span>
            <span className="mt-1 text-[11px] text-ink-3">
              {fillCopy(open ? t.stats.priceStartHint : t.stats.startPriceOnOpen, {
                start: pricePerPpl(CURVE.startPriceUsd, lang),
              })}
            </span>
          </div>
          <a
            href={`#${HERO_FORM_ID}`}
            className="mt-8 inline-flex min-h-13 items-center justify-center rounded-full bg-brand px-8 py-3.5 text-base font-semibold text-brand-ink shadow-[0_14px_36px_-16px_rgba(3,105,161,0.8)] transition hover:brightness-110"
          >
            {t.bottomCta.scrollToForm}
          </a>
        </div>
      </section>

      <div className={`${WARM_SECTION} !py-8`}>
        <SmallPrint />
      </div>

      {/* Mobile-only sticky CTA; adds room so it never covers the small print. */}
      <div className="h-20 sm:hidden" aria-hidden="true" />
      <StickyBuyBar stats={stats} targetId={HERO_FORM_ID} phase={phase} />
    </div>
  );
}
