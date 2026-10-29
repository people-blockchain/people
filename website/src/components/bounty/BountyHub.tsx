"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Bug, Check, Gift, Trophy, Users } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { bountyCopy } from "@/lib/bounty-content";
import { pplSaleCountdown, resolvePplSaleOpenDate } from "@/lib/bounty-countdown";
import { FOUNDER_ACTION_CONFIG, type FounderActionType } from "@/lib/founders/config";
import {
  REFERRAL_INSTANT_UNLOCK_BPS,
  REFERRAL_L1_POINTS,
  REFERRAL_L2_BPS,
  REFERRAL_SEASON_1_POOL_PPL,
  REFERRAL_VEST_WEEKS,
} from "@/lib/founders/referral";
import { GENESIS_ALLOCATIONS } from "@/lib/tokenomics";
import {
  CountUpNumber,
  SectionHead,
  WARM_HERO_BTN,
  WARM_PRIMARY_BTN,
  WARM_SECONDARY_BTN,
  WARM_SECTION,
  WarmCtaLink,
  WarmSection,
  fill,
} from "@/components/warm/warm-ui";
import { Reveal } from "@/components/motion/Reveal";
import { FoundersApp } from "@/components/founders/FoundersApp";

type Me = {
  signedIn: boolean;
  founder: {
    founderNumber: number;
    totalPoints: number;
    verificationLevel: number;
  } | null;
};

type CommunityPayload = {
  counters: { verifiedPeople: number; countries: number };
  ambassadors: {
    founderNumber: number;
    walletShort: string;
    verifiedInvitees: number;
    ambassador: boolean;
    name: string | null;
    avatar: string | null;
  }[];
};

const POLL_MS = 60_000;

function formatNumber(value: number, lang: string): string {
  return value.toLocaleString(lang);
}

export function BountyHero() {
  const { lang } = useLanguage();
  const t = bountyCopy(lang);
  return (
    <section className="relative overflow-hidden" data-testid="bounty-hero">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(58%_50%_at_88%_6%,rgba(245,158,11,0.20),transparent_70%),radial-gradient(42%_36%_at_0%_22%,rgba(3,105,161,0.10),transparent_70%)] dark:bg-[radial-gradient(58%_50%_at_88%_6%,rgba(251,191,36,0.16),transparent_70%),radial-gradient(42%_36%_at_0%_22%,rgba(76,196,248,0.14),transparent_70%)]"
      />
      <div className={`${WARM_SECTION} relative`}>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-warm">{t.hero.eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-[2rem] font-bold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-[3.4rem]">
          {t.hero.title}
        </h1>
        <p className="mt-4 max-w-2xl text-base text-ink-2 sm:text-lg">{t.hero.lead}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a href="#earn" className={WARM_HERO_BTN}>
            {t.hero.ctaEarn}
          </a>
          <WarmCtaLink href="/buy" className={WARM_SECONDARY_BTN} testId="bounty-hero-buy">
            {t.hero.ctaSale}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </WarmCtaLink>
        </div>
        <p className="mt-4 max-w-2xl text-xs text-ink-3">{t.hero.disclaimer}</p>
      </div>
    </section>
  );
}

