/**
 * The Human Passport verification flow is one linear path with four steps:
 *
 *   1. sign in (and get a founder number)
 *   2. build the score at app.passport.xyz, linking a wallet if needed
 *   3. check the score on the server
 *   4. verified — level 2, saved server-side
 *
 * This module is the React-free half of that flow: step resolution, response
 * classification, progress persistence and wallet formatting. The UI
 * (`components/founders/HumanPassportFlow.tsx`) is a thin renderer over these
 * rules, so every branch below is unit-tested without a browser.
 *
 * Progress is persisted because the flow is guaranteed to leave the page: the
 * external Passport hop, the mobile wallet app switch and the Web3Auth redirect
 * sign-in all reload the document. Only `localStorage` survives that, so the
 * helpers take `storage` as an argument (see `country-choice.ts`) and the
 * browser wrappers are the only part that touch `localStorage`.
 */

import { getAddress, isAddress } from "viem";
import { VERIFICATION_LEVEL_STRONG } from "./verification.ts";

/** Four visible steps: the indicator reads "Step N of 4". */
export const HUMAN_PASSPORT_STEPS = 4;

/** The external scorer. The one and only place the flow sends the user. */
export const HUMAN_PASSPORT_APP_URL = "https://app.passport.xyz";

/**
 * Ceiling for the server-side score check. The wallet-connect path has its own
 * `EXT_CONNECT_TIMEOUT_MS = 60_000`, which stays untouched; this one only bounds
 * the POST to `/api/founders/verify/human-passport` so a hung request cannot
 * leave the button spinning forever.
 */
export const HUMAN_PASSPORT_CHECK_TIMEOUT_MS = 20_000;

export type HumanPassportStep = 1 | 2 | 3 | 4;

/** Which wallet the server scores. Mirrors `human-passport-verify.ts`. */
export type HumanPassportWalletKind = "passport" | "primary";

export type HumanPassportFailureCode =
  | "not_configured"
  | "not_registered"
  | "invalid_credential"
  | "wallet_not_linked"
  | "wallet_mismatch"
  | "sign_in_required"
  | "verification_failed"
  | "timeout"
  | "network";

export type HumanPassportCheckResult =
  | { kind: "verified" }
  | {
      kind: "too_low";
      /** Formatted for display (`"17.3"`, or `"?"` when the server sent nonsense). */
      score: string;
      threshold: string;
      walletKind: HumanPassportWalletKind;
    }
  | { kind: "failed"; code: HumanPassportFailureCode; retryable: boolean };

/**
 * Failures worth a retry button: the check itself broke (server 5xx, timeout,
 * network). Everything else is a user-actionable state — sign in, claim a
 * number, link a wallet, build the score — where retrying the same request
 * would fail identically.
 */
const RETRYABLE_CODES: readonly HumanPassportFailureCode[] = ["verification_failed", "timeout", "network"];

const KNOWN_CODES: readonly string[] = [
  "not_configured",
  "not_registered",
  "invalid_credential",
  "wallet_not_linked",
  "wallet_mismatch",
  "sign_in_required",
  "verification_failed",
  "timeout",
  "network",
];

/** The step the user is actually on, from server truth plus the in-flight flag. */
export function resolveHumanPassportStep(input: {
  signedIn: boolean;
  hasFounder: boolean;
  verificationLevel: number;
  checking: boolean;
}): HumanPassportStep {
  // Verified outranks everything: `/me` may still be refreshing after the check,
  // and a verified founder must never be bounced back to step 1.
  if (input.verificationLevel >= VERIFICATION_LEVEL_STRONG) return 4;
  if (!input.signedIn || !input.hasFounder) return 1;
  if (input.checking) return 3;
  return 2;
}

/** Numeric display with one decimal; `"?"` when the field is missing or unparseable. */
function formatScore(value: unknown): string {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  return Number.isFinite(n) ? n.toFixed(1) : "?";
}

/**
 * Maps one score-check response (or a client-side transport failure, passed as
 * `status = 0` with a synthetic `network`/`timeout` code) onto the flow's three
 * outcomes. Kept pure so the UI never branches on raw status codes.
 */
export function classifyHumanPassportResponse(
  status: number,
  payload: { error?: unknown; score?: unknown; threshold?: unknown; walletKind?: unknown },
): HumanPassportCheckResult {
  if (status >= 200 && status < 300) return { kind: "verified" };

  const error = typeof payload.error === "string" ? payload.error : "";

  if (error === "score_too_low") {
    return {
      kind: "too_low",
      score: formatScore(payload.score),
      threshold: formatScore(payload.threshold),
      // The server says which wallet it scored; anything unexpected means the
      // founder wallet, matching the server's own default.
      walletKind: payload.walletKind === "passport" ? "passport" : "primary",
    };
  }

  const code: HumanPassportFailureCode = KNOWN_CODES.includes(error)
    ? (error as HumanPassportFailureCode)
    : // No usable error body. An expired session is the one status worth naming;
    // everything else (5xx, proxies, empty bodies) is a retryable check failure.
    status === 401
      ? "sign_in_required"
      : status === 503
        ? "not_configured"
        : "verification_failed";

  return { kind: "failed", code, retryable: RETRYABLE_CODES.includes(code) };
}

