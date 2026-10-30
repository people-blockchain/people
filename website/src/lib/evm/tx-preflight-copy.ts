/**
 * Localized copy and error ABI for the create-form preflight (`tx-preflight.ts`).
 *
 * EN is the base; every locale has a full `tx-preflight-<lang>.json` merged over EN so a missing
 * key can never render `undefined`. Same pattern as `nft-media-copy.ts`.
 */
import type { Abi } from "viem";
import type { Language } from "@/lib/preferences";
import en from "@/lib/locales/surfaces/tx-preflight-en.json" with { type: "json" };
import ru from "@/lib/locales/surfaces/tx-preflight-ru.json" with { type: "json" };
import es from "@/lib/locales/surfaces/tx-preflight-es.json" with { type: "json" };
import pt from "@/lib/locales/surfaces/tx-preflight-pt.json" with { type: "json" };
import fr from "@/lib/locales/surfaces/tx-preflight-fr.json" with { type: "json" };
import de from "@/lib/locales/surfaces/tx-preflight-de.json" with { type: "json" };
import it from "@/lib/locales/surfaces/tx-preflight-it.json" with { type: "json" };
import tr from "@/lib/locales/surfaces/tx-preflight-tr.json" with { type: "json" };
import vi from "@/lib/locales/surfaces/tx-preflight-vi.json" with { type: "json" };
import id from "@/lib/locales/surfaces/tx-preflight-id.json" with { type: "json" };
import zh from "@/lib/locales/surfaces/tx-preflight-zh.json" with { type: "json" };
import ar from "@/lib/locales/surfaces/tx-preflight-ar.json" with { type: "json" };
import { isDailyLimitRevert, type RevertReason } from "./tx-preflight";

export type TxPreflightCopy = typeof en;

const rawByLanguage: Record<Language, Partial<TxPreflightCopy>> = { en, ru, es, pt, fr, de, it, tr, vi, id, zh, ar };

export const txPreflightCopy: Record<Language, TxPreflightCopy> = Object.fromEntries(
  Object.entries(rawByLanguage).map(([lang, copy]) => [lang, { ...en, ...copy }]),
) as Record<Language, TxPreflightCopy>;

/**
 * Custom errors a token-create transaction can revert with: the stablecoin gateway's own plus the
 * OpenZeppelin ones raised by its `safeTransferFrom` and pausable modifier.
 */
export const CREATE_FLOW_ERRORS_ABI = [
  { type: "error", name: "StableNotAccepted", inputs: [{ name: "stable", type: "address" }] },
  { type: "error", name: "DailyCapExceeded", inputs: [{ name: "payer", type: "address" }] },
  {
    type: "error",
    name: "InsufficientFloat",
    inputs: [
      { name: "requested", type: "uint256" },
      { name: "available", type: "uint256" },
    ],
  },
  { type: "error", name: "FeeOutOfBounds", inputs: [{ name: "amountUsd6", type: "uint256" }] },
  { type: "error", name: "PplTransferFailed", inputs: [] },
  { type: "error", name: "EnforcedPause", inputs: [] },
  { type: "error", name: "Unauthorized", inputs: [] },
  {
    type: "error",
    name: "ERC20InsufficientAllowance",
    inputs: [
      { name: "spender", type: "address" },
      { name: "allowance", type: "uint256" },
      { name: "needed", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "ERC20InsufficientBalance",
    inputs: [
      { name: "sender", type: "address" },
      { name: "balance", type: "uint256" },
      { name: "needed", type: "uint256" },
    ],
  },
  { type: "error", name: "SafeERC20FailedOperation", inputs: [{ name: "token", type: "address" }] },
] as const satisfies Abi;

const FRIENDLY_REVERT = {
  InsufficientFloat: "errorInsufficientFloat",
  StableNotAccepted: "errorStableNotAccepted",
  FeeOutOfBounds: "errorFeeOutOfBounds",
  PplTransferFailed: "errorPplTransferFailed",
  EnforcedPause: "errorEnforcedPause",
  Unauthorized: "errorUnauthorized",
  ERC20InsufficientAllowance: "errorErc20Allowance",
  ERC20InsufficientBalance: "errorErc20Balance",
  SafeERC20FailedOperation: "errorSafeTransfer",
} as const satisfies Record<string, keyof TxPreflightCopy>;

function friendlyRevertKey(name: string | undefined): keyof typeof FRIENDLY_REVERT | undefined {
  if (!name || !Object.prototype.hasOwnProperty.call(FRIENDLY_REVERT, name)) return undefined;
  return name as keyof typeof FRIENDLY_REVERT;
}

/**
 * User-facing text for a preflight revert. Known custom errors get a sentence from the locale.
 * `Error(string)` still includes the contract's own sentence. The raw custom-error text stays out
 * of this string; `preflightErrorDetails` returns it for the details toggle.
 */
export function preflightErrorMessage(
  reason: RevertReason,
  t: TxPreflightCopy,
  opts: { payingWithStable: boolean },
): string {
  if (isDailyLimitRevert(reason)) return t.preflightDailyLimit;
  const key = friendlyRevertKey(reason.errorName);
  if (key) {
    const friendly = t[FRIENDLY_REVERT[key]];
    if (opts.payingWithStable && !friendly.includes("PPL")) return `${friendly} ${t.preflightPayInPplHint}`;
    return friendly;
  }
  const known = reason.kind === "error" || reason.kind === "custom" || reason.kind === "panic";
  const base = known && reason.message ? t.preflightRevert.replace("{reason}", reason.message) : t.preflightRevertGeneric;
  return opts.payingWithStable ? `${base} ${t.preflightPayInPplHint}` : base;
}

/** Raw revert text for a known custom error. Empty for `Error(string)`, panics, and unknown noise. */
export function preflightErrorDetails(reason: RevertReason): string {
  const raw = reason.message ?? "";
  if (isDailyLimitRevert(reason)) return raw;
  if (!friendlyRevertKey(reason.errorName)) return "";
  return raw;
}
