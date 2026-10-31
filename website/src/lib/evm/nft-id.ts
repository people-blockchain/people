import { getAddress, isAddress } from "viem";

/**
 * `collection:tokenId` is the id the wallet and the explorer give a factory-minted NFT. Kept apart
 * from `wallet-holdings.ts` (server-only RPC reads) so client code can parse it.
 */
export function parseNftId(nftId: string): { collection: `0x${string}`; tokenId: bigint } | null {
  const [collection, tokenId, ...rest] = nftId.split(":");
  if (rest.length || !collection || !tokenId || !isAddress(collection) || !/^(0|[1-9]\d{0,77})$/.test(tokenId)) return null;
  return { collection: getAddress(collection), tokenId: BigInt(tokenId) };
}
