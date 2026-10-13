"use client";

import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { Reveal } from "../motion/Reveal";
import { Chip } from "../ui/primitives";

/**
 * Compact, non-sticky story hero: title, one sentence, and the four-beat
 * economic flow as a strong horizontal visual — no empty vertical space.
 */
export function StoryHero() {
  const { lang } = useLanguage();
  const story = content[lang].howItWorks;
  const t = story.hero;

  return (
    <section className="relative overflow-hidden border-b border-line bg-canvas">
      <div className="grid-texture pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
      <div
        className="glow-brand pointer-events-none absolute -top-32 right-0 h-80 w-[420px] rounded-full"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 sm:pt-10 lg:px-8 lg:pb-12">
        <Reveal>
          <Chip tone="brand">{t.eyebrow}</Chip>
          <h1 className="mt-5 max-w-4xl text-h2 font-black tracking-tight text-ink text-balance sm:text-[2.75rem] lg:text-[3.25rem] lg:leading-[1.05]">
            {t.title}
          </h1>
          <p className="mt-4 max-w-3xl text-lead text-ink-2 text-pretty">{t.lead}</p>
        </Reveal>

        {/* Four-beat flow — the whole page in one glance */}
        <Reveal delay={120}>
          <ol className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {t.beats.map((beat, index) => (
              <li key={beat.label} className="relative">
                <div className="flex h-full items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5">
                  <span className="mono-label pt-0.5 text-ink-3">{`0${index + 1}`}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink">{beat.label}</p>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{beat.sub}</p>
                  </div>
                </div>
                {index < t.beats.length - 1 && (
                  <>
                    <span
                      className="absolute -bottom-3 left-6 h-3 w-px bg-line sm:hidden"
                      aria-hidden="true"
                    />
                    <span
                      className="absolute -right-[0.95rem] top-1/2 hidden -translate-y-1/2 text-ink-3 lg:block"
                      aria-hidden="true"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </>
                )}
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal delay={180}>
          <p className="mt-6 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">
            <span className="h-1.5 w-1.5 rounded-full bg-brand node-pulse" aria-hidden="true" />
            {t.scrollHint}
            <span className="text-ink-3/70">· {story.readTime}</span>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
