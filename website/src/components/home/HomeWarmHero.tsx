"use client";

import { useMemo, useRef } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import {
  heroHeadlineCqiMultiplier,
  heroHeadlineMaxWordCharsFromLines,
  heroHeadlineUsesWideGlyphs,
  HERO_HEADLINE_HOME_MAX_REM,
} from "@/lib/hero-headline-scale";
import { useHeroHeadlineFit } from "@/hooks/useHeroHeadlineFit";
import { homeWarmCopy } from "@/lib/home-warm-content";
import { HOME_FOUNDER_CTA_HREF } from "@/lib/home-founder-cta";
import { Reveal } from "@/components/motion/Reveal";
import { HomeWalletCta } from "@/components/wallet/HomeWalletCta";
import { WARM_HERO_BTN } from "@/components/warm/warm-ui";
import { HeroTokenCard } from "./HeroTokenCard";
import { HomeHeroCountdown } from "./HomeHeroCountdown";
import { HomeHeroSteps } from "./HomeHeroSteps";
import { communityShareHeadline } from "@/lib/selling-economics";

const MAX_HEADLINE_LINES = 6;

export function HomeWarmHero() {
  const { lang } = useLanguage();
  const t = homeWarmCopy(lang).hero;
  const shareHeadline = communityShareHeadline(lang);
  const sloganLines = t.sloganPrimaryLines;
  const headlineCopyKey = useMemo(() => sloganLines.join("\0"), [sloganLines]);
  const heroMaxWordChars = heroHeadlineMaxWordCharsFromLines(sloganLines);
  const heroCqiMult = heroHeadlineCqiMultiplier(heroMaxWordChars, t.sloganPrimary, "");
  const wideGlyphs = heroHeadlineUsesWideGlyphs(t.sloganPrimary, "");

  const columnRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const lineRefs = useRef<(HTMLSpanElement | null)[]>(
    Array.from({ length: MAX_HEADLINE_LINES }, () => null),
  );

  useHeroHeadlineFit(
    columnRef,
    headlineRef,
    lineRefs,
    headlineCopyKey,
    sloganLines.length,
    HERO_HEADLINE_HOME_MAX_REM,
  );

  const brandUpper = lang !== "tr";

  return (
    <section className="relative overflow-hidden" data-testid="home-hero">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(58%_48%_at_88%_6%,rgba(245,158,11,0.20),transparent_70%),radial-gradient(42%_36%_at_0%_22%,rgba(3,105,161,0.10),transparent_70%)] dark:bg-[radial-gradient(58%_48%_at_88%_6%,rgba(251,191,36,0.16),transparent_70%),radial-gradient(42%_36%_at_0%_22%,rgba(76,196,248,0.14),transparent_70%)]"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-6xl px-4 pb-4 pt-6 sm:px-6 sm:pb-6 sm:pt-12 lg:px-8 lg:pb-8">
        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:items-center lg:gap-10">
          <div ref={columnRef} className="hero-copy min-w-0 max-w-full" data-testid="hero-copy-column">
            <Reveal>
              <p
                className={`text-xs font-semibold tracking-[0.16em] text-warm ${brandUpper ? "uppercase" : ""}`}
                data-testid="home-hero-brand-line"
              >
                {t.brandLine}
              </p>
            </Reveal>

            <Reveal delay={30}>
              <h1
                ref={headlineRef}
                className="hero-headline mt-3 max-w-full text-4xl font-bold leading-[1.04] tracking-tight text-ink sm:mt-4 sm:text-6xl"
                data-testid="hero-headline"
                data-hero-fit="pending"
                style={
                  {
                    "--hero-max-chars": heroMaxWordChars,
                    "--hero-cqi-mult": wideGlyphs ? heroCqiMult * 0.96 : heroCqiMult * 0.92,
                    "--hero-display-max": `${HERO_HEADLINE_HOME_MAX_REM}rem`,
                  } as React.CSSProperties
                }
              >
                {sloganLines.map((line, index) => (
                  <span
                    key={`slogan-${line}`}
                    ref={(el) => {
                      lineRefs.current[index] = el;
                    }}
                    className="hero-headline-line"
                    data-testid="hero-headline-line"
                  >
                    {line}
                  </span>
                ))}
              </h1>
            </Reveal>

            <Reveal delay={50}>
              <p
                className="mt-3 max-w-xl text-balance text-lg font-semibold leading-snug text-ink-2 sm:text-xl"
                data-testid="home-hero-subheadline"
              >
                {t.subheadline}
              </p>
            </Reveal>

            <Reveal delay={80}>
              <div className="mt-4 flex flex-col gap-2.5 sm:mt-5 sm:flex-row sm:flex-wrap sm:items-center">
                <Link
                  href={HOME_FOUNDER_CTA_HREF}
                  className={WARM_HERO_BTN}
                  data-testid="home-hero-founder-cta"
                >
                  {t.ctaFounder}
                </Link>
                <HomeWalletCta label={t.ctaWallet} className={WARM_HERO_BTN} />
              </div>
            </Reveal>

            <Reveal delay={100}>
              <p className="mt-3 max-w-xl text-sm leading-snug text-ink-3" data-testid="home-hero-trust-line">
                {t.trustLine}
              </p>
            </Reveal>

            <Reveal delay={120}>
              <HomeHeroCountdown badge={t.betaBadge} countdown={t.countdown} />
            </Reveal>

            <Reveal delay={140} className="lg:hidden">
              <HomeHeroSteps stages={t.stages} compact className="mt-4 w-full max-w-md space-y-1.5" />
            </Reveal>
          </div>

          <Reveal delay={80} className="hidden min-w-0 flex-col items-center gap-4 lg:flex lg:items-end">
            <HeroTokenCard t={t} shareHeadline={shareHeadline} />
            <HomeHeroSteps stages={t.stages} className="w-full max-w-[340px] space-y-2" />
          </Reveal>
        </div>
      </div>
    </section>
  );
}