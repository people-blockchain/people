"use client";

import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { hiwWarmCopy } from "@/lib/hiw-warm-content";
import { hiwPublic } from "@/lib/hiw-public-content";
import { SOCIAL_PROFILES } from "@/lib/social-profiles";
import { TOTAL_SUPPLY_PPL } from "@/lib/tokenomics";
import { useActiveStep } from "@/components/motion/useActiveStep";
import { Reveal } from "@/components/motion/Reveal";
import { HomeWalletCta } from "@/components/wallet/HomeWalletCta";
import {
  SectionHead,
  WARM_PRIMARY_BTN,
  WARM_SECONDARY_BTN,
  WARM_SECTION,
  WarmCard,
  WarmSection,
} from "@/components/warm/warm-ui";
import { CurveMini, FeeFlowDiagram, SupplyDonut, ValidatorTimeline } from "./HiwWarmVisuals";

const STEP_ICONS = [
  // wallet / key
  <path key="wallet" d="M4 6.5A2.5 2.5 0 0 1 6.5 4H18v3h1a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 17.5v-11ZM6.5 6a.5.5 0 0 0 0 1H16V6H6.5ZM16 12.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0Z" />,
  // person / check
  <path key="human" d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Zm-1.2 12.6-3.3-3.3 1.4-1.4 1.9 1.9 4.6-4.6 1.4 1.4-6 6Z" />,
  // rocket / launch
  <path key="launch" d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
];

/**
 * /how-it-works rebuilt in the /founders visual language: warm palette,
 * sentence-case section heads, cards and the site's shared reveal/count-up
 * motion. Every economic figure is imported from `lib/tokenomics.ts` or
 * `lib/selling-economics.ts`, never typed into copy.
 */
