/**
 * Payment memo ("Назначение платежа") for native PPL transfers.
 *
 * The People chain is a Cosmos SDK EVM chain and the wallet sends native transfers as
 * EVM transactions, which have no memo field. The honest on-chain carrier is the
 * transaction `data` (calldata) of a plain value transfer to an externally owned
 * account: the memo is the UTF-8 bytes of the text, is part of the signed transaction
 * and is therefore publicly readable by anyone (explorer, RPC). It is never stored
 * client-side only.
 */
import { bytesToHex, hexToBytes, type Hex } from "viem";

/** Same ceiling as Cosmos `MaxMemoCharacters` (256). The EVM path has no protocol limit of its own. */
export const MEMO_MAX_CHARS = 256;

export type MemoError = "long" | "invalid";

export type MemoCheck = { ok: true; memo: string } | { ok: false; error: MemoError };

// C0 controls (except tab/newline), DEL, C1 controls, and bidi/zero-width format characters.
const FORBIDDEN = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\uFFFD]/;

/** Length as users count it: code points, so one emoji is one character. */
export function memoLength(text: string): number {
  return Array.from(text).length;
}

/** Normalise and validate user input. Empty / whitespace-only memo is valid and means "no memo". */
export function validateMemo(raw: string): MemoCheck {
  const memo = raw.normalize("NFC").trim();
  if (memoLength(memo) > MEMO_MAX_CHARS) return { ok: false, error: "long" };
  if (FORBIDDEN.test(memo)) return { ok: false, error: "invalid" };
  // Lone surrogates cannot be encoded as UTF-8.
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(memo)) {
    return { ok: false, error: "invalid" };
  }
  return { ok: true, memo };
}

/** Transaction `data` for a memo, or undefined when there is nothing to attach. */
export function memoToData(memo: string | undefined): Hex | undefined {
  if (!memo) return undefined;
  const checked = validateMemo(memo);
  if (!checked.ok) throw new Error(`memo_${checked.error}`);
  if (!checked.memo) return undefined;
  return bytesToHex(new TextEncoder().encode(checked.memo));
}

/**
 * Read a memo back from a transaction `input`. Returns undefined for empty input and for
 * anything that does not look like human text (contract calls start with a binary
 * selector and are full of control bytes), so contract calls are never mislabelled.
 */
export function memoFromInput(input: string | null | undefined): string | undefined {
  if (!input || input === "0x" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(input)) return undefined;
  let bytes: Uint8Array;
  try {
    bytes = hexToBytes(input as Hex);
  } catch {
    return undefined;
  }
  if (bytes.length > MEMO_MAX_CHARS * 4) return undefined;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
  const checked = validateMemo(text);
  if (!checked.ok || !checked.memo || checked.memo !== text) return undefined;
  return text;
}
