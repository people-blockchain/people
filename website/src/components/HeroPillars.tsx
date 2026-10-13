"use client";

import { MODEL_A_FEE_SPLIT, TOKEN_COMMUNITY_SHARE_PCT } from "@/lib/selling-economics";
import type { Language } from "@/context/LanguageContext";
import { hub } from "@/lib/hub-content";

const pillarTone: Record<string, string> = {
  allocation: "text-violet",
  fees: "text-value",
  partner: "text-warm",
};

const barTone: Record<string, string> = {
  brand: "bg-brand",
  value: "bg-value",
  violet: "bg-violet",
  warm: "bg-warm",
  neutral: "bg-ink-3",
};

type Pillar = {
  readonly id: string;
  readonly value: string;
  readonly title: string;
  readonly note: string;
};

type HeroPillarsProps = {
  pillars: readonly Pillar[];
  lang: Language;
  className?: string;
  compact?: boolean;
};

export function HeroPillars({ pillars, lang, className = "", compact }: HeroPillarsProps) {
  return (
    <div className={className}>
      <ul className={`grid grid-cols-3 gap-2 ${compact ? "" : "mt-5"}`}>
        {pillars.map((pillar) => (
          <li
            key={pillar.id}
            className="surface-elevated min-w-0 rounded-xl px-2 py-2.5 sm:px-3 lg:px-2.5 lg:py-3"
          >
            <p
              className={`font-mono text-lg font-black tabular-nums leading-none sm:text-2xl lg:text-xl xl:text-2xl ${
                pillarTone[pillar.id] ?? "text-brand"
              }`}
            >
              {pillar.id === "allocation" ? `${TOKEN_COMMUNITY_SHARE_PCT}%` : pillar.value}
            </p>
            <p className="mt-1 text-[10px] font-semibold uppercase leading-snug tracking-wide text-ink sm:text-[11px]">
              {pillar.title}
            </p>
            <p className="mt-0.5 hidden text-[11px] leading-snug text-ink-3 sm:block">{pillar.note}</p>
          </li>
        ))}
      </ul>
      <div className="mt-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <div className="flex h-1.5 w-full">
          {MODEL_A_FEE_SPLIT.map((row) => (
            <span
              key={row.id}
              className={barTone[row.tone]}
              style={{ flexGrow: Math.max(row.pct, 1), flexBasis: 0 }}
            />
          ))}
        </div>
      </div>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
        {hub[lang].economics.title}
      </p>
    </div>
  );
}
