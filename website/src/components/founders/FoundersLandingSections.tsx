"use client";

import type { FoundersLandingCopy } from "@/lib/founders-landing-content";
import { Reveal } from "@/components/motion/Reveal";
import { CountUpNumber, PersonAvatar, SectionHead } from "./founders-ui";
import { FounderCard } from "./FounderCard";
import type { FoundersPromoCopy } from "@/lib/founders-promo-content";
import { FounderMosaicPlaceholder } from "./FounderMosaicPlaceholder";

const SECTION = "mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8";

const BUBBLES = [
  "left-[4%] top-[6%]",
  "right-[2%] top-[18%]",
  "left-[12%] bottom-[22%]",
  "right-[8%] bottom-[8%]",
];

export type MillionCounter = {
  current: number;
  goal: number;
  source?: string;
};

type HeroProps = {
  copy: FoundersLandingCopy;
  promo: FoundersPromoCopy;
  lang: string;
  counter: MillionCounter | null;
  onCta: () => void;
  countryBlock?: React.ReactNode;
};

export function FoundersMillionCounterBar({
  copy,
  lang,
  counter,
  className = "",
}: {
  copy: FoundersLandingCopy;
  lang: string;
  counter: MillionCounter | null;
  className?: string;
}) {
  const pct =
    counter && counter.goal > 0 && counter.current > 0
      ? Math.max(0.5, Math.min(100, (counter.current / counter.goal) * 100))
      : 0;

  return (
    <div className={className} data-testid="founders-million-counter">
      <div className="flex flex-col gap-4 rounded-3xl border border-line bg-surface/90 px-5 py-5 shadow-[var(--elev-1)] sm:flex-row sm:items-center sm:gap-6">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-value opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-value" />
          </span>
          <CountUpNumber
            value={counter?.current ?? 0}
            lang={lang}
            className="font-mono text-3xl font-bold tabular-nums text-ink sm:text-4xl"
          />
          <span className="text-sm text-ink-2">{copy.counterLabel}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--c-warm),var(--c-brand))]"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <p className="text-sm text-ink-3">
          {copy.counterGoal}:{" "}
          <span className="font-mono font-semibold text-ink">
            {(counter?.goal ?? 1_000_000).toLocaleString(lang)}
          </span>
        </p>
      </div>
      <p className="mt-2 text-center text-xs text-ink-3 sm:text-left">
        {counter?.source === "verified" ? copy.counterLive : copy.counterStub}
      </p>
    </div>
  );
}

export function FoundersLandingHero({
  copy,
  promo,
  lang,
  counter,
  onCta,
  countryBlock,
}: HeroProps) {
  return (
    <section className="relative overflow-hidden" data-testid="founders-hero">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_85%_10%,rgba(245,158,11,0.18),transparent_70%),radial-gradient(40%_35%_at_0%_25%,rgba(3,105,161,0.10),transparent_70%)] dark:bg-[radial-gradient(60%_50%_at_85%_10%,rgba(251,191,36,0.16),transparent_70%),radial-gradient(40%_35%_at_0%_25%,rgba(76,196,248,0.14),transparent_70%)]"
        aria-hidden="true"
      />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-6 pt-8 sm:px-6 sm:pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-12 lg:px-8 lg:pb-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">{copy.heroEyebrow}</p>
          <h1 className="mt-3 text-[2rem] font-bold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-[3.4rem]">
            {copy.heroTitle}
          </h1>
          <p className="mt-4 max-w-xl text-base text-ink-2 sm:text-lg">{copy.heroSub}</p>
          {countryBlock}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={onCta} className={primaryBtn} data-testid="founders-cta-claim">
              {copy.heroCta}
            </button>
            <a href="#tiers" className={secondaryBtn}>
              {copy.heroCtaHow}
            </a>
          </div>
          <p className="mt-4 max-w-xl text-xs text-ink-3" data-testid="founders-disclaimer">
            {copy.disclaimer}
          </p>
        </div>

        <div className="relative px-2 sm:px-10 sm:py-8">
          <div className="pointer-events-none absolute inset-0 hidden sm:block" aria-hidden="true">
            {BUBBLES.map((pos, i) => (
              <span
                key={pos}
                className={`founders-bubble absolute ${pos} z-10 inline-flex items-center gap-2 rounded-full border border-line bg-surface/95 py-1 pl-1 pr-3 text-xs font-semibold text-ink shadow-[var(--elev-1)]`}
                style={{ ["--d" as string]: `${i * 0.7}s` }}
              >
                <PersonAvatar index={i} className="h-7 w-7" />
                {promo.hello[i * 2 % promo.hello.length]}
              </span>
            ))}
          </div>
          <div className="founders-float">
            <FounderCard founder={null} t={promo} lang={lang} />
          </div>
        </div>
      </div>

      <div className="relative mx-auto max-w-6xl px-4 pb-10 sm:px-6 lg:px-8">
        <FoundersMillionCounterBar copy={copy} lang={lang} counter={counter} />
      </div>
    </section>
  );
}

