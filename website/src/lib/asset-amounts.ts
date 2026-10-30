/**
 * Display helpers for on-chain amounts.
 *
 * The node stores native PPL as a decimal PPL number (e.g. 13.84472) and every
 * user token as integer base units (e.g. 78038183 at 6 decimals = 78.038183).
 * Never print a token amount without dividing by its decimals.
 */

import { formatUnits as viemFormatUnits, parseUnits as viemParseUnits } from "viem";
import { displayAssetSymbol } from "@/lib/hidden-assets";
import { isCosmosEvmChain } from "@/lib/chain-mode";

/** Native PPL uses 18 decimal wei. All amount and fee arithmetic stays in this unit. */
export const PPL_WEI_DECIMALS = 18;
/** 0.0001 PPL. A positive amount below this is shown as dust, not rounded to zero. */
export const PPL_DUST_WEI = BigInt(10) ** BigInt(14);
export const PPL_DUST_LABEL = "< 0.0001 PPL";

function stripFractionZeros(raw: string): string {
  if (!raw.includes(".")) return raw;
  const stripped = raw.replace(/0+$/, "").replace(/\.$/, "");
  return stripped === "" ? "0" : stripped;
}

/**
 * Parse a PPL amount typed by a person. Accepts a comma or a dot as the decimal
 * separator. Returns null for empty, signed, scientific, or over-precise input.
 */
