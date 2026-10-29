import { formatUnits, getAddress, isAddress, toEventSelector } from "viem";
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
const SEL_DECIMALS = "0x313ce567";
/** ERC-20 default when a token does not answer `decimals()`. */
const FALLBACK_DECIMALS = 18;
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
 * Positive `balanceOf(owner)` per token as a human number (base units divided by the token's
 * decimals, the shape the EVM compat endpoints return), keyed by the token's asset id. Decimals
 * come from the caller when known, otherwise from the token's own `decimals()`. A token that
 * reverts (not an ERC-20) or holds nothing is omitted; the same contract listed twice counts once.
 */
export async function readTokenBalances(
  owner: string,
  tokens: ReadonlyArray<{ assetId: string; address: string; decimals?: number }>,
): Promise<Record<string, number>> {
  const unique = new Map<string, { address: string; decimals?: number }>();
  const seenAddresses = new Set<string>();
  for (const token of tokens) {
    if (!isAddress(token.address)) continue;
    const key = token.assetId.toLowerCase();
    const address = getAddress(token.address);
    if (unique.has(key) || seenAddresses.has(address)) continue;
    seenAddresses.add(address);
    const decimals = Number.isInteger(token.decimals) && (token.decimals as number) >= 0 && (token.decimals as number) <= 255 ? token.decimals : undefined;
    unique.set(key, { address, decimals });
  }
  const entries = [...unique.entries()];
  if (!entries.length) return {};
  const data = balanceOfData(owner);
  const results = await evmJsonRpcBatch<string>(
    entries.map(([, { address }]) => ({ method: "eth_call", params: [{ to: address, data }, "latest"] })),
  ).catch(() => entries.map(() => null));
  const held = entries
    .map(([assetId, token], index) => ({ assetId, token, raw: wordToBigInt(results[index]) }))
    .filter((row) => row.raw > BigInt(0));
  const unknown = held.filter((row) => row.token.decimals === undefined);
  const decimalsOut = unknown.length
    ? await evmJsonRpcBatch<string>(
        unknown.map((row) => ({ method: "eth_call", params: [{ to: row.token.address, data: SEL_DECIMALS }, "latest"] })),
      ).catch(() => unknown.map(() => null))
    : [];
  const out: Record<string, number> = {};
  for (const row of held) {
    let decimals = row.token.decimals;
    if (decimals === undefined) {
      const raw = decimalsOut[unknown.indexOf(row)];
      const parsed = Number(wordToBigInt(raw));
      decimals = raw && raw !== "0x" && Number.isInteger(parsed) && parsed <= 77 ? parsed : FALLBACK_DECIMALS;
    }
    const value = Number(formatUnits(row.raw, decimals));
    if (value > 0) out[row.assetId] = value;
  }
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
 * NFTs minted through an NFT factory, newest first: candidates come from the factory's `NftMinted`
 * logs (windowed + cached by `fetchLogsWindowed`), and each is confirmed with a live `ownerOf`, so a
 * burned token is dropped and a transferred one reports its current owner. With `owner` set, the
 * owner's own mints plus the newest mints overall are checked and only tokens `ownerOf` still reports
 * for that address are returned. Without it (the public explorer list) the newest
 * `MAX_OWNED_NFT_CANDIDATES` mints are listed. Limits: only factory mints are discoverable, a
 * received token older than the newest `MAX_OWNED_NFT_CANDIDATES` mints is not found, and the
 * tokenURI image is not resolved here.
 */
async function readFactoryNfts(owner?: string): Promise<OwnedNft[]> {
  const ownerAddr = owner ? getAddress(owner) : null;
  const dep = readEvmDeployments();
  const factories = Object.entries(dep.contracts ?? {})
    .filter(([key, addr]) => /^nftFactory(V\d+)?$/.test(key) && addr && isAddress(addr))
    .map(([, addr]) => getAddress(addr as string));
  if (!factories.length) return [];
  const ownerTopic = ownerAddr ? `0x${pad32(ownerAddr.slice(2))}` : null;
  const scan = async (topic: string | null) =>
    (
      await Promise.all(
        factories.map((factory) => fetchLogsWindowed(factory, [NFT_MINTED_TOPIC, null, null, topic]).catch(() => [])),
      )
    ).flat();
  // Owner query: the owner's own mints first, then the newest mints of everyone (the same scan the
  // public list uses, so its windows are cached), which also finds tokens received by transfer.
  const logSets = ownerTopic ? [await scan(ownerTopic), await scan(null)] : [await scan(null)];

  const seen = new Set<string>();
  const candidates: Array<{ collection: string; tokenId: bigint; minter: string | null }> = [];
  for (const logs of logSets) {
    let taken = 0;
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
      candidates.push({ collection, tokenId, minter: wordToAddress(log.topics?.[3]) });
      taken += 1;
      if (taken >= MAX_OWNED_NFT_CANDIDATES) break;
    }
  }
  if (!candidates.length) return [];

  const owners = await evmJsonRpcBatch<string>(
    candidates.map((c) => ({ method: "eth_call", params: [{ to: getAddress(c.collection), data: ownerOfData(c.tokenId) }, "latest"] })),
  ).catch(() => candidates.map(() => null));
  const held = candidates
    .map((c, index) => ({ ...c, current: wordToAddress(owners[index]) }))
    .filter((c) => c.current !== null && (!ownerAddr || c.current === ownerAddr.toLowerCase()));
  if (!held.length) return [];

  const collections = [...new Set(held.map((c) => c.collection))];
  const names = await evmJsonRpcBatch<string>(
    collections.map((collection) => ({ method: "eth_call", params: [{ to: getAddress(collection), data: SEL_NAME }, "latest"] })),
  ).catch(() => collections.map(() => null));
  const nameOf = new Map(collections.map((collection, index) => [collection, decodeString(names[index])]));

  return held.map(({ collection, tokenId, minter, current }) => {
    const base = nameOf.get(collection) || `${collection.slice(0, 8)}…`;
    return {
      nftId: `${collection}:${tokenId}`,
      name: `${base} #${tokenId}`,
      owner: getAddress(current as string),
      creator: getAddress(minter ?? (current as string)),
      collection: getAddress(collection),
      onChainTokenId: tokenId.toString(),
    };
  });
}

/** NFTs `owner` currently holds that were minted through an NFT factory (see `readFactoryNfts`). */
export async function readOwnedFactoryNfts(owner: string): Promise<OwnedNft[]> {
  if (!isAddress(owner)) return [];
  return readFactoryNfts(owner);
}

/** The newest factory-minted NFTs with their live owners, for the public explorer list. */
export async function readAllFactoryNfts(): Promise<OwnedNft[]> {
  return readFactoryNfts();
}
