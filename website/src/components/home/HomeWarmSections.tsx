"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { homeWarmCopy } from "@/lib/home-warm-content";
import { homePublic } from "@/lib/home-public-content";
import { SOCIAL_PROFILES } from "@/lib/social-profiles";
import { fetchHealth, type NetworkHealth } from "@/lib/network-client";
import { MODEL_A_FEE_SPLIT, TOKEN_COMMUNITY_SHARE_PCT } from "@/lib/selling-economics";
import { CommunityShareFlow } from "@/components/visuals/CommunityShareFlow";
import {
  CountUpNumber,
  PersonAvatar,
  WarmCard,
  WarmSection,
  WARM_SECONDARY_BTN,
  fill,
} from "@/components/warm/warm-ui";
import { HomeWalletCta } from "@/components/wallet/HomeWalletCta";

const SECTION_CTA =
  "mt-4 inline-flex text-sm font-semibold text-brand hover:underline";

const CARD_TINTS = [
  "bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-400/15 dark:text-violet-200",
];

const CARD_ICONS: ReactNode[] = [
  // coin / token
  <path key="coin" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-1.1A3.5 3.5 0 0 1 8.5 13h2a1.5 1.5 0 1 0 1.5-1.5 3.5 3.5 0 0 1-1-6.9V3.5h2v1.1A3.5 3.5 0 0 1 15.5 8h-2A1.5 1.5 0 1 0 12 9.5a3.5 3.5 0 0 1 1 6.9V17Z" />,
  // card / nft
  <path key="card" d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Zm3 3v3h4V8H7Zm6 0v1.5h4V8h-4Zm0 3.5V13h4v-1.5h-4ZM7 14v1.5h10V14H7Z" />,
  // growth / funding
  <path key="growth" d="M4 19h16v2H4v-2Zm2-4 4.5-5 3 3L19 6.5V11h2V4h-7v2h4.2l-4.7 5.2-3-3L4 15.5 5.5 16.5 6 15Z" />,
  // contract / code
  <path key="code" d="M8.7 15.9 4.8 12l3.9-3.9-1.4-1.4L2 12l5.3 5.3 1.4-1.4Zm6.6 0 3.9-3.9-3.9-3.9 1.4-1.4L22 12l-5.3 5.3-1.4-1.4Z" />,
];

/* ── 2. The 10% community share ──────────────────────────────────────────── */

/**
 * The 10% community block — the promise the whole design hangs on. The warm
 * redesign dropped it from the homepage, so it is restored here, high on the
 * page and stacked on mobile.
 *
 * The percentage comes from `TOKEN_COMMUNITY_SHARE_PCT` and the fee-split
 * figures in the footnote from `MODEL_A_FEE_SPLIT`; the diagram copy is the
 * already-translated text every locale has for the community pool.
 */
export function HomeWarmCommunity() {
  const { lang } = useLanguage();
  const t = homeWarmCopy(lang).community;
  const flow = homePublic[lang].visuals;
  const feePct = (id: string) => MODEL_A_FEE_SPLIT.find((row) => row.id === id)?.pct ?? 0;

  return (
    <WarmSection
      id="home-community"
      testId="home-warm-community"
      tone="canvas-2"
      eyebrow={t.eyebrow}
      title={t.title}
      lead={t.lead}
    >
      <div className="mt-8 grid gap-4 lg:grid-cols-[0.62fr_1.38fr] lg:items-stretch">
        <div className="flex flex-col justify-center rounded-[28px] border border-value/30 bg-surface p-6 text-center shadow-[var(--elev-1)]">
          <p className="font-mono text-6xl font-bold leading-none tabular-nums text-value sm:text-7xl">
            {TOKEN_COMMUNITY_SHARE_PCT}%
          </p>
          <p className="mt-4 text-sm font-semibold text-ink">{t.statLabel}</p>
          <p className="mt-2 text-xs text-ink-3">{t.statNote}</p>
        </div>
        <div className="min-w-0">
          <CommunityShareFlow copy={flow} />
        </div>
      </div>

      <p className="mt-4 text-sm text-ink-2">
        {fill(t.footnote, { community: feePct("community"), validators: feePct("validators") })}
      </p>
      <Link href={t.href} className={SECTION_CTA}>
        {t.cta} →
      </Link>
    </WarmSection>
  );
}

