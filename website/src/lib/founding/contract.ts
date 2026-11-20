/**
 * Founding 1,000 conversion layer: shared, client-safe contract between the UI capture layer
 * (sticky bar, drawer, exit modal, progress widget, simulator) and the server routes
 * (Telegram cold-start claim, email waitlist). No Node-only imports here.
 *
 * Framing rule: the roster and order stay sealed until 1,000 verified wallets lock in. Never
 * expose a live counter or a seat/order number anywhere in the UI.
 */

/** Same bot as the session-code flow (`TELEGRAM_VERIFY_BOT_USERNAME` in telegram-bot.ts). */
export const FOUNDING_TELEGRAM_BOT_USERNAME = "PeopleVerifyBot";

/** PEOPLE Mainnet Beta opening (matches PPL_V2_OPEN_DATE_FALLBACK in bounty-countdown.ts). */
export const FOUNDING_MAINNET_BETA_OPEN_ISO = "2026-12-01T00:00:00.000Z";

/** Size of the sealed Founding roster. Used in copy only, never as a live counter. */
export const FOUNDING_ROSTER_SIZE = 1_000;

/**
 * Cold-start `/start` payload prefix (no session code, no wallet). Telegram allows
 * `[A-Za-z0-9_-]{1,64}` in start parameters.
 */
export const FOUNDING_TG_COLD_START_PREFIX = "f1000";

/** Query param the bot's claim button carries back to the site: `/founders?tg_claim=<token>`. */
export const FOUNDING_TG_CLAIM_PARAM = "tg_claim";

/** Claim tokens are base64url, 32 random bytes → 43 chars. */
export const FOUNDING_TG_CLAIM_TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

/** localStorage key of the not-yet-bound Telegram claim (token + when it was stored). */
export const FOUNDING_PENDING_CLAIM_STORAGE_KEY = "people_founding_tg_claim";

export const FOUNDING_API = {
  /** POST { token } → binds a pending Telegram verification to the signed-in wallet founder. */
  telegramClaim: "/api/founders/telegram/claim",
  /** POST { email, locale?, path? } → email waitlist (always generic success for valid input). */
  waitlist: "/api/founders/waitlist",
  /** GET → session + founder state (existing). */
  me: "/api/founders/me",
} as const;

/** Window event the bar/drawer/CTAs dispatch to open the single Founding 1,000 modal. */
export const FOUNDING_OPEN_EVENT = "people:founding-open";

export type FoundingOpenSource =
  | "sticky_bar"
  | "drawer"
  | "exit_intent"
  | "progress"
  | "simulator"
  | "cta"
  | "nav";

/** Dispatch from any client component to open the Founding 1,000 modal. */
export function openFoundingModal(source: FoundingOpenSource = "cta"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FOUNDING_OPEN_EVENT, { detail: { source } }));
}

const LOCALE_RE = /^[a-z]{2,3}$/;
const REF_RE = /^[A-Za-z0-9]{4,32}$/;

/**
 * Cold-start deep link: `https://t.me/PeopleVerifyBot?start=f1000_<locale>[_<ref>]`.
 * Works without a session or wallet; the bot asks for the phone contact and replies with a
 * one-time claim link back to /founders.
 */
export function telegramColdStartLink(locale?: string | null, ref?: string | null): string {
  const parts: string[] = [FOUNDING_TG_COLD_START_PREFIX];
  const lc = (locale ?? "").toLowerCase();
  if (LOCALE_RE.test(lc)) parts.push(lc);
  const r = (ref ?? "").trim();
  if (parts.length === 2 && REF_RE.test(r)) parts.push(r);
  const payload = parts.join("_").slice(0, 64);
  return `https://t.me/${FOUNDING_TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(payload)}`;
}

/** Parses a cold-start payload; returns null for anything else (e.g. a session code). */
export function parseColdStartPayload(
  payload: string,
): { locale: string | null; ref: string | null } | null {
  const raw = payload.trim();
  if (raw === FOUNDING_TG_COLD_START_PREFIX) return { locale: null, ref: null };
  if (!raw.startsWith(`${FOUNDING_TG_COLD_START_PREFIX}_`)) return null;
  const [, locale, ref, ...rest] = raw.split("_");
  if (rest.length > 0) return null;
  if (!locale || !LOCALE_RE.test(locale)) return null;
  if (ref !== undefined && !REF_RE.test(ref)) return null;
  return { locale, ref: ref ?? null };
}
