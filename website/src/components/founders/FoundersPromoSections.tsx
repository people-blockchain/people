"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { FoundersPromoCopy } from "@/lib/founders-promo-content";
import {
  EARLY_MULTIPLIER_TIER_1,
  EARLY_MULTIPLIER_TIER_2,
  EARLY_MULTIPLIER_TIER_3,
  EARLY_TIER_1_MAX,
  EARLY_TIER_2_MAX,
  EARLY_TIER_3_MAX,
} from "@/lib/founders/config";
import {
  REFERRAL_EXTRA_POINTS,
  REFERRAL_INSTANT_UNLOCK_BPS,
  REFERRAL_L1_POINTS,
  REFERRAL_L2_BPS,
  REFERRAL_MAX_ACTIVE_INVITEES,
  REFERRAL_SEASON_1_POOL_PPL,
  REFERRAL_STAY_ACTIVE_DAYS,
  REFERRAL_VEST_WEEKS,
} from "@/lib/founders/referral";
import { countryFlagEmoji } from "@/lib/founders/countries";
import { Reveal } from "@/components/motion/Reveal";
import { CheckIcon, CountUpNumber, PersonAvatar, SectionHead, fill } from "./founders-ui";

export type ReferralPool = { seasonPoolPpl: number; spentPpl: number; remainingPpl: number };
export type CountryRow = { countryCode: string; founderCount: number };

const SECTION = "mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8";

/* ── 2. Season 1 pool ─────────────────────────────────────────────────────── */

export function PoolSection({
  t,
  lang,
  pool,
}: {
  t: FoundersPromoCopy;
  lang: string;
  pool: ReferralPool | null;
}) {
  const total = pool?.seasonPoolPpl ?? REFERRAL_SEASON_1_POOL_PPL;
  const spentPct = pool && total > 0 ? Math.min(100, Math.max(0, (pool.spentPpl / total) * 100)) : 0;
  return (
    <section className={SECTION} aria-labelledby="founders-pool-title" data-testid="founders-pool">
      <Reveal>
        <div className="rounded-[28px] border border-line bg-surface p-6 shadow-[var(--elev-1)] sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">{t.poolEyebrow}</p>
          <h2 id="founders-pool-title" className="mt-2 font-mono text-3xl font-bold tabular-nums text-ink sm:text-6xl">
            {total.toLocaleString(lang)} <span className="text-brand">PPL</span>
          </h2>
          <p className="mt-3 text-base font-medium text-ink-2">{t.poolNoNewCoins}</p>
          {pool ? (
            <div className="mt-6" data-testid="founders-pool-bar">
              <div
                className="h-4 overflow-hidden rounded-full bg-surface-2"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(spentPct)}
                aria-label={t.poolSpent}
              >
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,var(--c-warm),var(--c-brand))] transition-[width] duration-1000"
                  style={{ width: `${spentPct}%` }}
                />
              </div>
              <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm">
                <span className="text-ink-3">
                  {t.poolSpent}:{" "}
                  <span className="font-mono font-semibold text-ink">
                    <CountUpNumber value={Math.round(pool.spentPpl)} lang={lang} /> PPL
                  </span>
                </span>
                <span className="text-ink-3">
                  {t.poolRemaining}:{" "}
                  <span className="font-mono font-semibold text-ink">
                    <CountUpNumber value={Math.round(pool.remainingPpl)} lang={lang} /> PPL
                  </span>
                </span>
              </div>
              {pool.remainingPpl <= 0 ? <p className="mt-2 text-sm text-warm">{t.poolEmpty}</p> : null}
            </div>
          ) : (
            <p className="mt-4 text-xs text-ink-3">{t.poolLiveHint}</p>
          )}
        </div>
      </Reveal>
    </section>
  );
}

/* ── 3. How it works ──────────────────────────────────────────────────────── */

const STEP_ICONS: ReactNode[] = [
  <path key="v" d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Zm-1.2 12.6-3.3-3.3 1.4-1.4 1.9 1.9 4.6-4.6 1.4 1.4-6 6Z" />,
  <path key="w" d="M4 6.5A2.5 2.5 0 0 1 6.5 4H18v3h1a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 17.5v-11ZM6.5 6a.5.5 0 0 0 0 1H16V6H6.5ZM16 12.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0Z" />,
  <path key="a" d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
];

