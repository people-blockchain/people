"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { useInView } from "../motion/useInView";
import { Reveal } from "../motion/Reveal";

/**
 * Chapter 02 — the participation journey. A drawn horizontal rail on desktop,
 * a numbered vertical spine on mobile. Nodes illuminate left-to-right so the
 * sequence reads as a procedure, not four unrelated cards.
 */
export function ParticipationJourney() {
  const { lang } = useLanguage();
  const t = content[lang].howItWorks.section2;
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.2 });

  return (
    <div ref={ref}>
      <ol className="relative grid gap-8 md:grid-cols-4 md:gap-5">
        {/* desktop rail */}
        <span
          className="absolute left-[12.5%] right-[12.5%] top-5 hidden h-px bg-line md:block"
          aria-hidden="true"
        >
          <span
            className="block h-px origin-left bg-gradient-to-r from-brand via-brand to-violet transition-transform duration-[1600ms] ease-out"
            style={{ transform: inView ? "scaleX(1)" : "scaleX(0)" }}
          />
        </span>

        {t.steps.map((step, index) => (
          <li
            key={step.num}
            className="relative flex items-start gap-4 md:flex-col md:items-stretch md:gap-0"
          >
            <span
              className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-canvas font-mono text-[12px] font-bold transition-colors duration-500 ${
                inView ? "border-brand/50 text-brand" : "border-line text-ink-3"
              }`}
              aria-hidden="true"
            >
              {step.num}
            </span>

            {/* mobile spine */}
            {index < t.steps.length - 1 && (
              <span className="absolute left-5 top-12 -bottom-8 w-px bg-line md:hidden" aria-hidden="true" />
            )}

            <div className="min-w-0 pt-1 md:pt-5">
              <p className="mono-label text-ink-3">{step.highlight}</p>
              <h4 className="mt-1.5 text-base font-bold text-ink">
                {"href" in step && (step as { href?: string }).href ? (
                  <Link href={(step as { href: string }).href} className="hover:text-brand">
                    {step.title}
                  </Link>
                ) : (
                  step.title
                )}
              </h4>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{step.desc}</p>
            </div>
          </li>
        ))}
      </ol>

      <Reveal delay={80}>
        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
          <div className="flex items-start gap-2.5 bg-surface px-5 py-4">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-value" aria-hidden="true" />
            <p className="text-sm font-medium text-ink">{t.stateNote}</p>
          </div>
          <div className="bg-surface-2 px-5 py-4">
            <p className="text-sm leading-relaxed text-ink-2">{t.noIncomeNote}</p>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
