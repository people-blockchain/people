"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import { useWalletModal } from "@/context/WalletModalContext";
import { foundersPublic } from "@/lib/founders-public-content";
import { foundersReferralCopy } from "@/lib/founders-referral-content";
import { foundersPromoCopy } from "@/lib/founders-promo-content";
import { decideAutoClaim, isIdempotentClaimSuccess } from "@/lib/founders/auto-claim";
import { detectBrowserCountryCode } from "@/lib/founders/country-detect";
import { persistCountryChoice, readPersistedCountryChoice } from "@/lib/founders/country-choice";
import { FOUNDER_COUNTRY_OPTIONS, countryFlagEmoji } from "@/lib/founders/countries";
import { getOrCreateFounderDeviceId } from "@/lib/founders/device-id";
import { formatPplPerPointEstimate } from "@/lib/founders/season-pool";
import { readStoredReferrer } from "@/lib/referral-ref";
import { FounderCard } from "./FounderCard";
import { FoundersPersonal, type DemoAirdropState, type ReferralStatus } from "./FoundersPersonal";
import {
  ActiveSection,
  BuildSection,
  CountriesSection,
  FairSection,
  FaqSection,
  GovSection,
  HowSection,
  LevelsSection,
  PoolSection,
  RanksSection,
} from "./FoundersPromoSections";
import { ShareButtons } from "./ShareButtons";
import { HumanPassportFlow } from "./HumanPassportFlow";
import { founderShareText, founderShareUrl } from "@/lib/founders-share-text";
import { CountUpNumber, PersonAvatar, fill } from "./founders-ui";

type Stats = {
  verifiedCount: number;
  goal: number;
  countries: { countryCode: string; founderCount: number }[];
  programPoolPpl: number;
  seasonPoolPpl: number;
  totalPoints: number;
  estimatedPplPerPoint: number | null;
};

type Me = {
  signedIn: boolean;
  userId?: string;
  verifiedHuman: boolean;
  founder: {
    founderNumber: number;
    countryCode: string;
    entryMultiplier: number;
    totalPoints: number;
    verificationLevel: number;
    /** Whether public lists (e.g. /transparency) may show this founder's name and avatar. */
    publicProfileOptIn: boolean;
    /** Separate wallet linked for Human Passport scoring, lowercase. Null when unlinked. */
    passportWallet: string | null;
    /** The wallet on the founder card; Human Passport falls back to it when none is linked. */
    walletAddress?: string;
  } | null;
  demoAirdrop?: DemoAirdropState;
};

/** The partner wallet link is fire-and-forget after sign-in; re-read `/me` a few times for it. */
const WALLET_LINK_RETRIES = 5;
const WALLET_LINK_RETRY_MS = 700;

/** Greeting bubbles around the hero card: positions for sm+ screens. */
const BUBBLES = [
  "left-0 top-6",
  "right-2 top-0",
  "-left-4 bottom-20",
  "right-0 bottom-10",
  "left-10 -bottom-2",
];

