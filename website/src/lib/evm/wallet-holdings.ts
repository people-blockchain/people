import { getAddress, isAddress, toEventSelector } from "viem";
import { readEvmDeployments } from "@/lib/evm/config";
import { fetchLogsWindowed } from "@/lib/evm/chain-catalog";
import { nftMintedEvent } from "@/lib/evm/nft-factory";
import { evmJsonRpcBatch } from "@/lib/evm/rpc-server";

/**
 * What an address holds, read straight from the contracts. The wallet used to show only what the
 * catalog / the build-time deployment snapshot listed, so a token or NFT created after the last
 * snapshot never appeared. Balances here are `balanceOf`, ownership is `ownerOf`: neither depends
 * on the asset catalog having discovered the contract yet.
 */

const SEL_BALANCE_OF = "0x70a08231";
const SEL_OWNER_OF = "0x6352211e";
const SEL_NAME = "0x06fdde03";
const NFT_MINTED_TOPIC = toEventSelector(nftMintedEvent);
/** Newest mints verified per request; a wallet page does not need more and the batch stays small. */
export const MAX_OWNED_NFT_CANDIDATES = 100;

const pad32 = (hexNoPrefix: string) => hexNoPrefix.toLowerCase().padStart(64, "0");

export function balanceOfData(owner: string): string {
  return `${SEL_BALANCE_OF}${pad32(owner.replace(/^0x/i, ""))}`;
}

export function ownerOfData(tokenId: bigint): string {
  return `${SEL_OWNER_OF}${pad32(tokenId.toString(16))}`;
}

/** Address word of an `ownerOf` / `balanceOf`-style return, or null when the call failed/reverted. */
function wordToAddress(out: string | null | undefined): string | null {
  if (!out || !/^0x[0-9a-fA-F]{64}$/.test(out)) return null;
  return `0x${out.slice(-40)}`.toLowerCase();
}

function wordToBigInt(out: string | null | undefined): bigint {
  if (!out || out === "0x") return BigInt(0);
  try {
    return BigInt(out);
  } catch {
    return BigInt(0);
  }
}

function decodeString(out: string | null | undefined): string {
  if (!out || out.length < 130) return "";
  try {
    return Buffer.from(out.slice(130), "hex").toString("utf8").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 64);
  } catch {
    return "";
  }
}

/**
 * Positive `balanceOf(owner)` per token, in base units, keyed by the token's asset id. A token that
 * reverts (not an ERC-20) or holds nothing is omitted.
 */
export async function readTokenBalances(
  owner: string,
  tokens: ReadonlyArray<{ assetId: string; address: string }>,
): Promise<Record<string, number>> {
  const unique = new Map<string, string>();
  for (const token of tokens) {
    if (!isAddress(token.address)) continue;
    const key = token.assetId.toLowerCase();
    if (!unique.has(key)) unique.set(key, getAddress(token.address));
  }
  const entries = [...unique.entries()];
  if (!entries.length) return {};
  const data = balanceOfData(owner);
  const results = await evmJsonRpcBatch<string>(
    entries.map(([, address]) => ({ method: "eth_call", params: [{ to: address, data }, "latest"] })),
  ).catch(() => entries.map(() => null));
  const out: Record<string, number> = {};
  entries.forEach(([assetId], index) => {
    const raw = wordToBigInt(results[index]);
    if (raw > BigInt(0)) out[assetId] = Number(raw);
  });
  return out;
}

export type OwnedNft = {
  nftId: string;
  name: string;
  owner: string;
  creator: string;
  collection: string;
  onChainTokenId: string;
};

/**
 * NFTs currently owned by `owner` that were minted through an NFT factory: candidates come from the
 * factory's `NftMinted` logs filtered by the indexed owner topic, and each is confirmed with a live
 * `ownerOf` so a token the owner has since transferred away is not listed.
 */
export async function readOwnedFactoryNfts(owner: string): Promise<OwnedNft[]> {
  if (!isAddress(owner)) return [];
  const ownerAddr = getAddress(owner);
  const dep = readEvmDeployments();
  const factories = Object.entries(dep.contracts ?? {})
    .filter(([key, addr]) => /^nftFactory(V\d+)?$/.test(key) && addr && isAddress(addr))
    .map(([, addr]) => getAddress(addr as string));
  if (!factories.length) return [];
  const ownerTopic = `0x${pad32(ownerAddr.slice(2))}`;
  const logs = (
    await Promise.all(
      factories.map((factory) =>
        fetchLogsWindowed(factory, [NFT_MINTED_TOPIC, null, null, ownerTopic]).catch(() => []),
      ),
    )
  ).flat();

  const seen = new Set<string>();
  const candidates: Array<{ collection: string; tokenId: bigint }> = [];
  for (const log of [...logs].reverse()) {
    const collection = wordToAddress(log.topics?.[1]);
    const tokenIdTopic = log.topics?.[2];
    if (!collection || !tokenIdTopic) continue;
    let tokenId: bigint;
    try {
      tokenId = BigInt(tokenIdTopic);
    } catch {
      continue;
    }
    const key = `${collection}:${tokenId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ collection, tokenId });
    if (candidates.length >= MAX_OWNED_NFT_CANDIDATES) break;
  }
  if (!candidates.length) return [];

  const owners = await evmJsonRpcBatch<string>(
    candidates.map((c) => ({ method: "eth_call", params: [{ to: getAddress(c.collection), data: ownerOfData(c.tokenId) }, "latest"] })),
  ).catch(() => candidates.map(() => null));
  const held = candidates.filter((_, index) => wordToAddress(owners[index]) === ownerAddr.toLowerCase());
  if (!held.length) return [];

  const collections = [...new Set(held.map((c) => c.collection))];
  const names = await evmJsonRpcBatch<string>(
    collections.map((collection) => ({ method: "eth_call", params: [{ to: getAddress(collection), data: SEL_NAME }, "latest"] })),
  ).catch(() => collections.map(() => null));
  const nameOf = new Map(collections.map((collection, index) => [collection, decodeString(names[index])]));

  return held.map(({ collection, tokenId }) => {
    const base = nameOf.get(collection) || `${collection.slice(0, 8)}…`;
    return {
      nftId: `${collection}:${tokenId}`,
      name: `${base} #${tokenId}`,
      owner: ownerAddr,
      creator: ownerAddr,
      collection: getAddress(collection),
      onChainTokenId: tokenId.toString(),
    };
  });
}
