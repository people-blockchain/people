"use client";

import { ArrowDown } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { Reveal } from "../motion/Reveal";
import { Eyebrow } from "../ui/primitives";
import { UnderstandLoop } from "../visuals/UnderstandLoop";

/**
 * Visual-first introduction that sits between the /how-it-works hero and the
 * long-form story: one connected loop the visitor can read in ~15 seconds,
 * followed by a single link down into the detailed explanation.
 *
 * The detailed story is untouched — this only adds the fast path in front of it.
 */
export function QuickStart() {
  const { lang } = useLanguage();
  const t = content[lang].howItWorks.quickLoop;

  return (
    <section
      id="understand-people"
      aria-labelledby="understand-people-title"
      className="relative overflow-hidden border-b border-line bg-gradient-to-b from-canvas via-canvas-2 to-canvas"
    >
      <div className="dot-texture pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" />
      <div
        className="glow-brand pointer-events-none absolute -top-28 left-1/4 h-72 w-72 rounded-full"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <Reveal>
          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
            <div className="max-w-3xl">
              <Eyebrow tone="brand">{t.eyebrow}</Eyebrow>
              <h2
                id="understand-people-title"
                className="mt-4 text-h2 font-black tracking-tight text-ink text-balance"
              >
                {t.title}
              </h2>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-ink-2 text-pretty lg:pb-1.5 lg:text-right">
              {t.lead}
            </p>
          </header>
        </Reveal>

        <Reveal delay={100} className="mt-8 lg:mt-10">
          <UnderstandLoop />
        </Reveal>

        <Reveal delay={140}>
          <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-ink-2">{t.ctaTitle}</p>
            <a
              href="#what-is"
              className="group inline-flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 px-5 py-3 text-sm font-semibold text-brand transition-colors hover:bg-brand/15"
            >
              {t.ctaAction}
              <ArrowDown
                className="h-4 w-4 transition-transform group-hover:translate-y-0.5"
                aria-hidden="true"
              />
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
