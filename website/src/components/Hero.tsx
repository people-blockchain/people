"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { homePublic } from "@/lib/home-public-content";
import {
  heroHeadlineCqiMultiplier,
  heroHeadlineMaxWordCharsFromLines,
  heroHeadlineUsesWideGlyphs,
  HERO_HEADLINE_HOME_MAX_REM,
} from "@/lib/hero-headline-scale";
import { useHeroHeadlineFit } from "@/hooks/useHeroHeadlineFit";
import { Chip } from "./ui/primitives";
import { HomeWalletCta } from "@/components/wallet/HomeWalletCta";
import { Reveal } from "./motion/Reveal";
import { ValueFlowAnimation } from "./visuals/ValueFlowAnimation";

const MAX_HEADLINE_LINES = 6;

export function Hero() {
  const [showFlowVisual, setShowFlowVisual] = useState(false);
  const { lang } = useLanguage();

  useEffect(() => {
    const run = () => setShowFlowVisual(true);
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(run, { timeout: 1200 });
      return () => cancelIdleCallback(id);
    }
    const timer = window.setTimeout(run, 1);
    return () => window.clearTimeout(timer);
  }, []);
  const t = homePublic[lang].hero;
  const mainLines = t.headlineMainLines;
  const accentLines = t.headlineAccentLines;
  const headlineLines = useMemo(() => [...mainLines, ...accentLines], [mainLines, accentLines]);
  const headlineLineCount = headlineLines.length;

  const headlineCopyKey = useMemo(() => headlineLines.join("\0"), [headlineLines]);
  const heroMaxWordChars = heroHeadlineMaxWordCharsFromLines(headlineLines);
  const heroCqiMult = heroHeadlineCqiMultiplier(
    heroMaxWordChars,
    mainLines.join(" "),
    accentLines.join(" ")
  );
  const wideGlyphs = heroHeadlineUsesWideGlyphs(mainLines.join(" "), accentLines.join(" "));

  const columnRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const lineRefs = useRef<(HTMLSpanElement | null)[]>(
    Array.from({ length: MAX_HEADLINE_LINES }, () => null)
  );

  useHeroHeadlineFit(
    columnRef,
    headlineRef,
    lineRefs,
    headlineCopyKey,
    headlineLineCount,
    HERO_HEADLINE_HOME_MAX_REM
  );

  return (
    <section className="relative overflow-hidden border-b border-line bg-canvas">
      <div className="grid-texture pointer-events-none absolute inset-0 opacity-[0.5]" aria-hidden="true" />
      <div
        className="glow-brand pointer-events-none absolute -top-24 left-1/4 h-[240px] w-[360px] rounded-full"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-9">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] lg:items-stretch lg:gap-x-10">
          <div ref={columnRef} className="hero-copy flex min-w-0 max-w-full flex-col" data-testid="hero-copy-column">
            <Reveal className="mb-4">
              <Chip tone="value">{t.testnetBadge}</Chip>
            </Reveal>
            <Reveal delay={20}>
              <p className="mb-2 text-sm font-semibold tracking-wide text-brand sm:text-base" data-testid="hero-brand-line">
                {t.brandLine}
              </p>
            </Reveal>
            <Reveal delay={40}>
              <h1
                ref={headlineRef}
                className="hero-headline max-w-full text-display font-black tracking-tight text-ink normal-case lg:mt-0"
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
                {mainLines.map((line, index) => (
                  <span
                    key={`main-${index}`}
                    ref={(el) => {
                      lineRefs.current[index] = el;
                    }}
                    className="hero-headline-line"
                    data-testid="hero-headline-line"
                  >
                    {line}
                  </span>
                ))}
                {accentLines.map((line, index) => {
                  const refIndex = mainLines.length + index;
                  return (
                    <span
                      key={`accent-${index}`}
                      ref={(el) => {
                        lineRefs.current[refIndex] = el;
                      }}
                      className="hero-headline-line hero-headline-line--accent text-gradient-brand"
                      data-testid="hero-headline-line"
                    >
                      {line}
                    </span>
                  );
                })}
              </h1>
            </Reveal>
            <Reveal delay={80}>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-2 text-pretty sm:text-lg">
                {t.sub}
              </p>
            </Reveal>

            <Reveal delay={120}>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="/create/token"
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-ink transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  {t.ctaCreate}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <HomeWalletCta className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-5 py-3 text-sm font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink" />
              </div>
            </Reveal>
          </div>

          <Reveal
            delay={80}
            className="hidden min-h-0 min-w-0 lg:flex lg:h-full lg:w-full lg:items-stretch lg:self-stretch"
          >
            {showFlowVisual ? (
              <ValueFlowAnimation
                layout="stacked"
                size="hero"
                flow={t}
                className="h-full min-h-full w-full"
                data-testid="hero-visual-card"
              />
            ) : (
              <div
                className="surface-elevated h-full min-h-full w-full min-h-[18rem] rounded-3xl"
                data-testid="hero-visual-card"
                aria-hidden="true"
              />
            )}
          </Reveal>

        </div>
      </div>
    </section>
  );
}
