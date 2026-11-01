"use client";

/**
 * The one Human Passport surface. Every entry point renders this component, and
 * it renders exactly one step at a time (see `lib/founders/human-passport-flow.ts`
 * for the step rules). It replaces the flat card that used to put a Telegram CTA,
 * a Passport CTA, a raw external link and a wallet linker on screen at once.
 *
 * Two rules keep the flow linear:
 *
 * 1. **Nothing opens by itself.** The only external hop is one labelled link the
 *    user clicks. There is no `window.open` for Passport — not even a blank tab.
 *    (The Telegram bot keeps its synchronous `window.open("about:blank")`, which
 *    exists because mobile popup blockers kill a tab opened after `await`.)
 * 2. **One affordance per moment.** Wallet linking lives in a collapsed
 *    `<details>`, so the wallet modal / WalletConnect QR can never be on screen
 *    together with the Passport hop.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { FoundersPublicCopy } from "@/lib/founders-public-content";
import { CheckIcon, fill } from "./founders-ui";
import { useExternalWalletOptional, signViaActiveSigner } from "@/context/ExternalWalletContext";
import { WalletExternalConnectSection } from "@/components/wallet/WalletExternalConnectSection";
import { buildPassportWalletLinkMessage } from "@/lib/founders/passport-wallet";
import {
  HUMAN_PASSPORT_APP_URL,
  HUMAN_PASSPORT_CHECK_TIMEOUT_MS,
  HUMAN_PASSPORT_STEPS,
  classifyHumanPassportResponse,
  clearPersistedHumanPassportProgress,
  hasPendingPassportVisit,
  maskAddress,
  passportScoredWallet,
  persistHumanPassportProgress,
  readPersistedHumanPassportProgress,
  resolveHumanPassportStep,
  type HumanPassportCheckResult,
  type HumanPassportFailureCode,
} from "@/lib/founders/human-passport-flow";

type FlowOutcome = { text: string; tone: "error" | "success"; retry: boolean };

const OUTCOME_CLASS: Record<FlowOutcome["tone"], string> = {
  error: "border-warm/40 bg-warm/10 text-ink",
  success: "border-value/40 bg-value/10 text-ink",
};

export function HumanPassportFlow({
  base,
  lang,
  signedIn,
  founderNumber,
  verificationLevel,
  passportWallet,
  primaryWallet,
  onSignIn,
  onReload,
}: {
  base: FoundersPublicCopy;
  lang: string;
  signedIn: boolean;
  /** Null until the founder number exists — step 1 is the whole flow in that case. */
  founderNumber: number | null;
  verificationLevel: number;
  /** Separate wallet linked for Human Passport scoring. Null when unlinked. */
  passportWallet: string | null;
  /** The wallet on the founder card. */
  primaryWallet: string | null;
  /** Opens the existing sign-in wallet modal. Never modified, only called. */
  onSignIn: () => void;
  onReload: () => Promise<void>;
}) {
  const c = COPY[lang] ?? COPY.en;
  const external = useExternalWalletOptional();
  const signer = external?.signer ?? null;

  const [checking, setChecking] = useState(false);
  const [outcome, setOutcome] = useState<HumanPassportCheckResult | null>(null);
  /** True when this load is a return from the external scorer (see `hasPendingPassportVisit`). */
  const [returning, setReturning] = useState(false);
  const [telegramUrl, setTelegramUrl] = useState<string | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramError, setTelegramError] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwError, setPwError] = useState(false);
  const [pwShowConnect, setPwShowConnect] = useState(false);

  const step = resolveHumanPassportStep({
    signedIn,
    hasFounder: founderNumber !== null,
    verificationLevel,
    checking,
  });
  const scored = passportScoredWallet(passportWallet, primaryWallet);
  const guide = GUIDE[lang] ?? null;

  // `Date.now()` is read here, on mount, and never during render.
  useEffect(() => {
    const progress = readPersistedHumanPassportProgress();
    setReturning(hasPendingPassportVisit(progress, Date.now()));
  }, []);

  // Verified: the stored step has done its job, so a later reload starts clean.
  useEffect(() => {
    if (step === 4) clearPersistedHumanPassportProgress();
  }, [step]);

  const runCheck = useCallback(async () => {
    setChecking(true);
    setOutcome(null);
    persistHumanPassportProgress({ step: 3, wallet: scored ? scored.address.toLowerCase() : null });

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), HUMAN_PASSPORT_CHECK_TIMEOUT_MS);
    let result: HumanPassportCheckResult;
    try {
      const res = await fetch("/api/founders/verify/human-passport", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: "{}",
        signal: controller.signal,
      });
      const payload = res.ok
        ? {}
        : ((await res.json().catch(() => ({}))) as {
            error?: unknown;
            score?: unknown;
            threshold?: unknown;
            walletKind?: unknown;
          });
      result = classifyHumanPassportResponse(res.status, payload);
    } catch (err) {
      // A hung request aborts locally; anything else that never reached the
      // server is a network failure. Both are retryable.
      const aborted = (err as Error)?.name === "AbortError";
      result = classifyHumanPassportResponse(0, { error: aborted ? "timeout" : "network" });
    } finally {
      window.clearTimeout(timer);
    }

    setOutcome(result);
    setChecking(false);
    if (result.kind === "verified") {
      clearPersistedHumanPassportProgress();
      setReturning(false);
      await onReload();
    }
  }, [onReload, scored]);

  /**
   * Opens the Telegram bot in a tab that is claimed **synchronously**, inside the
   * click, before the `await` — mobile browsers block a popup opened later. Then
   * the tab is pointed at the one-time deep link (or closed when the link failed).
   */
  async function openTelegramBot() {
    setTelegramLoading(true);
    setTelegramError(false);
    const tab = typeof window !== "undefined" ? window.open("about:blank", "_blank") : null;
    try {
      const res = await fetch(`/api/founders/telegram/link?locale=${encodeURIComponent(lang)}`, {
        credentials: "include",
      });
      const data = res.ok ? ((await res.json()) as { url?: string }) : {};
      if (data.url) {
        setTelegramUrl(data.url);
        if (tab) tab.location.href = data.url;
        else window.location.assign(data.url);
      } else {
        tab?.close();
        setTelegramError(true);
      }
    } catch {
      tab?.close();
      setTelegramError(true);
    } finally {
      setTelegramLoading(false);
    }
  }

  async function linkPassportWallet() {
    if (!signer) {
      setPwShowConnect(true);
      return;
    }
    setPwBusy(true);
    setPwMsg(null);
    setPwError(false);
    try {
      const nonceRes = await fetch("/api/founders/passport-wallet/nonce", { credentials: "include" });
      if (!nonceRes.ok) {
        setPwError(true);
        setPwMsg(c.walletError);
        return;
      }
      const challenge = (await nonceRes.json()) as {
        nonce: string;
        domain: string;
        founderNumber: number;
        issuedAt: string;
        expiresAt: string;
      };
      const message = buildPassportWalletLinkMessage({
        domain: challenge.domain,
        address: signer.address,
        founderNumber: challenge.founderNumber,
        nonce: challenge.nonce,
        issuedAt: challenge.issuedAt,
        expiresAt: challenge.expiresAt,
      });
      const signature = await signViaActiveSigner(signer, message);
      const linkRes = await fetch("/api/founders/passport-wallet", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nonce: challenge.nonce, address: signer.address, signature }),
      });
      if (linkRes.ok) {
        setPwShowConnect(false);
        setPwMsg(c.walletLinked);
        await onReload();
        return;
      }
      const payload = (await linkRes.json().catch(() => ({}))) as { error?: string };
      setPwError(true);
      setPwMsg(payload.error === "passport_wallet_taken" ? c.walletTaken : payload.error === "nonce_invalid" ? c.walletExpired : c.walletError);
    } catch {
      setPwError(true);
      setPwMsg(c.walletError);
    } finally {
      setPwBusy(false);
    }
  }

  async function unlinkPassportWallet() {
    setPwBusy(true);
    setPwMsg(null);
    setPwError(false);
    try {
      const res = await fetch("/api/founders/passport-wallet", { method: "DELETE", credentials: "include" });
      if (res.ok) {
        await onReload();
      } else {
        setPwError(true);
        setPwMsg(c.walletError);
      }
    } catch {
      setPwError(true);
      setPwMsg(c.walletError);
    } finally {
      setPwBusy(false);
    }
  }

  /** The single shared error/success surface. One message, one action. */
  const message: FlowOutcome | null = (() => {
    if (step === 4) return { text: c.verified, tone: "success", retry: false };
    if (!outcome) return null;
    if (outcome.kind === "too_low") {
      return {
        text: fill(c.low, {
          walletLabel: outcome.walletKind === "passport" ? c.walletLabelPassport : c.walletLabelPrimary,
          wallet: scored ? maskAddress(scored.address) : "",
          score: outcome.score,
          need: outcome.threshold,
        }),
        tone: "error",
        retry: false,
      };
    }
    if (outcome.kind === "verified") return { text: c.verified, tone: "success", retry: false };
    return { text: failureText(c, outcome.code), tone: "error", retry: outcome.retryable };
  })();

  const btnPrimary =
    "inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-brand-ink hover:brightness-110 disabled:opacity-50";
  const btnGhost =
    "inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:border-brand hover:text-brand disabled:opacity-50";

  return (
    <div data-testid="founders-hp-flow">
      {/* Step indicator: the number is the label, the dots are decoration. */}
      <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="founders-hp-steps">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
          {fill(c.stepOf, { step })}
        </span>
        <span className="flex items-center gap-1" aria-hidden="true">
          {Array.from({ length: HUMAN_PASSPORT_STEPS }, (_, i) => i + 1).map((n) => (
            <span
              key={n}
              className={`h-1.5 w-1.5 rounded-full ${n <= step ? "bg-brand" : "bg-line-strong"}`}
            />
          ))}
        </span>
      </div>

      {step === 1 ? (
        <div className="mt-2 space-y-2" data-testid="founders-hp-step-1">
          <h3 className="text-sm font-semibold text-ink">{c.step1Title}</h3>
          <p className="text-sm text-ink-2">{signedIn ? c.step1FounderBody : c.step1SignInBody}</p>
          {signedIn ? (
            <button type="button" className={btnGhost} onClick={() => void onReload()} data-testid="founders-hp-reload">
              {c.reloadCta}
            </button>
          ) : (
            <button type="button" className={btnPrimary} onClick={onSignIn} data-testid="founders-hp-signin">
              {c.signInCta}
            </button>
          )}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="mt-2 space-y-3">
          <h3 className="text-sm font-semibold text-ink">{c.step2Title}</h3>
          <p className="text-sm text-ink-2" data-testid={returning ? "founders-hp-welcome-back" : undefined}>
            {returning ? c.welcomeBack : c.step2Body}
          </p>
          <p className="text-xs text-ink-3">
            {fill(c.scoredWallet, {
              walletLabel: scored?.kind === "passport" ? c.walletLabelPassport : c.walletLabelPrimary,
              wallet: scored ? maskAddress(scored.address) : c.walletLabelNone,
            })}
          </p>
          {guide ? (
            <ol
              className="list-decimal space-y-1.5 rounded-xl border border-brand/30 bg-brand/5 py-3 pl-8 pr-3 text-sm text-ink"
              data-testid="founders-hp-guide"
            >
              {guide.steps.map((line, i) => (
                <li key={i}>
                  {fill(line, {
                    need: outcome?.kind === "too_low" ? outcome.threshold : HUMAN_PASSPORT_DEFAULT_MIN_SCORE,
                    wallet: scored ? maskAddress(scored.address) : c.walletLabelNone,
                  })}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-ink-3">{c.step2Order}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <a
              href={HUMAN_PASSPORT_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={btnPrimary}
              data-testid="founders-hp-open-passport"
              onClick={() =>
                persistHumanPassportProgress({ step: 2, wallet: scored ? scored.address.toLowerCase() : null })
              }
            >
              {c.openPassportCta}
            </a>
            <button
              type="button"
              disabled={checking}
              className={btnGhost}
              onClick={() => void runCheck()}
              data-testid="founders-hp-check"
            >
              {checking ? c.checkBusy : c.checkCta}
            </button>
          </div>

          {/* Alternative wallet. Collapsed so it can never compete with the hop above. */}
          <details className="rounded-xl border border-line bg-surface-2 px-3 py-2" data-testid="founders-passport-wallet">
            <summary className="cursor-pointer select-none text-xs font-semibold text-ink-2">{c.walletDetails}</summary>
            <div className="mt-2">
              {passportWallet ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-ink-2" data-testid="founders-passport-wallet-address">
                    {maskAddress(passportWallet)}
                  </span>
                  <button
                    type="button"
                    disabled={pwBusy}
                    onClick={() => void unlinkPassportWallet()}
                    className="text-xs text-warm underline disabled:opacity-50"
                    data-testid="founders-passport-wallet-unlink"
                  >
                    {pwBusy ? c.walletUnlinking : c.walletUnlink}
                  </button>
                </div>
              ) : signer ? (
                <div className="space-y-2">
                  <p className="text-xs text-ink-3">{fill(c.walletReady, { address: maskAddress(signer.address) })}</p>
                  <button
                    type="button"
                    disabled={pwBusy}
                    onClick={() => void linkPassportWallet()}
                    className={btnGhost}
                    data-testid="founders-passport-wallet-sign"
                  >
                    {pwBusy ? c.walletLinking : c.walletCta}
                  </button>
                </div>
              ) : pwShowConnect ? (
                external ? (
                  <WalletExternalConnectSection compact />
                ) : (
                  <button type="button" className={btnGhost} onClick={onSignIn} data-testid="founders-passport-wallet-signin">
                    {c.signInCta}
                  </button>
                )
              ) : (
                <>
                  <p className="text-xs text-ink-3">{c.walletHint}</p>
                  <button
                    type="button"
                    onClick={() => setPwShowConnect(true)}
                    className={`${btnGhost} mt-2`}
                    data-testid="founders-passport-wallet-link"
                  >
                    {c.walletCta}
                  </button>
                </>
              )}
              {pwMsg ? (
                <p
                  className={`mt-2 text-xs ${pwError ? "text-warm" : "text-value"}`}
                  role="status"
                  data-testid="founders-passport-wallet-message"
                >
                  {pwMsg}
                </p>
              ) : null}
            </div>
          </details>

          {/* Telegram is the optional level-1 shortcut, not a second main path. */}
          {verificationLevel < 1 ? (
            <details className="rounded-xl border border-line bg-surface-2 px-3 py-2" data-testid="founders-telegram-verify">
              <summary className="cursor-pointer select-none text-xs font-semibold text-ink-2">{c.telegramOptional}</summary>
              <div className="mt-2 space-y-2">
                <button type="button" disabled={telegramLoading} onClick={() => void openTelegramBot()} className={btnGhost}>
                  {telegramLoading ? base.verificationTelegramLoading : base.verificationTelegramCta}
                </button>
                {telegramUrl ? (
                  <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="block break-all text-xs text-brand underline">
                    {telegramUrl}
                  </a>
                ) : null}
                {telegramError ? (
                  <p className="text-xs text-warm" role="alert" data-testid="founders-telegram-error">
                    {c.telegramError}
                  </p>
                ) : null}
              </div>
            </details>
          ) : null}
          {verificationLevel === 1 ? (
            <p className="text-xs text-value" data-testid="founders-telegram-status">
              {base.verificationTelegramStatusVerified}
            </p>
          ) : null}
        </div>
      ) : null}

      {step === 3 ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-2" role="status" aria-live="polite" data-testid="founders-hp-checking">
          <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
          {c.checkBusy}
        </p>
      ) : null}

      {message ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="founders-hp-message"
          data-tone={message.tone}
          className={`mt-3 rounded-xl border p-3 text-sm ${OUTCOME_CLASS[message.tone]}`}
        >
          <p className="flex items-start gap-2">
            {message.tone === "success" ? <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" /> : null}
            <span>{message.text}</span>
          </p>
          {message.retry ? (
            <button
              type="button"
              disabled={checking}
              onClick={() => void runCheck()}
              className={`${btnGhost} mt-2`}
              data-testid="founders-hp-retry"
            >
              {c.retryCta}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function failureText(c: FlowCopy, code: HumanPassportFailureCode): string {
  switch (code) {
    case "not_configured":
      return c.errNotConfigured;
    case "not_registered":
      return c.errNotRegistered;
    case "invalid_credential":
      return c.errInvalidCredential;
    case "wallet_not_linked":
      return c.errWalletNotLinked;
    case "wallet_mismatch":
      return c.errWalletMismatch;
    case "sign_in_required":
      return c.errSignIn;
    case "timeout":
      return c.errTimeout;
    case "network":
      return c.errNetwork;
    default:
      return c.errVerificationFailed;
  }
}

type FlowCopy = {
  stepOf: string;
  step1Title: string;
  step1SignInBody: string;
  step1FounderBody: string;
  signInCta: string;
  reloadCta: string;
  step2Title: string;
  step2Body: string;
  step2Order: string;
  openPassportCta: string;
  checkCta: string;
  checkBusy: string;
  welcomeBack: string;
  scoredWallet: string;
  walletLabelPrimary: string;
  walletLabelPassport: string;
  walletLabelNone: string;
  walletDetails: string;
  walletHint: string;
  walletCta: string;
  walletReady: string;
  walletLinking: string;
  walletLinked: string;
  walletUnlink: string;
  walletUnlinking: string;
  walletTaken: string;
  walletExpired: string;
  walletError: string;
  low: string;
  verified: string;
  telegramOptional: string;
  telegramError: string;
  errNotConfigured: string;
  errNotRegistered: string;
  errInvalidCredential: string;
  errWalletNotLinked: string;
  errWalletMismatch: string;
  errSignIn: string;
  errVerificationFailed: string;
  errTimeout: string;
  errNetwork: string;
  retryCta: string;
};

/** Matches the server default in `human-passport-config.ts` when FOUNDERS_HUMAN_PASSPORT_MIN_SCORE is unset. */
const HUMAN_PASSPORT_DEFAULT_MIN_SCORE = 20;

/**
 * Plain step-by-step guide shown above the buttons. Only languages with a reviewed
 * translation get it; the rest keep the one-line `step2Order`.
 */
const GUIDE: Record<string, { steps: string[] }> = {
  en: {
    steps: [
      "Press \u201cOpen Human Passport\u201d and connect the wallet {{wallet}}. It must be the same wallet, otherwise the score will not count. Safari has no MetaMask extension: use Chrome or Brave with MetaMask, or the browser inside the MetaMask app.",
      "A new Passport starts at 0. You need at least {{need}} points.",
      "On the Passport site open \u201cVerify\u201d stamps and pick the ones you can pass. The quickest without documents: Phone Verification and Biometrics. A phone confirmed in our Telegram bot does not count there: Passport has its own phone stamp, so verify it again on the Passport site. If you have them: Government ID, a verified Binance account (Binance BABT). One or two strong stamps are usually enough.",
      "When the score on the Passport site shows {{need}} or more, come back here and press \u201cI\u2019ve finished, check my score\u201d.",
    ],
  },
  ru: {
    steps: [
      "Нажмите \u00abОткрыть Human Passport\u00bb и подключите кошелёк {{wallet}}. Нужен именно этот кошелёк, иначе баллы не засчитаются. В Safari нет расширения MetaMask: откройте сайт в Chrome или Brave с MetaMask, или в браузере внутри приложения MetaMask.",
      "У нового паспорта 0 баллов. Нужно набрать не меньше {{need}}.",
      "На сайте Passport откройте раздел со штампами (Verify) и пройдите те, что можете. Быстрее всего без документов: Phone Verification (телефон) и Biometrics (селфи). Подтверждение телефона в нашем Telegram-боте там не засчитывается: у Passport свой штамп за телефон, его нужно пройти ещё раз на сайте Passport. Если есть: Government ID (паспорт) и верифицированный аккаунт Binance (Binance BABT). Обычно хватает одного-двух сильных штампов.",
      "Когда на сайте Passport балл станет {{need}} или больше, вернитесь сюда и нажмите кнопку проверки балла.",
    ],
  },
};

const COPY: Record<string, FlowCopy> = {
  en: {
    stepOf: "Step {{step}} of 4",
    step1Title: "Sign in",
    step1SignInBody: "Verification is tied to your founder card, so sign in first.",
    step1FounderBody: "You are signed in, but your founder number is not ready yet. Reload to continue.",
    signInCta: "Sign in",
    reloadCta: "Reload",
    step2Title: "Human Passport",
    step2Body: "Open Human Passport, add your stamps there, then come back to this page and check your score.",
    step2Order: "Do it in this order: open Human Passport, build your score, then check it here.",
    openPassportCta: "Open Human Passport",
    checkCta: "I've finished, check my score",
    checkBusy: "Checking your score…",
    welcomeBack: "Welcome back. Check your score to finish.",
    scoredWallet: "The score check uses {{walletLabel}} {{wallet}}.",
    walletLabelPrimary: "wallet",
    walletLabelPassport: "Human Passport wallet",
    walletLabelNone: "no wallet yet",
    walletDetails: "Use a different wallet instead",
    walletHint: "Score Human Passport on a separate wallet instead of your founder wallet.",
    walletCta: "Link MetaMask for Human Passport",
    walletReady: "Ready to sign with {{address}}.",
    walletLinking: "Signing…",
    walletLinked: "Wallet linked for Human Passport.",
    walletUnlink: "Unlink",
    walletUnlinking: "Unlinking…",
    walletTaken: "That wallet is already linked to another founder.",
    walletExpired: "That request expired. Try again.",
    walletError: "Couldn't link the wallet. Try again.",
    low: "Your Human Passport score for {{walletLabel}} {{wallet}} is {{score}}, required {{need}}. Add stamps at app.passport.xyz, then check again.",
    verified: "Human Passport verified.",
    telegramOptional: "Optional: verify with Telegram first",
    telegramError: "Couldn't open the Telegram bot. Refresh the page and try again.",
    errNotConfigured: "Human Passport is not configured on this environment yet.",
    errNotRegistered: "Claim your founder number first.",
    errInvalidCredential: "Human Passport did not accept that credential. Build your score at app.passport.xyz, then check again.",
    errWalletNotLinked: "No wallet is linked to your founder card yet. Connect a wallet in the header, then try again.",
    errWalletMismatch: "The connected wallet differs from the wallet on your founder card.",
    errSignIn: "Your session expired. Sign in again and retry.",
    errVerificationFailed: "Human Passport verification failed. Try again later.",
    errTimeout: "The score check took too long. Check your connection and try again.",
    errNetwork: "Couldn't reach the server. Check your connection and try again.",
    retryCta: "Try again",
  },
  ru: {
    stepOf: "Шаг {{step}} из 4",
    step1Title: "Войдите",
    step1SignInBody: "Верификация привязана к вашей карточке основателя, поэтому сначала войдите.",
    step1FounderBody: "Вы вошли, но номер основателя ещё не готов. Обновите страницу, чтобы продолжить.",
    signInCta: "Войти",
    reloadCta: "Обновить",
    step2Title: "Human Passport",
    step2Body: "Откройте Human Passport, добавьте там штампы, затем вернитесь на эту страницу и проверьте балл.",
    step2Order: "Порядок такой: откройте Human Passport, наберите баллы, потом проверьте их здесь.",
    openPassportCta: "Открыть Human Passport",
    checkCta: "Я всё сделал, проверить балл",
    checkBusy: "Проверяем балл…",
    welcomeBack: "С возвращением. Проверьте балл, чтобы завершить.",
    scoredWallet: "Проверяем {{walletLabel}} {{wallet}}.",
    walletLabelPrimary: "кошелёк",
    walletLabelPassport: "кошелёк Human Passport",
    walletLabelNone: "кошелёк пока не привязан",
    walletDetails: "Использовать другой кошелёк",
    walletHint: "Можно набирать баллы Human Passport на отдельном кошельке, а не на кошельке основателя.",
    walletCta: "Привязать MetaMask для Human Passport",
    walletReady: "Готово к подписи кошельком {{address}}.",
    walletLinking: "Подписываем…",
    walletLinked: "Кошелёк привязан для Human Passport.",
    walletUnlink: "Отвязать",
    walletUnlinking: "Отвязываем…",
    walletTaken: "Этот кошелёк уже привязан к другому основателю.",
    walletExpired: "Запрос устарел. Попробуйте снова.",
    walletError: "Не удалось привязать кошелёк. Попробуйте снова.",
    low: "Ваш балл Human Passport для {{walletLabel}} {{wallet}}: {{score}}, нужно {{need}}. Добавьте штампы на app.passport.xyz и проверьте снова.",
    verified: "Human Passport подтверждён.",
    telegramOptional: "Необязательно: сначала подтвердить через Telegram",
    telegramError: "Не удалось открыть Telegram-бота. Обновите страницу и попробуйте снова.",
    errNotConfigured: "Human Passport на этом окружении ещё не настроен.",
    errNotRegistered: "Сначала получите номер основателя.",
    errInvalidCredential: "Human Passport не принял эти данные. Наберите баллы на app.passport.xyz и проверьте снова.",
    errWalletNotLinked: "К карточке основателя ещё не привязан кошелёк. Подключите кошелёк в шапке сайта и попробуйте снова.",
    errWalletMismatch: "Подключённый кошелёк не совпадает с кошельком карточки основателя.",
    errSignIn: "Сессия истекла. Войдите заново и повторите.",
    errVerificationFailed: "Не удалось пройти Human Passport. Попробуйте позже.",
    errTimeout: "Проверка балла заняла слишком много времени. Проверьте соединение и попробуйте снова.",
    errNetwork: "Не удалось связаться с сервером. Проверьте соединение и попробуйте снова.",
    retryCta: "Повторить",
  },
  de: {
    stepOf: "Schritt {{step}} von 4",
    step1Title: "Anmelden",
    step1SignInBody: "Die Verifizierung hängt an deiner Gründerkarte — melde dich zuerst an.",
    step1FounderBody: "Du bist angemeldet, aber deine Gründernummer ist noch nicht bereit. Lade neu, um fortzufahren.",
    signInCta: "Anmelden",
    reloadCta: "Neu laden",
    step2Title: "Human Passport",
    step2Body: "Öffne Human Passport, füge dort deine Stempel hinzu und komm dann zurück, um deinen Score zu prüfen.",
    step2Order: "In dieser Reihenfolge: Human Passport öffnen, Score aufbauen, dann hier prüfen.",
    openPassportCta: "Human Passport öffnen",
    checkCta: "Fertig — Score prüfen",
    checkBusy: "Score wird geprüft…",
    welcomeBack: "Willkommen zurück. Prüfe deinen Score, um abzuschließen.",
    scoredWallet: "Geprüft wird {{walletLabel}} {{wallet}}.",
    walletLabelPrimary: "Wallet",
    walletLabelPassport: "Human-Passport-Wallet",
    walletLabelNone: "noch keine Wallet",
    walletDetails: "Stattdessen eine andere Wallet verwenden",
    walletHint: "Sammle Human-Passport-Punkte auf einer separaten Wallet statt auf deiner Gründer-Wallet.",
    walletCta: "MetaMask für Human Passport verlinken",
    walletReady: "Bereit zum Signieren mit {{address}}.",
    walletLinking: "Signieren…",
    walletLinked: "Wallet für Human Passport verlinkt.",
    walletUnlink: "Trennen",
    walletUnlinking: "Wird getrennt…",
    walletTaken: "Diese Wallet ist bereits mit einem anderen Gründer verknüpft.",
    walletExpired: "Diese Anfrage ist abgelaufen. Versuche es erneut.",
    walletError: "Die Wallet konnte nicht verlinkt werden. Versuche es erneut.",
    low: "Dein Human-Passport-Score für {{walletLabel}} {{wallet}} ist {{score}}, benötigt werden {{need}}. Füge Stempel auf app.passport.xyz hinzu und prüfe erneut.",
    verified: "Human Passport verifiziert.",
    telegramOptional: "Optional: zuerst per Telegram verifizieren",
    telegramError: "Der Telegram-Bot ließ sich nicht öffnen. Seite neu laden und erneut versuchen.",
    errNotConfigured: "Human Passport ist in dieser Umgebung noch nicht konfiguriert.",
    errNotRegistered: "Hole dir zuerst deine Gründernummer.",
    errInvalidCredential: "Human Passport hat diese Angabe nicht akzeptiert. Baue deinen Score auf app.passport.xyz auf und prüfe erneut.",
    errWalletNotLinked: "Mit deiner Gründerkarte ist noch keine Wallet verknüpft. Verbinde oben eine Wallet und versuche es erneut.",
    errWalletMismatch: "Die verbundene Wallet unterscheidet sich von der Wallet deiner Gründerkarte.",
    errSignIn: "Deine Sitzung ist abgelaufen. Melde dich erneut an und versuche es noch einmal.",
    errVerificationFailed: "Human-Passport-Verifizierung fehlgeschlagen. Versuche es später erneut.",
    errTimeout: "Die Score-Prüfung hat zu lange gedauert. Prüfe deine Verbindung und versuche es erneut.",
    errNetwork: "Der Server war nicht erreichbar. Prüfe deine Verbindung und versuche es erneut.",
    retryCta: "Erneut versuchen",
  },
  es: {
    stepOf: "Paso {{step}} de 4",
    step1Title: "Inicia sesión",
    step1SignInBody: "La verificación está ligada a tu tarjeta de fundador, así que inicia sesión primero.",
    step1FounderBody: "Has iniciado sesión, pero tu número de fundador aún no está listo. Recarga para continuar.",
    signInCta: "Iniciar sesión",
    reloadCta: "Recargar",
    step2Title: "Human Passport",
    step2Body: "Abre Human Passport, añade allí tus sellos y vuelve a esta página para comprobar tu puntuación.",
    step2Order: "En este orden: abre Human Passport, sube tu puntuación y compruébala aquí.",
    openPassportCta: "Abrir Human Passport",
    checkCta: "Ya terminé, comprobar mi puntuación",
    checkBusy: "Comprobando tu puntuación…",
    welcomeBack: "Bienvenido de nuevo. Comprueba tu puntuación para terminar.",
    scoredWallet: "La comprobación usa {{walletLabel}} {{wallet}}.",
    walletLabelPrimary: "billetera",
    walletLabelPassport: "billetera de Human Passport",
    walletLabelNone: "ninguna billetera todavía",
    walletDetails: "Usar otra billetera en su lugar",
    walletHint: "Suma puntos de Human Passport en una billetera distinta a tu billetera de fundador.",
    walletCta: "Vincular MetaMask para Human Passport",
    walletReady: "Listo para firmar con {{address}}.",
    walletLinking: "Firmando…",
    walletLinked: "Billetera vinculada para Human Passport.",
    walletUnlink: "Desvincular",
    walletUnlinking: "Desvinculando…",
    walletTaken: "Esa billetera ya está vinculada a otro fundador.",
    walletExpired: "Esa solicitud caducó. Inténtalo de nuevo.",
    walletError: "No se pudo vincular la billetera. Inténtalo de nuevo.",
    low: "Tu puntuación de Human Passport para {{walletLabel}} {{wallet}} es {{score}}, se requiere {{need}}. Añade sellos en app.passport.xyz y comprueba de nuevo.",
    verified: "Human Passport verificado.",
    telegramOptional: "Opcional: verifica antes con Telegram",
    telegramError: "No se pudo abrir el bot de Telegram. Recarga la página e inténtalo de nuevo.",
    errNotConfigured: "Human Passport aún no está configurado en este entorno.",
    errNotRegistered: "Primero reclama tu número de fundador.",
    errInvalidCredential: "Human Passport no aceptó esa credencial. Sube tu puntuación en app.passport.xyz y comprueba de nuevo.",
    errWalletNotLinked: "Todavía no hay una billetera vinculada a tu tarjeta de fundador. Conecta una billetera en la cabecera e inténtalo de nuevo.",
    errWalletMismatch: "La billetera conectada es distinta de la billetera de tu tarjeta de fundador.",
    errSignIn: "Tu sesión caducó. Inicia sesión de nuevo e inténtalo otra vez.",
    errVerificationFailed: "La verificación de Human Passport falló. Inténtalo más tarde.",
    errTimeout: "La comprobación tardó demasiado. Revisa tu conexión e inténtalo de nuevo.",
    errNetwork: "No se pudo contactar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
    retryCta: "Reintentar",
  },
  fr: {
    stepOf: "Étape {{step}} sur 4",
    step1Title: "Connectez-vous",
    step1SignInBody: "La vérification est liée à votre carte de fondateur : connectez-vous d'abord.",
    step1FounderBody: "Vous êtes connecté, mais votre numéro de fondateur n'est pas encore prêt. Rechargez pour continuer.",
    signInCta: "Se connecter",
    reloadCta: "Recharger",
    step2Title: "Human Passport",
    step2Body: "Ouvrez Human Passport, ajoutez vos tampons, puis revenez ici pour vérifier votre score.",
    step2Order: "Dans cet ordre : ouvrez Human Passport, construisez votre score, puis vérifiez-le ici.",
    openPassportCta: "Ouvrir Human Passport",
    checkCta: "J'ai terminé, vérifier mon score",
    checkBusy: "Vérification de votre score…",
    welcomeBack: "Bon retour. Vérifiez votre score pour terminer.",
    scoredWallet: "La vérification porte sur {{walletLabel}} {{wallet}}.",
    walletLabelPrimary: "portefeuille",
    walletLabelPassport: "portefeuille Human Passport",
    walletLabelNone: "aucun portefeuille pour l'instant",
    walletDetails: "Utiliser plutôt un autre portefeuille",
    walletHint: "Construisez votre score Human Passport sur un portefeuille séparé plutôt que sur votre portefeuille de fondateur.",
    walletCta: "Lier MetaMask pour Human Passport",
    walletReady: "Prêt à signer avec {{address}}.",
    walletLinking: "Signature…",
    walletLinked: "Portefeuille lié pour Human Passport.",
    walletUnlink: "Dissocier",
    walletUnlinking: "Dissociation…",
    walletTaken: "Ce portefeuille est déjà lié à un autre fondateur.",
    walletExpired: "Cette demande a expiré. Réessayez.",
    walletError: "Impossible de lier le portefeuille. Réessayez.",
    low: "Votre score Human Passport pour {{walletLabel}} {{wallet}} est {{score}}, {{need}} requis. Ajoutez des tampons sur app.passport.xyz, puis vérifiez de nouveau.",
    verified: "Human Passport vérifié.",
    telegramOptional: "Facultatif : vérifier d'abord avec Telegram",
    telegramError: "Impossible d'ouvrir le bot Telegram. Rechargez la page et réessayez.",
    errNotConfigured: "Human Passport n'est pas encore configuré dans cet environnement.",
    errNotRegistered: "Réclamez d'abord votre numéro de fondateur.",
    errInvalidCredential: "Human Passport n'a pas accepté cet élément. Construisez votre score sur app.passport.xyz, puis vérifiez de nouveau.",
    errWalletNotLinked: "Aucun portefeuille n'est encore lié à votre carte de fondateur. Connectez un portefeuille dans l'en-tête, puis réessayez.",
    errWalletMismatch: "Le portefeuille connecté diffère du portefeuille de votre carte de fondateur.",
    errSignIn: "Votre session a expiré. Reconnectez-vous et réessayez.",
    errVerificationFailed: "La vérification Human Passport a échoué. Réessayez plus tard.",
    errTimeout: "La vérification du score a pris trop de temps. Vérifiez votre connexion et réessayez.",
    errNetwork: "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.",
    retryCta: "Réessayer",
  },
  it: {
    stepOf: "Passo {{step}} di 4",
    step1Title: "Accedi",
    step1SignInBody: "La verifica è legata alla tua carta fondatore: accedi prima.",
    step1FounderBody: "Hai effettuato l'accesso, ma il tuo numero di fondatore non è ancora pronto. Ricarica per continuare.",
    signInCta: "Accedi",
    reloadCta: "Ricarica",
    step2Title: "Human Passport",
    step2Body: "Apri Human Passport, aggiungi lì i tuoi stamp e torna su questa pagina per controllare il punteggio.",
    step2Order: "In quest'ordine: apri Human Passport, costruisci il punteggio, poi controllalo qui.",
    openPassportCta: "Apri Human Passport",
    checkCta: "Ho finito, controlla il mio punteggio",
    checkBusy: "Controllo del punteggio…",
    welcomeBack: "Bentornato. Controlla il punteggio per completare.",
    scoredWallet: "Il controllo usa {{walletLabel}} {{wallet}}.",
    walletLabelPrimary: "wallet",
    walletLabelPassport: "wallet Human Passport",
    walletLabelNone: "ancora nessun wallet",
    walletDetails: "Usa invece un altro wallet",
    walletHint: "Accumula punti Human Passport su un wallet separato invece che sul tuo wallet fondatore.",
    walletCta: "Collega MetaMask per Human Passport",
    walletReady: "Pronto a firmare con {{address}}.",
    walletLinking: "Firma in corso…",
    walletLinked: "Wallet collegato per Human Passport.",
    walletUnlink: "Scollega",
    walletUnlinking: "Scollegamento…",
    walletTaken: "Quel wallet è già collegato a un altro fondatore.",
    walletExpired: "Quella richiesta è scaduta. Riprova.",
    walletError: "Impossibile collegare il wallet. Riprova.",
    low: "Il tuo punteggio Human Passport per {{walletLabel}} {{wallet}} è {{score}}, richiesto {{need}}. Aggiungi stamp su app.passport.xyz, poi controlla di nuovo.",
    verified: "Human Passport verificato.",
    telegramOptional: "Facoltativo: verifica prima con Telegram",
    telegramError: "Impossibile aprire il bot Telegram. Ricarica la pagina e riprova.",
    errNotConfigured: "Human Passport non è ancora configurato in questo ambiente.",
    errNotRegistered: "Richiedi prima il tuo numero di fondatore.",
    errInvalidCredential: "Human Passport non ha accettato questa credenziale. Costruisci il punteggio su app.passport.xyz, poi controlla di nuovo.",
    errWalletNotLinked: "Nessun wallet è ancora collegato alla tua carta fondatore. Collega un wallet nell'intestazione, poi riprova.",
    errWalletMismatch: "Il wallet connesso è diverso dal wallet della tua carta fondatore.",
    errSignIn: "La sessione è scaduta. Accedi di nuovo e riprova.",
    errVerificationFailed: "Verifica Human Passport non riuscita. Riprova più tardi.",
    errTimeout: "Il controllo del punteggio ha impiegato troppo tempo. Controlla la connessione e riprova.",
    errNetwork: "Impossibile raggiungere il server. Controlla la connessione e riprova.",
    retryCta: "Riprova",
  },
  pt: {
    stepOf: "Passo {{step}} de 4",
    step1Title: "Entre",
    step1SignInBody: "A verificação está ligada ao seu cartão de fundador, então entre primeiro.",
    step1FounderBody: "Você está conectado, mas seu número de fundador ainda não está pronto. Recarregue para continuar.",
    signInCta: "Entrar",
    reloadCta: "Recarregar",
    step2Title: "Human Passport",
    step2Body: "Abra o Human Passport, adicione seus selos lá e volte a esta página para verificar sua pontuação.",
    step2Order: "Nesta ordem: abra o Human Passport, aumente a pontuação e verifique aqui.",
    openPassportCta: "Abrir Human Passport",
    checkCta: "Já terminei, verificar minha pontuação",
    checkBusy: "Verificando sua pontuação…",
    welcomeBack: "Bem-vindo de volta. Verifique sua pontuação para concluir.",
    scoredWallet: "A verificação usa {{walletLabel}} {{wallet}}.",
    walletLabelPrimary: "carteira",
    walletLabelPassport: "carteira do Human Passport",
    walletLabelNone: "nenhuma carteira ainda",
    walletDetails: "Usar outra carteira em vez disso",
    walletHint: "Pontue no Human Passport com uma carteira separada em vez da sua carteira de fundador.",
    walletCta: "Vincular MetaMask para Human Passport",
    walletReady: "Pronto para assinar com {{address}}.",
    walletLinking: "Assinando…",
    walletLinked: "Carteira vinculada para Human Passport.",
    walletUnlink: "Desvincular",
    walletUnlinking: "Desvinculando…",
    walletTaken: "Essa carteira já está vinculada a outro fundador.",
    walletExpired: "Essa solicitação expirou. Tente novamente.",
    walletError: "Não foi possível vincular a carteira. Tente novamente.",
    low: "Sua pontuação do Human Passport para {{walletLabel}} {{wallet}} é {{score}}, necessário {{need}}. Adicione selos em app.passport.xyz e verifique de novo.",
    verified: "Human Passport verificado.",
    telegramOptional: "Opcional: verifique primeiro pelo Telegram",
    telegramError: "Não foi possível abrir o bot do Telegram. Recarregue a página e tente de novo.",
    errNotConfigured: "O Human Passport ainda não está configurado neste ambiente.",
    errNotRegistered: "Primeiro resgate seu número de fundador.",
    errInvalidCredential: "O Human Passport não aceitou essa credencial. Aumente sua pontuação em app.passport.xyz e verifique de novo.",
    errWalletNotLinked: "Ainda não há carteira vinculada ao seu cartão de fundador. Conecte uma carteira no cabeçalho e tente novamente.",
    errWalletMismatch: "A carteira conectada é diferente da carteira do seu cartão de fundador.",
    errSignIn: "Sua sessão expirou. Entre novamente e tente de novo.",
    errVerificationFailed: "A verificação do Human Passport falhou. Tente mais tarde.",
    errTimeout: "A verificação da pontuação demorou demais. Verifique sua conexão e tente novamente.",
    errNetwork: "Não foi possível alcançar o servidor. Verifique sua conexão e tente novamente.",
    retryCta: "Tentar novamente",
  },
  tr: {
    stepOf: "Adım {{step}} / 4",
    step1Title: "Giriş yapın",
    step1SignInBody: "Doğrulama kurucu kartınıza bağlıdır, bu yüzden önce giriş yapın.",
    step1FounderBody: "Giriş yaptınız ama kurucu numaranız henüz hazır değil. Devam etmek için sayfayı yenileyin.",
    signInCta: "Giriş yap",
    reloadCta: "Yenile",
    step2Title: "Human Passport",
    step2Body: "Human Passport'u açın, damgalarınızı ekleyin, sonra bu sayfaya dönüp puanınızı kontrol edin.",
    step2Order: "Şu sırayla: Human Passport'u açın, puanınızı oluşturun, sonra burada kontrol edin.",
    openPassportCta: "Human Passport'u aç",
    checkCta: "Bitirdim, puanımı kontrol et",
    checkBusy: "Puanınız kontrol ediliyor…",
    welcomeBack: "Tekrar hoş geldiniz. Bitirmek için puanınızı kontrol edin.",
    scoredWallet: "Kontrol {{walletLabel}} {{wallet}} üzerinde yapılır.",
    walletLabelPrimary: "cüzdan",
    walletLabelPassport: "Human Passport cüzdanı",
    walletLabelNone: "henüz cüzdan yok",
    walletDetails: "Bunun yerine başka bir cüzdan kullan",
    walletHint: "Human Passport puanını kurucu cüzdanınız yerine ayrı bir cüzdanda toplayın.",
    walletCta: "Human Passport için MetaMask bağla",
    walletReady: "{{address}} ile imzalamaya hazır.",
    walletLinking: "İmzalanıyor…",
    walletLinked: "Cüzdan Human Passport için bağlandı.",
    walletUnlink: "Bağlantıyı kaldır",
    walletUnlinking: "Bağlantı kaldırılıyor…",
    walletTaken: "Bu cüzdan zaten başka bir kurucuya bağlı.",
    walletExpired: "Bu istek süresi doldu. Tekrar deneyin.",
    walletError: "Cüzdan bağlanamadı. Tekrar deneyin.",
    low: "{{walletLabel}} {{wallet}} için Human Passport puanınız {{score}}, gereken {{need}}. app.passport.xyz üzerinden damga ekleyip tekrar kontrol edin.",
    verified: "Human Passport doğrulandı.",
    telegramOptional: "İsteğe bağlı: önce Telegram ile doğrula",
    telegramError: "Telegram botu açılamadı. Sayfayı yenileyip tekrar deneyin.",
    errNotConfigured: "Human Passport bu ortamda henüz yapılandırılmadı.",
    errNotRegistered: "Önce kurucu numaranızı alın.",
    errInvalidCredential: "Human Passport bu bilgiyi kabul etmedi. app.passport.xyz üzerinden puan oluşturup tekrar kontrol edin.",
    errWalletNotLinked: "Kurucu kartınıza henüz bir cüzdan bağlı değil. Üstteki başlıktan bir cüzdan bağlayıp tekrar deneyin.",
    errWalletMismatch: "Bağlı cüzdan, kurucu kartınızdaki cüzdandan farklı.",
    errSignIn: "Oturumunuz sona erdi. Yeniden giriş yapıp tekrar deneyin.",
    errVerificationFailed: "Human Passport doğrulaması başarısız oldu. Daha sonra tekrar deneyin.",
    errTimeout: "Puan kontrolü çok uzun sürdü. Bağlantınızı kontrol edip tekrar deneyin.",
    errNetwork: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.",
    retryCta: "Tekrar dene",
  },
  id: {
    stepOf: "Langkah {{step}} dari 4",
    step1Title: "Masuk",
    step1SignInBody: "Verifikasi terikat pada kartu pendiri Anda, jadi masuk dulu.",
    step1FounderBody: "Anda sudah masuk, tetapi nomor pendiri Anda belum siap. Muat ulang untuk melanjutkan.",
    signInCta: "Masuk",
    reloadCta: "Muat ulang",
    step2Title: "Human Passport",
    step2Body: "Buka Human Passport, tambahkan stempel Anda di sana, lalu kembali ke halaman ini dan periksa skor Anda.",
    step2Order: "Urutannya: buka Human Passport, bangun skor Anda, lalu periksa di sini.",
    openPassportCta: "Buka Human Passport",
    checkCta: "Saya sudah selesai, periksa skor saya",
    checkBusy: "Memeriksa skor Anda…",
    welcomeBack: "Selamat datang kembali. Periksa skor Anda untuk menyelesaikan.",
    scoredWallet: "Pemeriksaan memakai {{walletLabel}} {{wallet}}.",
    walletLabelPrimary: "dompet",
    walletLabelPassport: "dompet Human Passport",
    walletLabelNone: "belum ada dompet",
    walletDetails: "Pakai dompet lain saja",
    walletHint: "Kumpulkan skor Human Passport di dompet terpisah, bukan dompet pendiri Anda.",
    walletCta: "Tautkan MetaMask untuk Human Passport",
    walletReady: "Siap menandatangani dengan {{address}}.",
    walletLinking: "Menandatangani…",
    walletLinked: "Dompet tertaut untuk Human Passport.",
    walletUnlink: "Lepas tautan",
    walletUnlinking: "Melepas tautan…",
    walletTaken: "Dompet itu sudah tertaut ke pendiri lain.",
    walletExpired: "Permintaan itu sudah kedaluwarsa. Coba lagi.",
    walletError: "Tidak bisa menautkan dompet. Coba lagi.",
    low: "Skor Human Passport Anda untuk {{walletLabel}} {{wallet}} adalah {{score}}, diperlukan {{need}}. Tambahkan stempel di app.passport.xyz lalu periksa lagi.",
    verified: "Human Passport terverifikasi.",
    telegramOptional: "Opsional: verifikasi dulu lewat Telegram",
    telegramError: "Bot Telegram tidak bisa dibuka. Muat ulang halaman lalu coba lagi.",
    errNotConfigured: "Human Passport belum dikonfigurasi di lingkungan ini.",
    errNotRegistered: "Klaim dulu nomor pendiri Anda.",
    errInvalidCredential: "Human Passport tidak menerima kredensial itu. Bangun skor Anda di app.passport.xyz lalu periksa lagi.",
    errWalletNotLinked: "Belum ada dompet yang tertaut ke kartu pendiri Anda. Hubungkan dompet di header, lalu coba lagi.",
    errWalletMismatch: "Dompet yang terhubung berbeda dari dompet pada kartu pendiri Anda.",
    errSignIn: "Sesi Anda berakhir. Masuk lagi dan coba ulang.",
    errVerificationFailed: "Verifikasi Human Passport gagal. Coba lagi nanti.",
    errTimeout: "Pemeriksaan skor terlalu lama. Periksa koneksi Anda lalu coba lagi.",
    errNetwork: "Server tidak bisa dihubungi. Periksa koneksi Anda lalu coba lagi.",
    retryCta: "Coba lagi",
  },
  zh: {
    stepOf: "第 {{step}} 步，共 4 步",
    step1Title: "登录",
    step1SignInBody: "验证与您的创始人卡片绑定，请先登录。",
    step1FounderBody: "您已登录，但创始人编号尚未就绪。请重新加载以继续。",
    signInCta: "登录",
    reloadCta: "重新加载",
    step2Title: "Human Passport",
    step2Body: "打开 Human Passport，在那里添加戳记，然后回到本页检查您的分数。",
    step2Order: "顺序是：打开 Human Passport，提升分数，然后在这里检查。",
    openPassportCta: "打开 Human Passport",
    checkCta: "我已完成，检查我的分数",
    checkBusy: "正在检查您的分数…",
    welcomeBack: "欢迎回来。检查分数即可完成。",
    scoredWallet: "检查将使用{{walletLabel}} {{wallet}}。",
    walletLabelPrimary: "钱包",
    walletLabelPassport: "Human Passport 钱包",
    walletLabelNone: "尚未绑定钱包",
    walletDetails: "改用其他钱包",
    walletHint: "用一个独立的钱包来累积 Human Passport 分数，而不是用您的创始人钱包。",
    walletCta: "绑定 MetaMask 用于 Human Passport",
    walletReady: "已准备好用 {{address}} 签名。",
    walletLinking: "签名中…",
    walletLinked: "钱包已绑定用于 Human Passport。",
    walletUnlink: "取消绑定",
    walletUnlinking: "正在取消绑定…",
    walletTaken: "该钱包已绑定到另一位创始人。",
    walletExpired: "该请求已过期，请重试。",
    walletError: "无法绑定钱包，请重试。",
    low: "您在{{walletLabel}} {{wallet}} 上的 Human Passport 分数为 {{score}}，需要 {{need}}。请在 app.passport.xyz 添加戳记后再次检查。",
    verified: "Human Passport 已验证。",
    telegramOptional: "可选：先用 Telegram 验证",
    telegramError: "无法打开 Telegram 机器人，请刷新页面后重试。",
    errNotConfigured: "此环境尚未配置 Human Passport。",
    errNotRegistered: "请先领取您的创始人编号。",
    errInvalidCredential: "Human Passport 未接受该凭据。请在 app.passport.xyz 提升分数后再次检查。",
    errWalletNotLinked: "您的创始人卡片尚未绑定钱包。请在页头连接钱包后重试。",
    errWalletMismatch: "已连接的钱包与您创始人卡片上的钱包不同。",
    errSignIn: "会话已过期。请重新登录后再试。",
    errVerificationFailed: "Human Passport 验证失败，请稍后再试。",
    errTimeout: "分数检查耗时过长。请检查网络后重试。",
    errNetwork: "无法连接服务器。请检查网络后重试。",
    retryCta: "重试",
  },
  vi: {
    stepOf: "Bước {{step}}/4",
    step1Title: "Đăng nhập",
    step1SignInBody: "Xác minh gắn với thẻ nhà sáng lập của bạn, nên hãy đăng nhập trước.",
    step1FounderBody: "Bạn đã đăng nhập nhưng số nhà sáng lập chưa sẵn sàng. Hãy tải lại để tiếp tục.",
    signInCta: "Đăng nhập",
    reloadCta: "Tải lại",
    step2Title: "Human Passport",
    step2Body: "Mở Human Passport, thêm stamp ở đó, rồi quay lại trang này để kiểm tra điểm của bạn.",
    step2Order: "Theo thứ tự: mở Human Passport, tích điểm, rồi kiểm tra tại đây.",
    openPassportCta: "Mở Human Passport",
    checkCta: "Tôi đã xong, kiểm tra điểm",
    checkBusy: "Đang kiểm tra điểm của bạn…",
    welcomeBack: "Chào mừng trở lại. Hãy kiểm tra điểm để hoàn tất.",
    scoredWallet: "Kiểm tra sẽ dùng {{walletLabel}} {{wallet}}.",
    walletLabelPrimary: "ví",
    walletLabelPassport: "ví Human Passport",
    walletLabelNone: "chưa có ví",
    walletDetails: "Dùng ví khác thay thế",
    walletHint: "Tích điểm Human Passport trên một ví riêng thay vì ví nhà sáng lập của bạn.",
    walletCta: "Liên kết MetaMask cho Human Passport",
    walletReady: "Sẵn sàng ký với {{address}}.",
    walletLinking: "Đang ký…",
    walletLinked: "Đã liên kết ví cho Human Passport.",
    walletUnlink: "Hủy liên kết",
    walletUnlinking: "Đang hủy liên kết…",
    walletTaken: "Ví đó đã được liên kết với một nhà sáng lập khác.",
    walletExpired: "Yêu cầu đó đã hết hạn. Hãy thử lại.",
    walletError: "Không thể liên kết ví. Hãy thử lại.",
    low: "Điểm Human Passport của bạn cho {{walletLabel}} {{wallet}} là {{score}}, cần {{need}}. Hãy thêm stamp tại app.passport.xyz rồi kiểm tra lại.",
    verified: "Đã xác minh Human Passport.",
    telegramOptional: "Tùy chọn: xác minh bằng Telegram trước",
    telegramError: "Không mở được bot Telegram. Hãy tải lại trang và thử lại.",
    errNotConfigured: "Human Passport chưa được cấu hình trong môi trường này.",
    errNotRegistered: "Hãy nhận số nhà sáng lập trước.",
    errInvalidCredential: "Human Passport không chấp nhận thông tin đó. Hãy tích điểm tại app.passport.xyz rồi kiểm tra lại.",
    errWalletNotLinked: "Chưa có ví nào được liên kết với thẻ nhà sáng lập của bạn. Hãy kết nối ví ở thanh đầu trang rồi thử lại.",
    errWalletMismatch: "Ví đang kết nối khác với ví trên thẻ nhà sáng lập của bạn.",
    errSignIn: "Phiên đã hết hạn. Hãy đăng nhập lại và thử lại.",
    errVerificationFailed: "Xác minh Human Passport thất bại. Hãy thử lại sau.",
    errTimeout: "Kiểm tra điểm mất quá lâu. Hãy kiểm tra kết nối rồi thử lại.",
    errNetwork: "Không kết nối được máy chủ. Hãy kiểm tra kết nối rồi thử lại.",
    retryCta: "Thử lại",
  },
  ar: {
    stepOf: "الخطوة {{step}} من 4",
    step1Title: "تسجيل الدخول",
    step1SignInBody: "التحقق مرتبط ببطاقة المؤسس، لذا سجّل الدخول أولًا.",
    step1FounderBody: "أنت مسجّل الدخول، لكن رقم المؤسس ليس جاهزًا بعد. حدّث الصفحة للمتابعة.",
    signInCta: "تسجيل الدخول",
    reloadCta: "تحديث الصفحة",
    step2Title: "Human Passport",
    step2Body: "افتح Human Passport وأضف أختامك هناك، ثم ارجع إلى هذه الصفحة وتحقق من نتيجتك.",
    step2Order: "بالترتيب: افتح Human Passport، وارفع نتيجتك، ثم تحقق منها هنا.",
    openPassportCta: "فتح Human Passport",
    checkCta: "انتهيت، تحقق من نتيجتي",
    checkBusy: "جارٍ التحقق من نتيجتك…",
    welcomeBack: "أهلًا بعودتك. تحقق من نتيجتك للإنهاء.",
    scoredWallet: "سيتم التحقق من {{walletLabel}} {{wallet}}.",
    walletLabelPrimary: "المحفظة",
    walletLabelPassport: "محفظة Human Passport",
    walletLabelNone: "لا توجد محفظة بعد",
    walletDetails: "استخدام محفظة أخرى بدلًا من ذلك",
    walletHint: "احصل على نقاط Human Passport في محفظة مستقلة بدلًا من محفظة المؤسس.",
    walletCta: "ربط MetaMask لـ Human Passport",
    walletReady: "جاهز للتوقيع بـ {{address}}.",
    walletLinking: "جارٍ التوقيع…",
    walletLinked: "تم ربط المحفظة لـ Human Passport.",
    walletUnlink: "إلغاء الربط",
    walletUnlinking: "جارٍ إلغاء الربط…",
    walletTaken: "هذه المحفظة مرتبطة بالفعل بمؤسس آخر.",
    walletExpired: "انتهت صلاحية هذا الطلب. حاول مجددًا.",
    walletError: "تعذّر ربط المحفظة. حاول مجددًا.",
    low: "نتيجتك في Human Passport لـ {{walletLabel}} {{wallet}} هي {{score}}، والمطلوب {{need}}. أضف أختامًا على app.passport.xyz ثم تحقق مجددًا.",
    verified: "تم التحقق عبر Human Passport.",
    telegramOptional: "اختياري: التحقق عبر Telegram أولًا",
    telegramError: "تعذّر فتح بوت Telegram. حدّث الصفحة وحاول مجددًا.",
    errNotConfigured: "لم يتم إعداد Human Passport في هذه البيئة بعد.",
    errNotRegistered: "احصل أولًا على رقم المؤسس الخاص بك.",
    errInvalidCredential: "لم يقبل Human Passport هذه البيانات. ارفع نتيجتك على app.passport.xyz ثم تحقق مجددًا.",
    errWalletNotLinked: "لا توجد محفظة مرتبطة ببطاقة المؤسس حتى الآن. اربط محفظة من الترويسة ثم حاول مجددًا.",
    errWalletMismatch: "المحفظة المتصلة تختلف عن المحفظة الموجودة على بطاقة المؤسس.",
    errSignIn: "انتهت جلستك. سجّل الدخول من جديد وأعد المحاولة.",
    errVerificationFailed: "فشل التحقق عبر Human Passport. حاول لاحقًا.",
    errTimeout: "استغرق التحقق وقتًا طويلًا. تحقق من اتصالك وحاول مجددًا.",
    errNetwork: "تعذّر الوصول إلى الخادم. تحقق من اتصالك وحاول مجددًا.",
    retryCta: "إعادة المحاولة",
  },
};