export function HowSection({ t }: { t: FoundersPromoCopy }) {
  return (
    <section id="how" className={`${SECTION} scroll-mt-20`} aria-labelledby="founders-how-title" data-testid="founders-how">
      <Reveal>
        <SectionHead eyebrow={t.howEyebrow} title={t.howTitle} />
      </Reveal>
      <ol className="mt-8 grid gap-4 sm:grid-cols-3">
        {t.steps.map((step, i) => (
          <Reveal key={step.title} delay={i * 120}>
            <li className="relative h-full rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
                    {STEP_ICONS[i]}
                  </svg>
                </span>
                <span className="font-mono text-sm font-semibold text-ink-3">0{i + 1}</span>
              </div>
              <h3 className="mt-4 text-lg font-bold text-ink">{step.title}</h3>
              <p className="mt-2 text-sm text-ink-2">{step.body}</p>
            </li>
          </Reveal>
        ))}
      </ol>
      <Reveal>
        <p className="mt-6 rounded-2xl bg-amber-100/70 px-5 py-4 text-center text-base font-semibold text-ink dark:bg-amber-400/10 sm:text-lg">
          {t.inviteLine}
        </p>
      </Reveal>
    </section>
  );
}

/* ── 4. Levels tree ───────────────────────────────────────────────────────── */

function FlowConnector({ label, warm = false }: { label: string; warm?: boolean }) {
  return (
    <div className="flex items-center gap-4">
      <div className="founders-flow-line h-20 w-0.5 shrink-0 bg-line-strong" aria-hidden="true">
        {[0, 0.8, 1.6].map((d) => (
          <span key={d} className={`founders-flow-dot ${warm ? "is-warm" : ""}`} style={{ ["--d" as string]: `${d}s` }} />
        ))}
      </div>
      <p className={`text-sm font-semibold ${warm ? "text-warm" : "text-brand"}`}>{label}</p>
    </div>
  );
}

