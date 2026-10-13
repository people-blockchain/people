"use client";

import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { useInView } from "../motion/useInView";
import { Chip } from "../ui/primitives";
import { TOKEN_COMMUNITY_SHARE_PCT } from "@/lib/selling-economics";

/**
 * Chapter 04 (second mechanism) — the TOKEN economy pipeline. Deliberately
 * separate styling from the network flow: this is a token supply allocation,
 * not a network fee, and the pools are never merged.
 */
export function TokenValueFlow() {
  const { lang } = useLanguage();
  const t = content[lang].howItWorks.section4;
  const stages = t.tokenFlow;
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.25 });

  return (
    <div ref={ref} className="rounded-3xl border border-violet/30 bg-violet/[0.04] p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mono-label text-violet">{t.tokenPipelineHeading}</p>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-2">
            {t.tokenPipelineSubtitle}
          </p>
        </div>
        <Chip tone="violet">
          {t.separateMechanism}
        </Chip>
      </div>

      <ol className="mt-7 grid gap-6 lg:grid-cols-4 lg:gap-4">
        {stages.map((stage, index) => {
          const emphasised = index === 1;
          return (
            <li key={stage.step} className="relative flex items-start gap-4 lg:flex-col lg:gap-0">
              <span
                className={`relative z-10 flex shrink-0 items-center justify-center rounded-2xl border bg-canvas font-mono font-bold transition-colors duration-500 ${
                  emphasised
                    ? "h-14 w-14 border-violet/50 text-violet lg:h-16 lg:w-16"
                    : "h-10 w-10 border-line text-ink-3 lg:h-11 lg:w-11"
                }`}
                aria-hidden="true"
              >
                {emphasised ? (
                  <span className="text-center text-[15px] leading-none lg:text-[17px]">{TOKEN_COMMUNITY_SHARE_PCT}%</span>
                ) : (
                  <span className="text-[11px]">{stage.step}</span>
                )}
              </span>

              {index < stages.length - 1 && (
                <>
                  <span
                    className="absolute left-5 top-12 -bottom-6 w-px bg-line lg:hidden"
                    aria-hidden="true"
                  />
                  <span
                    className="absolute -right-[0.9rem] top-5 hidden h-px w-[1.1rem] bg-line lg:block"
                    aria-hidden="true"
                  />
                </>
              )}

              <div className="min-w-0 lg:mt-5">
                <span className="mono-label text-ink-3">{stage.step}</span>
                <h4
                  className={`mt-1 font-mono text-[13px] font-bold uppercase tracking-wide ${
                    emphasised ? "text-violet" : "text-ink"
                  }`}
                >
                  {stage.name}
                </h4>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{stage.desc}</p>
                <span
                  className="mt-3 block h-px w-full origin-left bg-gradient-to-r from-violet/70 to-transparent transition-transform duration-1000 ease-out"
                  style={{
                    transform: inView ? "scaleX(1)" : "scaleX(0)",
                    transitionDelay: `${index * 140}ms`,
                  }}
                  aria-hidden="true"
                />
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-7 border-t border-violet/20 pt-4 text-[13px] leading-relaxed text-ink-2">
        {t.nftRuleNotice}
      </p>
    </div>
  );
}
