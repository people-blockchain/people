/**
 * Cross-chain funding for `/buy` via the embedded LI.FI Widget.
 *
 * Source chains are limited to ecosystems LI.FI documents for the widget
 * (EVM and Solana). Tron and TON are not offered in the widget.
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
  featured(ChainId.BSC, "0x8AC76a51cc950d9822EEE5674B141ff43154C6A0", "USDC", 18),
  featured(ChainId.POL, "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", "USDT", 6),
  featured(ChainId.POL, "0x3c499c542cEF5E3811eD2ac1691cC68c50f2166F", "USDC", 6),
  featured(ChainId.ARB, "0xFd086bC7CD5C481DCC9EC5e2a0C90d5Aa7Ef4c3", "USDT", 6),
  featured(ChainId.ARB, "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "USDC", 6),
  featured(ChainId.OPT, "0x94b008aA0059c6e05A642b4Cb4e7BdD38CA8d26", "USDT", 6),
  featured(ChainId.OPT, "0x0b2C639c533813f4Aa9D7837CAa64639E49B96", "USDC", 6),
  featured(ChainId.AVA, "0x970223C8Ae6CaD509CC4843E425BeB5B3517f2a", "USDT", 6),
  featured(ChainId.AVA, "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", "USDC", 6),
  featured(ChainId.SOL, "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", "USDT", 6),
  featured(ChainId.SOL, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "USDC", 6),
];

/** Human-readable list for on-page copy (EN); other locales translate in `buy-*.json`. */
export const LIFI_BRIDGE_SOURCE_CHAINS_EN =
  "Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Avalanche, and Solana";

/** Documentation link for supported ecosystems (EVM + Solana; Tron and TON absent). */
export const LIFI_BRIDGE_DOCS_URL = "https://docs.li.fi/widget/wallet-management";
