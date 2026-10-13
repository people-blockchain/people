"use client";

import { useMemo, useRef } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { homeWarmCopy } from "@/lib/home-warm-content";
import {
  heroHeadlineCqiMultiplier,
  heroHeadlineMaxWordCharsFromLines,
  heroHeadlineUsesWideGlyphs,
  HERO_HEADLINE_HOME_MAX_REM,
} from "@/lib/hero-headline-scale";
import { useHeroHeadlineFit } from "@/hooks/useHeroHeadlineFit";
import { Reveal } from "@/components/motion/Reveal";
import { HomeWalletCta } from "@/components/wallet/HomeWalletCta";
import { PersonAvatar, WARM_HERO_BTN } from "@/components/warm/warm-ui";
import Link from "next/link";
import { HeroTokenCard } from "./HeroTokenCard";

/** main lines + accent lines; keep in sync with the copy module. */
const MAX_HEADLINE_LINES = 3;

/**
 * Homepage hero in the /founders visual language.
 *
 * The headline keeps the site's per-line fit machinery (`useHeroHeadlineFit`)
 * so long RU/DE lines shrink instead of overflowing, and the token card sits
 * to the right on desktop / below the copy on mobile.
 */
export function HomeWarmHero() {
  const { lang } = useLanguage();
  const t = homeWarmCopy(lang).hero;

  const mainLines = t.headlineMainLines;
  const accentLines = t.headlineAccentLines;
  const headlineLines = useMemo(() => [...mainLines, ...accentLines], [mainLines, accentLines]);
  const headlineCopyKey = useMemo(() => headlineLines.join("\0"), [headlineLines]);

  const heroMaxWordChars = heroHeadlineMaxWordCharsFromLines(headlineLines);
  const heroCqiMult = heroHeadlineCqiMultiplier(
    heroMaxWordChars,
    mainLines.join(" "),
    accentLines.join(" "),
  );
  const wideGlyphs = heroHeadlineUsesWideGlyphs(mainLines.join(" "), accentLines.join(" "));

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
    headlineLines.length,
    HERO_HEADLINE_HOME_MAX_REM,
  );

  return (
    <section className="relative overflow-hidden" data-testid="home-hero">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(58%_48%_at_88%_6%,rgba(245,158,11,0.20),transparent_70%),radial-gradient(42%_36%_at_0%_22%,rgba(3,105,161,0.10),transparent_70%)] dark:bg-[radial-gradient(58%_48%_at_88%_6%,rgba(251,191,36,0.16),transparent_70%),radial-gradient(42%_36%_at_0%_22%,rgba(76,196,248,0.14),transparent_70%)]"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-8 sm:px-6 sm:pt-14 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-center lg:gap-10">
          <div ref={columnRef} className="hero-copy min-w-0 max-w-full" data-testid="hero-copy-column">
            <Reveal>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-warm" data-testid="home-hero-brand-line">
                {t.brandLine}
              </p>
            </Reveal>

            <Reveal delay={30}>
              <h1
                ref={headlineRef}
                className="hero-headline mt-4 max-w-full text-3xl font-bold leading-[1.06] tracking-tight text-ink sm:text-5xl"
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
                    key={`main-${line}`}
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
                      key={`accent-${line}`}
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

            {/* What this actually is, in one line, before any supporting detail. */}
            <Reveal delay={60}>
              <p
                className="mt-4 max-w-xl text-lg font-semibold leading-snug text-ink sm:text-xl"
                data-testid="home-hero-pitch"
              >
                {t.pitchLine}
              </p>
            </Reveal>

            {/* Join is the page's one big ask — it is the only Join on the site
                now that the header carries a single «Sign in». The founder
                number leads the row and is its peer. */}
            <Reveal delay={100}>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Link
                  href="/founders"
                  className={WARM_HERO_BTN}
                  data-testid="home-hero-founder-cta"
                >
                  {t.ctaFounder}
                </Link>
                <HomeWalletCta label={content[lang].nav.ctaJoin} className={WARM_HERO_BTN} />
              </div>
            </Reveal>

            <Reveal delay={140}>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-2 sm:text-lg">{t.sub}</p>
            </Reveal>

            <Reveal delay={180}>
              <p
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink-2 shadow-[var(--elev-1)]"
                data-testid="home-hero-testnet-badge"
              >
                <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-value opacity-60 motion-reduce:hidden" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-value" />
                </span>
                {t.testnetBadge}
              </p>
            </Reveal>
          </div>

          {/* Token card. In the flow on mobile (stacked under the copy), beside it on desktop. */}
          <Reveal delay={80} className="flex min-w-0 flex-col items-center gap-5 lg:items-end">
            <HeroTokenCard t={t} />

            <ol className="w-full max-w-[340px] space-y-2" data-testid="home-hero-beats">
              {t.stages.map((beat, index) => (
                <li
                  key={beat.id}
                  className="flex items-start gap-3 rounded-2xl border border-line bg-surface/60 px-4 py-3"
                >
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/10 text-[11px] font-bold text-brand" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{beat.label}</p>
                    <p className="mt-0.5 text-xs text-ink-2">{beat.sub}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>

        {/* Logged-out reassurance: real people, different countries. */}
        <Reveal delay={200}>
          <div className="mt-8 flex items-center gap-3">
            <span className="flex -space-x-2" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <PersonAvatar key={i} index={i} className="warm-avatar-ring h-9 w-9 rounded-full" />
              ))}
            </span>
            <span className="text-sm font-semibold text-ink-2">{t.peopleLine}</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
