"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { hub } from "@/lib/hub-content";
import { Chip } from "@/components/ui/primitives";
import { DisclosurePanel } from "@/components/ui/DisclosurePanel";
import { HScroll, HScrollItem } from "@/components/ui/HScroll";
import { HubSection } from "@/components/hub/HubSection";
import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";
import { ProtocolInvariants } from "@/components/ProtocolInvariants";
import { PhaseTimeline } from "@/components/PhaseTimeline";

export function HubHome() {
  const { lang } = useLanguage();
  const t = hub[lang];
  const why = content[lang].why;
  const audiences = content[lang].audiences;

  const barTone: Record<string, string> = {
    brand: "bg-brand",
    value: "bg-value",
    violet: "bg-violet",
    warm: "bg-warm",
    neutral: "bg-ink-3",
  };

  return (
    <>
      <HubSection
        id={t.whatIs.id}
        extraIds={["concept"]}
        eyebrow={t.whatIs.tag}
        title={t.whatIs.title}
        lead={t.whatIs.summary}
        canvas="canvas-2"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {t.whatIs.items.map((item) => (
            <DisclosurePanel key={item.id} title={item.title}>
              <p>{item.summary}</p>
            </DisclosurePanel>
          ))}
        </div>
        <div className="mt-4">
          <DisclosurePanel title={t.whatIs.whyTitle}>
            <ul className="space-y-3">
              {why.pillars.map((pillar) => (
                <li key={pillar.title}>
                  <p className="font-semibold text-ink">{pillar.title}</p>
                  <p className="mt-1 text-sm text-ink-2">{pillar.desc}</p>
                </li>
              ))}
            </ul>
          </DisclosurePanel>
        </div>
      </HubSection>

      <HubSection
        id={t.whatCanIDo.id}
        extraIds={["audiences"]}
        eyebrow={t.whatCanIDo.tag}
        title={t.whatCanIDo.title}
        lead={t.whatCanIDo.subtitle}
      >
        <HScroll label={t.whatCanIDo.title} className="sm:grid-cols-2 lg:grid-cols-5">
          {t.whatCanIDo.cards.map((card) => (
            <HScrollItem key={card.id}>
              <a
                href={card.href}
                className="surface-elevated flex h-full flex-col rounded-2xl p-4 transition-colors hover:border-line-strong"
              >
                <span className="mono-label text-brand">{card.title}</span>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{card.summary}</p>
              </a>
            </HScrollItem>
          ))}
        </HScroll>
        <div className="mt-4">
          <DisclosurePanel title={t.whatIs.learnMore}>
            <ul className="grid gap-4 md:grid-cols-3">
              {audiences.cards.map((card) => (
                <li key={card.role} className="border-t border-line pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{card.role}</p>
                  <p className="mt-1 font-semibold text-ink">{card.headline}</p>
                  <p className="mt-2 text-sm text-ink-2">{card.desc}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-ink-2">
                    {card.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </DisclosurePanel>
        </div>
      </HubSection>

      <HubSection
        id={t.flow.id}
        extraIds={["how-it-works-teaser"]}
        eyebrow={t.flow.tag}
        title={t.flow.title}
        lead={t.flow.subtitle}
        canvas="canvas-2"
      >
        <HScroll label={t.flow.title} className="sm:grid-cols-3 lg:grid-cols-6">
          {t.flow.steps.map((step, index) => (
            <HScrollItem key={step.id}>
              <div className="surface-elevated h-full rounded-2xl p-4">
                <span className="mono-label text-ink-3">{String(index + 1).padStart(2, "0")}</span>
                <h3 className="mt-2 text-sm font-bold text-ink">{step.title}</h3>
                <p className="mt-1 text-sm text-ink-2">{step.summary}</p>
                <div className="mt-3">
                  <DisclosurePanel title={t.whatIs.learnMore}>
                    {step.detail}
                  </DisclosurePanel>
                </div>
              </div>
            </HScrollItem>
          ))}
        </HScroll>
        <Link
          href="/how-it-works"
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline"
        >
          {t.flow.storyCta}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </HubSection>

      <HubSection id={t.ppl.id} eyebrow={t.ppl.tag} title={t.ppl.title} lead={t.ppl.summary}>
        <HScroll label={t.ppl.title} className="sm:grid-cols-2 lg:grid-cols-4">
          {t.ppl.cards.map((card) => (
            <HScrollItem key={card.title}>
              <div className="surface-elevated h-full rounded-2xl p-4">
                <Chip tone="brand">{card.title}</Chip>
                <p className="mt-3 text-sm leading-relaxed text-ink-2">{card.body}</p>
              </div>
            </HScrollItem>
          ))}
        </HScroll>
        <p className="mt-4 text-xs leading-relaxed text-ink-3">{t.ppl.notMarket}</p>
      </HubSection>

      <HubSection
        id={t.network.id}
        eyebrow={t.network.tag}
        title={t.network.title}
        lead={t.network.summary}
        canvas="canvas-2"
      >
        <dl className="grid gap-3 sm:grid-cols-3">
          {t.network.facts.map((fact) => (
            <div key={fact.label} className="surface-elevated rounded-2xl p-4">
              <dt className="mono-label text-ink-3">{fact.label}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-ink">{fact.value}</dd>
            </div>
          ))}
        </dl>
        {t.network.caveat ? <p className="mt-4 text-xs text-ink-3">{t.network.caveat}</p> : null}
      </HubSection>

      <HubSection
        id={t.economics.id}
        eyebrow={t.economics.tag}
        title={t.economics.title}
        lead={t.economics.summary}
        tone="value"
      >
        <ol className="space-y-2">
          {t.economics.splits.map((row) => (
            <li key={row.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-ink">{row.label}</span>
                <span className="font-mono tabular-nums text-ink-2">{row.pct}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full rounded-full ${barTone[row.tone] ?? barTone.brand}`}
                  style={{ width: `${Math.max(row.pct, row.pct === 0 ? 0 : 2)}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-ink-2">{t.economics.growthNote}</p>
        <div className="mt-4">
          <DisclosurePanel title={t.economics.detailsTitle}>
            <p>{t.economics.detailsBody}</p>
            <Link
              href="/how-it-works"
              className="mt-3 inline-flex items-center gap-2 font-semibold text-brand hover:underline"
            >
              {t.economics.storyLink}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </DisclosurePanel>
        </div>
      </HubSection>

      <HubSection
        id={t.tokenMarket.id}
        eyebrow={t.tokenMarket.tag}
        title={t.tokenMarket.title}
        lead={t.tokenMarket.subtitle}
        tone="warm"
        canvas="canvas-2"
      >
        <HScroll label={t.tokenMarket.title} className="sm:grid-cols-2 lg:grid-cols-4">
          {t.tokenMarket.steps.map((step, index) => (
            <HScrollItem key={step.title}>
              <div className="surface-elevated h-full rounded-2xl p-4">
                <span className="mono-label text-warm">{String(index + 1).padStart(2, "0")}</span>
                <h3 className="mt-2 font-bold text-ink">{step.title}</h3>
                <p className="mt-2 text-sm text-ink-2">{step.body}</p>
              </div>
            </HScrollItem>
          ))}
        </HScroll>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/create/token"
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-ink"
          >
            {t.tokenMarket.createCta}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/create/nft"
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-5 py-3 text-sm font-medium text-ink-2"
          >
            {t.tokenMarket.nftCta}
          </Link>
          <Link
            href="/swap"
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-5 py-3 text-sm font-medium text-ink-2"
          >
            {t.tokenMarket.swapCta}
          </Link>
        </div>
        <div className="mt-4">
          <DisclosurePanel title={t.tokenMarket.expandTitle}>
            <ul className="list-disc space-y-2 pl-4">
              {t.tokenMarket.expandItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </DisclosurePanel>
        </div>
      </HubSection>

      <HubSection
        id={t.technology.id}
        extraIds={["architecture", "invariants"]}
        eyebrow={t.technology.tag}
        title={t.technology.title}
        lead={t.technology.subtitle}
      >
        <HScroll label={t.technology.title} className="sm:grid-cols-2 lg:grid-cols-3">
          {t.technology.cards.map((card) => (
            <HScrollItem key={card.title}>
              <div className="surface-elevated h-full rounded-2xl p-4">
                <h3 className="text-sm font-bold text-ink">{card.title}</h3>
                <p className="mt-2 text-sm text-ink-2">{card.summary}</p>
              </div>
            </HScrollItem>
          ))}
        </HScroll>
        <div className="mt-4 space-y-3">
          <DisclosurePanel title={t.technology.archTitle}>
            <ArchitectureDiagram embedded />
          </DisclosurePanel>
          <DisclosurePanel title={t.technology.invTitle}>
            <ProtocolInvariants embedded />
          </DisclosurePanel>
        </div>
      </HubSection>

      <HubSection
        id={t.roadmap.id}
        extraIds={["phase-1", "phase-2", "phase-3"]}
        eyebrow={t.roadmap.tag}
        title={t.roadmap.title}
        lead={t.roadmap.subtitle}
        canvas="canvas-2"
      >
        <HScroll label={t.roadmap.title} className="sm:grid-cols-2 lg:grid-cols-4">
          {t.roadmap.columns.map((col) => (
            <HScrollItem key={col.id}>
              <div className="surface-elevated h-full rounded-2xl p-4">
                <Chip tone={col.id === "current" ? "value" : col.id === "future" ? "warm" : "neutral"}>
                  {col.title}
                </Chip>
                <ul className="mt-3 space-y-2 text-sm text-ink-2">
                  {col.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </HScrollItem>
          ))}
        </HScroll>
        <div className="mt-4">
          <DisclosurePanel title={t.whatIs.learnMore}>
            <PhaseTimeline embedded />
          </DisclosurePanel>
        </div>
      </HubSection>

      <HubSection
        id={t.documentation.id}
        extraIds={["specifications"]}
        eyebrow={t.documentation.tag}
        title={t.documentation.title}
        lead={t.documentation.summary}
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {t.documentation.links.map((link) => (
            <li key={link.label}>
              {link.href.startsWith("/") ? (
                <Link
                  href={link.href}
                  className="surface-elevated flex h-full flex-col rounded-2xl p-4 hover:border-line-strong"
                >
                  <span className="font-semibold text-ink">{link.label}</span>
                  <span className="mt-1 text-sm text-ink-2">{link.hint}</span>
                </Link>
              ) : (
                <a
                  href={link.href}
                  className="surface-elevated flex h-full flex-col rounded-2xl p-4 hover:border-line-strong"
                >
                  <span className="font-semibold text-ink">{link.label}</span>
                  <span className="mt-1 text-sm text-ink-2">{link.hint}</span>
                </a>
              )}
            </li>
          ))}
        </ul>
      </HubSection>
    </>
  );
}
