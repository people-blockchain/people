"use client";

import { ArrowDown, Coins, PieChart, Waypoints } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { useInView } from "../motion/useInView";
import { Chip } from "../ui/primitives";

/**
 * Chapter 06 — the Community Pool as a reservoir, not a rectangle.
 *
 * Value enters from two strictly separate sources, is held per asset, and
 * leaves through four allocation destinations. No allocation percentages are
 * shown, because none are final.
 */
export function CommunityPoolDiagram() {
  const { lang } = useLanguage();
  const t = content[lang].howItWorks.section6;
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.2 });

  return (
    <div ref={ref} className="space-y-0">
      {/* INFLOWS */}
      <p className="mono-label mb-4 text-ink-3">{t.inflowsTitle}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {t.inflows.map((inflow, index) => (
          <div
            key={inflow.source}
            className="rounded-2xl border border-line bg-surface px-5 py-4 transition-colors"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-bold text-ink">
                <Coins className="h-4 w-4 text-brand" aria-hidden="true" />
                {inflow.source}
              </span>
              <Chip tone="brand">{inflow.share}</Chip>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{inflow.desc}</p>
            <span
              className="mt-4 block h-px w-full origin-left bg-gradient-to-r from-brand to-transparent transition-transform duration-1000 ease-out"
              style={{
                transform: inView ? "scaleX(1)" : "scaleX(0)",
                transitionDelay: `${index * 160}ms`,
              }}
              aria-hidden="true"
            />
          </div>
        ))}
      </div>

      {/* inflow arrows */}
      <div className="grid grid-cols-2 place-items-center py-4" aria-hidden="true">
        {[0, 1].map((index) => (
          <span key={index} className="relative h-10 w-px bg-line">
            <svg viewBox="0 0 2 40" className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none">
              <line
                x1="1"
                y1="0"
                x2="1"
                y2="40"
                stroke="currentColor"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                className="flow-dash text-brand opacity-80"
              />
            </svg>
            <ArrowDown className="absolute -bottom-1 left-1/2 h-3 w-3 -translate-x-1/2 text-brand" />
          </span>
        ))}
      </div>

      {/* RESERVOIR */}
      <div className="relative overflow-hidden rounded-3xl border border-brand/40 bg-surface">
        {/* decorative liquid band (no level is implied) */}
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-brand/25 via-brand/10 to-transparent"
          aria-hidden="true"
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-16 h-px bg-brand/40" aria-hidden="true" />

        <div className="relative flex flex-col items-center px-6 py-8 text-center sm:py-10">
          <Waypoints className="h-5 w-5 text-brand" aria-hidden="true" />
          <p className="mt-3 font-mono text-lg font-black uppercase tracking-[0.18em] text-ink sm:text-2xl">
            {t.reservoirLabel}
          </p>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">
            {t.reservoirCaption}
          </p>
        </div>
      </div>

      {/* split bracket */}
      <div className="py-4" aria-hidden="true">
        <svg viewBox="0 0 400 60" className="hidden h-14 w-full lg:block" preserveAspectRatio="none">
          <path
            d="M200,0 L200,16 M50,16 L350,16 M50,16 L50,44 M150,16 L150,44 M250,16 L250,44 M350,16 L350,44"
            fill="none"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            className={`stroke-brand draw-path ${inView ? "is-drawn" : ""}`}
            style={{ ["--path-len" as string]: "1100", ["--draw-delay" as string]: "220ms" }}
          />
        </svg>
        <div className="flex justify-center lg:hidden">
          <span className="relative h-8 w-px bg-line">
            <svg viewBox="0 0 2 32" className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none">
              <line
                x1="1"
                y1="0"
                x2="1"
                y2="32"
                stroke="currentColor"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                className="flow-dash text-value opacity-80"
              />
            </svg>
          </span>
        </div>
      </div>

      {/* OUTFLOWS */}
      <p className="mono-label mb-4 text-ink-3">{t.outflowsTitle}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {t.destinations.map((destination, index) => (
          <div key={destination.label} className="rounded-2xl border border-line bg-surface px-4 py-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-value/35 bg-value/10 font-mono text-[11px] font-bold text-value">
                {index + 1}
              </span>
              <PieChart className="h-3.5 w-3.5 text-value" aria-hidden="true" />
            </div>
            <p className="mt-3 text-sm font-bold text-ink">{destination.label}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{destination.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