export const HUMAN_PASSPORT_PROGRESS_KEY = "ppl_human_passport_progress";

/** Progress older than this is treated as absent, so a stale step never traps the user. */
export const HUMAN_PASSPORT_PROGRESS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type HumanPassportProgress = {
  step: HumanPassportStep;
  /** Epoch ms when the step was recorded. */
  at: number;
  /** The wallet the score check will use, lowercase; null when nothing is linked yet. */
  wallet: string | null;
};

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem" | "removeItem">;

function isStep(value: unknown): value is HumanPassportStep {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function isFresh(progress: HumanPassportProgress, now: number): boolean {
  return now - progress.at >= 0 && now - progress.at <= HUMAN_PASSPORT_PROGRESS_MAX_AGE_MS;
}

/** The stored progress, or null when absent, corrupt, expired or shaped wrong. */
export function readHumanPassportProgress(storage: ReadableStorage, now: number): HumanPassportProgress | null {
  let raw: string | null;
  try {
    raw = storage.getItem(HUMAN_PASSPORT_PROGRESS_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { step?: unknown; at?: unknown; wallet?: unknown };
    if (!isStep(parsed.step)) return null;
    if (typeof parsed.at !== "number" || !Number.isFinite(parsed.at)) return null;
    const progress: HumanPassportProgress = {
      step: parsed.step,
      at: parsed.at,
      wallet: typeof parsed.wallet === "string" && parsed.wallet ? parsed.wallet : null,
    };
    return isFresh(progress, now) ? progress : null;
  } catch {
    return null;
  }
}

export function writeHumanPassportProgress(storage: WritableStorage, progress: HumanPassportProgress): void {
  try {
    storage.setItem(HUMAN_PASSPORT_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    /* storage blocked (private mode / quota): the in-memory step still works for this load */
  }
}

export function clearHumanPassportProgress(storage: WritableStorage): void {
  try {
    storage.removeItem(HUMAN_PASSPORT_PROGRESS_KEY);
  } catch {
    /* storage blocked: nothing to clear */
  }
}

/**
 * True while the user is mid-visit to the external scorer: steps 2 and 3 mean
 * "sent to Passport / score check in flight". The UI uses it to greet a
 * returning user with the check button instead of restarting them at step 1.
 * Step 1 (nothing done) and step 4 (verified) are never a pending visit.
 */
export function hasPendingPassportVisit(progress: HumanPassportProgress | null, now: number): boolean {
  if (!progress) return false;
  if (!isFresh(progress, now)) return false;
  return progress.step === 2 || progress.step === 3;
}

/**
 * The wallet the server will score, and under which label. Identical rule to
 * `human-passport-verify.ts`: the separately linked Passport wallet wins over
 * the founder wallet whenever it is a valid address. Null when neither is
 * usable — the server reports that as `wallet_not_linked`.
 */
export function passportScoredWallet(
  passportWallet: string | null | undefined,
  primaryWallet: string | null | undefined,
): { kind: HumanPassportWalletKind; address: string } | null {
  const passportLinked = passportWallet?.trim();
  const kind: HumanPassportWalletKind = passportLinked && isAddress(passportLinked, { strict: false }) ? "passport" : "primary";
  const linked = kind === "passport" ? passportLinked : primaryWallet?.trim();
  if (!linked || !isAddress(linked, { strict: false })) return null;
  return { kind, address: getAddress(linked) };
}

/** `0x1234…abcd`. Anything too short to shorten is returned trimmed, never mangled. */
export function maskAddress(address: string | null | undefined): string {
  const value = typeof address === "string" ? address.trim() : "";
  if (value.length < 10) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function browserLocalStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

/** Browser wrapper. Safe during SSR (reads null). */
export function readPersistedHumanPassportProgress(): HumanPassportProgress | null {
  const store = browserLocalStorage();
  return store ? readHumanPassportProgress(store, Date.now()) : null;
}

/** Browser wrapper. Safe during SSR (no-op). */
export function persistHumanPassportProgress(progress: Omit<HumanPassportProgress, "at">): void {
  const store = browserLocalStorage();
  if (store) writeHumanPassportProgress(store, { ...progress, at: Date.now() });
}

/** Browser wrapper. Safe during SSR (no-op). */
export function clearPersistedHumanPassportProgress(): void {
  const store = browserLocalStorage();
  if (store) clearHumanPassportProgress(store);
}