export function parsePplInput(text: string): bigint | null {
  const clean = text.trim().replace(/[\s\u00a0]/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  const fraction = clean.split(".")[1] ?? "";
  if (fraction.length > PPL_WEI_DECIMALS) return null;
  try {
    return viemParseUnits(clean, PPL_WEI_DECIMALS);
  } catch {
    return null;
  }
}

/** Full precision, no rounding. Trailing zeros are removed. */
export function formatPplExact(wei: bigint): string {
  if (wei <= BigInt(0)) return "0";
  return stripFractionZeros(viemFormatUnits(wei, PPL_WEI_DECIMALS));
}

/**
 * Balances and lists: at most 4 decimal places, trailing zeros removed.
 * Amounts greater than zero and below 0.0001 PPL use `dustLabel`.
 */
export function formatPplDisplay(wei: bigint, dustLabel = PPL_DUST_LABEL): string {
  if (wei <= BigInt(0)) return "0";
  if (wei < PPL_DUST_WEI) return dustLabel;
  const step = PPL_DUST_WEI;
  const rounded = (wei + step / BigInt(2)) / step;
  const whole = rounded / BigInt(10_000);
  const frac = rounded % BigInt(10_000);
  const intText = group(whole.toString());
  if (frac === BigInt(0)) return intText;
  const fracText = frac.toString().padStart(4, "0").replace(/0+$/, "");
  return `${intText}.${fracText}`;
}

/** Compact label, with the PPL ticker. Dust text already includes it. */
export function formatPplLabeled(wei: bigint, dustLabel = PPL_DUST_LABEL): string {
  const compact = formatPplDisplay(wei, dustLabel);
  return compact.startsWith("<") ? compact : `${compact} PPL`;
}

/** Spendable wei after reserving a fee. Never uses floating point. */
export function maxSendWei(balanceWei: bigint, feeWei: bigint): bigint {
  if (balanceWei <= BigInt(0)) return BigInt(0);
  if (feeWei <= BigInt(0)) return balanceWei;
  if (balanceWei <= feeWei) return BigInt(0);
  return balanceWei - feeWei;
}

/** `numerator/denominator` of the spendable balance, floored in wei. */
export function fractionOfPplWei(balanceWei: bigint, feeWei: bigint, numerator: bigint, denominator: bigint): bigint {
  if (denominator <= BigInt(0) || numerator <= BigInt(0)) return BigInt(0);
  return (maxSendWei(balanceWei, feeWei) * numerator) / denominator;
}

/**
 * USD with 6 decimals (micro-USD) from PPL wei and a USD-per-PPL price in 1e18 wad.
 * `usd6 = pplWei * priceWad / 1e30`.
 */
export function pplWeiToUsd6(pplWei: bigint, priceWad: bigint): bigint {
  if (pplWei <= BigInt(0) || priceWad <= BigInt(0)) return BigInt(0);
  return (pplWei * priceWad) / BigInt(10) ** BigInt(30);
}

/**
 * USD-per-unit wad (1e18) to a dollar string.
 * Prices under $0.01 keep four decimal places; larger prices keep at least two.
 */
export function formatUsdWad(wad: bigint): string {
  if (wad <= BigInt(0)) return "0.00";
  const step = BigInt(10) ** BigInt(14);
  const rounded = (wad + step / BigInt(2)) / step;
  const whole = rounded / BigInt(10_000);
  const frac = rounded % BigInt(10_000);
  const minDigits = rounded < BigInt(100) ? 4 : 2;
  const fracText = frac.toString().padStart(4, "0").replace(/0+$/, "").padEnd(minDigits, "0");
  return `${whole.toString()}.${fracText}`;
}

/** Micro-USD to a 2-decimal dollar string, half up. No floating point. */
export function formatUsd6(usd6: bigint): string {
  const neg = usd6 < BigInt(0);
  const v = neg ? -usd6 : usd6;
  const cents = (v + BigInt(5_000)) / BigInt(10_000);
  const dollars = cents / BigInt(100);
  const frac = (cents % BigInt(100)).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${dollars.toString()}.${frac}`;
}

const HEX_WEI = /^0[xX][0-9a-fA-F]+$/;

/**
 * Integer wei: a bigint, a base-10 digit string, or a 0x hex quantity.
 * Decimal strings are not wei; callers that mean human PPL parse those separately.
 */
export function weiFromField(raw: unknown): bigint | null {
  if (typeof raw === "bigint") return raw >= BigInt(0) ? raw : null;
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!/^\d+$/.test(text) && !HEX_WEI.test(text)) return null;
  try {
    return BigInt(text);
  } catch {
    return null;
  }
}

/**
 * Legacy nodes and route mocks send native PPL as a JSON number (human units,
 * at most 6 decimal places). Scale that to 18-decimal wei without `amount * 1e18`,
 * which cannot represent 0.1 exactly.
 */
function pplNumberToWei(amount: number): bigint | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  let text: string;
  try {
    text = amount.toFixed(6);
  } catch {
    return null;
  }
  if (!/^\d+\.\d{6}$/.test(text)) return null;
  const [whole, frac] = text.split(".");
  return BigInt(whole) * (BigInt(10) ** BigInt(PPL_WEI_DECIMALS)) + BigInt(frac) * (BigInt(10) ** BigInt(12));
}

/** Human PPL (number or decimal string) or a raw hex wei quantity. */
function humanOrHexToWei(raw: unknown): bigint | null {
  if (typeof raw === "number") return pplNumberToWei(raw);
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (HEX_WEI.test(text)) return weiFromField(text);
  return parsePplInput(text);
}

/**
 * Wei from whatever an account payload actually carries.
 * Integer or hex `balanceWei` / `balances.pplWei` win.
 * A decimal string on those fields is human PPL.
 * Legacy `balance` and `balances.ppl` are human PPL numbers or decimal strings, or hex wei.
 */
export function readBalanceWei(body: unknown): bigint | null {
  if (!body || typeof body !== "object") return null;
  const rec = body as Record<string, unknown>;
  const direct = weiFromField(rec.balanceWei);
  if (direct !== null) return direct;
  if (typeof rec.balanceWei === "string") {
    const decimal = parsePplInput(rec.balanceWei);
    if (decimal !== null) return decimal;
  }
  const balances = rec.balances;
  const map = balances && typeof balances === "object" ? (balances as Record<string, unknown>) : null;
  if (map) {
    const mapped = weiFromField(map.pplWei);
    if (mapped !== null) return mapped;
    if (typeof map.pplWei === "string") {
      const decimal = parsePplInput(map.pplWei);
      if (decimal !== null) return decimal;
    }
  }
  const fromBalance = humanOrHexToWei(rec.balance);
  if (fromBalance !== null) return fromBalance;
  if (map) return humanOrHexToWei(map.ppl);
  return null;
}

export const NATIVE_ASSET_ID = "ppl";
export const DEFAULT_TOKEN_DECIMALS = 6;

export type AssetInfo = {
  assetId: string;
  /** ERC-20 contract on chain 97401 when known. */
  tokenAddress?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  creationMetadata?: { image?: unknown; [key: string]: unknown };
};

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function validDecimals(decimals: number): boolean {
  return Number.isInteger(decimals) && decimals >= 0 && decimals <= 18;
}

/** Integer base units -> human string with thousands separators, trailing zeros trimmed. */
export function formatUnits(units: number | string | null | undefined, decimals = DEFAULT_TOKEN_DECIMALS, maxFraction?: number): string {
  if (units === null || units === undefined || units === "") return "—";
  const n = typeof units === "string" ? Number(units) : units;
  if (!Number.isFinite(n) || n < 0) return "—";
  const d = validDecimals(decimals) ? decimals : DEFAULT_TOKEN_DECIMALS;
  if (!Number.isSafeInteger(n)) {
    // Not an integer: already a human amount. Show it rounded rather than wrong.
    return formatPpl(n);
  }
  const digits = String(n).padStart(d + 1, "0");
  const intPart = d === 0 ? digits : digits.slice(0, -d);
  let frac = d === 0 ? "" : digits.slice(-d);
  if (maxFraction !== undefined && frac.length > maxFraction) frac = frac.slice(0, maxFraction);
  frac = frac.replace(/0+$/, "");
  return frac ? `${group(intPart)}.${frac}` : group(intPart);
}

/** Native PPL (already a decimal PPL number) -> string with at most 6 decimals. */
export function formatPpl(value: number | null | undefined, maxFraction = 6): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const fixed = Math.max(0, value).toFixed(maxFraction);
  const [i, f = ""] = fixed.split(".");
  const frac = f.replace(/0+$/, "");
  return frac ? `${group(i)}.${frac}` : group(i);
}

export function assetDecimals(asset: AssetInfo | undefined | null): number {
  const d = asset?.decimals;
  return typeof d === "number" && validDecimals(d) ? d : DEFAULT_TOKEN_DECIMALS;
}

/**
 * Format a token amount that is base units on the legacy chain but already a
 * human-readable number on the cosmos-evm chain (the EVM compat endpoints
 * convert with viem's formatUnits before returning). Never divide an
 * already-human EVM number by 10**decimals again.
 */
export function formatAssetUnits(value: number | string | null | undefined, decimals = DEFAULT_TOKEN_DECIMALS, maxFraction?: number): string {
  if (isCosmosEvmChain()) {
    const n = typeof value === "string" ? Number(value) : value;
    return formatPpl(n ?? null, maxFraction ?? 6);
  }
  return formatUnits(value, decimals, maxFraction);
}

/** Format a raw on-chain amount for the given asset id. */
export function formatAssetAmount(assetId: string | undefined | null, raw: number | null | undefined, asset?: AssetInfo | null): string {
  if (!assetId || assetId.toLowerCase() === NATIVE_ASSET_ID) return formatPpl(raw ?? null);
  return formatAssetUnits(raw ?? null, assetDecimals(asset));
}

/** "12.5" -> base units for a token (null when invalid or too precise). */
export function parseUnits(text: string, decimals: number): number | null {
  const clean = text.trim().replace(",", ".");
  if (!/^\d*(?:\.\d*)?$/.test(clean) || clean === "" || clean === ".") return null;
  const [whole = "0", fraction = ""] = clean.split(".");
  if (fraction.length > decimals) return null;
  const units = BigInt((whole || "0") + fraction.padEnd(decimals, "0"));
  if (units > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(units);
}

/** Parse a PPL amount typed by a person (decimal, up to 6 places). */
export function parsePpl(text: string): number | null {
  const units = parseUnits(text, 6);
  return units === null ? null : units / 1_000_000;
}

/** Which asset a transaction's `amount` field is denominated in. */
export function txAmountAssetId(tx: { type?: string; assetId?: string; payload?: Record<string, unknown> | null }): string {
  const type = tx.type ?? "";
  if (type === "ammSwap") {
    const tokenIn = tx.payload?.tokenIn;
    return typeof tokenIn === "string" && tokenIn ? tokenIn.toLowerCase() : NATIVE_ASSET_ID;
  }
  if ((type === "transfer" || type === "tokenTransfer") && tx.assetId) return tx.assetId.toLowerCase();
  return NATIVE_ASSET_ID;
}

export function symbolOf(assetId: string, asset?: AssetInfo | null): string {
  if (assetId.toLowerCase() === NATIVE_ASSET_ID) return "PPL";
  return displayAssetSymbol(assetId, asset?.symbol);
}
