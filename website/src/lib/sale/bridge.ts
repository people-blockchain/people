/**
 * Cross-chain funding for `/buy` via the embedded LI.FI Widget.
 *
 * Supported source ecosystems: Base, EVM L1/L2s listed below, Solana and Tron.
 *
 * @see https://docs.li.fi/widget/wallet-management
 * @see https://docs.li.fi/widget/install-widget
 */

import { ChainId, type StaticToken } from "@lifi/types";

import type { SaleStableSymbol } from "@/lib/sale/config";

/** Circle USDC on Base mainnet — bridge destination and the only token passed to the sale hub. */
export const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

/**
 * Circle USDT on Base mainnet — payment-side only; LI.FI converts to USDC before the sale contract is called.
 * Verified via LI.FI token API (2026-10-17). Do not use the wrong address from private deployment JSON.
 */
export const BASE_USDT_ADDRESS = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2" as const;

/** Token the PplCurveHub `buyWith` path accepts (USDC only on Base). */
export const HUB_PAYMENT_TOKEN = BASE_USDC_ADDRESS;

/** The sale contract accepts USDC only; USDT is swapped to USDC first. */
export function hubPaymentToken(paidWith: SaleStableSymbol): typeof BASE_USDC_ADDRESS {
  void paidWith;
  return BASE_USDC_ADDRESS;
}

/** Hub chain for PplCurveHub (sale contract). */
export const BASE_CHAIN_ID = ChainId.BAS;

export type BuyNetworkId = "base" | "eth" | "bsc" | "pol" | "arb" | "opt" | "sol" | "tron";

export type BuyNetworkOption = {
  id: BuyNetworkId;
  chainId: number;
};

/** Networks shown in the `/buy` selector (Base first). */
export const BUY_NETWORK_OPTIONS: readonly BuyNetworkOption[] = [
  { id: "base", chainId: ChainId.BAS },
  { id: "eth", chainId: ChainId.ETH },
  { id: "bsc", chainId: ChainId.BSC },
  { id: "pol", chainId: ChainId.POL },
  { id: "arb", chainId: ChainId.ARB },
  { id: "opt", chainId: ChainId.OPT },
  { id: "sol", chainId: ChainId.SOL },
  { id: "tron", chainId: ChainId.TRN },
];

/**
 * Source chains exposed in the cross-chain LI.FI widget (`chains.from.allow`).
 * Base is included for same-chain USDT→USDC.
 */
export const LIFI_BRIDGE_SOURCE_CHAIN_IDS: readonly number[] = [
  ChainId.ETH,
  ChainId.BSC,
  ChainId.POL,
  ChainId.ARB,
  ChainId.OPT,
  ChainId.SOL,
  ChainId.TRN,
];

function featured(
  chainId: number,
  address: string,
  symbol: string,
  decimals: number,
): StaticToken {
  return { chainId, address, symbol, decimals, name: symbol };
}

/** Featured USDT/USDC on source chains (cross-chain widget). */
export const LIFI_FEATURED_SOURCE_TOKENS: readonly StaticToken[] = [
  featured(ChainId.ETH, "0xdAC17F958D2ee523a2206206994597C13D831ec7", "USDT", 6),
  featured(ChainId.ETH, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "USDC", 6),
  featured(ChainId.BSC, "0x55d398326f99059fF775485246999027B3197955", "USDT", 18),
  featured(ChainId.BSC, "0x8Ac76a51CC950D9822eee5674b141Ff43154c6A0", "USDC", 18),
  featured(ChainId.POL, "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", "USDT", 6),
  featured(ChainId.POL, "0x3c499C542CEF5E3811eD2Ac1691cc68C50F2166f", "USDC", 6),
  featured(ChainId.ARB, "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", "USDT", 6),
  featured(ChainId.ARB, "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "USDC", 6),
  featured(ChainId.OPT, "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", "USDT", 6),
  featured(ChainId.OPT, "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", "USDC", 6),
  featured(ChainId.SOL, "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", "USDT", 6),
  featured(ChainId.SOL, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "USDC", 6),
  featured(ChainId.TRN, "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", "USDT", 6),
];

/** Networks where only USDT is offered as the paying coin (no featured USDC token). */
const USDT_ONLY_CHAINS: readonly number[] = [ChainId.TRN];

/** Whether `stable` can be picked as the paying coin on `chainId`. */
export function networkSupportsStable(chainId: number, stable: SaleStableSymbol): boolean {
  return !(stable === "USDC" && USDT_ONLY_CHAINS.includes(chainId));
}

/** Pick the default `fromToken` for a network + stable selection. */
export function defaultFromToken(chainId: number, stable: SaleStableSymbol): string {
  if (chainId === ChainId.BAS) {
    return stable === "USDT" ? BASE_USDT_ADDRESS : BASE_USDC_ADDRESS;
  }
  const match = LIFI_FEATURED_SOURCE_TOKENS.find(
    (token) => token.chainId === chainId && token.symbol === stable,
  );
  if (match) return match.address;
  const fallback = LIFI_FEATURED_SOURCE_TOKENS.find(
    (token) => token.chainId === chainId && (token.symbol === "USDC" || token.symbol === "USDT"),
  );
  return fallback?.address ?? BASE_USDC_ADDRESS;
}

/** Human-readable list for APIs (EN). */
export const LIFI_BRIDGE_SOURCE_CHAINS_EN =
  "Base, Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Solana, and Tron";

/** Documentation link for supported ecosystems (EVM, Solana and Tron). */
export const LIFI_BRIDGE_DOCS_URL = "https://docs.li.fi/widget/wallet-management";
