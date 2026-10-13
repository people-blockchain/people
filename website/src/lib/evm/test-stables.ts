import { getAddress } from "viem";
import testStables from "@/data/evm-test-stables-97401.json" with { type: "json" };

/**
 * Testnet-only mock stablecoins (tUSDC / tUSDT) used by the Escrow/Crowdfund samples.
 *
 * They are deployed from `contracts/src/samples/TestStablecoin.sol` rather than through the
 * token factory, so they never show up in `discoverTokensOnChain` and have no entry in the
 * deployment `assetMap`. That makes `resolveLogicalAssetId` fall back to the lower-cased
 * contract address, which leaves the token/PPL pools for them without a symbol or decimals —
 * the swap page then rendered a truncated address as the ticker and quoted with the wrong
 * scale. This module is the single lookup that gives those pools a real identity.
 *
 * Deliberately *not* wired into `assetMap`/`discoverTokensOnChain`: only the swap UI reads it,
 * so test stables stay out of the public explorer token list.
 */
export type TestStable = {
  /** Logical id: the lower-cased symbol (`tusdc`, `tusdt`). */
  assetId: string;
  /** Checksummed ERC-20 address. */
  tokenAddress: string;
  name: string;
  symbol: string;
  decimals: number;
};

type TestStableFile = {
  tokens: Record<string, { address: string; name: string; symbol: string; decimals: number }>;
};

const file = testStables as TestStableFile;

export const TEST_STABLES: readonly TestStable[] = Object.values(file.tokens).map((token) => ({
  assetId: token.symbol.toLowerCase(),
  tokenAddress: getAddress(token.address),
  name: token.name,
  symbol: token.symbol,
  decimals: token.decimals,
}));

/** Resolves a test stable by logical id (`tusdc`), symbol (`tUSDC`) or contract address. */
export function testStableMeta(idOrAddress: string | null | undefined): TestStable | null {
  if (!idOrAddress) return null;
  const key = String(idOrAddress).trim().toLowerCase();
  if (!key) return null;
  return (
    TEST_STABLES.find(
      (stable) =>
        stable.assetId === key ||
        stable.symbol.toLowerCase() === key ||
        stable.tokenAddress.toLowerCase() === key,
    ) ?? null
  );
}

/**
 * Rewrites a pool row's `tokenAssetId` (which for test stables is the lower-cased address) to the
 * stable's logical id, so the picker, the pool list and `assetDecimals` all agree. Anything not in
 * the stable table is returned untouched.
 */
export function normalizePoolTokenId<T extends { tokenAssetId: string; tokenAddress?: string }>(pool: T): T {
  const stable = testStableMeta(pool.tokenAddress) ?? testStableMeta(pool.tokenAssetId);
  if (!stable || stable.assetId === pool.tokenAssetId) return pool;
  return { ...pool, tokenAssetId: stable.assetId };
}
