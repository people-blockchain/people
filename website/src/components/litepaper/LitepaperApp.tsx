"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { Language } from "@/lib/preferences";
import { litepaperPublic, type LitepaperCopy } from "@/lib/litepaper-content";
import { renderLitepaperBlocks } from "@/lib/litepaper/renderer";
import type { MdBlock } from "@/lib/litepaper/markdown";
import {
  groupLitepaperSections,
  splitLeadParagraph,
  extractFirstTable,
  type LitepaperChartSlot,
} from "@/lib/litepaper/sections";
import { Reveal } from "@/components/motion/Reveal";
import { WarmCard, WARM_PRIMARY_BTN, WARM_SECONDARY_BTN } from "@/components/warm/warm-ui";
import { DOCS_RELEASE, docsVersionLine } from "@/lib/docs-release";
import { TOTAL_SUPPLY_PPL, NETWORK_FEE_SPLIT } from "@/lib/tokenomics";
import { TOKEN_COMMUNITY_ALLOCATION_PCT } from "@/lib/selling-economics";
import {
  LitepaperAllocationDonut,
  FeeFlowDiagram,
  BuybackLoop,
  TeamVestingChart,
  FoundersPayoutBar,
  RoadmapTimeline,
  VerificationLevels,
  DifferTable,
} from "@/components/litepaper/LitepaperChartsLazy";

type Heading = { id: string; text: string };

const WHITEPAPER_HREF = "/whitepaper/people-whitepaper.pdf";
const LITEOBER_PDF_HREF = "/litepaper/people-litepaper.pdf";
const PROMO_KIT_HREF = "/litepaper/people-promo-kit.zip";

