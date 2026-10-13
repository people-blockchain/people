"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Cpu, ShieldAlert, Users } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { Chapter } from "./Chapter";
import { ChapterRail } from "./ChapterRail";
import { Disclosure } from "../ui/Disclosure";
import { Chip, Eyebrow, Statement } from "../ui/primitives";
import { ParticipationJourney } from "../visuals/ParticipationJourney";
import { PowerDiagram } from "../visuals/PowerDiagram";
import { FeeSplitBar, NetworkValueFlow } from "../visuals/NetworkValueFlow";
import { TokenValueFlow } from "../visuals/TokenValueFlow";
import { CommunityPoolDiagram } from "../visuals/CommunityPoolDiagram";
import { RewardBars } from "../visuals/RewardBars";
import { DefenseLayers } from "../visuals/DefenseLayers";
import { Flywheel } from "../visuals/Flywheel";

/**
 * The whole /how-it-works narrative.
 *
 * Ten chapters share one spine, one progression indicator and one type scale,
 * so the page reads as a single continuous story instead of ten documentation
 * chapters. Every diagram renders its full meaning without motion.
 */
export function Story() {
  const { lang } = useLanguage();
  const t = content[lang].howItWorks;
  const chapters = t.chapters;

  const [activeId, setActiveId] = useState(chapters[0].id);
  const visible = useRef<Set<string>>(new Set());

  // A late chapter opened by URL hash (or by a rail click) must become active
  // immediately, before the intersection observer catches up with the scroll.
  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (chapters.some((chapter) => chapter.id === hash)) setActiveId(hash);
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [chapters]);

  useEffect(() => {
    const ids = chapters.map((chapter) => chapter.id);
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (elements.length === 0 || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.current.add(entry.target.id);
          else visible.current.delete(entry.target.id);
        }
        const first = ids.find((id) => visible.current.has(id));
        if (first) setActiveId(first);
      },
      { rootMargin: "-22% 0px -58% 0px", threshold: 0 }
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [chapters]);

  const activeIndex = Math.max(
    0,
    chapters.findIndex((chapter) => chapter.id === activeId)
  );
  const progress = (activeIndex + 1) / chapters.length;

  return (
    <>
      <ChapterRail activeId={activeId} progress={progress} />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative py-14 lg:py-20">
          {/* Continuous spine */}
          <div
            className="pointer-events-none absolute bottom-0 left-[1.375rem] top-0 hidden w-px bg-line lg:block"
            aria-hidden="true"
          >
            <div
              className="w-px origin-top bg-gradient-to-b from-brand via-violet to-value transition-[height] duration-700 ease-out"
              style={{ height: `${progress * 100}%` }}
            />
          </div>

          <div className="space-y-20 lg:space-y-28">
            {/* 01 ---------------------------------------------------------- */}
            <Chapter
              num={chapters[0].num}
              id={t.section1.id}
              tag={t.section1.tag}
              title={t.section1.title}
              tone="brand"
            >
              <Statement tone="brand">{t.section1.coreMessage}</Statement>

              <div className="mt-10 grid overflow-hidden rounded-3xl border border-line md:grid-cols-2">
                <div className="relative border-b border-line bg-warm/[0.05] p-6 sm:p-7 md:border-b-0 md:border-r">
                  <span
                    className="pointer-events-none absolute -right-2 -top-6 font-mono text-[7rem] font-black leading-none text-warm/10"
                    aria-hidden="true"
                  >
                    ✕
                  </span>
                  <Chip tone="warm">
                    <Cpu className="h-3 w-3" />
                    {t.section1.notPowBadge}
                  </Chip>
                  <h4 className="mt-4 text-lg font-bold text-ink">{t.section1.notPowTitle}</h4>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-2">
                    {t.section1.notPowExplanation}
                  </p>
                </div>

                <div className="relative bg-value/[0.06] p-6 sm:p-7">
                  <span
                    className="pointer-events-none absolute -right-2 -top-6 font-mono text-[7rem] font-black leading-none text-value/10"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <Chip tone="value">
                    <Users className="h-3 w-3" />
                    {t.storyActiveHumanity}
                  </Chip>
                  <h4 className="mt-4 text-lg font-bold text-ink">{t.section1.participationTitle}</h4>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-2">
                    {t.section1.participationExplanation}
                  </p>
                </div>
              </div>
            </Chapter>

            {/* 02 ---------------------------------------------------------- */}
            <Chapter
              num={chapters[1].num}
              id={t.section2.id}
              tag={t.section2.tag}
              title={t.section2.title}
              lead={t.section2.subtitle}
              tone="value"
            >
              <ParticipationJourney />
            </Chapter>

            {/* 03 ---------------------------------------------------------- */}
            <Chapter
              num={chapters[2].num}
              id={t.section3.id}
              tag={t.section3.tag}
              title={t.section3.title}
              lead={t.section3.subtitle}
              tone="brand"
            >
              <PowerDiagram />

              <div className="mt-10 grid gap-x-10 sm:grid-cols-2">
                {t.section3.safeguards.slice(0, 2).map((safeguard) => (
                  <div key={safeguard.title} className="border-t border-line py-4">
                    <h4 className="text-sm font-bold text-ink">{safeguard.title}</h4>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{safeguard.desc}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8">
                <Disclosure title={t.section3.techDetailsTitle}>
                  <p className="text-[13px] leading-relaxed text-ink-2">{t.section3.techDetailsText}</p>
                </Disclosure>
              </div>
            </Chapter>

            {/* 04 ---------------------------------------------------------- */}
            <Chapter
              num={chapters[3].num}
              id={t.section4.id}
              tag={t.section4.tag}
              title={t.section4.title}
              lead={t.section4.subtitle}
              tone="warm"
            >
              <Statement tone="warm">{t.section4.coreMessage}</Statement>

              <div className="mt-10 space-y-12">
                <div>
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <Eyebrow tone="brand">{t.section4.networkPipelineHeading}</Eyebrow>
                    <Chip tone="brand">
                      {t.storyFeePipeline}
                    </Chip>
                  </div>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">
                    {t.section4.networkPipelineSubtitle}
                  </p>

                  <div className="mt-6 space-y-8">
                    <Disclosure title={t.section4.feeSplitTitle}>
                      <FeeSplitBar />
                    </Disclosure>
                    <NetworkValueFlow />
                  </div>
                </div>

                <div>
                  {/* The heading, subtitle and "separate mechanism" chip all live
                      inside the TokenValueFlow card; repeating them here rendered
                      the same title and chip twice. */}
                  <Eyebrow tone="violet">{t.section4.dualPipelineTitle}</Eyebrow>
                  <div className="mt-6">
                    <TokenValueFlow />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-brand/30 bg-brand/[0.05] px-5 py-4">
                    <span className="mono-label text-brand">{t.section4.assetSpecificBadge}</span>
                    <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                      {t.section4.assetSpecificNotice}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-warm/30 bg-warm/[0.05] px-5 py-4">
                    <span className="mono-label inline-flex items-center gap-2 text-warm">
                      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                      {t.section4.zeroPoolBadge}
                    </span>
                    <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                      {t.section4.zeroPoolText}
                    </p>
                  </div>
                </div>
              </div>
            </Chapter>

            {/* 05 ---------------------------------------------------------- */}
            <Chapter
              num={chapters[4].num}
              id={t.section5.id}
              tag={t.section5.tag}
              title={t.section5.title}
              lead={t.section5.subtitle}
              tone="value"
            >
              <div className="grid gap-x-10 gap-y-8 lg:grid-cols-3">
                {t.section5.cards.map((card, index) => (
                  <div key={card.title} className="border-t border-line pt-5">
                    <span
                      className="block font-mono text-4xl font-black leading-none text-ink-3/25"
                      aria-hidden="true"
                    >
                      0{index + 1}
                    </span>
                    <span className="mono-label mt-4 block text-value">{card.type}</span>
                    <h4 className="mt-2 text-xl font-bold tracking-tight text-ink text-balance">
                      {card.title}
                    </h4>
                    <p className="mt-3 text-sm leading-relaxed text-ink-2">{card.desc}</p>
                    <div className="mt-4">
                      <Chip tone="value">{card.badge}</Chip>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-10 rounded-2xl border border-line bg-surface px-5 py-5 sm:px-6">
                <span className="mono-label text-ink-3">{t.section5.microChainTitle}</span>
                <ol className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                  {t.section5.microChainSteps.map((step, index) => (
                    <li key={step} className="flex items-center gap-3">
                      <span className="text-base font-bold text-ink sm:text-lg">{step}</span>
                      {index < t.section5.microChainSteps.length - 1 && (
                        <ArrowRight className="h-4 w-4 text-value" aria-hidden="true" />
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            </Chapter>

            {/* 06 ---------------------------------------------------------- */}
            <Chapter
              num={chapters[5].num}
              id={t.section6.id}
              tag={t.section6.tag}
              title={t.section6.title}
              lead={t.section6.subtitle}
              tone="brand"
            >
              <CommunityPoolDiagram />

              {t.section6.simulationNotice.headline ? (
              <div className="mt-10 rounded-3xl border border-warm/40 bg-warm/[0.07] px-5 py-5 sm:px-6">
                <span className="mono-label inline-flex items-center gap-2 text-warm">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.section6.simulationNotice.badge}
                </span>
                <h4 className="mt-3 text-base font-bold text-ink">
                  {t.section6.simulationNotice.headline}
                </h4>
                <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink-2">
                  {t.section6.simulationNotice.body}
                </p>
              </div>
              ) : null}
            </Chapter>

            {/* 07 ---------------------------------------------------------- */}
            <Chapter
              num={chapters[6].num}
              id={t.section7.id}
              tag={t.section7.tag}
              title={t.section7.title}
              lead={t.section7.subtitle}
              tone="value"
            >
              <div className="max-w-3xl">
                <Chip tone="value">{t.section7.exampleTitle}</Chip>
                <p className="mt-3 text-sm leading-relaxed text-ink-2">{t.section7.exampleSubtitle}</p>
                <div className="mt-8">
                  <RewardBars />
                </div>
              </div>
            </Chapter>

            {/* 08 ---------------------------------------------------------- */}
            <Chapter
              num={chapters[7].num}
              id={t.section8.id}
              tag={t.section8.tag}
              title={t.section8.title}
              lead={t.section8.subtitle}
              tone="brand"
            >
              <DefenseLayers />
            </Chapter>

            {/* 09 ---------------------------------------------------------- */}
            <Chapter
              num={chapters[8].num}
              id={t.section9.id}
              tag={t.section9.tag}
              title={t.section9.headline}
              lead={t.section9.subtitle}
              tone="violet"
            >
              <Flywheel />
            </Chapter>

            {/* 10 ---------------------------------------------------------- */}
            <Chapter
              num={chapters[9].num}
              id={t.section10.id}
              tag={t.section10.tag}
              title={t.section10.title}
              lead={t.section10.subtitle}
              tone="warm"
            >
              <ul>
                {t.section10.cards.map((card, index) => (
                  <li
                    key={card.title}
                    className="flex flex-col gap-2 border-t border-line py-6 sm:flex-row sm:gap-8"
                  >
                    <span className="mono-label shrink-0 pt-1 text-warm sm:w-12">
                      0{index + 1}
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-lg font-bold text-ink">{card.title}</h4>
                      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2">{card.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <Statement tone="warm">{t.section10.summary}</Statement>
              </div>
            </Chapter>
          </div>
        </div>
      </div>
    </>
  );
}