/* ── 3. What you can do without code ─────────────────────────────────────── */

export function HomeWarmBuild() {
  const { lang } = useLanguage();
  const t = homeWarmCopy(lang).build;

  return (
    <WarmSection
      id="home-build"
      testId="home-warm-build"
      eyebrow={t.eyebrow}
      title={t.title}
      lead={t.lead}
    >
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {t.cards.map((card, index) => (
          <li key={card.id}>
            <WarmCard className="flex flex-col">
              <span className={`grid h-12 w-12 place-items-center rounded-2xl ${CARD_TINTS[index % CARD_TINTS.length]}`}>
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
                  {CARD_ICONS[index % CARD_ICONS.length]}
                </svg>
              </span>
              <h3 className="mt-4 text-lg font-bold text-ink">{card.title}</h3>
              <p className="mt-2 flex-1 text-sm text-ink-2">{card.body}</p>
              <Link href={card.href} className={SECTION_CTA}>
                {t.cta} →
              </Link>
            </WarmCard>
          </li>
        ))}
      </ul>
    </WarmSection>
  );
}

/* ── 4. Why it's fair ────────────────────────────────────────────────────── */

export function HomeWarmFair() {
  const { lang } = useLanguage();
  const t = homeWarmCopy(lang).fair;

  return (
    <WarmSection
      id="home-fair"
      testId="home-warm-fair"
      eyebrow={t.eyebrow}
      title={t.title}
      lead={t.lead}
      center
    >
      <ul className="mx-auto mt-8 grid max-w-4xl gap-4 sm:grid-cols-3">
        {t.tiles.map((tile) => (
          <li key={tile.id}>
            <WarmCard className="text-center">
              <p className="font-mono text-4xl font-bold tabular-nums text-brand">{tile.stat}</p>
              <h3 className="mt-3 text-base font-bold leading-snug text-ink">{tile.title}</h3>
              <p className="mt-2 text-sm text-ink-2">{tile.body}</p>
            </WarmCard>
          </li>
        ))}
      </ul>
    </WarmSection>
  );
}

/* ── 7. Community AI agents ──────────────────────────────────────────────── */

const AGENT_ICONS: ReactNode[] = [
  // pay for real work
  <path key="pay" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-1.1A3.5 3.5 0 0 1 8.5 13h2a1.5 1.5 0 1 0 1.5-1.5 3.5 3.5 0 0 1-1-6.9V3.5h2v1.1A3.5 3.5 0 0 1 15.5 8h-2A1.5 1.5 0 1 0 12 9.5a3.5 3.5 0 0 1 1 6.9V17Z" />,
  // rules you vote on
  <path key="vote" d="M9 2h6l1 3H8l1-3ZM4 7h16v3H4V7Zm1 4h14v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V11Zm4 2v2h6v-2H9Z" />,
  // visible in explorer
  <path key="eye" d="M12 5c-5 0-9 4.5-9 7s4 7 9 7 9-4.5 9-7-4-7-9-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-2.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />,
  // built for groups
  <path key="group" d="M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20v-1.5C2 15.5 4.7 13 8 13s6 2.5 6 5.5V20H2Zm14.5 0v-1.5c0-1.9-.7-3.5-1.9-4.7.5-.1 1-.2 1.4-.2 3 0 5.5 2.2 5.5 4.9V20h-5Z" />,
];

export function HomeWarmAgents() {
  const { lang } = useLanguage();
  const t = homeWarmCopy(lang).agents;
  // Card copy stays exactly what the site already publishes for agents.
  const cards = homePublic[lang].agentsTeaser.cards;

  return (
    <WarmSection
      id="home-agents"
      testId="home-warm-agents"
      tone="canvas-2"
      eyebrow={t.eyebrow}
      title={t.title}
      lead={t.lead}
    >
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, index) => (
          <li key={card.title}>
            <WarmCard>
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand/10 text-brand">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                  {AGENT_ICONS[index % AGENT_ICONS.length]}
                </svg>
              </span>
              <h3 className="mt-4 text-base font-bold text-ink">{card.title}</h3>
              <p className="mt-2 text-sm text-ink-2">{card.body}</p>
            </WarmCard>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <Link href={t.href} className={WARM_SECONDARY_BTN}>
          {t.cta} →
        </Link>
      </div>
    </WarmSection>
  );
}

