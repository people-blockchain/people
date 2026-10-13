"use client";

import { Activity, Hourglass, ShieldCheck, Sparkles, TrendingUp, Zap } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { useInView } from "../motion/useInView";
import { Chip, Statement } from "../ui/primitives";

const GLYPHS = [ShieldCheck, Activity, Hourglass, Sparkles];
const TONES = ["text-value", "text-brand", "text-warm", "text-violet"];
const STROKES = ["stroke-value", "stroke-brand", "stroke-warm", "stroke-violet"];
const DOTS = ["bg-value", "bg-brand", "bg-warm", "bg-violet"];

/**
 * Chapter 03 — Participation Power.
 *
 * The four conceptual inputs converge into one non-transferable metric, then
 * the *shape* of the curve (sublinear growth + a hard PowerCap) is shown.
 * No finalized formula, coefficient or decay schedule is presented, and no
 * relative weighting between the four inputs is implied.
 */
export function PowerDiagram() {
  const { lang } = useLanguage();
  const t = content[lang].howItWorks.section3;
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.18 });

  const components = t.conceptFormula.components;

  // Conceptual only: sublinear growth approaching a hard ceiling.
  const curvePoints = Array.from({ length: 26 }, (_, index) => {
    const ratio = index / 25;
    const x = 46 + ratio * 358;
    const y = 176 - Math.min(1, Math.sqrt(ratio)) * 128;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div ref={ref} className="space-y-12">
      {/* Definition */}
      <div className="grid gap-6 lg:grid-cols-12 lg:items-start lg:gap-10">
        <div className="lg:col-span-7">
          <Statement tone="brand">{t.coreDefinition}</Statement>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-ink-2">{t.roleExplanation}</p>
        </div>
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-brand/30 bg-brand/5 px-5 py-5">
            <Zap className="h-4 w-4 text-brand" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-ink">
              {t.notToken}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
              {t.notTokenDesc}
            </p>
            <div className="mt-4">
              <Chip tone="brand">
                {t.internalMetric}
              </Chip>
            </div>
          </div>
        </div>
      </div>

      {/* Four inputs converge into one metric */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,0.6fr)] lg:items-center lg:gap-3">
        <ul className="space-y-4">
          {components.map((component, index) => {
            const Glyph = GLYPHS[index];
            return (
              <li key={component.name} className="flex items-start gap-3.5">
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2"
                  aria-hidden="true"
                >
                  <Glyph className={`h-4 w-4 ${TONES[index]}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">{component.name}</p>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{component.desc}</p>
                </div>
                <span
                  className={`mt-2 hidden h-1.5 w-1.5 shrink-0 rounded-full lg:block ${DOTS[index]}`}
                  aria-hidden="true"
                />
              </li>
            );
          })}
        </ul>

        {/* converging bracket (desktop only) */}
        <svg
          viewBox="0 0 112 200"
          className="hidden h-[210px] w-[112px] lg:block"
          aria-hidden="true"
          preserveAspectRatio="none"
        >
          {[25, 75, 125, 175].map((y, index) => (
            <path
              key={y}
              d={`M2,${y} C52,${y} 48,100 110,100`}
              fill="none"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              className={`${STROKES[index]} draw-path ${inView ? "is-drawn" : ""}`}
              style={{
                ["--path-len" as string]: "170",
                ["--draw-delay" as string]: `${index * 130}ms`,
              }}
            />
          ))}
        </svg>

        <div className="rounded-2xl border border-brand/35 bg-brand/5 px-5 py-6 text-center">
          <p className="mono-label text-brand">
            {t.participationPowerBadge}
          </p>
          <p className="mt-3 text-2xl font-black tracking-tight text-ink">P</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
            {t.powerDesc}
          </p>
        </div>
      </div>

      {/* Shape of the curve */}
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <div className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="mono-label inline-flex items-center gap-2 text-ink-2">
                <TrendingUp className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                {t.powerShape.title}
              </span>
              <Chip tone="warm">{t.chipConceptual}</Chip>
            </div>

            <svg
              viewBox="0 0 420 210"
              className="mt-5 w-full"
              role="img"
              aria-label={t.powerShape.title}
            >
              <line x1="46" y1="176" x2="404" y2="176" className="stroke-line" strokeWidth="1" />
              <line x1="46" y1="16" x2="46" y2="176" className="stroke-line" strokeWidth="1" />

              <line
                x1="46"
                y1="48"
                x2="404"
                y2="48"
                className="stroke-warm"
                strokeWidth="1.5"
                strokeDasharray="5 5"
              />
              <text
                x="402"
                y="42"
                textAnchor="end"
                className="fill-warm"
                fontSize="11"
                fontFamily="var(--font-geist-mono)"
              >
                {t.powerShape.capLabel}
              </text>

              <polyline
                points={curvePoints}
                fill="none"
                strokeWidth="2.5"
                className={`stroke-brand draw-path ${inView ? "is-drawn" : ""}`}
                style={{
                  ["--path-len" as string]: "420",
                  ["--draw-delay" as string]: "200ms",
                }}
              />

              <text
                x="60"
                y="140"
                className="fill-ink-3"
                fontSize="11"
                fontFamily="var(--font-geist-mono)"
              >
                {t.powerShape.diminishLabel}
              </text>
              <text
                x="404"
                y="198"
                textAnchor="end"
                className="fill-ink-3"
                fontSize="11"
                fontFamily="var(--font-geist-mono)"
              >
                {t.powerShape.activityAxis}
              </text>
              <text
                x="16"
                y="96"
                className="fill-ink-3"
                fontSize="11"
                fontFamily="var(--font-geist-mono)"
                transform="rotate(-90 16 96)"
                textAnchor="middle"
              >
                {t.powerShape.powerAxis}
              </text>
            </svg>

            <p className="mt-4 border-t border-line pt-4 font-mono text-[11.5px] leading-relaxed text-ink-3">
              {t.conceptFormula.label}
            </p>
          </div>
        </div>

        {/* Maturation / decay / humanity layer */}
        <div className="lg:col-span-5">
          <ul>
            <li className="flex items-start gap-3 border-t border-line py-4">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-brand">{t.powerShape.maturationLabel}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{t.safeguards[2].desc}</p>
              </div>
            </li>
            <li className="flex items-start gap-3 border-t border-line py-4">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warm" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-warm">{t.powerShape.decayLabel}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{t.safeguards[3].desc}</p>
              </div>
            </li>
            <li className="flex items-start gap-3 border-y border-line py-4">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-value" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-value">{t.safeguards[4].title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{t.safeguards[4].desc}</p>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
