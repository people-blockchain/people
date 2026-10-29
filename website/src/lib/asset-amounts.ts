/**
 * Display helpers for on-chain amounts.
 *
 * The node stores native PPL as a decimal PPL number (e.g. 13.84472) and every
 * user token as integer base units (e.g. 78038183 at 6 decimals = 78.038183).
 * Never print a token amount without dividing by its decimals.
 */

import { displayAssetSymbol } from "@/lib/hidden-assets";
import { isCosmosEvmChain } from "@/lib/chain-mode";

export const NATIVE_ASSET_ID = "ppl";
export const DEFAULT_TOKEN_DECIMALS = 6;

export type AssetInfo = {
  assetId: string;
  /** ERC-20 contract on chain 97401 when known. */
  tokenAddress?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  imageUri?: string;
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