export function BountyCountdown() {
  const { lang } = useLanguage();
  const t = bountyCopy(lang).countdown;
  const target = useMemo(() => resolvePplSaleOpenDate(), []);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const parts = target && now !== null ? pplSaleCountdown(target, now) : null;
  const dateLabel =
    target === null
      ? null
      : new Intl.DateTimeFormat(lang, {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(target);

  const cells = parts
    ? [
        { label: t.days, value: parts.days },
        { label: t.hours, value: parts.hours },
        { label: t.minutes, value: parts.minutes },
        { label: t.seconds, value: parts.seconds },
      ]
    : [];

  return (
    <section className="bg-canvas-2" data-testid="bounty-countdown">
      <div className={WARM_SECTION}>
        <Reveal>
          <div className="rounded-[28px] border border-line bg-surface p-6 shadow-[var(--elev-1)] sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">{t.eyebrow}</p>
            <h2 className="mt-2 text-2xl font-bold leading-tight text-ink sm:text-3xl">{t.title}</h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-2 sm:text-base">{t.lead}</p>
            {target === null ? (
              <p className="mt-5 text-sm text-ink-2">{t.unavailable}</p>
            ) : (
              <>
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {cells.map((cell) => (
                    <div key={cell.label} className="rounded-2xl border border-line bg-canvas-2 px-4 py-3 text-center">
                      <p className="font-mono text-3xl font-bold tabular-nums text-ink sm:text-4xl">
                        {now === null ? "—" : String(cell.value).padStart(2, "0")}
                      </p>
                      <p className="mt-1 text-xs text-ink-3">{cell.label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-ink-3">
                    {t.dateLabel}: <span className="font-semibold text-ink-2">{dateLabel}</span>
                  </p>
                  {parts?.open ? (
                    <Link href="/buy" className={WARM_PRIMARY_BTN}>
                      {t.openCta}
                      <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                    </Link>
                  ) : null}
                </div>
                {parts?.open ? <p className="mt-2 text-sm font-semibold text-value">{t.open}</p> : null}
              </>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function BountyEarn() {
  return (
    <div id="earn" className="scroll-mt-24">
      <FoundersApp variant="bounty" />
    </div>
  );
}

export function BountyTasks() {
  const { lang } = useLanguage();
  const t = bountyCopy(lang).tasks;
  const items = bountyCopy(lang).taskItems;
  const [me, setMe] = useState<Me | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/founders/me", { cache: "no-store", credentials: "include" });
      if (!res.ok) return;
      setMe((await res.json()) as Me);
    } catch {
      /* the personal block stays hidden */
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <WarmSection id="bounty-tasks" eyebrow={t.eyebrow} title={t.title} lead={t.lead} testId="bounty-tasks">
      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Reveal>
          <div className="rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
            {me?.founder ? (
              <dl className="grid gap-4">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">{t.yourNumber}</dt>
                  <dd className="mt-1 font-mono text-3xl font-bold tabular-nums text-ink">
                    #{formatNumber(me.founder.founderNumber, lang)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">{t.yourPoints}</dt>
                  <dd className="mt-1 font-mono text-3xl font-bold tabular-nums text-brand">
                    <CountUpNumber value={me.founder.totalPoints} lang={lang} />
                  </dd>
                </div>
                {me.founder.verificationLevel < 1 ? (
                  <p className="rounded-2xl bg-warm/10 px-4 py-3 text-sm text-ink-2">{t.verification}</p>
                ) : null}
              </dl>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-ink-2">{t.notFounder}</p>
                <Link href={me?.signedIn ? "#claim" : "/wallet"} className={WARM_PRIMARY_BTN}>
                  {t.signIn}
                </Link>
              </div>
            )}
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className="rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
            <h3 className="text-base font-semibold text-ink">{t.tasksLabel}</h3>
            <ul className="mt-4 divide-y divide-line">
              {items.map((item) => {
                const config = FOUNDER_ACTION_CONFIG[item.id as FounderActionType];
                if (!config) return null;
                return (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{item.label}</p>
                        <p className="text-xs text-ink-3">
                          {config.basePoints} {t.points} · {t.dailyCap} {config.dailyCap}
                        </p>
                      </div>
                    </div>
                    <Link
                      href={item.href}
                      className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-line-strong bg-surface px-3 text-xs font-semibold text-ink transition hover:border-brand hover:text-brand"
                    >
                      {t.open}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </Reveal>
      </div>
    </WarmSection>
  );
}

export function BountyCommunity() {
  const { lang } = useLanguage();
  const t = bountyCopy(lang);
  const [payload, setPayload] = useState<CommunityPayload | null>(null);
  const [goal, setGoal] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [community, counter] = await Promise.all([
        fetch("/api/founders/transparency", { cache: "no-store" }).catch(() => null),
        fetch("/api/founders/million-counter", { cache: "no-store" }).catch(() => null),
      ]);
      if (!alive) return;
      if (community?.ok) {
        setPayload((await community.json()) as CommunityPayload);
      }
      if (counter?.ok) {
        const body = (await counter.json()) as { goal?: number; source?: string };
        if (body.source === "verified" && typeof body.goal === "number") setGoal(body.goal);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const counters = payload?.counters ?? null;
  const rows = payload?.ambassadors ?? [];

  if (!counters && rows.length === 0) return null;

  return (
    <WarmSection
      id="bounty-community"
      tone="canvas-2"
      eyebrow={t.stats.eyebrow}
      title={t.stats.title}
      lead={t.stats.lead}
      testId="bounty-community"
    >
      {counters ? (
        <Reveal>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--elev-1)]">
              <Users className="h-5 w-5 text-brand" aria-hidden="true" />
              <p className="mt-3 font-mono text-3xl font-bold tabular-nums text-ink">
                <CountUpNumber value={counters.verifiedPeople} lang={lang} />
              </p>
              <p className="mt-1 text-sm text-ink-2">{t.stats.verified}</p>
            </div>
            <div className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--elev-1)]">
              <Trophy className="h-5 w-5 text-warm" aria-hidden="true" />
              <p className="mt-3 font-mono text-3xl font-bold tabular-nums text-ink">
                <CountUpNumber value={counters.countries} lang={lang} />
              </p>
              <p className="mt-1 text-sm text-ink-2">{t.stats.countries}</p>
            </div>
            {goal !== null ? (
              <div className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--elev-1)]">
                <Gift className="h-5 w-5 text-value" aria-hidden="true" />
                <p className="mt-3 font-mono text-3xl font-bold tabular-nums text-ink">
                  <CountUpNumber value={goal} lang={lang} />
                </p>
                <p className="mt-1 text-sm text-ink-2">{t.stats.goal}</p>
              </div>
            ) : null}
          </div>
        </Reveal>
      ) : null}

      {rows.length > 0 ? (
        <Reveal delay={80}>
          <div className="mt-10">
            <SectionHead eyebrow={t.leaderboard.eyebrow} title={t.leaderboard.title} lead={t.leaderboard.lead} />
            <ol className="mt-6 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
              {rows.map((row, index) => (
                <li key={row.founderNumber} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="w-8 shrink-0 font-mono text-xs text-ink-3">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">
                        #{formatNumber(row.founderNumber, lang)}
                      </span>
                      {row.ambassador ? (
                        <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                          {t.leaderboard.ambassador}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-xs text-ink-3">{row.walletShort}</span>
                    {row.name ? <span className="block text-xs text-ink-2">{row.name}</span> : null}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-base font-bold tabular-nums text-ink">
                      {formatNumber(row.verifiedInvitees, lang)}
                    </span>
                    <span className="block text-[11px] text-ink-3">{t.leaderboard.invites}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      ) : null}
    </WarmSection>
  );
}

export function BountyReferral() {
  const { lang } = useLanguage();
  const t = bountyCopy(lang).referral;
  const [link, setLink] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [hasFounder, setHasFounder] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const meRes = await fetch("/api/founders/me", { cache: "no-store", credentials: "include" });
        const me = meRes.ok ? ((await meRes.json()) as Me) : null;
        if (!alive) return;
        setSignedIn(Boolean(me?.signedIn));
        setHasFounder(Boolean(me?.founder));
        if (me?.founder) {
          const referralRes = await fetch("/api/founders/referral", {
            cache: "no-store",
            credentials: "include",
          });
          if (referralRes.ok) {
            const referral = (await referralRes.json()) as { referralWallet?: string };
            if (alive && referral.referralWallet) {
              setLink(`${window.location.origin}/bounty?ref=${referral.referralWallet}`);
            }
          }
        }
      } catch {
        /* the personal link stays hidden */
      } finally {
        if (alive) setLoaded(true);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <WarmSection id="referral" eyebrow={t.eyebrow} title={t.title} lead={t.lead} testId="bounty-referral">
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Reveal>
          <div className="h-full rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">{t.l1}</p>
            <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-ink">
              {REFERRAL_L1_POINTS} <span className="text-base font-semibold text-ink-2">{t.points}</span>
            </p>
          </div>
        </Reveal>
        <Reveal delay={80}>
          <div className="h-full rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">{t.l2}</p>
            <p className="mt-2 text-xl font-semibold leading-snug text-ink">
              {fill(t.l2Value, { percent: `${REFERRAL_L2_BPS / 100}%` })}
            </p>
          </div>
        </Reveal>
        <Reveal delay={160}>
          <div className="h-full rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">{t.poolLabel}</p>
            <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-ink">
              {formatNumber(REFERRAL_SEASON_1_POOL_PPL, lang)}
              <span className="ml-1 text-base font-semibold text-ink-2">PPL</span>
            </p>
            <p className="mt-2 text-xs text-ink-3">
              {t.vestingLabel}:{" "}
              {fill(t.vestingValue, {
                instant: REFERRAL_INSTANT_UNLOCK_BPS / 100,
                weeks: REFERRAL_VEST_WEEKS,
              })}
            </p>
          </div>
        </Reveal>
      </div>

      <Reveal delay={120}>
        <div className="mt-4 rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
          <h3 className="text-base font-semibold text-ink">{t.yourLink}</h3>
          {link ? (
            <input
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
              className="mt-3 w-full rounded-xl border border-line bg-canvas-2 px-3 py-2.5 font-mono text-xs text-ink"
              aria-label={t.yourLink}
            />
          ) : (
            <p className="mt-2 text-sm text-ink-2">{loaded ? t.signIn : "…"}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            {hasFounder ? (
              <Link href="/partner" className={WARM_SECONDARY_BTN}>
                {t.cabinet}
              </Link>
            ) : (
              <Link href={signedIn ? "#claim" : "/wallet"} className={WARM_PRIMARY_BTN}>
                {t.signIn}
              </Link>
            )}
          </div>
          <p className="mt-4 text-xs text-ink-3">{t.growthNote}</p>
        </div>
      </Reveal>
    </WarmSection>
  );
}

export function BountyBounties() {
  const { lang } = useLanguage();
  const t = bountyCopy(lang).bounties;

  return (
    <WarmSection
      id="bounties"
      tone="canvas-2"
      eyebrow={t.eyebrow}
      title={t.title}
      lead={t.lead}
      testId="bounty-bounties"
    >
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Reveal>
          <div className="h-full rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
            <Bug className="h-6 w-6 text-warm" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-bold text-ink">{t.bugTitle}</h3>
            <p className="mt-2 text-sm text-ink-2">{t.bugBody}</p>
            <button
              type="button"
              onClick={() => document.getElementById("bug-report-fab")?.click()}
              className={`${WARM_SECONDARY_BTN} mt-5`}
            >
              {t.bugCta}
            </button>
          </div>
        </Reveal>
        <Reveal delay={80}>
          <div className="h-full rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
            <Gift className="h-6 w-6 text-brand" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-bold text-ink">{t.creatorTitle}</h3>
            <p className="mt-2 text-sm text-ink-2">{t.creatorBody}</p>
            <Link href="/create/token" className={`${WARM_PRIMARY_BTN} mt-5`}>
              {t.creatorCta}
            </Link>
          </div>
        </Reveal>
        <Reveal delay={160}>
          <div className="h-full rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
            <Users className="h-6 w-6 text-value" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-bold text-ink">{t.contentTitle}</h3>
            <p className="mt-2 text-sm text-ink-2">{t.contentBody}</p>
          </div>
        </Reveal>
      </div>
    </WarmSection>
  );
}

export function BountyTokenomics() {
  const { lang } = useLanguage();
  const t = bountyCopy(lang).tokenomics;
  const community = GENESIS_ALLOCATIONS.find((bucket) => bucket.id === "community");

  return (
    <WarmSection id="bounty-tokenomics" eyebrow={t.eyebrow} title={t.title} lead={t.lead} testId="bounty-tokenomics">
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Reveal>
          <div className="h-full rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">{t.communityLabel}</p>
            <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-ink">
              {community ? `${community.pct}% · ${formatNumber(community.amountPpl, lang)} PPL` : t.communityValue}
            </p>
            <p className="mt-2 text-sm text-ink-2">{t.communityNote}</p>
          </div>
        </Reveal>
        <Reveal delay={80}>
          <div className="h-full rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">{t.seasonLabel}</p>
            <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-ink">{t.seasonValue}</p>
          </div>
        </Reveal>
        <Reveal delay={160}>
          <div className="h-full rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">{t.vestingLabel}</p>
            <p className="mt-2 text-base font-semibold text-ink">{t.vestingValue}</p>
          </div>
        </Reveal>
        <Reveal delay={240}>
          <div className="h-full rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">{t.growthLabel}</p>
            <p className="mt-2 text-base font-semibold text-ink">{t.growthValue}</p>
          </div>
        </Reveal>
      </div>
      <Reveal delay={120}>
        <div className="mt-6">
          <Link href="/tokenomics" className={WARM_SECONDARY_BTN}>
            {t.sourceCta}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </Reveal>
    </WarmSection>
  );
}

export function BountyFinal() {
  const { lang } = useLanguage();
  const t = bountyCopy(lang).final;
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6 sm:pb-24 lg:px-8" data-testid="bounty-final">
      <div className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#0369a1_0%,#4f46e5_60%,#f59e0b_140%)] px-6 py-10 text-white sm:px-12 sm:py-14">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" aria-hidden="true" />
        <div className="relative max-w-2xl">
          <h2 className="text-3xl font-bold leading-tight sm:text-4xl">{t.title}</h2>
          <p className="mt-3 text-base text-white/90">{t.lead}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href="#earn"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 text-base font-semibold text-[#0369a1] transition hover:bg-amber-50"
            >
              {t.cta}
            </a>
            <Link
              href="/buy"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/40 px-6 text-base font-semibold text-white transition hover:bg-white/10"
            >
              {t.sale}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