function TreeNode({ label, avatars, highlight = false }: { label: string; avatars: number[]; highlight?: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-3 rounded-full border px-4 py-2 shadow-[var(--elev-1)] ${
        highlight ? "border-brand/40 bg-brand text-brand-ink" : "border-line bg-surface text-ink"
      }`}
    >
      <span className="flex -space-x-2">
        {avatars.map((a) => (
          <PersonAvatar key={a} index={a} className="warm-avatar-ring h-9 w-9 rounded-full" />
        ))}
      </span>
      <span className="text-sm font-bold">{label}</span>
    </div>
  );
}

export function LevelsSection({ t }: { t: FoundersPromoCopy }) {
  return (
    <section className={SECTION} aria-labelledby="founders-levels-title" data-testid="founders-levels">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <Reveal>
          <SectionHead eyebrow={t.levelsEyebrow} title={t.levelsTitle} lead={t.levelsTagline} />
        </Reveal>
        <Reveal>
          <div className="rounded-[28px] border border-line bg-canvas-2 p-6 sm:p-8">
            <div className="flex flex-col items-start">
              <TreeNode label={t.levelYou} avatars={[0]} highlight />
              <div className="pl-8">
                <FlowConnector label={fill(t.levelL1, { pts: REFERRAL_L1_POINTS })} />
              </div>
              <TreeNode label={t.levelFriend} avatars={[1]} />
              <div className="pl-8">
                <FlowConnector warm label={fill(t.levelL2, { pct: REFERRAL_L2_BPS / 100 })} />
              </div>
              <TreeNode label={t.levelFriendsFriends} avatars={[2, 3, 4]} />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ── 5. gPPL governance ───────────────────────────────────────────────────── */

export function GovSection({ t }: { t: FoundersPromoCopy }) {
  return (
    <section className={SECTION} aria-labelledby="founders-gppl-title" data-testid="founders-gppl">
      <Reveal>
        <SectionHead eyebrow={t.gpplEyebrow} title={t.gpplTitle} />
      </Reveal>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {t.gppl.map((item, i) => (
          <Reveal key={item.title} delay={i * 100}>
            <div className="h-full rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
              <h3 className="text-lg font-bold text-ink">{item.title}</h3>
              <p className="mt-2 text-sm text-ink-2">{item.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal>
        <p className="mt-6 rounded-2xl border border-brand/25 bg-brand/5 px-5 py-4 text-center text-sm font-medium text-ink">
          {t.gpplNote}
        </p>
      </Reveal>
    </section>
  );
}

/* ── 6. Who counts as active ──────────────────────────────────────────────── */

export function ActiveSection({ t }: { t: FoundersPromoCopy }) {
  const chips = [
    fill(t.bonusStay, { pts: REFERRAL_EXTRA_POINTS.stay_7d, days: REFERRAL_STAY_ACTIVE_DAYS }),
    fill(t.bonusSale, { pts: REFERRAL_EXTRA_POINTS.sale_buy }),
    fill(t.bonusAirdrop, { pts: REFERRAL_EXTRA_POINTS.airdrop_join }),
  ];
  return (
    <section className={SECTION} aria-labelledby="founders-active-title" data-testid="founders-active">
      <Reveal>
        <SectionHead eyebrow={t.activeEyebrow} title={t.activeTitle} />
      </Reveal>
      <div className="mt-8 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Reveal>
          <div className="h-full rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
            <ul className="space-y-3">
              {t.activeChecklist.map((item) => (
                <li key={item} className="flex items-start gap-3 text-base font-medium text-ink">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-value text-brand-ink">
                    <CheckIcon />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-ink-3">{t.activeActionsHint}</p>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="flex h-full flex-col justify-center rounded-3xl border-2 border-dashed border-warm/40 bg-amber-50 p-6 text-center dark:bg-amber-400/10">
            <p className="font-mono text-3xl font-bold text-warm">{t.signupZero}</p>
          </div>
        </Reveal>
      </div>
      <Reveal>
        <h3 className="mt-8 text-base font-semibold text-ink">{t.bonusTitle}</h3>
        <ul className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <li key={c} className="rounded-full border border-brand/25 bg-brand/5 px-4 py-2 text-sm font-medium text-ink">
              {c}
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}

/* ── 7. What friends can build ────────────────────────────────────────────── */

const BUILD_TINTS = [
  "bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200",
];
const BUILD_ICONS: ReactNode[] = [
  <path key="t" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-1.1A3.5 3.5 0 0 1 8.5 13h2a1.5 1.5 0 1 0 1.5-1.5 3.5 3.5 0 0 1-1-6.9V3.5h2v1.1A3.5 3.5 0 0 1 15.5 8h-2A1.5 1.5 0 1 0 12 9.5a3.5 3.5 0 0 1 1 6.9V17Z" />,
  <path key="c" d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Zm4 2.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM11 9v1.5h7V9h-7Zm0 3.5V14h5v-1.5h-5ZM5 16v1.5h8V16H5Z" />,
  <path key="f" d="M12 21s-7.5-4.6-9.4-9.3C1.3 8.4 3.4 4.5 7.2 4.5c2 0 3.5 1.1 4.8 2.7 1.3-1.6 2.8-2.7 4.8-2.7 3.8 0 5.9 3.9 4.6 7.2C19.5 16.4 12 21 12 21Z" />,
];

export function BuildSection({ t }: { t: FoundersPromoCopy }) {
  return (
    <section className={SECTION} aria-labelledby="founders-build-title" data-testid="founders-build">
      <Reveal>
        <SectionHead eyebrow={t.buildEyebrow} title={t.buildTitle} />
      </Reveal>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {t.build.map((item, i) => (
          <Reveal key={item.title} delay={i * 100}>
            <div className="flex h-full flex-col rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
              <span className={`grid h-12 w-12 place-items-center rounded-2xl ${BUILD_TINTS[i % BUILD_TINTS.length]}`}>
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
                  {BUILD_ICONS[i % BUILD_ICONS.length]}
                </svg>
              </span>
              <h3 className="mt-4 text-lg font-bold text-ink">{item.title}</h3>
              <p className="mt-2 flex-1 text-sm text-ink-2">{item.body}</p>
              <Link href={item.href} className="mt-4 text-sm font-semibold text-brand hover:underline">
                {item.cta} →
              </Link>
            </div>
          </Reveal>
        ))}
      </div>
      <div className="mt-6">
        <Link
          href="/create"
          className="inline-flex min-h-11 items-center rounded-full border border-line-strong bg-surface px-5 text-sm font-semibold text-ink hover:border-brand hover:text-brand"
        >
          {t.buildTestnet} →
        </Link>
      </div>
    </section>
  );
}

/* ── 8. Early-entry ranks (from config.ts) ────────────────────────────────── */

export function RanksSection({ t, lang }: { t: FoundersPromoCopy; lang: string }) {
  const tiers = [
    { from: 1, to: EARLY_TIER_1_MAX, x: EARLY_MULTIPLIER_TIER_1 },
    { from: EARLY_TIER_1_MAX + 1, to: EARLY_TIER_2_MAX, x: EARLY_MULTIPLIER_TIER_2 },
    { from: EARLY_TIER_2_MAX + 1, to: EARLY_TIER_3_MAX, x: EARLY_MULTIPLIER_TIER_3 },
  ];
  return (
    <section className={SECTION} aria-labelledby="founders-ranks-title" data-testid="founders-ranks">
      <Reveal>
        <SectionHead eyebrow={t.ranksEyebrow} title={t.ranksTitle} lead={t.ranksHint} />
      </Reveal>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {tiers.map((tier, i) => (
          <Reveal key={tier.from} delay={i * 100}>
            <div
              className={`rounded-3xl border p-6 ${
                i === 0
                  ? "border-brand/30 bg-[linear-gradient(140deg,#e0f2fe,#fef3c7)] dark:bg-[linear-gradient(140deg,rgba(76,196,248,0.16),rgba(251,191,36,0.14))]"
                  : "border-line bg-surface"
              }`}
            >
              <p className="font-mono text-5xl font-bold text-brand">×{tier.x}</p>
              <p className="mt-3 text-sm font-medium text-ink-2">
                {fill(t.ranksRange, { from: tier.from.toLocaleString(lang), to: tier.to.toLocaleString(lang) })}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ── 9. Fair by design ────────────────────────────────────────────────────── */

export function FairSection({ t }: { t: FoundersPromoCopy }) {
  const instant = REFERRAL_INSTANT_UNLOCK_BPS / 100;
  const vars = { instant, rest: 100 - instant, weeks: REFERRAL_VEST_WEEKS, max: REFERRAL_MAX_ACTIVE_INVITEES };
  return (
    <section className={SECTION} aria-labelledby="founders-fair-title" data-testid="founders-fair">
      <Reveal>
        <SectionHead eyebrow={t.fairEyebrow} title={t.fairTitle} />
      </Reveal>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {t.fair.map((item, i) => (
          <Reveal key={item.title} delay={i * 80}>
            <div className="h-full rounded-3xl border border-line bg-surface p-6">
              <p className="text-lg font-bold leading-snug text-ink">{fill(item.title, vars)}</p>
              <p className="mt-2 text-sm text-ink-2">{fill(item.body, vars)}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ── 10. Countries ─────────────────────────────────────────────────────────── */

export function CountriesSection({
  t,
  lang,
  countries,
  countryName,
  onClaim,
}: {
  t: FoundersPromoCopy;
  lang: string;
  countries: CountryRow[] | null;
  countryName: (code: string) => string;
  /** Logged-out visitors start Web3Auth from here; founders get no CTA. */
  onClaim: (() => void) | null;
}) {
  const rows = (countries ?? []).slice(0, 10);
  const max = Math.max(1, ...rows.map((r) => r.founderCount));
  return (
    <section className={SECTION} aria-labelledby="founders-countries-title" data-testid="founders-countries">
      <Reveal>
        <SectionHead eyebrow={t.countriesEyebrow} title={t.countriesTitle} lead={t.countriesHint} />
      </Reveal>
      <Reveal>
        {rows.length ? (
          <ol className="mt-8 grid gap-3 md:grid-cols-2">
            {rows.map((row, index) => (
              <li key={row.countryCode} className="rounded-2xl border border-line bg-surface px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="font-mono text-xs text-ink-3">#{index + 1}</span>
                    <span className="truncate font-medium text-ink">
                      {countryFlagEmoji(row.countryCode)} {countryName(row.countryCode)}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-ink-2">
                    {fill(t.countriesCount, { count: row.founderCount.toLocaleString(lang) })}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,var(--c-brand),var(--c-warm))]"
                    style={{ width: `${(row.founderCount / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-8 flex flex-col items-center rounded-[28px] border-2 border-dashed border-line-strong bg-surface px-6 py-10 text-center">
            <span className="flex -space-x-3" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <PersonAvatar key={i} index={i} className="warm-avatar-ring-lg h-12 w-12 rounded-full" />
              ))}
            </span>
            <p className="mt-5 text-xl font-bold text-ink" data-testid="founders-countries-empty">
              {t.countriesEmpty}
            </p>
            <p className="mt-2 text-sm text-ink-2">{t.countriesEmptyHint}</p>
            {onClaim ? (
              <button
                type="button"
                onClick={onClaim}
                className="mt-5 inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-brand-ink"
              >
                {t.ctaClaim}
              </button>
            ) : null}
          </div>
        )}
      </Reveal>
    </section>
  );
}

/* ── 11. FAQ ──────────────────────────────────────────────────────────────── */

export function FaqSection({ t, children }: { t: FoundersPromoCopy; children?: ReactNode }) {
  return (
    <section className={SECTION} aria-labelledby="founders-faq-title" data-testid="founders-faq">
      <Reveal>
        <SectionHead eyebrow={t.faqEyebrow} title={t.faqTitle} />
      </Reveal>
      <div className="mt-8 divide-y divide-line rounded-3xl border border-line bg-surface">
        {t.faq.map((item) => (
          <details key={item.q} className="group px-5 py-4 sm:px-6">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-ink">
              {item.q}
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 transition group-open:rotate-45" aria-hidden="true">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm text-ink-2">{item.a}</p>
          </details>
        ))}
      </div>
      {children}
    </section>
  );
}