export function FoundersApp() {
  const { lang } = useLanguage();
  const base = foundersPublic[lang];
  const t = foundersPromoCopy(lang);
  const r = foundersReferralCopy(lang);
  const [stats, setStats] = useState<Stats | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [referral, setReferral] = useState<ReferralStatus | null>(null);
  const [referralError, setReferralError] = useState(false);
  const [countryCode, setCountryCode] = useState("GE");
  const [countryDetected, setCountryDetected] = useState(false);
  const [autoAttempted, setAutoAttempted] = useState(false);
  const [autoFailed, setAutoFailed] = useState(false);
  const [autoErrorCode, setAutoErrorCode] = useState<string | null>(null);
  const [walletWait, setWalletWait] = useState(0);
  const [countryBusy, setCountryBusy] = useState(false);
  const [countryStatus, setCountryStatus] = useState<"idle" | "saved" | "error" | "rate_limited">("idle");
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [visibilityStatus, setVisibilityStatus] = useState<"idle" | "saved" | "error" | "rate_limited">("idle");
  const [airdropClaiming, setAirdropClaiming] = useState(false);
  /** True once the first `/me` read has answered, successfully or not. */
  const [meSettled, setMeSettled] = useState(false);
  const [origin, setOrigin] = useState("");
  const { session: walletSession } = useWallet();
  const { openWalletModal } = useWalletModal();
  /** Auto-claim fires at most once per page load, even if the effect re-runs. */
  const claimFiredRef = useRef(false);
  /** Set when this page load actually issued the number, to scroll the personal block in. */
  const justClaimedRef = useRef(false);
  const personalRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [statsRes, meRes] = await Promise.all([
      fetch("/api/founders/stats", { cache: "no-store" }).catch(() => null),
      fetch("/api/founders/me", { cache: "no-store", credentials: "include" }).catch(() => null),
    ]);
    // Counters are hidden (not zeroed) while stats are unavailable.
    if (statsRes?.ok) setStats((await statsRes.json()) as Stats);
    const meBody = meRes?.ok ? ((await meRes.json()) as Me) : null;
    setMe(meBody);
    if (meBody?.founder) {
      try {
        const res = await fetch("/api/founders/referral", { cache: "no-store", credentials: "include" });
        if (!res.ok) throw new Error("referral");
        setReferral((await res.json()) as ReferralStatus);
        setReferralError(false);
      } catch {
        setReferralError(true);
      }
    } else {
      setReferral(null);
    }
    // Whatever `/me` answered — a founder, no founder, or nothing at all — the page
    // can now render its `#verify` anchor, so the deep link may scroll to it.
    setMeSettled(true);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setOrigin(window.location.origin));
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(id);
    };
  }, [load]);

  useEffect(() => {
    if (!me?.founder || me.founder.verificationLevel < 1) return;
    if (me.demoAirdrop?.state !== "pending") return;
    if (airdropClaiming) return;
    setAirdropClaiming(true);
    fetch("/api/founders/demo-airdrop", { method: "POST", credentials: "include" })
      .then(() => load())
      .finally(() => setAirdropClaiming(false));
  }, [me?.founder, me?.demoAirdrop?.state, airdropClaiming, load]);

  // Country can only be guessed in the browser, so it lands one tick after mount. An earlier
  // explicit choice (localStorage) wins over a fresh guess — it must survive the Google
  // sign-in redirect, which leaves and returns to this page.
  useEffect(() => {
    setCountryCode(readPersistedCountryChoice() ?? detectBrowserCountryCode());
    setCountryDetected(true);
  }, []);

  /** Every country pick goes through here so the choice is remembered across the sign-in redirect. */
  const chooseCountry = useCallback((code: string) => {
    setCountryCode(code);
    persistCountryChoice(code);
  }, []);

  const walletUserId = walletSession?.userId ?? null;
  // A Web3Auth sign-in right here on /founders sets the wallet session in place; re-read /me.
  useEffect(() => {
    if (walletUserId) void load();
  }, [walletUserId, load]);

  // After login the partner wallet link is fire-and-forget: retry /me until it lands so the
  // auto-claim is not skipped because the human gate read a stale row.
  useEffect(() => {
    if (!me?.signedIn || me.founder || me.verifiedHuman) return;
    if (walletWait >= WALLET_LINK_RETRIES) return;
    const id = window.setTimeout(() => {
      setWalletWait((n) => n + 1);
      void load();
    }, WALLET_LINK_RETRY_MS);
    return () => window.clearTimeout(id);
  }, [me?.signedIn, me?.founder, me?.verifiedHuman, walletWait, load]);

  const claimedFounder = me?.founder ?? null;
  // Right after the number is issued, bring the personal block into view.
  useEffect(() => {
    if (!claimedFounder || !justClaimedRef.current) return;
    justClaimedRef.current = false;
    personalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [claimedFounder]);

  const countryName = useCallback(
    (code: string) => {
      try {
        const dn = new Intl.DisplayNames([lang], { type: "region" });
        return dn.of(code) ?? code;
      } catch {
        return FOUNDER_COUNTRY_OPTIONS.find((c) => c.code === code)?.name ?? code;
      }
    },
    [lang],
  );

  /** The one register call. API contract unchanged: same endpoint, same body. */
  const postRegister = useCallback(
    (code: string) =>
      fetch("/api/founders/register", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          countryCode: code,
          deviceId: getOrCreateFounderDeviceId(),
          invitedByWallet: readStoredReferrer(),
        }),
      }),
    [],
  );

  const runAutoClaim = useCallback(
    async (code: string) => {
      if (claimFiredRef.current) return;
      claimFiredRef.current = true;
      setAutoAttempted(true);
      setAutoFailed(false);
      setAutoErrorCode(null);
      try {
        const res = await postRegister(code);
        if (res.ok) {
          justClaimedRef.current = true;
          await load();
          return;
        }
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        // Already a founder (double mount / returning user): success, not an error.
        if (isIdempotentClaimSuccess(payload.error)) {
          await load();
          return;
        }
        setAutoErrorCode(payload.error ?? "failed");
        setAutoFailed(true);
      } catch {
        setAutoErrorCode("network");
        setAutoFailed(true);
      }
    },
    [load, postRegister],
  );

  const retryAutoClaim = useCallback(() => {
    claimFiredRef.current = false;
    setAutoAttempted(false);
    setAutoFailed(false);
    setAutoErrorCode(null);
    void runAutoClaim(countryCode);
  }, [countryCode, runAutoClaim]);

  /**
   * The success block lets a founder correct their country later via its own endpoint.
   * This must not call `chooseCountry`: that setter (and the localStorage it writes)
   * backs the *pre-claim* picker only. Routing an already-claimed founder's edit through
   * it persisted the attempted value — even on a failed save (rate limit, stale
   * session) — into the one shared `localStorage` key, which the next not-yet-claimed
   * sign-in on the same browser (e.g. a second account) then auto-claims with.
   */
  async function changeCountry(next: string) {
    setCountryBusy(true);
    setCountryStatus("idle");
    try {
      const res = await fetch("/api/founders/country", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ countryCode: next }),
      });
      if (res.ok) {
        await load();
        setCountryStatus("saved");
        return;
      }
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      setCountryStatus(payload.error === "rate_limited" ? "rate_limited" : "error");
    } catch {
      setCountryStatus("error");
    } finally {
      setCountryBusy(false);
    }
  }

  /**
   * The founder's own switch for appearing by name on public lists. Off until they turn it
   * on: the endpoint is scoped to the session, so this only ever changes their own record.
   */
  async function changeVisibility(optIn: boolean) {
    setVisibilityBusy(true);
    setVisibilityStatus("idle");
    try {
      const res = await fetch("/api/founders/profile-visibility", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optIn }),
      });
      if (res.ok) {
        await load();
        setVisibilityStatus("saved");
        return;
      }
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      setVisibilityStatus(payload.error === "rate_limited" ? "rate_limited" : "error");
    } catch {
      setVisibilityStatus("error");
    } finally {
      setVisibilityBusy(false);
    }
  }

  const autoClaimDecision = decideAutoClaim({
    signedIn: Boolean(me?.signedIn),
    verifiedHuman: Boolean(me?.verifiedHuman),
    hasFounder: Boolean(me?.founder),
    countryReady: countryDetected,
    attempted: autoAttempted,
    failed: autoFailed,
  });

  useEffect(() => {
    if (autoClaimDecision !== "claim") return;
    void runAutoClaim(countryCode);
  }, [autoClaimDecision, countryCode, runAutoClaim]);

  const founder = me?.founder ?? null;
  // Header "Verify" badge links to /founders#verify. Both shapes of the page render
  // that anchor — the personal card when a number exists, the flow-only card when it
  // does not — and `/me` decides which, so scroll once the read settles rather than
  // once a founder row shows up.
  useEffect(() => {
    if (!meSettled || typeof window === "undefined" || window.location.hash !== "#verify") return;
    const id = window.setTimeout(() => document.getElementById("verify")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    return () => window.clearTimeout(id);
  }, [meSettled]);
  const signedIn = Boolean(me?.signedIn);
  const pageUrl = origin ? `${origin}/founders` : "";

  /** Logged-out claim CTA starts Web3Auth here instead of detouring through /login. */
  const handleClaimCta = useCallback(() => {
    if (founder) return;
    if (!signedIn) {
      openWalletModal();
      return;
    }
    document.getElementById("claim")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [founder, signedIn, openWalletModal]);

  /** Country list, keeping an off-list detected code selectable instead of showing a blank option. */
  const countryOptionsFor = useCallback((selected: string) => {
    const list = [...FOUNDER_COUNTRY_OPTIONS];
    if (selected && !list.some((option) => option.code === selected)) {
      list.unshift({ code: selected, name: selected });
    }
    return list;
  }, []);

  // Small editable country control inside the success block, backed by its own update endpoint.
  const countryEditor = founder ? (
    <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="founders-country-edit">
      <label className="text-xs font-semibold text-ink-3" htmlFor="founders-country-select">
        {base.countryLabel}
      </label>
      <select
        id="founders-country-select"
        value={founder.countryCode}
        disabled={countryBusy}
        onChange={(event) => void changeCountry(event.target.value)}
        className="rounded-xl border border-line bg-canvas-2 px-2 py-1.5 text-sm text-ink disabled:opacity-50"
      >
        {countryOptionsFor(founder.countryCode).map((option) => (
          <option key={option.code} value={option.code}>
            {countryFlagEmoji(option.code)} {countryName(option.code)}
          </option>
        ))}
      </select>
      {countryStatus === "saved" ? (
        <span className="text-xs text-value" data-testid="founders-country-note">
          {base.countrySaved}
        </span>
      ) : countryStatus === "rate_limited" ? (
        <span className="text-xs text-warm" data-testid="founders-country-note">
          {base.countryRateLimited}
        </span>
      ) : countryStatus === "error" ? (
        <span className="text-xs text-warm" data-testid="founders-country-note">
          {base.countryUpdateError}
        </span>
      ) : null}
    </div>
  ) : null;

  // Privacy switch next to the country control: name/avatar stay private until switched on.
  const visibilityEditor = founder ? (
    <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="founders-visibility-edit">
      <label className="flex items-center gap-2 text-sm font-semibold text-ink" htmlFor="founders-visibility-toggle">
        <input
          id="founders-visibility-toggle"
          type="checkbox"
          role="switch"
          checked={founder.publicProfileOptIn}
          disabled={visibilityBusy}
          onChange={(event) => void changeVisibility(event.target.checked)}
          className="h-4 w-4 accent-brand disabled:opacity-50"
        />
        {base.visibilityLabel}
      </label>
      <p className="w-full text-xs text-ink-3">{base.visibilityHint}</p>
      {visibilityStatus === "saved" ? (
        <span className="text-xs text-value" data-testid="founders-visibility-note">
          {base.visibilitySaved}
        </span>
      ) : visibilityStatus === "rate_limited" ? (
        <span className="text-xs text-warm" data-testid="founders-visibility-note">
          {base.countryRateLimited}
        </span>
      ) : visibilityStatus === "error" ? (
        <span className="text-xs text-warm" data-testid="founders-visibility-note">
          {base.visibilityError}
        </span>
      ) : null}
    </div>
  ) : null;

  const card = useMemo(
    () =>
      founder
        ? {
            founderNumber: founder.founderNumber,
            countryCode: founder.countryCode,
            countryName: countryName(founder.countryCode),
            entryMultiplier: founder.entryMultiplier,
            totalPoints: founder.totalPoints,
          }
        : null,
    [founder, countryName],
  );

  const actionRows = base.actions
    .filter((action) => action.id !== "invite")
    .map((action) => ({
      ...action,
      label:
        action.id === "swap"
          ? fill(action.label, { swapMin: base.swapMinPpl })
          : action.id === "stake"
            ? fill(action.label, { stakeMin: base.stakeMinPpl })
            : action.label,
    }));

  const primaryBtn =
    "inline-flex min-h-12 items-center justify-center rounded-full bg-brand px-6 text-base font-semibold text-brand-ink shadow-[0_10px_30px_-12px_rgba(3,105,161,0.7)] transition hover:brightness-110";
  const secondaryBtn =
    "inline-flex min-h-12 items-center justify-center rounded-full border border-line-strong bg-surface px-6 text-base font-semibold text-ink transition hover:border-brand hover:text-brand";

  return (
    <div className="founders-warm" data-testid="founders-page">
      {founder && card ? (
        <div ref={personalRef}>
          <FoundersPersonal
            t={t}
            r={r}
            base={base}
            lang={lang}
            card={card}
            verificationLevel={founder.verificationLevel}
            passportWallet={founder.passportWallet}
            primaryWallet={founder.walletAddress ?? null}
            onSignIn={openWalletModal}
            referral={referral}
            referralError={referralError}
            demoAirdrop={me?.demoAirdrop}
            airdropClaiming={airdropClaiming}
            countryEditor={countryEditor}
            visibilityEditor={visibilityEditor}
            onReload={load}
          />
        </div>
      ) : (
        /* 1. Hero */
        <section className="relative overflow-hidden" data-testid="founders-hero">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_85%_10%,rgba(245,158,11,0.18),transparent_70%),radial-gradient(40%_35%_at_0%_25%,rgba(3,105,161,0.10),transparent_70%)] dark:bg-[radial-gradient(60%_50%_at_85%_10%,rgba(251,191,36,0.16),transparent_70%),radial-gradient(40%_35%_at_0%_25%,rgba(76,196,248,0.14),transparent_70%)]"
            aria-hidden="true"
          />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-10 pt-8 sm:px-6 sm:pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-12 lg:px-8 lg:pb-14">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">{t.eyebrow}</p>
              <h1 className="mt-3 text-[2rem] font-bold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-[3.4rem]">
                {t.heroTitle}
              </h1>
              <p className="mt-4 max-w-xl text-base text-ink-2 sm:text-lg">{t.heroSub}</p>
              <div
                className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface/90 px-4 py-3"
                data-testid="founders-country-choice"
              >
                <label className="text-sm font-semibold text-ink" htmlFor="founders-hero-country">
                  {base.chooseCountryTitle}
                </label>
                <select
                  id="founders-hero-country"
                  value={countryCode}
                  onChange={(event) => chooseCountry(event.target.value)}
                  className="rounded-xl border border-line bg-canvas-2 px-3 py-2 text-sm text-ink"
                >
                  {countryOptionsFor(countryCode).map((option) => (
                    <option key={option.code} value={option.code}>
                      {countryFlagEmoji(option.code)} {countryName(option.code)}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-ink-3">{base.countryDetectedHint}</span>
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={handleClaimCta} className={primaryBtn} data-testid="founders-cta-claim">
                  {t.ctaClaim}
                </button>
                <a href="#how" className={secondaryBtn}>
                  {t.ctaHow}
                </a>
              </div>
              <p className="mt-4 max-w-xl text-xs text-ink-3" data-testid="founders-disclaimer">
                {t.disclaimer}
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
                    {t.hello[i * 2 % t.hello.length]}
                  </span>
                ))}
              </div>
              <div className="founders-float">
                <FounderCard founder={null} t={t} lang={lang} />
              </div>
              <div className="mt-5 flex items-center justify-center gap-2 sm:hidden" aria-hidden="true">
                <span className="flex -space-x-2">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <PersonAvatar key={i} index={i} className="warm-avatar-ring h-8 w-8 rounded-full" />
                  ))}
                </span>
                <span className="text-xs font-semibold text-ink-2">{t.hello.slice(0, 3).join(" · ")}</span>
              </div>
            </div>
          </div>

          {stats ? (
            <div className="relative mx-auto max-w-6xl px-4 pb-10 sm:px-6 lg:px-8" data-testid="founders-live-strip">
              <div className="flex flex-col gap-3 rounded-3xl border border-line bg-surface/90 px-5 py-4 shadow-[var(--elev-1)] sm:flex-row sm:items-center sm:gap-6">
                <div className="flex items-baseline gap-2">
                  <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-value opacity-60 motion-reduce:hidden" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-value" />
                  </span>
                  <CountUpNumber value={stats.verifiedCount} lang={lang} className="font-mono text-2xl font-bold text-ink" />
                  <span className="text-sm text-ink-2">{t.stripVerified}</span>
                </div>
                <div className="flex-1">
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,var(--c-warm),var(--c-brand))]"
                      style={{ width: `${Math.max(0.5, Math.min(100, (stats.verifiedCount / stats.goal) * 100))}%` }}
                    />
                  </div>
                </div>
                <p className="text-sm text-ink-3">
                  {t.stripGoal}: <span className="font-mono font-semibold text-ink">{stats.goal.toLocaleString(lang)}</span>
                </p>
              </div>
            </div>
          ) : null}
        </section>
      )}

      {/* Claim: signed-in visitors who do not have a founder number yet. The number is issued
          automatically; this block is the loading / failure surface, never a click gate. */}
      {signedIn && !founder ? (
        <section id="claim" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-6 sm:px-6 lg:px-8" data-testid="founders-claim">
          <div className="rounded-[28px] border border-brand/25 bg-surface p-6 shadow-[var(--elev-1)] sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">{t.claimEyebrow}</p>
            <h2 className="mt-2 text-2xl font-bold text-ink">{t.claimTitle}</h2>
            <p className="mt-2 text-sm text-ink-2">{base.registerLead}</p>
            {!me?.verifiedHuman ? (
              walletWait >= WALLET_LINK_RETRIES ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-ink-2">{base.pohRequired}</p>
                  <Link href="/wallet" className={secondaryBtn}>
                    {base.walletCta}
                  </Link>
                </div>
              ) : (
                <p className="mt-4 flex items-center gap-2 text-sm text-value" role="status" aria-live="polite" data-testid="founders-claim-loading">
                  <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
                  {base.autoClaimLoading}
                </p>
              )
            ) : autoFailed ? (
              <div className="mt-4 grid gap-3 sm:max-w-md" role="alert" data-testid="founders-claim-error">
                <p className="text-sm text-warm">
                  {autoErrorCode === "poh_required" ? base.pohRequired : base.autoClaimError}
                </p>
                <label className="text-sm font-semibold text-ink" htmlFor="founder-country">
                  {base.countryLabel}
                </label>
                <select
                  id="founder-country"
                  className="w-full rounded-xl border border-line bg-canvas-2 px-3 py-3 text-ink"
                  value={countryCode}
                  onChange={(e) => chooseCountry(e.target.value)}
                >
                  {countryOptionsFor(countryCode).map((c) => (
                    <option key={c.code} value={c.code}>
                      {countryFlagEmoji(c.code)} {countryName(c.code)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-ink-3">{base.countryDetectedHint}</p>
                <button type="button" onClick={retryAutoClaim} className={primaryBtn} data-testid="founders-claim-retry">
                  {base.autoClaimRetry}
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-2" role="status" aria-live="polite" data-testid="founders-claim-loading">
                <p className="flex items-center gap-2 text-sm text-value">
                  <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
                  {base.autoClaimLoading}
                </p>
                <p className="text-xs text-ink-3">{base.countryDetectedHint}</p>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {/* Verification without a founder card: the header's "Verify" link lands here,
          and the same flow's step 1 offers sign-in or a reload. Exactly one element
          carries `founders-verification` — this one or the personal card's. */}
      {!founder ? (
        <section id="verify" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-6 sm:px-6 lg:px-8" data-testid="founders-verification">
          <div className="rounded-[28px] border border-line bg-surface p-6 shadow-[var(--elev-1)] sm:p-8">
            <h2 className="text-2xl font-bold text-ink">{t.verifyTitle}</h2>
            <HumanPassportFlow
              base={base}
              lang={lang}
              signedIn={signedIn}
              founderNumber={null}
              verificationLevel={0}
              passportWallet={null}
              primaryWallet={null}
              onSignIn={openWalletModal}
              onReload={load}
            />
          </div>
        </section>
      ) : null}

      <PoolSection t={t} lang={lang} pool={referral?.pool ?? null} />
      <HowSection t={t} />
      <LevelsSection t={t} />
      <GovSection t={t} />
      <ActiveSection t={t} />
      <BuildSection t={t} />
      <RanksSection t={t} lang={lang} />
      <FairSection t={t} />
      <CountriesSection
        t={t}
        lang={lang}
        countries={stats?.countries ?? null}
        countryName={countryName}
        onClaim={founder ? null : handleClaimCta}
      />
      <FaqSection t={t}>
        <details className="mt-6 rounded-3xl border border-line bg-canvas-2 px-5 py-4 sm:px-6" data-testid="founders-full-rules">
          <summary className="cursor-pointer text-sm font-semibold text-ink">{t.rulesDetails}</summary>
          <div className="mt-4 space-y-6 text-sm text-ink-2">
            {stats ? (
              <div>
                <h3 className="text-base font-semibold text-ink">{base.poolTitle}</h3>
                <p className="mt-2">{fill(base.poolProgramLine, { program: stats.programPoolPpl.toLocaleString(lang) })}</p>
                <p>{fill(base.poolSeasonLine, { season: stats.seasonPoolPpl.toLocaleString(lang) })}</p>
                <p>{base.poolFormula}</p>
                <p className="font-semibold text-brand">
                  {base.poolEstimateLabel}:{" "}
                  {stats.estimatedPplPerPoint
                    ? fill(base.poolEstimateValue, { ppl: formatPplPerPointEstimate(stats.estimatedPplPerPoint) })
                    : base.poolEstimatePending}
                </p>
              </div>
            ) : null}
            <div>
              <h3 className="text-base font-semibold text-ink">{base.actionsTitle}</h3>
              <p className="mt-1 text-xs text-ink-3">{fill(base.pointsTodayHint, { dailyCap: base.dailyCapValue })}</p>
              <ul className="mt-3 space-y-2">
                {actionRows.map((action) => (
                  <li key={action.id} className="flex justify-between gap-3">
                    <span>{action.label}</span>
                    <span className="shrink-0 font-mono text-xs text-ink-3">
                      {action.base} · {action.limit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink">{base.verificationTitle}</h3>
              <p className="mt-2">{base.verificationLead}</p>
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink">{base.mainnetRulesTitle}</h3>
              <p className="mt-2">{base.mainnetRulesPoh}</p>
              <h4 className="mt-4 font-semibold text-ink">{base.mainnetRulesVestingTitle}</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {base.mainnetRulesVestingBullets.map((line) => (
                  <li key={line.slice(0, 48)}>{line}</li>
                ))}
              </ul>
              <h4 className="mt-4 font-semibold text-ink">{base.mainnetRulesSaleFeeTitle}</h4>
              <p className="mt-1">{base.mainnetRulesSaleFeeBody}</p>
              <h4 className="mt-4 font-semibold text-ink">{base.mainnetRulesStakingTitle}</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {base.mainnetRulesStakingBullets.map((line) => (
                  <li key={line.slice(0, 48)}>{line}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink">{r.rulesTitle}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {r.rules.map((line) => (
                  <li key={line.slice(0, 40)}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      </FaqSection>

      {/* 12. Final CTA + share */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6 sm:pb-24 lg:px-8" data-testid="founders-final">
        <div className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#0369a1_0%,#4f46e5_60%,#f59e0b_140%)] px-6 py-10 text-white sm:px-12 sm:py-14">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" aria-hidden="true" />
          <div className="relative grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <h2 className="text-3xl font-bold leading-tight sm:text-4xl">{t.finalTitle}</h2>
              <p className="mt-3 text-base text-white/90">{t.finalSub}</p>
              {!founder ? (
                <button
                  type="button"
                  onClick={handleClaimCta}
                  className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 text-base font-semibold text-[#0369a1] transition hover:bg-amber-50"
                >
                  {t.ctaClaim}
                </button>
              ) : null}
            </div>
            <div className="rounded-3xl bg-canvas-2 p-5 text-ink">
              <p className="text-sm font-semibold">{t.shareTitle}</p>
              <div className="mt-3">
                <ShareButtons
                  url={founder && referral ? founderShareUrl(origin, referral.referralWallet) : pageUrl}
                  text={founderShareText(lang, founder ? founder.founderNumber : null)}
                  t={t}
                  testId="founders-final-share"
                />
              </div>
            </div>
          </div>
          <p className="relative mt-8 text-xs text-white/80">{t.disclaimer}</p>
        </div>
      </section>
    </div>
  );
}
