"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Calculator,
  Clock,
  Coins,
  Database,
  Fingerprint,
  Hourglass,
  Info,
  Layers,
  ShieldAlert,
  Smartphone,
  Terminal,
  TrendingUp,
  X,
  Zap,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { hub } from "@/lib/hub-content";
import { ARCHITECTURE_NODES_DATA } from "@/lib/nodes";
import { Reveal } from "./motion/Reveal";
import { Chip, SectionIntro } from "./ui/primitives";

type Tone = "brand" | "value" | "warm";

interface Tier {
  key: string;
  tone: Tone;
  status: "implemented" | "design";
  modules: Array<{ id: string; Icon: LucideIcon }>;
}

const TIERS: Tier[] = [
  {
    key: "phase1Title",
    tone: "brand",
    status: "implemented",
    modules: [
      { id: "multi-asset-ledger", Icon: Database },
      { id: "feesplitter", Icon: Calculator },
      { id: "community-pool", Icon: Coins },
    ],
  },
  {
    key: "phase2Title",
    tone: "value",
    status: "implemented",
    modules: [
      { id: "token-factory", Icon: Coins },
      { id: "nft-factory", Icon: Layers },
      { id: "bonding-curve", Icon: TrendingUp },
      { id: "creator-vesting", Icon: Clock },
      { id: "liquidity-migration", Icon: ArrowRightLeft },
    ],
  },
  {
    key: "phase3Title",
    tone: "warm",
    status: "design",
    modules: [
      { id: "mobile-mining", Icon: Smartphone },
      { id: "proof-of-humanity", Icon: Fingerprint },
      { id: "anti-sybil", Icon: ShieldAlert },
      { id: "participation-power", Icon: Zap },
    ],
  },
];

const toneStyles: Record<Tone, { text: string; border: string; bg: string; activeBg: string }> = {
  brand: {
    text: "text-brand",
    border: "border-brand/40",
    bg: "bg-brand/10",
    activeBg: "bg-brand/15",
  },
  value: {
    text: "text-value",
    border: "border-value/40",
    bg: "bg-value/10",
    activeBg: "bg-value/15",
  },
  warm: {
    text: "text-warm",
    border: "border-warm/40",
    bg: "bg-warm/10",
    activeBg: "bg-warm/15",
  },
};

