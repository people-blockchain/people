/**
 * Cross-chain funding for `/buy` via the embedded LI.FI Widget.
 *
 * Source chains are limited to ecosystems LI.FI documents for the widget
 * (EVM, Solana, Tron). TON is not supported by LI.FI and is excluded.
 *
 * @see https://docs.li.fi/widget/wallet-management
 * @see https://docs.li.fi/widget/install-widget
 */

import { ChainId } from "@lifi/types";

/** Circle USDC on Base mainnet — bridge destination token for the sale. */
export const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

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
  ChainId.TRN,
];

/** Human-readable list for on-page copy (EN); other locales translate in `buy-*.json`. */
export const LIFI_BRIDGE_SOURCE_CHAINS_EN =
  "Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Avalanche, Solana, and Tron";

/** Documentation link for supported ecosystems (Solana + Tron called out; TON absent). */
export const LIFI_BRIDGE_DOCS_URL = "https://docs.li.fi/widget/wallet-management";
