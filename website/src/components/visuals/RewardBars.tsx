"use client";

import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { CountUp } from "../motion/CountUp";
import { useInView } from "../motion/useInView";
import { Disclosure } from "../ui/Disclosure";

const BAR_TONES = ["bg-brand", "bg-violet", "bg-value"];

/**
 * Chapter 07 — pro-rata reward calculation as animated proportional bars.
 * The principle is visible without reading a formula; the formula stays in the
 * technical disclosure.
 */
export function RewardBars() {
  const { lang } = useLanguage();
  const t = content[lang].howItWorks.section7;
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.25 });

  return (
    <div ref={ref} className="space-y-8">
      {/* Pool */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-5 py-4">
        <span className="mono-label text-ink-3">{t.poolLabel}</span>
        <span className="flex items-baseline gap-2">
          <CountUp value={Number(t.poolAmount)} className="font-mono text-3xl font-black text-value" />
          <span className="font-mono text-xs uppercase tracking-wider text-ink-3">{t.poolUnit}</span>
        </span>
      </div>

      {/* Participants */}
      <ul className="space-y-5">
        {t.participants.map((participant, index) => (
          <li key={participant.name}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-sm font-bold text-ink">{participant.name}</span>
              <span className="font-mono text-[11.5px] text-ink-3">
                {t.powerLabel}: {participant.power} · {t.shareLabel}: {participant.share}
              </span>
            </div>

            <div className="mt-2 flex items-center gap-4">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span
                  className={`bar-fill block h-full rounded-full ${BAR_TONES[index]} ${
                    inView ? "is-filled" : ""
                  }`}
                  style={{
                    width: `${participant.pct}%`,
                    ["--bar-delay" as string]: `${index * 160}ms`,
                  }}
                  aria-hidden="true"
                />
              </div>
              <span className="w-28 shrink-0 text-right font-mono text-sm font-bold text-value sm:w-32">
                {participant.reward}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/* Total */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className="mono-label text-ink-3">{t.totalLabel}</span>
        <span className="font-mono text-sm font-bold text-ink">{t.totalPower}</span>
      </div>

      <p className="text-[13px] leading-relaxed text-ink-2">{t.clarification}</p>

      <Disclosure title={t.techDetailsTitle}>
        <ul className="space-y-3">
          {t.techDetails.map((detail) => (
            <li key={detail} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" aria-hidden="true" />
              {detail}
            </li>
          ))}
        </ul>
      </Disclosure>
    </div>
  );
}
