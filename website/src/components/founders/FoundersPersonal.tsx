"use client";

import { useState, type ReactNode } from "react";
import type { FoundersPromoCopy } from "@/lib/founders-promo-content";
import type { FoundersReferralCopy } from "@/lib/founders-referral-content";
import type { FoundersPublicCopy } from "@/lib/founders-public-content";
import { vestingScheduleBps } from "@/lib/founders/referral";
import { formatFounderDisplayNumber } from "@/lib/founders/format-founder-number";
import { FounderCard, renderFounderCardPng, type FounderCardData } from "./FounderCard";
import { ShareButtons } from "./ShareButtons";
import { founderShareText, founderShareUrl } from "@/lib/founders-share-text";
import { CheckIcon, CountUpNumber, fill } from "./founders-ui";
import { MyBugReportsPanel } from "@/components/bug-reports/MyBugReportsPanel";
import type { Language } from "@/lib/preferences";
import { HumanPassportFlow } from "./HumanPassportFlow";

export type ReferralStatus = {
  referralWallet: string;
  maxActiveInvitees: number;
  ambassador: boolean;
  invitees: {
    founderNumber: number;
    status: "inactive" | "active" | "over_cap" | "bot";
    verified: boolean;
    l1Points: number;
  }[];
  activeCount: number;
  inactiveCount: number;
  l1Points: number;
  l2Points: number;
  extraPoints: number;
  totalPoints: number;
  todayPoints: number;
  dailyCap: number;
  pool: { seasonPoolPpl: number; spentPpl: number; remainingPpl: number };
  vesting: { totalPpl: number; vestedPpl: number; claimedPpl: number; claimablePpl: number };
  issuerAssets: { tokenAddress: string; total: string; claimable: string }[];
};

export type DemoAirdropState =
  | { state: "disabled" }
  | { state: "ineligible" }
  | { state: "cap_reached" }
  | { state: "pending" }
  | { state: "received"; tokensPerKind: number; kinds: number };

const WEEKS_SHOWN = [0, 13, 26, 39, 52];

