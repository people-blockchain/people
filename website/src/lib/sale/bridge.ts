/**
 * Cross-chain funding for `/buy` via the embedded LI.FI Widget.
 *
 * Source chains: EVM networks, Solana and Tron via the LI.FI widget. TON is not supported.
 *
 * @see https://docs.li.fi/widget/wallet-management
 * @see https://docs.li.fi/widget/install-widget
 */

import { ChainId, type StaticToken } from "@lifi/types";

import type { SaleStableSymbol } from "@/lib/sale/config";
import {
  BASE_MAINNET_USDC,
  BASE_MAINNET_USDT,
  SALE_CHAIN,
  saleTokenAddress,
  type SaleChain,
} from "@/lib/sale/saleChain";

/** Circle USDC on Base mainnet — bridge destination (the widget always targets Base mainnet). */
export const BASE_USDC_ADDRESS = BASE_MAINNET_USDC;

/**
 * Bridged USDT on Base (OP Standard Bridge, L1 token = Ethereum USDT), not native Tether.
 * Paid directly only if the hub accepts it; otherwise LI.FI converts to USDC first.
 */
export const BASE_USDT_ADDRESS = BASE_MAINNET_USDT;

/**
 * Token the PplCurveHub `buyWith` path takes on the sale chain: USDT only if the hub accepts it
 * directly (and it is configured), else USDC. Null when the chain has no USDC configured.
 */
export function hubPaymentToken(
  paidWith: SaleStableSymbol,
  hubAcceptsUsdt = false,
  chain: SaleChain = SALE_CHAIN,
): string | null {
  const usdt = saleTokenAddress("USDT", chain);
  if (paidWith === "USDT" && hubAcceptsUsdt && usdt) return usdt;
  return saleTokenAddress("USDC", chain);
}

/** LI.FI widget UI language per site language (Arabic is not offered by the widget). */
export const LIFI_LANG: Record<string, string> = {
  en: "en", es: "es", pt: "pt", fr: "fr", de: "de", it: "it",
  tr: "tr", vi: "vi", id: "id", zh: "zh", ar: "en", ru: "ru",
};

/** Base mainnet chain id: the LI.FI widget always delivers here (it does not support the test sale chain). */
export const BASE_CHAIN_ID = ChainId.BAS;

/**
 * Source chains exposed in the widget (`chains.from.allow`).
 * IDs from `@lifi/types` `ChainId` enum.
 */
export const LIFI_BRIDGE_SOURCE_CHAIN_IDS: readonly number[] = [
  ChainId.ETH,
  ChainId.BSC,
  ChainId.POL,
  ChainId.ARB,
  ChainId.OPT,
  ChainId.AVA,
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
  featured(ChainId.BSC, "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", "USDC", 18),
  featured(ChainId.POL, "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", "USDT", 6),
  featured(ChainId.POL, "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "USDC", 6),
  featured(ChainId.ARB, "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", "USDT0", 6),
  featured(ChainId.ARB, "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "USDC", 6),
  featured(ChainId.OPT, "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", "USDT", 6),
  featured(ChainId.OPT, "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", "USDC", 6),
  featured(ChainId.AVA, "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", "USDT", 6),
  featured(ChainId.AVA, "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", "USDC", 6),
  featured(ChainId.SOL, "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", "USDT", 6),
  featured(ChainId.SOL, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "USDC", 6),
  featured(ChainId.TRN, "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", "USDT", 6),
];

/** Documentation link for supported ecosystems (EVM, Solana, Tron; TON is not supported). */
export const LIFI_BRIDGE_DOCS_URL = "https://docs.li.fi/widget/wallet-management";
