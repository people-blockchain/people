"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { useLanguage } from "@/context/LanguageContext";
import { Reveal } from "@/components/motion/Reveal";
import { WARM_SECTION, WarmSection } from "@/components/warm/warm-ui";
import { buyCopy } from "@/lib/buy-content";
import type { SaleTrade } from "@/lib/sale/adapter";
import { buyPagePhase, curvePosition, formatOpenDate, soldPplForSpotPrice } from "@/lib/sale/buy-page";
import { basescanAddressUrl } from "@/lib/sale/config";
import { parseV2OpenDate } from "@/lib/sale/v2/stats-copy";
import { V2_PHASES } from "@/lib/sale/v2/constants";
import {
  isV2PreviewEnabled,
  parseV2PreviewState,
  readV2Env,
  resolveV2Chain,
  shouldRenderV2Buy,
  spotPriceWadToUsd,
} from "@/lib/sale/v2/logic";
import { useV2Phase, useV2SellBackToday } from "@/lib/sale/v2/useV2Sale";
import { useSalePhase } from "@/lib/sale/sale-state";

import { BeforeAfter } from "./BeforeAfter";
import { BuyForm } from "./BuyForm";
import { BUY_FORM_ID, BUY_RULES_ID, BuyCta, BuyHero, heroSub } from "./BuyHero";
import { HowToBuy } from "./HowToBuy";
import { SaleFaq } from "./SaleFaq";
import { SaleRules } from "./SaleRules";
import { SmallPrint } from "./SmallPrint";
import { TradeFeed } from "./TradeFeed";
import { WhatIsPpl } from "./WhatIsPpl";
import { useSaleData } from "./useSaleData";
import { BuyV2Panel } from "./v2/BuyV2Panel";

/**
 * `/buy` — the PPL sale page, written for people who have never bought a
 * token: hero → before/with PEOPLE → what PPL is → how to buy (+ the purchase
 * widget) → the rules → FAQ → final call to action. One main button per screen.
 *
 * `exampleTrades` is non-null only on a non-production deployment opened with
 * `?demo=1`; the server decides (see `app/buy/page.tsx`).
 */
