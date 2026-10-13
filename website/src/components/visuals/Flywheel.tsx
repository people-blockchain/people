"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { useInView } from "../motion/useInView";
import { Chip } from "../ui/primitives";

const SIZE = 480;
const CENTER = SIZE / 2;
const RADIUS = 186;
const COUNT = 9;

const point = (index: number) => {
  const angle = (index / COUNT) * Math.PI * 2 - Math.PI / 2;
  return {
    x: CENTER + RADIUS * Math.cos(angle),
    y: CENTER + RADIUS * Math.sin(angle),
  };
};

/**
 * Chapter 09 — the economic flywheel as an actual circular system.
 *
 * Nine steps sit on a ring; a slow sweep and the active node show the loop
 * turning. All nine steps are always readable as a numbered legend, so the
 * section still explains itself with motion disabled.
 */
export function Flywheel() {
  const { lang } = useLanguage();
  const t = content[lang].howItWorks.section9;
  const steps = t.steps;
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.25 });
  const [active, setActive] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    if (!inView) return;
    if (typeof window === "undefined" || !window.matchMedia) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      if (!paused.current) setActive((value) => (value + 1) % COUNT);
    }, 2600);
    return () => window.clearInterval(timer);
  }, [inView]);

  return (
    <div ref={ref} className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12">
      {/* The ring */}
      <div className="lg:col-span-6">
        <div
          className="relative mx-auto w-full max-w-[460px]"
          onMouseEnter={() => {
            paused.current = true;
          }}
          onMouseLeave={() => {
            paused.current = false;
          }}
        >
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full" role="img" aria-label={t.headline}>
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              strokeWidth="1"
              strokeDasharray="2 10"
              className="stroke-line spin-slow"
              style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
            />
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS - 34}
              fill="none"
              strokeWidth="1"
              className="stroke-line"
            />

            {/* travelling pulse */}
            <g
              className="spin-slow"
              style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
              aria-hidden="true"
            >
              <circle cx={CENTER} cy={CENTER - RADIUS} r="4.5" className="fill-brand" />
            </g>

            {/* arcs */}
            {steps.map((_, index) => {
              const from = point(index);
              const to = point((index + 1) % COUNT);
              const isPast = index < active;
              return (
                <path
                  key={`arc-${index}`}
                  d={`M ${from.x} ${from.y} A ${RADIUS} ${RADIUS} 0 0 1 ${to.x} ${to.y}`}
                  fill="none"
                  strokeWidth={index === active ? 2.5 : 1.5}
                  className={`transition-all duration-700 ${
                    index === active ? "stroke-value" : isPast ? "stroke-line-strong" : "stroke-line"
                  }`}
                />
              );
            })}

            {/* nodes */}
            {steps.map((step, index) => {
              const { x, y } = point(index);
              const isActive = index === active;
              return (
                <g key={step.num}>
                  <circle
                    cx={x}
                    cy={y}
                    r={isActive ? 27 : 22}
                    className={`transition-all duration-500 ${
                      isActive ? "fill-value/20 stroke-value" : "fill-canvas stroke-line"
                    }`}
                    strokeWidth={isActive ? 2 : 1}
                  />
                  <text
                    x={x}
                    y={y + 4}
                    textAnchor="middle"
                    fontSize="14"
                    fontWeight="700"
                    fontFamily="var(--font-geist-mono)"
                    className={isActive ? "fill-value" : "fill-ink-3"}
                  >
                    {step.num}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Centre statement */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="max-w-[54%] text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                {t.loopTag}
              </p>
              <p className="mt-2 text-[12.5px] font-bold leading-snug text-ink sm:text-[13.5px]">
                {t.loopDescription}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Chip tone="violet">
            <RotateCw className="h-3 w-3" />
            {t.closedLoop}
          </Chip>
          <span className="text-center text-[12.5px] leading-relaxed text-ink-3">{t.loopNote}</span>
        </div>
      </div>

      {/* Numbered legend */}
      <ol className="lg:col-span-6">
        {steps.map((step, index) => {
          const isActive = index === active;
          return (
            <li key={step.num}>
              <button
                type="button"
                onMouseEnter={() => {
                  setActive(index);
                }}
                onFocus={() => {
                  setActive(index);
                }}
                onClick={() => setActive(index)}
                className={`flex w-full items-start gap-4 border-t border-line px-3 py-3 text-left transition-colors ${
                  isActive ? "bg-value/[0.06]" : "hover:bg-surface-2"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border font-mono text-[11px] font-bold transition-colors ${
                    isActive ? "border-value/50 bg-value/15 text-value" : "border-line text-ink-3"
                  }`}
                  aria-hidden="true"
                >
                  {step.num}
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${isActive ? "text-ink" : "text-ink-2"}`}>
                    {step.title}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-2">
                    {step.desc}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
