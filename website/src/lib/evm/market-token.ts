import { getAddress, isAddress } from "viem";
import { readEvmDeployments } from "@/lib/evm/config";

/**
 * Resolves a logical asset id (e.g. "trosc3" from `assetMap`, or an uncurated token's own
 * address used as its assetId — see `resolveLogicalAssetId`) back to the EVM token contract
 * address the bonding-curve/AMM market panel reads from. Returns null for non-EVM assets
 * (native "ppl", the "usdt" test asset) which have no on-chain market to show.
 */
export function resolveMarketTokenAddress(assetId: string): `0x${string}` | null {
  const dep = readEvmDeployments();
  const mapped = dep.assetMap?.[assetId.toLowerCase()];
  if (mapped && isAddress(mapped)) return getAddress(mapped);
  if (isAddress(assetId)) return getAddress(assetId);
  return null;
}
