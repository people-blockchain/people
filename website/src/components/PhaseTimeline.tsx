"use client";

import { Fragment } from "react";
import { ArrowRight, CheckCircle2, Hourglass } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { ARCHITECTURE_NODES_DATA } from "@/lib/nodes";
import { Reveal } from "./motion/Reveal";
import { Chip, SectionIntro } from "./ui/primitives";

const shortName = (name: string) => name.replace(/\s+·\s+Phase 3$/u, "").replace(/\s+·\s+Фаза 3$/u, "");

const PHASE_LAYOUT = [
  {
    id: "phase-1",
    tone: "brand" as const,
    dot: "bg-brand",
    line: "from-brand/70 to-brand/0",
    nodeIds: ["multi-asset-ledger", "feesplitter", "community-pool"],
    implemented: true,
  },
  {
    id: "phase-2",
    tone: "value" as const,
    dot: "bg-value",
    line: "from-value/70 to-value/0",
    nodeIds: ["token-factory", "nft-factory", "bonding-curve", "creator-vesting", "liquidity-migration"],
    implemented: true,
  },
  {
    id: "phase-3",
    tone: "warm" as const,
    dot: "bg-warm",
    line: "from-warm/70 to-warm/0",
    nodeIds: ["mobile-mining", "proof-of-humanity", "anti-sybil", "participation-power"],
    implemented: true,
  },
];

/**
 * Homepage build order: three phases as a single timeline instead of three
 * stacked documentation sections. Deep detail lives behind the architecture
 * explorer link and on /how-it-works.
 */
export function PhaseTimeline({ embedded = false }: { embedded?: boolean }) {
  const { lang } = useLanguage();
  const t = content[lang].phases;
  const arch = content[lang].architecture;
  const nodes = ARCHITECTURE_NODES_DATA[lang];

  const phaseCopy = [
    { title: arch.phase1Title, subtitle: arch.phase1Subtitle },
    { title: arch.phase2Title, subtitle: arch.phase2Subtitle },
    { title: arch.phase3Title, subtitle: arch.phase3Subtitle },
  ];

  const bridges = [t.bridge1, t.bridge2];

  const list = (
        <ol className={`grid gap-10 lg:grid-cols-3 lg:gap-6 ${embedded ? "" : "mt-14"}`}>
          {PHASE_LAYOUT.map((phase, index) => {
            const copy = phaseCopy[index];
            const last = index === PHASE_LAYOUT.length - 1;
            return (
              <Fragment key={phase.id}>
              <li className="relative">
                {/* desktop connector tick */}
                {!last && (
                  <span
                    className="absolute -right-6 top-11 hidden h-px w-6 bg-line lg:block"
                    aria-hidden="true"
                  />
                )}

                <Reveal delay={index * 90} className="h-full">
                  <article
                    id={embedded ? undefined : phase.id}
                    className="anchor-offset surface-elevated relative flex h-full flex-col rounded-3xl p-6 sm:p-7"
                  >
                    <span
                      className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${phase.line}`}
                      aria-hidden="true"
                    />

                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface-2 font-mono text-xs font-bold text-ink-2`}
                      >
                        {index + 1}
                      </span>
                      <span className="mono-label text-ink-3">
                        {t.layerLabel} {index + 1}
                      </span>
                      <span className={`ml-auto h-2 w-2 rounded-full ${phase.dot}`} aria-hidden="true" />
                    </div>

                    <h3 className="mt-5 text-xl font-bold tracking-tight text-ink text-balance">
                      {copy.title}
                    </h3>
                    <p className="mt-1.5 text-sm text-ink-2">{copy.subtitle}</p>

                    <div className="mt-4">
                      <Chip tone={phase.implemented ? "value" : "warm"}>
                        {phase.implemented ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <Hourglass className="h-3 w-3" />
                        )}
                        {phase.implemented ? t.statusImplemented : t.statusDesign}
                      </Chip>
                    </div>

                    <ul className="mt-auto flex flex-wrap gap-2 border-t border-line pt-5">
                      {phase.nodeIds.map((nodeId) => (
                        <li key={nodeId}>
                          <span className="inline-block rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-[12px] text-ink-2">
                            {shortName(nodes[nodeId]?.name ?? nodeId)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </article>
                </Reveal>
              </li>

              {/* mobile bridge between phases */}
              {!last && (
                <li aria-hidden="true" className="lg:hidden">
                  <div className="flex items-center gap-4">
                    <span className="h-px flex-1 bg-line" />
                    <span className="mono-label text-ink-3">{bridges[index]}</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                </li>
              )}
              </Fragment>
            );
          })}
        </ol>
  );

  if (embedded) {
    return (
      <div>
        {list}
      </div>
    );
  }

  return (
    <section className="relative border-b border-line bg-canvas py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionIntro
            eyebrow={t.tag}
            title={t.title}
            lead={t.subtitle}
            tone="brand"
            className="max-w-3xl"
          />
        </Reveal>
        {list}
        <Reveal delay={120}>
          <div className="mt-14">
            <a
              href="#architecture"
              className="group inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline"
            >
              {t.cta}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