/* ── 6. Live network strip ───────────────────────────────────────────────── */

const NETWORK_POLL_MS = 30_000;

export function HomeWarmNetwork() {
  const { lang } = useLanguage();
  const t = homeWarmCopy(lang).network;
  const [health, setHealth] = useState<NetworkHealth | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const next = await fetchHealth();
    setHealth(next);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), NETWORK_POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  // Only real values are ever rendered; a failed read shows the explorer link alone.
  const height = health?.height && Number.isFinite(health.height) && health.height > 0 ? health.height : null;
  const chainId = health?.chainId?.trim() ? health.chainId : null;

  return (
    <section id="home-network" data-testid="home-warm-network" aria-labelledby="home-network-title">
      <div className="mx-auto max-w-6xl px-4 pb-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-line bg-surface px-5 py-5 shadow-[var(--elev-1)] sm:px-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">{t.eyebrow}</p>
              <h2 id="home-network-title" className="mt-2 text-xl font-bold text-ink">
                {t.title}
              </h2>
            </div>

            <dl className="flex flex-wrap items-center gap-x-8 gap-y-4">
              {height !== null ? (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">{t.blockHeight}</dt>
                  <dd className="mt-1 flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-value opacity-60 motion-reduce:hidden" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-value" />
                    </span>
                    <CountUpNumber
                      value={height}
                      lang={lang}
                      className="font-mono text-2xl font-bold text-ink"
                    />
                  </dd>
                </div>
              ) : null}
              {chainId ? (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">{t.chainLabel}</dt>
                  <dd className="mt-1 font-mono text-2xl font-bold tabular-nums text-ink">{chainId}</dd>
                </div>
              ) : null}
              <div>
                <Link href="/explorer" className="text-sm font-semibold text-brand hover:underline">
                  {t.explorer} →
                </Link>
              </div>
            </dl>
          </div>

          <p className="mt-4 text-xs text-ink-3">
            {!loaded ? t.collecting : height === null ? t.unavailable : t.note}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── 8. Final CTA + socials ──────────────────────────────────────────────── */

export function HomeWarmFinal() {
  const { lang } = useLanguage();
  const t = homeWarmCopy(lang).final;

  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pb-24 lg:px-8" data-testid="home-warm-final">
      <div className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#0369a1_0%,#4f46e5_60%,#f59e0b_140%)] px-6 py-10 text-white sm:px-12 sm:py-14">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" aria-hidden="true" />
        <div className="relative grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-bold leading-tight sm:text-4xl">{t.title}</h2>
            <p className="mt-3 text-base text-white/90">{t.body}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <HomeWalletCta
                label={t.ctaWallet}
                data-testid="home-footer-wallet-auth-cta"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 text-base font-semibold text-[#0369a1] transition hover:bg-amber-50"
              />
              <Link
                href="/explorer"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/40 px-6 text-base font-semibold text-white transition hover:bg-white/10"
              >
                {t.ctaExplore}
              </Link>
            </div>
          </div>

          <div className="rounded-3xl bg-canvas-2 p-5 text-ink">
            <p className="text-sm font-semibold">{t.socialLabel}</p>
            <ul className="mt-3 space-y-2">
              {SOCIAL_PROFILES.map((profile) => (
                <li key={profile.id}>
                  <a
                    href={profile.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 text-sm font-semibold text-ink transition hover:border-brand hover:text-brand"
                  >
                    {profile.label}
                    <span aria-hidden="true">↗</span>
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex -space-x-2" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <PersonAvatar key={i} index={i} className="warm-avatar-ring h-9 w-9 rounded-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