export function LitepaperApp({
  heroTitle,
  heroTagline,
  mission,
  caption,
  blocks,
  headings,
  whitepaperAvailable = false,
}: {
  heroTitle: string;
  heroTagline: string[];
  mission: string;
  caption: string;
  blocks: MdBlock[];
  headings: Heading[];
  /** True only when `public/whitepaper/people-whitepaper.pdf` is present. */
  whitepaperAvailable?: boolean;
}) {
  const { lang } = useLanguage();
  const t = litepaperPublic[lang];
  const [tocOpen, setTocOpen] = useState(false);
  const sections = useMemo(() => groupLitepaperSections(blocks), [blocks]);
  const versionLine = docsVersionLine();
  const burnPct = NETWORK_FEE_SPLIT.find((s) => s.id === "burn")?.pct ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <Reveal>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">{t.tag}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-5xl">{heroTitle}</h1>
        <div className="mt-4 space-y-1">
          {heroTagline.map((line) => (
            <p key={line} className="text-lg font-semibold leading-snug text-ink sm:text-xl">
              {line}
            </p>
          ))}
        </div>
        {mission ? <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-2">{mission}</p> : null}
        {caption ? <p className="mt-3 text-sm italic text-ink-3">{caption}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="inline-flex rounded-full border border-line-strong px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink-3">
            {t.preliminaryNote}
          </p>
          <p
            className="inline-flex rounded-full border border-line px-3 py-1 text-xs font-semibold tabular-nums text-ink-2"
            data-testid="docs-version-line"
          >
            <span className="sr-only">{t.versionLabel}: </span>
            {versionLine}
          </p>
        </div>

        <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HeroStat value={`${TOTAL_SUPPLY_PPL / 1_000_000_000}B`} label={t.heroStat.supplyLabel} />
          <HeroStat value={`${TOKEN_COMMUNITY_ALLOCATION_PCT}%`} label={t.heroStat.communityLabel} />
          <HeroStat value={`${burnPct}%`} label={t.heroStat.burnLabel} />
          <HeroStat value={t.heroStat.vcValue} label={t.heroStat.vcLabel} />
        </dl>
      </Reveal>

      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="order-2 lg:order-1">
          <div className="lg:sticky lg:top-24">
            <div className="rounded-2xl border border-line bg-surface shadow-[var(--elev-1)] lg:bg-transparent lg:shadow-none lg:border-none">
              <button
                type="button"
                onClick={() => setTocOpen((v) => !v)}
                aria-expanded={tocOpen}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-ink lg:hidden"
              >
                {t.tocLabel}
                <span aria-hidden="true">{tocOpen ? "−" : "+"}</span>
              </button>
              <nav
                aria-label={t.tocLabel}
                className={`${tocOpen ? "block" : "hidden"} px-4 pb-4 lg:block lg:px-0 lg:pb-0`}
              >
                <p className="hidden text-xs font-semibold uppercase tracking-[0.14em] text-ink-3 lg:block">
                  {t.tocLabel}
                </p>
                <ul className="mt-2 space-y-2 border-l border-line pl-4 text-sm lg:mt-3">
                  {headings.map((h) => (
                    <li key={h.id}>
                      <a href={`#${h.id}`} className="text-ink-2 transition-colors hover:text-brand">
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>

            <div className="mt-6 hidden rounded-2xl border border-line bg-surface p-5 shadow-[var(--elev-1)] lg:block">
              <DownloadCard t={t} whitepaperAvailable={whitepaperAvailable} versionLine={versionLine} />
            </div>
          </div>
        </aside>

        <div className="order-1 min-w-0 space-y-6 lg:order-2">
          {sections.map((section) => (
            // No Reveal wrapper: on Android Chrome, Reveal+IO left tall cards at opacity:0
            // (desktop was fine). Section cards + charts must paint immediately on mobile.
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-title`}
              className="scroll-mt-28 rounded-[28px] border border-line bg-surface p-6 shadow-[var(--elev-1)] sm:p-8"
              data-chart-slot={section.chartSlot ?? undefined}
            >
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-warm">
                {section.eyebrow}
              </p>
              <h2 id={`${section.id}-title`} className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                {section.title}
              </h2>
              <div className="mt-6">
                <SectionBody chartSlot={section.chartSlot} blocks={section.blocks} copy={t} lang={lang} />
              </div>
            </section>
          ))}

          <div className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--elev-1)] lg:hidden">
            <DownloadCard t={t} whitepaperAvailable={whitepaperAvailable} versionLine={versionLine} />
          </div>
          <ChangelogCard t={t} />
        </div>
      </div>
    </div>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <dd className="font-mono text-2xl font-bold tabular-nums text-brand sm:text-3xl">{value}</dd>
      <dt className="mt-1 text-xs leading-snug text-ink-2">{label}</dt>
    </div>
  );
}

/** Body of one `##` section: markdown prose plus any charts wired to its heading id. */
function SectionBody({
  chartSlot,
  blocks,
  copy,
  lang,
}: {
  chartSlot: LitepaperChartSlot;
  blocks: MdBlock[];
  copy: LitepaperCopy;
  lang: Language;
}) {
  switch (chartSlot) {
    case "technology": {
      const { lead, rest } = splitLeadParagraph(blocks);
      return (
        <>
          {lead ? renderLitepaperBlocks([lead]) : null}
          {renderLitepaperBlocks(rest)}
          <div className="mt-6">
            <VerificationLevels copy={copy} />
          </div>
        </>
      );
    }
    case "tokenomics": {
      const { lead, rest } = splitLeadParagraph(blocks);
      return (
        <>
          {lead ? renderLitepaperBlocks([lead]) : null}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <WarmCard testId="litepaper-allocation-donut-card">
              <LitepaperAllocationDonut lang={lang} />
            </WarmCard>
            <div className="flex flex-col gap-6">
              <TeamVestingChart copy={copy} />
              <BuybackLoop copy={copy} />
            </div>
          </div>
          <div className="mt-6">
            <FeeFlowDiagram copy={copy} lang={lang} />
          </div>
          <div className="mt-6">{renderLitepaperBlocks(rest)}</div>
        </>
      );
    }
    case "founders": {
      const { lead, rest } = splitLeadParagraph(blocks);
      return (
        <>
          {lead ? renderLitepaperBlocks([lead]) : null}
          <div className="mt-6">
            <FoundersPayoutBar copy={copy} />
          </div>
          {renderLitepaperBlocks(rest)}
        </>
      );
    }
    case "roadmap": {
      const { lead, rest } = splitLeadParagraph(blocks);
      return (
        <>
          {lead ? renderLitepaperBlocks([lead]) : null}
          <div className="mt-6">
            <RoadmapTimeline copy={copy} />
          </div>
          <div className="mt-6">{renderLitepaperBlocks(rest)}</div>
        </>
      );
    }
    case "differ": {
      const { before, table, after } = extractFirstTable(blocks);
      return (
        <>
          {renderLitepaperBlocks(before)}
          {table ? (
            <div className="mt-6">
              <DifferTable copy={copy} lang={lang} />
            </div>
          ) : null}
          <div className="mt-6">{renderLitepaperBlocks(after)}</div>
        </>
      );
    }
    default:
      return renderLitepaperBlocks(blocks);
  }
}

function DownloadCard({
  t,
  whitepaperAvailable,
  versionLine,
}: {
  t: LitepaperCopy;
  whitepaperAvailable: boolean;
  versionLine: string;
}) {
  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">{t.downloadTitle}</p>
      <p className="mt-1 text-xs tabular-nums text-ink-3" data-testid="docs-download-version">
        {versionLine}
      </p>
      <p className="mt-2 text-sm text-ink-2">{t.downloadLead}</p>
      <div className="mt-4 flex flex-col gap-3">
        <a href={LITEOBER_PDF_HREF} className={`${WARM_PRIMARY_BTN} gap-2`} data-testid="litepaper-download-pdf">
          <Download className="h-4 w-4" aria-hidden="true" />
          {t.downloadPdfLabel}
        </a>
        {whitepaperAvailable ? (
          <div className="flex flex-col gap-1.5">
            <a
              href={WHITEPAPER_HREF}
              className={`${WARM_SECONDARY_BTN} gap-2`}
              data-testid="litepaper-download-whitepaper"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {t.downloadWhitepaperLabel}
            </a>
            <p className="px-1 text-xs leading-snug text-ink-3" data-testid="litepaper-whitepaper-lead">
              {t.downloadWhitepaperLead}
            </p>
          </div>
        ) : null}
        <a href={PROMO_KIT_HREF} className={`${WARM_SECONDARY_BTN} gap-2`}>
          <Download className="h-4 w-4" aria-hidden="true" />
          {t.downloadZipLabel}
        </a>
      </div>
    </>
  );
}

function ChangelogCard({ t }: { t: LitepaperCopy }) {
  const summaryFor = (key: (typeof DOCS_RELEASE.changelog)[number]["summaryKey"]) => {
    if (key === "initial") return t.changelogInitial;
    if (key === "agentLive") return t.changelogAgentLive;
    return key;
  };

  return (
    <section
      className="mt-2 rounded-2xl border border-line bg-surface p-5 shadow-[var(--elev-1)] sm:p-6"
      aria-labelledby="docs-changelog-title"
      data-testid="docs-changelog"
    >
      <h2 id="docs-changelog-title" className="text-sm font-semibold uppercase tracking-[0.1em] text-ink-3">
        {t.changelogTitle}
      </h2>
      <ul className="mt-4 space-y-3">
        {DOCS_RELEASE.changelog.map((entry) => (
          <li key={`${entry.version}-${entry.dateLabel}`} className="text-sm text-ink-2">
            <span className="font-semibold tabular-nums text-ink">
              {entry.version} · {entry.dateLabel}
            </span>
            <span className="text-ink-3"> — </span>
            <span>{summaryFor(entry.summaryKey)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