export function ArchitectureDiagram({ embedded = false }: { embedded?: boolean }) {
  const { lang } = useLanguage();
  const t = content[lang].architecture;
  const phases = content[lang].phases;
  const nodes = ARCHITECTURE_NODES_DATA[lang];

  const [selectedId, setSelectedId] = useState("multi-asset-ledger");
  const [openMobile, setOpenMobile] = useState(false);

  const selected = nodes[selectedId] ?? nodes["multi-asset-ledger"];
  const selectedTierIndex = Math.max(
    0,
    TIERS.findIndex((tier) => tier.modules.some((module) => module.id === selectedId))
  );
  const selectedTone: Tone = TIERS[selectedTierIndex].tone;

  const phaseLabel = useMemo(
    () => ({
      "phase1Title": t.phase1Title,
      "phase2Title": t.phase2Title,
      "phase3Title": t.phase3Title,
    }),
    [t]
  ) as Record<string, string>;

  const subLabel = useMemo(
    () => ({
      "phase1Title": t.phase1Subtitle,
      "phase2Title": t.phase2Subtitle,
      "phase3Title": t.phase3Subtitle,
    }),
    [t]
  ) as Record<string, string>;

  const select = (id: string) => {
    setSelectedId(id);
    setOpenMobile(true);
  };

  const inspectorBody = (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono-label text-ink-3">{selected.phase}</span>
          <Chip tone={selected.status === "IMPLEMENTED" ? "value" : "warm"}>
            {selected.status === "IMPLEMENTED"
              ? phases.statusImplemented
              : phases.statusDesign}
          </Chip>
        </div>
        <h3 className="mt-2 text-xl font-bold tracking-tight text-ink">{selected.name}</h3>
      </div>

      <p className="text-sm leading-relaxed text-ink-2">{selected.summary}</p>

      <div>
        <span className={`mono-label inline-flex items-center gap-1.5 ${toneStyles[selectedTone].text}`}>
          <Terminal className="h-3.5 w-3.5" />
          {t.inspectorHeading}
        </span>
        <ul className="mt-3 space-y-2">
          {selected.technicalDetails.map((detail) => (
            <li
              key={detail}
              className="rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-ink-2"
            >
              {detail}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <span className="mono-label inline-flex items-center gap-1.5 text-value">
          <Info className="h-3.5 w-3.5" />
          {t.invariantsHeading}
        </span>
        <ul className="mt-3 space-y-2">
          {selected.invariants.map((invariant) => (
            <li key={invariant} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-2">
              <span className="mt-0.5 text-value" aria-hidden="true">
                ✓
              </span>
              <span className="font-mono">{invariant}</span>
            </li>
          ))}
        </ul>
      </div>

      {selected.id === "token-factory" ? (
        <Link href="/create/token" className="inline-flex text-sm font-semibold text-brand">
          {hub[lang].tokenMarket.createCta}
        </Link>
      ) : null}
      {selected.id === "nft-factory" ? (
        <Link href="/create/nft" className="inline-flex text-sm font-semibold text-brand">
          {hub[lang].tokenMarket.nftCta}
        </Link>
      ) : null}
      {selected.id === "liquidity-migration" ? (
        <Link href="/swap" className="inline-flex text-sm font-semibold text-brand">
          {hub[lang].tokenMarket.swapCta}
        </Link>
      ) : null}
    </div>
  );

  const body = (
        <div className={embedded ? "grid gap-8 lg:grid-cols-12 lg:gap-10" : "mt-12 grid gap-8 lg:grid-cols-12 lg:gap-10"}>
          {/* Layered stack */}
          <div className="lg:col-span-7">
            <Reveal>
              <div className="surface-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand node-pulse" aria-hidden="true" />
                  <div>
                    <span className="mono-label text-ink-3">{t.umbrellaTitle}</span>
                    <p className="text-base font-bold text-ink">{t.umbrellaName}</p>
                  </div>
                </div>
                <Chip tone="neutral">{t.umbrellaRole}</Chip>
              </div>
            </Reveal>

            <div className="flex items-center gap-3 py-4 pl-5">
              <span className="h-10 w-px bg-line" aria-hidden="true" />
              <span className="mono-label text-ink-3">
                {t.governsAndBuilds}
              </span>
            </div>

            <Reveal>
              <div className="surface-elevated relative overflow-hidden rounded-2xl px-5 py-5">
                <div className="glow-brand pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full" aria-hidden="true" />
                <span className="mono-label text-brand">{t.targetTitle}</span>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-2xl font-black tracking-tight text-ink">{t.targetName}</h3>
                    {t.targetNameSecondary ? (
                      <p className="mt-0.5 text-xs font-semibold tracking-wide text-ink-3">
                        {t.targetNameSecondary}
                      </p>
                    ) : null}
                  </div>
                  <Chip tone="brand">{t.targetBadge}</Chip>
                </div>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-2">{t.targetDesc}</p>
              </div>
            </Reveal>

            <div className="flex items-center gap-3 py-4 pl-5">
              <Layers className="h-4 w-4 text-ink-3" aria-hidden="true" />
              <span className="mono-label text-ink-3">
                {t.layerSequence}
              </span>
            </div>

            <ol className="space-y-5">
              {TIERS.map((tier, tierIndex) => {
                const tone = toneStyles[tier.tone];
                return (
                  <li key={tier.key}>
                    <Reveal delay={tierIndex * 70}>
                      <div className="surface-panel rounded-2xl p-4 sm:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <span
                              className={`flex h-7 w-7 items-center justify-center rounded-lg border ${tone.border} ${tone.bg} font-mono text-xs font-bold ${tone.text}`}
                            >
                              {tierIndex + 1}
                            </span>
                            <div>
                              <p className="text-sm font-bold uppercase tracking-wide text-ink">
                                {phaseLabel[tier.key]}
                              </p>
                              <p className="font-mono text-[11px] text-ink-3">{subLabel[tier.key]}</p>
                            </div>
                          </div>
                          <Chip tone={tier.status === "implemented" ? "value" : "warm"}>
                            {tier.status === "implemented" ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <Hourglass className="h-3 w-3" />
                            )}
                            {tier.status === "implemented"
                              ? phases.statusImplemented
                              : phases.statusDesign}
                          </Chip>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                          {tier.modules.map(({ id, Icon }) => {
                            const isActive = selectedId === id;
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => select(id)}
                                aria-pressed={isActive}
                                className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                                  isActive
                                    ? `${tone.border} ${tone.activeBg}`
                                    : "border-line bg-surface-2 hover:border-line-strong"
                                }`}
                              >
                                <Icon className={`h-4 w-4 ${isActive ? tone.text : "text-ink-3"}`} aria-hidden="true" />
                                <span className="mt-2 block text-[12.5px] font-semibold leading-snug text-ink">
                                  {nodes[id]?.name ?? id}
                                </span>
                                <span className="mt-1 block font-mono text-[10.5px] leading-snug text-ink-3">
                                  {(t.hints as Record<string, string>)?.[id]}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </Reveal>

                    {/* Mobile inline inspector: always belongs to the tier that owns the selection */}
                    {openMobile && selectedTierIndex === tierIndex && (
                      <div className="mt-3 rounded-2xl border border-line bg-surface p-5 shadow-[var(--elev-1)] lg:hidden">
                        <button
                          type="button"
                          onClick={() => setOpenMobile(false)}
                          className="mb-3 ml-auto flex items-center gap-1.5 text-xs font-medium text-ink-3"
                        >
                          <X className="h-3.5 w-3.5" />
                          {t.closeDrawer}
                        </button>
                        {inspectorBody}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="hidden lg:col-span-5 lg:block">
            <Reveal>
              <div className="surface-elevated sticky top-24 rounded-3xl p-6">{inspectorBody}</div>
            </Reveal>
          </div>
        </div>
  );

  if (embedded) {
    return <div>{body}</div>;
  }

  return (
    <section id="architecture" className="anchor-offset relative border-b border-line bg-canvas-2 py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionIntro eyebrow={t.tag} title={t.title} lead={t.subtitle} className="max-w-3xl" />
        </Reveal>
        {body}
      </div>
    </section>
  );
}