export function HiwWarm() {
  const { lang } = useLanguage();
  const c = hiwWarmCopy(lang);
  // Existing, already-translated fee labels — one per MODEL_A_FEE_SPLIT row.
  const rewards = hiwPublic[lang].blocks.find((block) => block.id === "rewards");
  const feeLabels =
    rewards && "feeSplit" in rewards ? (rewards.feeSplit ?? []).map((row) => row.label) : [];

  const steps = useActiveStep(c.steps.items.length, "-45% 0px -45% 0px");

  return (
    <div data-testid="hiw-warm-page">
      {/* 1. Hero */}
      <section className="relative overflow-hidden" data-testid="hiw-warm-hero">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_85%_8%,rgba(245,158,11,0.18),transparent_70%),radial-gradient(40%_34%_at_0%_25%,rgba(3,105,161,0.10),transparent_70%)] dark:bg-[radial-gradient(55%_45%_at_85%_8%,rgba(251,191,36,0.16),transparent_70%),radial-gradient(40%_34%_at_0%_25%,rgba(76,196,248,0.14),transparent_70%)]"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-6xl px-4 pb-6 pt-8 sm:px-6 sm:pt-14 lg:px-8">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">{c.hero.eyebrow}</p>
            <h1 className="mt-3 max-w-3xl text-[2rem] font-bold leading-[1.08] tracking-tight text-ink text-balance sm:text-5xl">
              {c.hero.title}
            </h1>
            <p className="mt-4 max-w-2xl text-base text-ink-2 sm:text-lg">{c.hero.lead}</p>
            <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink-2 shadow-[var(--elev-1)]">
              <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-value opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-value" />
              </span>
              {c.hero.testnetBadge}
            </p>
            <p className="mt-3 max-w-xl text-sm text-ink-2" data-testid="hiw-sale-note">
              {c.hero.saleNote}
            </p>
          </Reveal>
        </div>
      </section>

      {/* 2. Three steps */}
      <section id="hiw-steps" className={WARM_SECTION} aria-labelledby="hiw-steps-title" data-testid="hiw-warm-steps">
        <Reveal>
          <SectionHead eyebrow={c.steps.eyebrow} title={c.steps.title} lead={c.steps.lead} titleId="hiw-steps-title" />
        </Reveal>
        <ol className="mt-8 space-y-4">
          {c.steps.items.map((step, index) => (
            <li key={step.title} ref={steps.setStepRef(index)}>
              <Reveal delay={index * 90}>
                <div
                  className={`warm-step-card flex gap-4 rounded-3xl border border-line bg-surface p-5 sm:p-6 ${
                    steps.active >= index ? "is-on" : ""
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <span
                      className={`warm-step-node grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${
                        steps.active >= index ? "bg-brand text-brand-ink" : "bg-brand/10 text-brand"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
                        {STEP_ICONS[index % STEP_ICONS.length]}
                      </svg>
                    </span>
                    {index < c.steps.items.length - 1 ? (
                      <span className="hidden w-px flex-1 bg-line-strong sm:block" aria-hidden="true" />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-ink-3">0{index + 1}</p>
                    <h3 className="mt-1 text-lg font-bold text-ink">{step.title}</h3>
                    <p className="mt-2 text-sm text-ink-2">{step.body}</p>
                    <p className="mt-2 text-xs text-ink-3">{step.note}</p>
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      {/* 3. Supply */}
      <WarmSection
        id="hiw-supply"
        testId="hiw-warm-supply"
        tone="canvas-2"
        eyebrow={c.supply.eyebrow}
        title={c.supply.title}
        lead={c.supply.lead}
      >
        <Reveal>
          <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.1fr] lg:items-start">
            <div className="rounded-[28px] border border-line bg-surface p-6 shadow-[var(--elev-1)]">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">{c.supply.totalLabel}</p>
              <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-ink sm:text-4xl" data-testid="hiw-warm-total-supply">
                {TOTAL_SUPPLY_PPL.toLocaleString(lang)} <span className="text-brand">{c.supply.unit}</span>
              </p>
              <ul className="mt-5 space-y-3 text-sm text-ink-2">
                <li className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-value" aria-hidden="true" />
                  {c.supply.noNewCoins}
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warm" aria-hidden="true" />
                  {c.supply.year5}
                </li>
              </ul>
            </div>
            <SupplyDonut lang={lang} copy={c.supply} />
          </div>
        </Reveal>
      </WarmSection>

      {/* 4. Validators */}
      <WarmSection
        id="hiw-validators"
        testId="hiw-warm-validators"
        eyebrow={c.validators.eyebrow}
        title={c.validators.title}
        lead={c.validators.lead}
      >
        <div className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <Reveal>
            <WarmCard>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">{c.validators.poolLabel}</p>
              <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-ink">
                200,000,000 <span className="text-brand">{c.validators.unit}</span>
              </p>
              <p className="mt-3 text-sm font-semibold text-value">{c.validators.shareLabel}</p>
              <p className="mt-4 text-sm text-ink-2">{c.validators.feeNote}</p>
            </WarmCard>
          </Reveal>
          <Reveal delay={100}>
            <div className="rounded-[28px] border border-line bg-canvas-2 p-6">
              <p className="text-sm font-semibold text-ink">{c.validators.yearsLabel}</p>
              <div className="mt-4">
                <ValidatorTimeline lang={lang} copy={c.validators} />
              </div>
              <p className="mt-4 text-xs text-ink-3">{c.validators.scheduleNote}</p>
            </div>
          </Reveal>
        </div>
      </WarmSection>

      {/* 5. Where every fee goes */}
      <WarmSection
        id="hiw-fees"
        testId="hiw-warm-fees"
        tone="canvas-2"
        eyebrow={c.fees.eyebrow}
        title={c.fees.title}
        lead={c.fees.lead}
      >
        {/* One diagram only: the same six rows used to be listed again by a
            second donut block, so the split read as two consecutive copies. */}
        <Reveal>
          <div className="mx-auto mt-8 max-w-3xl">
            <FeeFlowDiagram copy={c.fees} labels={feeLabels} />
          </div>
        </Reveal>
      </WarmSection>

      {/* 6. Launch mechanics */}
      <WarmSection
        id="hiw-launch"
        testId="hiw-warm-launch"
        eyebrow={c.launch.eyebrow}
        title={c.launch.title}
        lead={c.launch.lead}
      >
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <ol className="space-y-4">
            {c.launch.points.map((point, index) => (
              <li key={point.title}>
                <Reveal delay={index * 90}>
                  <WarmCard className="flex gap-4 p-5 sm:p-6">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand/10 font-mono text-sm font-bold text-brand">
                      0{index + 1}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-ink">{point.title}</h3>
                      <p className="mt-2 text-sm text-ink-2">{point.body}</p>
                    </div>
                  </WarmCard>
                </Reveal>
              </li>
            ))}
          </ol>
          <Reveal delay={120}>
            <CurveMini copy={c.launch} />
          </Reveal>
        </div>
      </WarmSection>

      {/* 7. Million Founders */}
      <WarmSection
        id="hiw-founders"
        testId="hiw-warm-founders"
        tone="canvas-2"
        eyebrow={c.founders.eyebrow}
        title={c.founders.title}
        lead={c.founders.lead}
      >
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {c.founders.bullets.map((line, index) => (
            <li key={line}>
              <Reveal delay={index * 80}>
                <WarmCard>
                  <p className="text-sm text-ink-2">{line}</p>
                </WarmCard>
              </Reveal>
            </li>
          ))}
        </ul>
        <Reveal>

          <Link href={c.founders.href} className={`${WARM_PRIMARY_BTN} mt-6 w-full sm:w-auto`} data-testid="hiw-warm-founders-cta">
            {c.founders.cta}
          </Link>
        </Reveal>
      </WarmSection>

      {/* 8. FAQ */}
      <section id="hiw-faq" className={WARM_SECTION} aria-labelledby="hiw-faq-title" data-testid="hiw-warm-faq">
        <Reveal>
          <SectionHead eyebrow={c.faq.eyebrow} title={c.faq.title} titleId="hiw-faq-title" />
        </Reveal>
        <div className="mt-8 divide-y divide-line rounded-3xl border border-line bg-surface">
          {c.faq.items.map((item) => (
            <details key={item.q} className="group px-5 py-4 sm:px-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-ink">
                {item.q}
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 transition group-open:rotate-45"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-ink-2">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-2 sm:px-6 sm:pb-24 lg:px-8" data-testid="hiw-warm-cta">
        <div className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#0369a1_0%,#4f46e5_60%,#f59e0b_140%)] px-6 py-10 text-white sm:px-12 sm:py-14">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" aria-hidden="true" />
          <div className="relative">
            <h2 className="text-3xl font-bold leading-tight sm:text-4xl">{c.cta.title}</h2>
            <p className="mt-3 max-w-xl text-base text-white/90">{c.cta.body}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <HomeWalletCta
                label={c.cta.ctaWallet}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 text-base font-semibold text-[#0369a1] transition hover:bg-amber-50"
              />
              <Link href="/create/token" className={`${WARM_SECONDARY_BTN} border-white/40 bg-transparent text-white hover:border-white hover:text-white`}>
                {c.cta.ctaCreate}
              </Link>
              <Link href="/docs#basics" className={`${WARM_SECONDARY_BTN} border-white/40 bg-transparent text-white hover:border-white hover:text-white`}>
                {c.cta.ctaDocs}
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/85">
              {SOCIAL_PROFILES.map((profile) => (
                <li key={profile.id}>
                  <a href={profile.href} target="_blank" rel="noreferrer noopener" className="hover:underline">
                    {profile.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