function Tick({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        on ? "bg-value/10 text-value" : "bg-surface-2 text-ink-3"
      }`}
    >
      {on ? <CheckIcon className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {label}
      <span className="sr-only">{on ? "✓" : "—"}</span>
    </span>
  );
}

export function FoundersPersonal({
  t,
  r,
  base,
  lang,
  card,
  verificationLevel,
  passportWallet,
  primaryWallet,
  onSignIn,
  referral,
  referralError,
  demoAirdrop,
  airdropClaiming,
  countryEditor,
  visibilityEditor,
  onReload,
}: {
  t: FoundersPromoCopy;
  r: FoundersReferralCopy;
  base: FoundersPublicCopy;
  lang: string;
  card: FounderCardData;
  verificationLevel: number;
  /** Separate wallet linked for Human Passport scoring, lowercase. Null when unlinked. */
  passportWallet: string | null;
  /** The wallet on the founder card, which is what the score check falls back to. */
  primaryWallet: string | null;
  /** Opens the existing sign-in wallet modal (see FoundersApp). Never modified here. */
  onSignIn: () => void;
  referral: ReferralStatus | null;
  referralError: boolean;
  demoAirdrop: DemoAirdropState | undefined;
  airdropClaiming: boolean;
  /** Small editable country control rendered by the page (see FoundersApp). */
  countryEditor?: ReactNode;
  /** Public-profile opt-in switch, also rendered by the page (see FoundersApp). */
  visibilityEditor?: ReactNode;
  onReload: () => Promise<void>;
}) {
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  // Human Passport verification lives in its own component: one step on screen at
  // a time, one entry point. This card only frames it.
  // (see components/founders/HumanPassportFlow.tsx)
  const vx = VERIFY_EXTRA[lang] ?? VERIFY_EXTRA.en;

  const link =
    referral && typeof window !== "undefined"
      ? founderShareUrl(window.location.origin, referral.referralWallet)
      : "";
  const shareText = founderShareText(lang, card.founderNumber);
  const fmt = (n: number) => n.toLocaleString(lang, { maximumFractionDigits: 2 });
  const schedule = vestingScheduleBps();

  async function downloadCard() {
    const blob = await renderFounderCardPng(card, t, lang);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `people-founder-${card.founderNumber}.png`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function shareCard() {
    const blob = await renderFounderCardPng(card, t, lang);
    if (!blob) return;
    const file = new File([blob], `people-founder-${card.founderNumber}.png`, { type: "image/png" });
    const data: ShareData = { files: [file], text: link ? `${shareText} ${link}` : shareText };
    if (typeof navigator.canShare === "function" && navigator.canShare(data)) {
      try {
        await navigator.share(data);
        return;
      } catch {
        /* cancelled — fall through to download */
      }
    }
    await downloadCard();
  }

  async function claim() {
    setClaiming(true);
    setClaimMsg(null);
    try {
      const res = await fetch("/api/founders/referral/claim", { method: "POST", credentials: "include" });
      setClaimMsg(res.ok ? r.claimedOk : res.status === 409 ? r.claimNothing : r.claimError);
      if (res.ok) await onReload();
    } catch {
      setClaimMsg(r.claimError);
    } finally {
      setClaiming(false);
    }
  }

  const levelText =
    verificationLevel >= 2 ? base.verificationLevel2 : verificationLevel >= 1 ? base.verificationLevel1 : base.verificationLevel0;

  const statusLabel = (s: ReferralStatus["invitees"][number]["status"]) =>
    s === "active" ? r.statusActive : s === "bot" ? r.statusBot : r.statusInactive;

  const btnGhost =
    "inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:border-brand hover:text-brand disabled:opacity-50";

  return (
    <section className="mx-auto max-w-6xl px-4 pb-6 pt-8 sm:px-6 sm:pt-12 lg:px-8" data-testid="founders-personal">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">{t.personalEyebrow}</p>
      <h1 className="mt-2 text-3xl font-bold leading-tight text-ink sm:text-4xl">
        {fill(t.personalTitle, { n: formatFounderDisplayNumber(card.founderNumber, lang) })}
      </h1>
      <p className="mt-2 max-w-2xl text-xs text-ink-3">{t.disclaimer}</p>
      {countryEditor}
      {visibilityEditor}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* Card + downloads */}
        <div className="space-y-4">
          <FounderCard founder={card} t={t} lang={lang} />
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className={btnGhost} onClick={() => void downloadCard()} data-testid="founders-card-download">
              {t.downloadCard}
            </button>
            <button type="button" className={btnGhost} onClick={() => void shareCard()}>
              {t.shareCard}
            </button>
          </div>
        </div>

        {/* Referral link + counters */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--elev-1)] sm:p-6" data-testid="founders-referral">
            <label className="text-xs font-semibold text-ink-3" htmlFor="founders-ref-link">
              {r.linkLabel}
            </label>
            <input
              id="founders-ref-link"
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-1 w-full rounded-xl border border-line bg-canvas-2 px-3 py-2.5 font-mono text-xs text-ink"
            />
            <div className="mt-3">
              <ShareButtons url={link} text={shareText} t={t} testId="founders-ref-share" />
            </div>
            {referralError ? <p className="mt-3 text-sm text-warm">{r.loadError}</p> : null}
          </div>

          {referral ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
              <div className="min-w-0 rounded-3xl bg-brand p-5 text-brand-ink" data-testid="founders-active-count">
                <p className="break-words font-mono text-[clamp(1.5rem,2.4vw,2.25rem)] font-bold leading-tight">
                  {fill(t.activeOfMax, { active: referral.activeCount, max: referral.maxActiveInvitees })}
                </p>
                <p className="mt-1 text-sm opacity-90">{t.activeOfMaxHint}</p>
              </div>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(
                  [
                    [t.pointsL1, referral.l1Points],
                    [t.pointsL2, referral.l2Points],
                    [t.pointsBonus, referral.extraPoints],
                    [t.pointsTotal, referral.totalPoints],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-line bg-surface px-3 py-3">
                    <dt className="text-xs font-medium text-ink-3">{label}</dt>
                    <dd className="mt-1 font-mono text-xl font-bold text-ink">
                      <CountUpNumber value={value} lang={lang} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {referral ? (
            <p className="text-xs text-ink-3">
              {fill(r.todayLine, { today: referral.todayPoints, cap: referral.dailyCap })}{" "}
              {referral.ambassador ? r.capAmbassador : r.capHint}
            </p>
          ) : null}

          <div id="verify" className="scroll-mt-24 rounded-3xl border border-line bg-surface p-5 sm:p-6" data-testid="founders-verification">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-ink">{t.verifyTitle}</h2>
              <span
                data-testid="founders-verify-badge"
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  verificationLevel >= 1 ? "border-line bg-surface-2 text-value" : "border-brand/40 bg-brand/10 text-brand"
                }`}
              >
                {verificationLevel >= 2 ? vx.badgePassport : verificationLevel >= 1 ? vx.badgeTelegram : vx.badgeNone}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-2">{levelText}</p>
            <HumanPassportFlow
              base={base}
              lang={lang}
              signedIn
              founderNumber={card.founderNumber}
              verificationLevel={verificationLevel}
              passportWallet={passportWallet}
              primaryWallet={primaryWallet}
              onSignIn={onSignIn}
              onReload={onReload}
            />
            {verificationLevel >= 1 && demoAirdrop ? (
              <p className="mt-3 border-t border-line pt-3 text-xs text-ink-3">
                <span className="font-semibold text-ink-2">{base.demoAirdropTitle}: </span>
                {demoAirdrop.state === "received"
                  ? base.demoAirdropReceived
                  : demoAirdrop.state === "cap_reached"
                    ? base.demoAirdropCapReached
                    : demoAirdrop.state === "disabled"
                      ? base.demoAirdropUnavailable
                      : airdropClaiming
                        ? base.demoAirdropClaiming
                        : base.demoAirdropPending}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {referral ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Invitees */}
          <div className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="text-base font-semibold text-ink">{r.inviteesTitle}</h2>
            {referral.invitees.length === 0 ? (
              <p className="mt-3 text-sm text-ink-2">{r.inviteesEmpty}</p>
            ) : (
              <ul className="mt-3 space-y-2" data-testid="founders-referral-invitees">
                {referral.invitees.map((i) => (
                  <li key={i.founderNumber} className="rounded-2xl border border-line/70 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-mono font-semibold text-ink">#{i.founderNumber.toLocaleString(lang)}</span>
                      <span className={i.status === "active" ? "font-semibold text-value" : "text-ink-3"}>
                        {statusLabel(i.status)}
                      </span>
                      <span className="font-mono tabular-nums text-ink-2">+{i.l1Points}</span>
                    </div>
                    {i.status !== "bot" ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Tick on={i.verified} label={t.tickVerified} />
                        {/* Registration requires a linked wallet, so every listed invitee has one. */}
                        <Tick on label={t.tickWallet} />
                        <Tick on={i.status === "active"} label={t.tickAction} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Vesting */}
          <div className="rounded-3xl border border-line bg-surface p-5 sm:p-6" data-testid="founders-referral-vesting">
            <h2 className="text-base font-semibold text-ink">{t.vestingTimeline}</h2>
            <p className="mt-1 text-sm text-ink-2">{r.vestingBody}</p>
            <div className="mt-5" aria-hidden="true">
              <div className="relative h-3 rounded-full bg-[linear-gradient(90deg,var(--c-warm)_0%,var(--c-warm)_10%,var(--c-line-strong)_10%,var(--c-brand)_100%)]" />
              <div className="mt-2 flex justify-between text-[11px] text-ink-3">
                {WEEKS_SHOWN.map((w) => (
                  <span key={w} className="text-center">
                    <span className="block font-mono font-semibold text-ink-2">
                      {(schedule[w].cumulativeBps / 100).toFixed(0)}%
                    </span>
                    {w === 0 ? t.vestingNow : fill(t.vestingWeek, { w })}
                  </span>
                ))}
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-ink-3">{r.vestingTotal}</dt>
              <dd className="text-right font-mono tabular-nums">{fmt(referral.vesting.totalPpl)} PPL</dd>
              <dt className="text-ink-3">{r.vestingVested}</dt>
              <dd className="text-right font-mono tabular-nums">{fmt(referral.vesting.vestedPpl)} PPL</dd>
              <dt className="text-ink-3">{r.vestingClaimed}</dt>
              <dd className="text-right font-mono tabular-nums">{fmt(referral.vesting.claimedPpl)} PPL</dd>
              <dt className="font-medium text-ink">{r.vestingClaimable}</dt>
              <dd className="text-right font-mono font-semibold tabular-nums text-brand">
                {fmt(referral.vesting.claimablePpl)} PPL
              </dd>
            </dl>
            {referral.issuerAssets.length ? (
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-xs font-medium text-ink-3">{r.issuerAssetsTitle}</p>
                <ul className="mt-1 space-y-1 text-xs text-ink-2">
                  {referral.issuerAssets.map((a) => (
                    <li key={a.tokenAddress} className="flex justify-between gap-2">
                      <span className="font-mono">
                        {a.tokenAddress.slice(0, 8)}…{a.tokenAddress.slice(-4)}
                      </span>
                      <span className="font-mono tabular-nums">
                        {a.claimable} / {a.total}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <button type="button" disabled={claiming} onClick={() => void claim()} className={`${btnGhost} mt-4 w-full sm:w-auto`}>
              {claiming ? r.claiming : r.claimButton}
            </button>
            {claimMsg ? <p className="mt-2 text-xs text-ink-2">{claimMsg}</p> : null}
            <p className="mt-2 text-xs text-ink-3">{r.vestingNote}</p>
          </div>
        </div>
      ) : null}

      <MyBugReportsPanel lang={lang as Language} />
    </section>
  );
}

const VERIFY_EXTRA: Record<string, { badgeNone: string; badgeTelegram: string; badgePassport: string }> = {
  en: { badgeNone: "Not verified", badgeTelegram: "Telegram verified", badgePassport: "Human Passport verified" },
  ru: { badgeNone: "Не верифицирован", badgeTelegram: "Telegram подтверждён", badgePassport: "Human Passport подтверждён" },
  de: { badgeNone: "Nicht verifiziert", badgeTelegram: "Telegram verifiziert", badgePassport: "Human Passport verifiziert" },
  es: { badgeNone: "Sin verificar", badgeTelegram: "Telegram verificado", badgePassport: "Human Passport verificado" },
  fr: { badgeNone: "Non vérifié", badgeTelegram: "Telegram vérifié", badgePassport: "Human Passport vérifié" },
  it: { badgeNone: "Non verificato", badgeTelegram: "Telegram verificato", badgePassport: "Human Passport verificato" },
  pt: { badgeNone: "Não verificado", badgeTelegram: "Telegram verificado", badgePassport: "Human Passport verificado" },
  tr: { badgeNone: "Doğrulanmadı", badgeTelegram: "Telegram doğrulandı", badgePassport: "Human Passport doğrulandı" },
  id: { badgeNone: "Belum terverifikasi", badgeTelegram: "Telegram terverifikasi", badgePassport: "Human Passport terverifikasi" },
  zh: { badgeNone: "未验证", badgeTelegram: "Telegram 已验证", badgePassport: "Human Passport 已验证" },
  vi: { badgeNone: "Chưa xác minh", badgeTelegram: "Đã xác minh Telegram", badgePassport: "Đã xác minh Human Passport" },
  ar: { badgeNone: "غير موثّق", badgeTelegram: "تم التحقق عبر Telegram", badgePassport: "تم التحقق عبر Human Passport" },
};

