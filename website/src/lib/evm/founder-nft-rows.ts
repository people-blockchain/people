import { getAddress, isAddress } from "viem";
import { readEvmRpcUrl } from "@/lib/evm/config";
import {
  createFounderNftChainReader,
  createFounderNftViemClient,
  parseFounderNftTokenUri,
  type FounderNftChainReader,
} from "@/lib/founders/founder-nft-chain";
import { readFounderNftPublicConfig, type FounderNftPublicConfig } from "@/lib/founders/founder-nft-config";

/** Explorer index page lists at most this many Founder NFTs when no owner is given. */
export const FOUNDER_NFT_EXPLORER_CAP = 50;

export type FounderNftExplorerRow = {
  nftId: string;
  name: string;
  imageUri?: string;
  owner: string;
  creator: string;
  collection: string;
  onChainTokenId: string;
};

/** Token ids `1..min(totalSupply, cap)`. Ids are dense and start at 1. */
export function founderNftListedTokenIds(totalSupply: bigint, cap = FOUNDER_NFT_EXPLORER_CAP): bigint[] {
  if (totalSupply <= BigInt(0)) return [];
  const last = totalSupply > BigInt(cap) ? cap : Number(totalSupply);
  return Array.from({ length: last }, (_, index) => BigInt(index + 1));
}

async function rowForToken(
  reader: FounderNftChainReader,
  config: FounderNftPublicConfig,
  tokenId: bigint,
): Promise<FounderNftExplorerRow | null> {
  const [uri, holder] = await Promise.all([reader.tokenURI(tokenId), reader.ownerOf(tokenId)]);
  if (!holder) return null;
  const meta = parseFounderNftTokenUri(uri);
  const id = tokenId.toString();
  return {
    nftId: `founder-nft-${id}`,
    name: meta?.name ?? `People Founder #${id}`,
    ...(meta?.image ? { imageUri: meta.image } : {}),
    owner: holder,
    creator: holder,
    collection: config.address,
    onChainTokenId: id,
  };
}

/**
 * Founder NFT rows for `/wallet` and `/explorer/nfts`. No public address, an invalid address, or an
 * address that disagrees with `founderNft` / `peopleFounderNft` in static evm-deployments means no rows.
 * Any RPC or decode failure returns an empty list so the existing NFT list still renders.
 */
export async function listFounderNftRows(owner?: string): Promise<FounderNftExplorerRow[]> {
  try {
    const config = readFounderNftPublicConfig();
    if (!config) return [];
    const reader = createFounderNftChainReader(createFounderNftViemClient(config, readEvmRpcUrl()), config);
    let ids: bigint[];
    if (owner) {
      if (!isAddress(owner, { strict: false })) return [];
      const held = await reader.tokenOfOwner(getAddress(owner));
      ids = held > BigInt(0) ? [held] : [];
    } else {
      ids = founderNftListedTokenIds(await reader.totalSupply());
    }
    const rows = await Promise.all(ids.map((id) => rowForToken(reader, config, id)));
    return rows.filter((row): row is FounderNftExplorerRow => row !== null);
  } catch {
    return [];
  }
}
