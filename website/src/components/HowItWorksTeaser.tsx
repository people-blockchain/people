"use client";

import Link from "next/link";
import { Activity, ArrowRight, Coins, Layers, PieChart, ShieldCheck, Users } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { Reveal } from "./motion/Reveal";
import { useInView } from "./motion/useInView";
import { Chip, SectionIntro } from "./ui/primitives";

const stepStyles = [
  { icon: Users, text: "text-brand", ring: "border-brand/35", bg: "bg-brand/10" },
  { icon: Activity, text: "text-warm", ring: "border-warm/35", bg: "bg-warm/10" },
  { icon: PieChart, text: "text-violet", ring: "border-violet/35", bg: "bg-violet/10" },
  { icon: Coins, text: "text-value", ring: "border-value/35", bg: "bg-value/10" },
];

/**
 * Homepage economic teaser: the compact four-beat loop, horizontally on
 * desktop, as a vertical spine on mobile. The visitor should understand the
 * concept before clicking through to the full story.
 */
export function HowItWorksTeaser() {
  const { lang } = useLanguage();
  const t = content[lang].howItWorksTeaser;
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.25 });

  return (
    <section
      id="how-it-works-teaser"
      className="anchor-offset relative overflow-hidden border-b border-line bg-canvas-2 py-16 lg:py-24"
    >
      <div className="glow-value pointer-events-none absolute -left-32 top-1/3 h-80 w-80 rounded-full" aria-hidden="true" />
      <div className="glow-brand pointer-events-none absolute -right-32 top-0 h-80 w-80 rounded-full" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionIntro
            eyebrow={`${t.tag} · ${t.badge}`}
            title={t.title}
            lead={t.subtitle}
            tone="violet"
            className="max-w-3xl"
          />
        </Reveal>

        {/* The loop */}
        <div ref={ref} className="relative mt-14">
          {/* desktop connector */}
          <span
            className="absolute left-[12.5%] right-[12.5%] top-6 hidden h-px bg-line md:block"
            aria-hidden="true"
          >
            <span
              className="block h-px origin-left bg-gradient-to-r from-brand via-violet to-value transition-transform duration-[1400ms] ease-out"
              style={{ transform: inView ? "scaleX(1)" : "scaleX(0)" }}
            />
          </span>

          <ol className="relative grid gap-8 md:grid-cols-4 md:gap-6">
            {t.steps.map((step, index) => {
              const style = stepStyles[index];
              const Icon = style.icon;
              const last = index === t.steps.length - 1;
              return (
                <li
                  key={step.num}
                  className="relative flex items-start gap-4 md:flex-col md:items-center md:gap-0 md:text-center"
                >
                  <span
                    className={`relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border bg-canvas ${style.ring}`}
                    aria-hidden="true"
                  >
                    <span className={`flex h-full w-full items-center justify-center rounded-2xl ${style.bg}`}>
                      <Icon className={`h-5 w-5 ${style.text}`} />
                    </span>
                  </span>

                  {/* mobile spine */}
                  {!last && (
                    <span
                      className="absolute left-6 top-14 -bottom-8 w-px bg-line md:hidden"
                      aria-hidden="true"
                    />
                  )}

                  <div className="min-w-0 md:mt-5">
                    <span className={`mono-label ${style.text}`}>{step.num}</span>
                    <h3 className="mt-1 text-lg font-bold text-ink">{step.name}</h3>
                    <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-ink-3">
                      {step.highlight}
                    </p>
                    <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-2 md:mx-auto">
                      {step.desc}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Dual-source discipline + CTA */}
        <Reveal delay={80}>
          <div className="mt-14 flex flex-col gap-6 rounded-3xl border border-line bg-surface p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="brand">
                  <Layers className="h-3 w-3" />
                  {t.sourcesBadge}
                </Chip>
                <Chip tone="value">
                  <ShieldCheck className="h-3 w-3" />
                  {t.noFaucet}
                </Chip>
              </div>
              <p className="mt-4 text-sm font-medium leading-relaxed text-ink">{t.sourcesText}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.ctaSubtext}</p>
            </div>

            <Link
              href="/how-it-works"
              className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-sm font-semibold text-brand-ink transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {t.cta}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