export function FoundersNftSection({ copy }: { copy: FoundersLandingCopy }) {
  return (
    <section className={SECTION} aria-labelledby="founders-nft-title" data-testid="founders-nft">
      <Reveal>
        <SectionHead eyebrow={copy.nftEyebrow} title={copy.nftTitle} />
        <p className="mt-4 max-w-3xl text-base text-ink-2">{copy.nftBody}</p>
        <ul className="mt-6 space-y-3">
          {copy.nftBullets.map((line) => (
            <li key={line} className="flex gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-2">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}

export function FoundersTiersSection({ copy }: { copy: FoundersLandingCopy }) {
  return (
    <section
      id="tiers"
      className={`${SECTION} scroll-mt-20`}
      aria-labelledby="founders-tiers-title"
      data-testid="founders-tiers"
    >
      <Reveal>
        <SectionHead eyebrow={copy.tiersEyebrow} title={copy.tiersTitle} />
        <p className="mt-4 max-w-3xl text-base text-ink-2">{copy.tiersSub}</p>
      </Reveal>
      <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {copy.tiers.map((tier, i) => (
          <Reveal key={tier.name} delay={i * 80}>
            <li className="h-full rounded-3xl border border-line bg-surface p-5 shadow-[var(--elev-1)]">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-warm">{tier.name}</p>
              <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-ink">{tier.range}</p>
              <p className="mt-2 text-sm text-ink-2">{tier.note}</p>
            </li>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

export function FoundersSpecialSection({ copy }: { copy: FoundersLandingCopy }) {
  return (
    <section className={SECTION} aria-labelledby="founders-special-title" data-testid="founders-special">
      <Reveal>
        <SectionHead eyebrow={copy.specialEyebrow} title={copy.specialTitle} />
        <p className="mt-4 max-w-3xl text-base text-ink-2">{copy.specialBody}</p>
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[28px] border border-line bg-surface p-6 sm:p-8" data-testid="founders-special-list">
            <h3 className="text-lg font-semibold text-ink">{copy.specialListTitle}</h3>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
              {copy.specialList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm font-medium text-ink">{copy.specialFixedNote}</p>
          </div>
          <div className="rounded-[28px] border border-brand/20 bg-[linear-gradient(135deg,rgba(3,105,161,0.08),rgba(245,158,11,0.12))] p-6 sm:p-8" data-testid="founders-special-perks">
            <h3 className="text-lg font-semibold text-ink">{copy.specialPerksTitle}</h3>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
              {copy.specialPerks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-ink-2">{copy.specialPerksBody}</p>
            <p className="mt-2 text-sm font-medium text-ink">{copy.specialNamedBadge}</p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function FoundersSealSection({ copy }: { copy: FoundersLandingCopy }) {
  return (
    <section className={SECTION} aria-labelledby="founders-seal-title" data-testid="founders-seal">
      <Reveal>
        <SectionHead eyebrow={copy.sealEyebrow} title={copy.sealTitle} />
        <p className="mt-4 max-w-3xl text-base text-ink-2">{copy.sealBody}</p>
        <h3 className="mt-8 text-lg font-semibold text-ink">{copy.mosaicTitle}</h3>
        <p className="mt-1 text-sm text-ink-2">{copy.mosaicSub}</p>
        <FounderMosaicPlaceholder copy={copy} />
      </Reveal>
    </section>
  );
}

export function FoundersLandingFaq({ copy }: { copy: FoundersLandingCopy }) {
  return (
    <section className={SECTION} aria-labelledby="founders-faq-title" data-testid="founders-faq">
      <Reveal>
        <SectionHead eyebrow={copy.faqEyebrow} title={copy.faqTitle} />
      </Reveal>
      <div className="mt-8 divide-y divide-line rounded-3xl border border-line bg-surface">
        {copy.faq.map((item) => (
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
  );
}

export function FoundersLandingFinalCta({
  copy,
  onCta,
  showCta,
}: {
  copy: FoundersLandingCopy;
  onCta: () => void;
  showCta: boolean;
}) {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6 sm:pb-24 lg:px-8" data-testid="founders-final">
      <div className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#0369a1_0%,#4f46e5_60%,#f59e0b_140%)] px-6 py-10 text-white sm:px-12 sm:py-14">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" aria-hidden="true" />
        <div className="relative max-w-2xl">
          <h2 className="text-3xl font-bold leading-tight sm:text-4xl">{copy.finalTitle}</h2>
          <p className="mt-3 text-base text-white/90">{copy.finalSub}</p>
          {showCta ? (
            <button
              type="button"
              onClick={onCta}
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 text-base font-semibold text-[#0369a1] transition hover:bg-amber-50"
            >
              {copy.finalCta}
            </button>
          ) : null}
        </div>
        <p className="relative mt-8 text-xs text-white/80">{copy.disclaimer}</p>
      </div>
    </section>
  );
}

const primaryBtn =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-brand px-6 text-base font-semibold text-brand-ink shadow-[0_10px_30px_-12px_rgba(3,105,161,0.7)] transition hover:brightness-110";
const secondaryBtn =
  "inline-flex min-h-12 items-center justify-center rounded-full border border-line-strong bg-surface px-6 text-base font-semibold text-ink transition hover:border-brand hover:text-brand";
