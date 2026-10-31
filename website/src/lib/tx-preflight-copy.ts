/**
 * User-facing text for a transaction that the preflight refused to send (see `evm/tx-preflight`).
 *
 * EN is the base; every locale has a full `tx-preflight-<lang>.json`, deep-merged over EN so a
 * missing key can never render `undefined`. Same pattern as `nft-media-copy.ts`.
 */

import type { Language } from "./preferences";
import { TxPreflightError, isDailyLimitRevert } from "./evm/tx-preflight";
import en from "./locales/surfaces/tx-preflight-en.json" with { type: "json" };
import ru from "./locales/surfaces/tx-preflight-ru.json" with { type: "json" };
import es from "./locales/surfaces/tx-preflight-es.json" with { type: "json" };
import pt from "./locales/surfaces/tx-preflight-pt.json" with { type: "json" };
import fr from "./locales/surfaces/tx-preflight-fr.json" with { type: "json" };
import de from "./locales/surfaces/tx-preflight-de.json" with { type: "json" };
import it from "./locales/surfaces/tx-preflight-it.json" with { type: "json" };
import tr from "./locales/surfaces/tx-preflight-tr.json" with { type: "json" };
import vi from "./locales/surfaces/tx-preflight-vi.json" with { type: "json" };
import id from "./locales/surfaces/tx-preflight-id.json" with { type: "json" };
import zh from "./locales/surfaces/tx-preflight-zh.json" with { type: "json" };
import ar from "./locales/surfaces/tx-preflight-ar.json" with { type: "json" };

export type TxPreflightCopy = typeof en;

const rawByLanguage: Record<Language, Partial<TxPreflightCopy>> = { en, ru, es, pt, fr, de, it, tr, vi, id, zh, ar };

export const txPreflightCopy: Record<Language, TxPreflightCopy> = Object.fromEntries(
  Object.entries(rawByLanguage).map(([lang, copy]) => [lang, { ...en, ...copy }]),
) as Record<Language, TxPreflightCopy>;

const MAX_REASON_LENGTH = 200;

/**
 * Localized explanation for a refused transaction, or `null` when `err` is not a preflight refusal
 * (callers keep their own message then). `offerPpl` is true when paying in PPL would avoid the
 * revert, so the screen can show a "pay in PPL instead" action next to the text.
 */
export function describePreflightError(
  err: unknown,
  lang: Language,
): { text: string; offerPpl: boolean } | null {
  if (!(err instanceof TxPreflightError)) return null;
  const copy = txPreflightCopy[lang] ?? en;
  const { reason } = err;
  if (isDailyLimitRevert(reason)) return { text: copy.dailyLimit, offerPpl: true };
  if (reason.errorName === "InsufficientFloat") return { text: copy.stableUnavailable, offerPpl: true };
  if (reason.kind === "panic") {
    return { text: copy.panic.replaceAll("{code}", `0x${(reason.panicCode ?? BigInt(0)).toString(16)}`), offerPpl: false };
  }
  if (reason.kind === "unknown" || !reason.message.trim()) return { text: copy.revertedNoReason, offerPpl: false };
  return { text: copy.reverted.replaceAll("{reason}", reason.message.trim().slice(0, MAX_REASON_LENGTH)), offerPpl: false };
}