export function BuyPage({
  initialSaleOpen,
  exampleTrades = null,
}: {
  initialSaleOpen?: boolean;
  exampleTrades?: SaleTrade[] | null;
}) {
  const { lang } = useLanguage();
  const t = buyCopy[lang];
  const { stats, trades } = useSaleData();
  const { phase: legacyPhase, hubAcceptsUsdt } = useSalePhase(initialSaleOpen);

  const isRtl = lang === "ar";
  const searchParams = useSearchParams();
  const env = useMemo(() => readV2Env(), []);
  const v2Buy = shouldRenderV2Buy(env);
  const previewState = isV2PreviewEnabled(env)
    ? parseV2PreviewState(searchParams.get("v2state"))
    : null;
  const v2Chain = useMemo(() => resolveV2Chain(env), [env]);
  const v2Phase = useV2Phase({ chain: v2Chain, previewState, enabled: v2Buy });

  const phase = buyPagePhase({ v2Enabled: v2Buy, v2Phase: v2Phase.phase, legacyOpen: legacyPhase === "open" });
  const spotPriceUsd = v2Buy
    ? v2Phase.spotPriceWad === null
      ? null
      : spotPriceWadToUsd(v2Phase.spotPriceWad)
    : stats.spotPriceUsd;
  const liveSoldPpl = v2Buy ? (spotPriceUsd === null ? null : soldPplForSpotPrice(spotPriceUsd)) : stats.soldPpl;
  const position = curvePosition({ phase, liveSoldPpl });
  const sellBackTodayUsd = useV2SellBackToday({
    chain: v2Chain,
    enabled: v2Buy && previewState === null && phase !== "upcoming",
  });

  const contractAddress = v2Buy ? v2Chain.hubAddress : stats.contractAddress;
  const explorerUrl = contractAddress
    ? v2Buy
      ? v2Chain.explorer
        ? `${v2Chain.explorer}/address/${contractAddress}`
        : null
      : basescanAddressUrl(contractAddress)
    : null;

  const openDateRaw = env.NEXT_PUBLIC_PPL_V2_OPEN_DATE;
  const openDateText = formatOpenDate(parseV2OpenDate(openDateRaw), lang);

  return (
    <div data-testid="buy-page" dir={isRtl ? "rtl" : "ltr"} className={isRtl ? "buy-page-rtl" : undefined}>
      {/* a — Hero: headline, one sentence, countdown, one button */}
      <BuyHero phase={phase} openDateRaw={openDateRaw} spotPriceUsd={spotPriceUsd} />

      {/* b — Before → with PEOPLE */}
      <WarmSection id="before-after" eyebrow={t.before.eyebrow} title={t.before.title}>
        <Reveal>
          <BeforeAfter />
        </Reveal>
      </WarmSection>

      {/* c — What PPL is, with the curve and "you are here" */}
      <WarmSection id="what-is-ppl" eyebrow={t.ppl.eyebrow} title={t.ppl.title} tone="canvas-2">
        <Reveal>
          <WhatIsPpl position={position} />
        </Reveal>
      </WarmSection>

      {/* d — How to buy: three steps, then the purchase widget and the live feed */}
      <WarmSection id="how-to-buy" eyebrow={t.how.eyebrow} title={t.how.title}>
        <Reveal>
          <HowToBuy />
        </Reveal>
        <div className="mt-8 grid items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          {/* testId kept as "buy-form-hero" for the existing screenshot specs. */}
          <div id={BUY_FORM_ID} className="scroll-mt-[calc(3.5rem+0.75rem)] lg:scroll-mt-24">
            {v2Buy ? (
              <BuyV2Panel testId="buy-form-hero" />
            ) : (
              <BuyForm soldPpl={stats.soldPpl} phase={legacyPhase} hubAcceptsUsdt={hubAcceptsUsdt} testId="buy-form-hero" />
            )}
          </div>
          <Reveal>
            <TradeFeed trades={trades} examples={exampleTrades} />
          </Reveal>
        </div>
      </WarmSection>

      {/* e — The rules: limits, reserve, sell-back, public contract */}
      <WarmSection
        id={BUY_RULES_ID}
        eyebrow={t.rules.eyebrow}
        title={t.rules.title}
        lead={t.rules.lead}
        tone="canvas-2"
        className="scroll-mt-20"
      >
        <Reveal>
          <SaleRules
            phase={phase}
            graduated={v2Buy && v2Phase.phase === V2_PHASES.Graduated}
            sellBackTodayUsd={sellBackTodayUsd}
            contractAddress={contractAddress}
            explorerUrl={explorerUrl}
          />
        </Reveal>
      </WarmSection>

      {/* f — FAQ and the risk warning */}
      <WarmSection id="faq" eyebrow={t.faq.eyebrow} title={t.faq.title} className="scroll-mt-20">
        <Reveal>
          <SaleFaq />
        </Reveal>
      </WarmSection>

      {/* g — Final call to action: the hero again */}
      <section className="border-t border-line bg-canvas-2" aria-labelledby="buy-final-title" data-testid="buy-final-cta">
        <div className={`${WARM_SECTION} text-center`}>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">{t.finalCta.eyebrow}</p>
          <h2 id="buy-final-title" className="mx-auto mt-2 max-w-2xl text-2xl font-bold leading-tight text-ink sm:text-4xl">
            {t.hero.headline}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-ink-2 sm:text-base">
            {t.hero.lead} {heroSub(t.hero, phase, openDateText)}
          </p>
          <div className="mt-7 flex justify-center">
            <BuyCta phase={phase} testId="buy-final-cta-button" />
          </div>
        </div>
      </section>

      <div className={`${WARM_SECTION} !py-8`}>
        <SmallPrint />
      </div>
    </div>
  );
}
