"use client";

import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { useActiveStep } from "../motion/useActiveStep";
import { useInView } from "../motion/useInView";
import { Chip } from "../ui/primitives";

const SEGMENT_STYLES: Record<string, string> = {
  brand: "bg-brand",
  value: "bg-value",
  violet: "bg-violet",
  warm: "bg-warm",
  muted: "bg-ink-3",
};

const LEGEND_TEXT: Record<string, string> = {
  brand: "text-brand",
  value: "text-value",
  violet: "text-violet",
  warm: "text-warm",
  muted: "text-ink-3",
};

/** Deterministic protocol fee split as a single stacked bar. */
export function FeeSplitBar() {
  const { lang } = useLanguage();
  const t = content[lang].howItWorks.section4;
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.3 });

  return (
    <div ref={ref} className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="mono-label text-ink-2">{t.feeSplitTitle}</span>
        <Chip tone="warm">{t.feeSplitProvisional}</Chip>
      </div>

      <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
        {t.feeSplit.map((segment, index) => (
          <span
            key={segment.label}
            className={`h-full transition-[opacity,transform] duration-700 ease-out ${SEGMENT_STYLES[segment.tone] ?? "bg-ink-3"}`}
            style={{
              flexGrow: Number.parseInt(segment.share, 10),
              opacity: inView ? 1 : 0,
              transform: inView ? "scaleY(1)" : "scaleY(0.2)",
              transitionDelay: `${index * 90}ms`,
            }}
          />
        ))}
      </div>

      <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        {t.feeSplit.map((segment) => (
          <li key={segment.label} className="flex items-baseline gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${SEGMENT_STYLES[segment.tone] ?? "bg-ink-3"}`}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span
                className={`block font-mono text-sm font-bold ${LEGEND_TEXT[segment.tone] ?? "text-ink"}`}
              >
                {segment.share}
              </span>
              <span className="block text-[12.5px] leading-snug text-ink-2">{segment.label}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}


/**
 * Chapter 04 (centre-piece) — the NETWORK economy pipeline: nine stages of
 * causality. Stages illuminate progressively as the visitor scrolls, earlier
 * stages stay visible, and the current stage is emphasised.
 */
export function NetworkValueFlow() {
  const { lang } = useLanguage();
  const t = content[lang].howItWorks.section4;
  const stages = t.networkFlow;
  const { active, setStepRef } = useActiveStep(stages.length);

  const isLast = (index: number) => index === stages.length - 1;

  return (
    <ol className="relative">
      {stages.map((stage, index) => {
        const past = index < active;
        const current = index === active;
        return (
          <li key={stage.step} ref={setStepRef(index)} data-step-index={index} className="step-node">
            <div className="relative flex gap-4 pb-2">
              {/* spine */}
              {!isLast(index) && (
                <span
                  className="absolute left-[1.125rem] top-9 h-[calc(100%-1rem)] w-px bg-line"
                  aria-hidden="true"
                >
                  <span
                    className="block w-px origin-top bg-gradient-to-b from-brand to-value transition-transform duration-700 ease-out"
                    style={{
                      height: "100%",
                      transform: index < active ? "scaleY(1)" : "scaleY(0)",
                    }}
                  />
                </span>
              )}

              <span
                className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border font-mono text-[11px] font-bold transition-all duration-500 ${
                  current
                    ? "border-brand bg-brand/12 text-brand ring-4 ring-brand/15"
                    : past
                    ? "border-line-strong bg-surface-2 text-ink-2"
                    : "border-line bg-surface text-ink-3"
                }`}
                aria-hidden="true"
              >
                {stage.step}
              </span>

              <div
                className={`min-w-0 flex-1 rounded-2xl border px-4 py-3.5 transition-all duration-500 ${
                  current
                    ? "border-brand/40 bg-brand/[0.06]"
                    : past
                    ? "border-line bg-surface"
                    : "border-line bg-surface opacity-55"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h4
                    className={`font-mono text-[13px] font-bold uppercase tracking-wide ${
                      current ? "text-brand" : past ? "text-ink" : "text-ink-2"
                    }`}
                  >
                    {stage.name}
                  </h4>
                  {t.flowNotes && (t.flowNotes as Record<string, string>)[String(index)] && (
                    <span className="font-mono text-[11px] text-ink-3">
                      {(t.flowNotes as Record<string, string>)[String(index)]}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{stage.desc}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
