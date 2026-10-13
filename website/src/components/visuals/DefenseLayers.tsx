"use client";

import { ShieldCheck, UserCheck } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { useInView } from "../motion/useInView";
import { Chip } from "../ui/primitives";

const WIDTHS = [
  "lg:w-full",
  "lg:w-[94%]",
  "lg:w-[88%]",
  "lg:w-[82%]",
  "lg:w-[76%]",
  "lg:w-[70%]",
];

/**
 * Chapter 08 — layered anti-Sybil defence. Six independent layers narrow from
 * a real human down to reward caps, so the section reads as a defence funnel
 * rather than a six-card grid. No aggressive imagery.
 */
export function DefenseLayers() {
  const { lang } = useLanguage();
  const t = content[lang].howItWorks.section8;
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.15 });

  return (
    <div ref={ref} className="space-y-12">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="mono-label inline-flex items-center gap-2 text-ink-2">
            <ShieldCheck className="h-3.5 w-3.5 text-value" aria-hidden="true" />
            {t.multiLayer}
          </span>
          <Chip tone="value">
            {t.independentSignals}
          </Chip>
        </div>

        <ol className="mt-6 space-y-2.5">
          {t.layers.map((layer, index) => (
            <li
              key={layer.num}
              className={`relative mx-auto transition-all duration-700 ease-out ${WIDTHS[index]} ${
                inView ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
              }`}
              style={{ transitionDelay: `${index * 90}ms` }}
            >
              <div
                className={`flex items-start gap-4 rounded-2xl border px-4 py-3.5 sm:px-5 ${
                  index === 0
                    ? "border-value/40 bg-value/[0.07]"
                    : "border-line bg-surface"
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border font-mono text-[11px] font-bold ${
                    index === 0
                      ? "border-value/45 bg-value/10 text-value"
                      : "border-line bg-surface-2 text-ink-3"
                  }`}
                  aria-hidden="true"
                >
                  {index === 0 ? <UserCheck className="h-4 w-4" /> : layer.num}
                </span>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-ink">{layer.name}</h4>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{layer.desc}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-5 text-[12.5px] italic leading-relaxed text-ink-3">{t.disclaimerNotice}</p>
      </div>

      {/* What each defence actually does */}
      <div className="grid gap-x-10 sm:grid-cols-2">
        {t.protections.map((protection) => (
          <div key={protection.title} className="border-t border-line py-4">
            <h4 className="text-sm font-bold text-ink">{protection.title}</h4>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{protection.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
