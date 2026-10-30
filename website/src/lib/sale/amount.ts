import { parseUnits } from "viem";

/** Micro-USD (6 decimals) from a dollar string. Null when the text is not a plain decimal. */
export function parseUsd6Amount(raw: string, maxFraction = 6): bigint | null {
  const cleaned = raw.replace(/[\s\u00a0]/g, "");
  const match = new RegExp(`^(\\d+)(?:[.,](\\d{1,${maxFraction}}))?$`).exec(cleaned);
  if (!match) return null;
  const fraction = match[2] ?? "";
  try {
    return parseUnits(fraction ? `${match[1]}.${fraction}` : match[1], 6);
  } catch {
    return null;
  }
}

/** Scale 6-decimal USD into a token's base units without floating point. */
export function scaleUsd6(usd6: bigint, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) return BigInt(0);
  if (decimals === 6) return usd6;
  if (decimals > 6) return usd6 * BigInt(10) ** BigInt(decimals - 6);
  return usd6 / BigInt(10) ** BigInt(6 - decimals);
}

/**
 * Parses the dollar amount typed into the buy form.
 *
 * Accepts "," or "." as the decimal separator (at most two decimals). Thousands separators are
 * rejected on purpose: "1,000" must never be read as 1 and "10,5" must never become 105.
 */
export type ParsedAmount =
  | { ok: true; value: number }
  | { ok: false; reason: "empty" | "invalid" };

export function parseUsdAmount(raw: string): ParsedAmount {
  const cleaned = raw.replace(/[\s ]/g, "");
  if (cleaned === "") return { ok: false, reason: "empty" };
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(cleaned);
  if (!match) return { ok: false, reason: "invalid" };
  const value = Number(`${match[1]}.${match[2] ?? "0"}`);
  if (!Number.isFinite(value)) return { ok: false, reason: "invalid" };
  return { ok: true, value };
}
