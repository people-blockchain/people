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
import { foundersLandingCopy } from "@/lib/founders-landing-content";
import { decideAutoClaim, isIdempotentClaimSuccess } from "@/lib/founders/auto-claim";
import { detectBrowserCountryCode } from "@/lib/founders/country-detect";
import { persistCountryChoice, readPersistedCountryChoice } from "@/lib/founders/country-choice";
import { FOUNDER_COUNTRY_OPTIONS, countryFlagEmoji } from "@/lib/founders/countries";
import { getOrCreateFounderDeviceId } from "@/lib/founders/device-id";
import { readStoredReferrer } from "@/lib/referral-ref";
import { FoundersPersonal, type DemoAirdropState, type ReferralStatus } from "./FoundersPersonal";
import {
  FoundersLandingFinalCta,
  FoundersLandingFaq,
  FoundersLandingHero,
  FoundersMillionCounterBar,
  FoundersNftSection,
  FoundersSealSection,
  FoundersSpecialSection,
  FoundersTiersSection,
  type MillionCounter,
} from "./FoundersLandingSections";
import { FoundersNftCard } from "./FoundersNftCard";
import { HumanPassportFlow } from "./HumanPassportFlow";

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

export function FoundersApp({ variant = "landing" }: { variant?: "landing" | "bounty" } = {}) {
  const embedded = variant === "bounty";
  const { lang } = useLanguage();
  const base = foundersPublic[lang];
  const t = foundersPromoCopy(lang);
  const landing = foundersLandingCopy(lang);
  const r = foundersReferralCopy(lang);
  const [millionCounter, setMillionCounter] = useState<MillionCounter | null>(null);
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
  const { session: walletSession } = useWallet();
  const { openWalletModal } = useWalletModal();
  /** Auto-claim fires at most once per page load, even if the effect re-runs. */
  const claimFiredRef = useRef(false);
  /** Set when this page load actually issued the number, to scroll the personal block in. */
  const justClaimedRef = useRef(false);
  const personalRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [counterRes, meRes] = await Promise.all([
      fetch("/api/founders/million-counter", { cache: "no-store" }).catch(() => null),
      fetch("/api/founders/me", { cache: "no-store", credentials: "include" }).catch(() => null),
    ]);
    if (counterRes?.ok) {
      const body = (await counterRes.json()) as { current?: number; goal?: number; source?: string };
      if (typeof body.current === "number" && typeof body.goal === "number") {
        setMillionCounter({ current: body.current, goal: body.goal, source: body.source });
      }
    }
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
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
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
  /** Landing CTAs: sign in, then Human Passport verification on this page. */
  const handleJoinCta = useCallback(() => {
    if (!signedIn) {
      openWalletModal();
      return;
    }
    document.getElementById("verify")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [signedIn, openWalletModal]);

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

  const heroCountryBlock = !founder ? (
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
  ) : null;

  const primaryBtn =
    "inline-flex min-h-12 items-center justify-center rounded-full bg-brand px-6 text-base font-semibold text-brand-ink shadow-[0_10px_30px_-12px_rgba(3,105,161,0.7)] transition hover:brightness-110";
  const secondaryBtn =
    "inline-flex min-h-12 items-center justify-center rounded-full border border-line-strong bg-surface px-6 text-base font-semibold text-ink transition hover:border-brand hover:text-brand";

  return (
    <div className="founders-warm" data-testid="founders-page">
      {founder && card ? (
        <div ref={personalRef} id="founder-dashboard">
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
      ) : embedded ? null : (
        <FoundersLandingHero
          copy={landing}
          promo={t}
          lang={lang}
          counter={millionCounter}
          onCta={handleJoinCta}
          countryBlock={heroCountryBlock}
        />
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

      {founder && !embedded ? (
        <div className="mx-auto max-w-6xl px-4 pb-4 sm:px-6 lg:px-8">
          <FoundersMillionCounterBar copy={landing} lang={lang} counter={millionCounter} />
        </div>
      ) : null}

      {embedded ? (
        <FoundersNftCard signedIn={signedIn} />
      ) : (
        <>
          <FoundersNftSection copy={landing} />
          <FoundersNftCard signedIn={signedIn} />
          <FoundersTiersSection copy={landing} />
          <FoundersSpecialSection copy={landing} />
          <FoundersSealSection copy={landing} />
          <FoundersLandingFaq copy={landing} />
          <FoundersLandingFinalCta copy={landing} onCta={handleJoinCta} showCta={!founder} />
        </>
      )}
    </div>
  );
}
