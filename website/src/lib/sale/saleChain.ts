/**
 * Single source of truth for which chain the PPL sale runs on.
 *
 * `NEXT_PUBLIC_SALE_CHAIN=base-sepolia` switches the whole sale contour (chain id, RPC, hub address,
 * payment tokens, explorer) to the Base Sepolia test network. Anything else, or no flag, is Base
 * mainnet with the production addresses.
 *
 * `resolveSaleChain` is pure: it takes the env object as an argument so it can be unit-tested.
 * Next.js inlines `process.env.NEXT_PUBLIC_*` only for literal property accesses, hence the explicit
 * list in `readSaleChainEnv`.
 */

import { base, baseSepolia } from "viem/chains";
import type { Chain } from "viem";

export type SaleChainKey = "base" | "base-sepolia";

export type SaleChainEnv = Readonly<Record<string, string | undefined>>;

export type SaleTokenSymbol = "USDC" | "USDT";

/** Circle USDC on Base mainnet. */
export const BASE_MAINNET_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

/**
 * Bridged USDT on Base (OP Standard Bridge, L1 token = Ethereum USDT), not native Tether.
 */
export const BASE_MAINNET_USDT = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2" as const;

export type SaleChain = {
  key: SaleChainKey;
  id: number;
  viemChain: Chain;
  /** Human name for the wallet "add network" prompt. */
  name: string;
  /** RPC used by the site's own clients. */
  rpcUrl: string;
  /** Block explorer origin, no trailing slash. */
  explorer: string;
  testnet: boolean;
  /** Hub (sale contract) address, or null while not configured. */
  hubAddress: string | null;
  /** Payment tokens; null = not configured for this chain. */
  tokens: Readonly<Record<SaleTokenSymbol, string | null>>;
};

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Returns the trimmed value when it is `0x` + 40 hex characters, else null. */
export function validAddress(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  return ADDRESS_RE.test(value) ? value : null;
}

/** Only the exact value "base-sepolia" (case-insensitive, trimmed) selects the testnet. */
export function resolveSaleChainKey(env: SaleChainEnv): SaleChainKey {
  return (env.NEXT_PUBLIC_SALE_CHAIN ?? "").trim().toLowerCase() === "base-sepolia" ? "base-sepolia" : "base";
}

export function resolveSaleChain(env: SaleChainEnv): SaleChain {
  if (resolveSaleChainKey(env) === "base-sepolia") {
    return {
      key: "base-sepolia",
      id: baseSepolia.id,
      viemChain: baseSepolia,
      name: "Base Sepolia",
      rpcUrl: (env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ?? "").trim() || "https://sepolia.base.org",
      explorer: "https://sepolia.basescan.org",
      testnet: true,
      hubAddress: validAddress(env.NEXT_PUBLIC_SEPOLIA_HUB_ADDRESS),
      tokens: {
        USDC: validAddress(env.NEXT_PUBLIC_SEPOLIA_USDC_ADDRESS),
        USDT: validAddress(env.NEXT_PUBLIC_SEPOLIA_USDT_ADDRESS),
      },
    };
  }
  return {
    key: "base",
    id: base.id,
    viemChain: base,
    name: "Base",
    /** Public, keyless endpoint. Overridable without a redeploy. */
    rpcUrl: (env.NEXT_PUBLIC_BASE_RPC_URL ?? "https://mainnet.base.org").trim(),
    explorer: "https://basescan.org",
    testnet: false,
    hubAddress: validAddress(env.NEXT_PUBLIC_SALE_HUB_ADDRESS),
    tokens: { USDC: BASE_MAINNET_USDC, USDT: BASE_MAINNET_USDT },
  };
}

/** Reads the public env at call time (literal accesses so Next.js can inline them). */
export function readSaleChainEnv(): SaleChainEnv {
  return {
    NEXT_PUBLIC_SALE_CHAIN: process.env.NEXT_PUBLIC_SALE_CHAIN,
    NEXT_PUBLIC_BASE_RPC_URL: process.env.NEXT_PUBLIC_BASE_RPC_URL,
    NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL,
    NEXT_PUBLIC_SALE_HUB_ADDRESS: process.env.NEXT_PUBLIC_SALE_HUB_ADDRESS,
    NEXT_PUBLIC_SEPOLIA_HUB_ADDRESS: process.env.NEXT_PUBLIC_SEPOLIA_HUB_ADDRESS,
    NEXT_PUBLIC_SEPOLIA_USDC_ADDRESS: process.env.NEXT_PUBLIC_SEPOLIA_USDC_ADDRESS,
    NEXT_PUBLIC_SEPOLIA_USDT_ADDRESS: process.env.NEXT_PUBLIC_SEPOLIA_USDT_ADDRESS,
  };
}

/** The sale chain for this build. */
export const SALE_CHAIN: SaleChain = resolveSaleChain(readSaleChainEnv());
export const SALE_CHAIN_KEY: SaleChainKey = SALE_CHAIN.key;

/** Payment token address on the sale chain, or null when not configured. */
export function saleTokenAddress(symbol: SaleTokenSymbol, chain: SaleChain = SALE_CHAIN): string | null {
  return chain.tokens[symbol];
}
