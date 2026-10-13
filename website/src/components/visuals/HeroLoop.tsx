"use client";

import { Coins, Layers, ShieldCheck, Smartphone } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { Reveal } from "../motion/Reveal";
import { Chip, Eyebrow } from "../ui/primitives";

const tones = [
  { text: "text-value", bg: "bg-value/10", ring: "border-value/30", dot: "bg-value" },
  { text: "text-brand", bg: "bg-brand/10", ring: "border-brand/30", dot: "bg-brand" },
  { text: "text-brand", bg: "bg-brand/10", ring: "border-brand/30", dot: "bg-brand" },
  { text: "text-warm", bg: "bg-warm/10", ring: "border-warm/30", dot: "bg-warm" },
];

const glyphs = [Coins, Layers, Coins, Smartphone];

/**
 * Hero visual: the four economic beats as a single causal chain with a drawn
 * return path. One idea, no card wall — it answers "what happens in this
 * network?" before the visitor scrolls.
 */
export function HeroLoop() {
  const { lang } = useLanguage();
  const t = content[lang].hero;

  const loopNote = t.loopAria;
  const returnLabel = t.returnLabel;

  return (
    <div
      className="surface-elevated relative overflow-hidden rounded-3xl p-5 sm:p-7"
    >
      <div
        className="glow-brand pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full"
        aria-hidden="true"
      />

      <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <Eyebrow tone="brand">{t.flowBadge}</Eyebrow>
        <Chip tone="value">
          {t.circularValueLoop}
        </Chip>
      </div>

      <div className="relative mt-4">
        <ol className="relative space-y-1.5">
          {t.flowSteps.slice(0, 4).map((step, index) => {
            const tone = tones[index];
            const Glyph = glyphs[index];
            const isLast = index === 3;
            return (
              <li key={step.id}>
                <Reveal delay={index * 110}>
                  <div className="flex items-start gap-3.5 rounded-2xl px-1 py-2.5">
                    <span
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${tone.ring} ${tone.bg}`}
                      aria-hidden="true"
                    >
                      <Glyph className={`h-4 w-4 ${tone.text}`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-ink">{step.title}</span>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
                          {step.status}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{step.desc}</p>
                    </div>
                    <span className="mono-label hidden shrink-0 pt-1 text-ink-3 sm:block">
                      0{index + 1}
                    </span>
                  </div>
                </Reveal>

                {!isLast && (
                  <div className="relative ml-[1.35rem] h-5 w-px" aria-hidden="true">
                    <span className="absolute inset-0 bg-gradient-to-b from-line-strong via-line to-line" />
                    <span
                      className={`node-pulse absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${tone.dot}`}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3">
          <ShieldCheck className="h-4 w-4 shrink-0 text-value" aria-hidden="true" />
          <p className="text-[13px] leading-relaxed text-ink-2">{loopNote}</p>
          <span className="mono-label ml-auto hidden shrink-0 text-ink-3 md:block">
            {returnLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
