/**
 * Freshly minted NFTs are not in the seed catalog. The wallet list reads `NftMinted` logs from
 * the factory. A single token page reads `ownerOf` / `tokenURI` directly, so a token still
 * missing from the log index is not a 404.
 *
 * The factory was deployed hundreds of thousands of blocks ago. Walking every window from that
 * block takes long enough that a holdings request ends before the newest window — the only place
 * a mint from the last few hours can be. The request therefore reads a short recent span first.
 * Older mints are filled from a background scan and merged on the next read.
 */
import {
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  isAddress,
  pad,
  type Address,
  type Hex,
} from "viem";
import { fetchLogsWindowed, LOG_WINDOW_BLOCKS, logStartBlock } from "@/lib/evm/chain-catalog";
import { evmJsonRpc } from "@/lib/evm/rpc-server";
import { nftFactoryAddress, nftMintedEvent, NFT_MINTED_TOPIC, peopleNftAbi } from "@/lib/evm/nft-factory";

/** Recent factory windows read on the wallet request. Four windows is about a day on this chain. */
export const RECENT_MINT_WINDOWS = 4;

const collectionNameAbi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

export type NftListRow = {
  nftId: string;
  name: string;
  owner: string;
  collection?: string;
  onChainTokenId?: string;
  imageUri?: string;
  tokenUri?: string;
  description?: string;
  creator?: string;
};

export type ChainNft = NftListRow & {
  collection: string;
  onChainTokenId: string;
};

type MintLog = { address?: string; topics?: readonly string[]; data?: string };
type ContractCall = (to: Address, data: Hex) => Promise<Hex>;

/** In-app token page. The explorer address page is a different route and 404s a token id. */
export function inAppNftPath(collection: string, tokenId: bigint | number | string): string {
  return `/nft/${collection}/${tokenId.toString()}`;
}

/** `/nft` has no token to show. The explorer already lists collections. */
export function nftIndexPath(): string {
  return "/explorer/nfts";
}

/**
 * First block of a wallet mint scan. `latest` is the chain tip; `factoryStart` is the factory's
 * own first block. The result is never earlier than the factory, and never more than `windows`
 * log windows behind the tip.
 */
export function recentMintScanStart(latest: number, factoryStart: number, windows = RECENT_MINT_WINDOWS): number {
  const start = Number.isFinite(factoryStart) && factoryStart > 0 ? factoryStart : 0;
  if (!Number.isFinite(latest) || latest <= start) return start;
  return Math.max(start, latest - windows * LOG_WINDOW_BLOCKS + 1);
}

export function nftIdFor(collection: string, tokenId: bigint | number | string): string {
  return `${getAddress(collection).toLowerCase()}:${tokenId.toString()}`;
}

/** First block that can hold an `NftMinted` log: the factory's own start, not the chain deploy. */
export function nftFactoryScanStart(factory: string): number {
  return logStartBlock(factory);
}

/**
 * `NftMinted(collection, tokenId, owner, tokenURI)` — owner is the third indexed argument.
 * `null` is a wildcard so one owner filter still returns every collection they minted into.
 */
export function mintLogTopics(owner?: string): Array<string | null> {
  if (!owner || !isAddress(owner)) return [NFT_MINTED_TOPIC];
  return [NFT_MINTED_TOPIC, null, null, pad(getAddress(owner), { size: 32 }).toLowerCase()];
}

/** The log is emitted by the factory. The collection address is an indexed argument, not `log.address`. */
export function chainNftFromMintLog(log: MintLog): ChainNft | null {
  if (!log.topics?.length || !log.data || log.data === "0x") return null;
  try {
    const decoded = decodeEventLog({
      abi: [nftMintedEvent],
      data: log.data as Hex,
      topics: log.topics as [Hex, ...Hex[]],
    });
    if (decoded.eventName !== "NftMinted") return null;
    const collection = getAddress(decoded.args.collection);
    const tokenId = decoded.args.tokenId;
    const owner = getAddress(decoded.args.owner);
    return {
      nftId: nftIdFor(collection, tokenId),
      name: `NFT #${tokenId.toString()}`,
      owner,
      creator: owner,
      collection,
      onChainTokenId: tokenId.toString(),
      tokenUri: decoded.args.tokenURI,
    };
  } catch {
    return null;
  }
}

export function nftsFromMintLogs(logs: readonly MintLog[], owner: string): ChainNft[] {
  if (!isAddress(owner)) return [];
  const ownerLc = getAddress(owner).toLowerCase();
  const rows: ChainNft[] = [];
  const seen = new Set<string>();
  for (const log of logs) {
    const row = chainNftFromMintLog(log);
    if (!row || row.owner.toLowerCase() !== ownerLc || seen.has(row.nftId)) continue;
    seen.add(row.nftId);
    rows.push(row);
  }
  return rows;
}

const olderMints = new Map<string, ChainNft[]>();
const olderInFlight = new Set<string>();

function defaultScanOlderMints(factory: string, topics: Array<string | null>, owner: string, factoryStart: number): void {
  const key = owner.toLowerCase();
  if (olderInFlight.has(key) || olderMints.has(key)) return;
  olderInFlight.add(key);
  void fetchLogsWindowed(factory, topics, factoryStart)
    .then((logs) => {
      olderMints.set(key, nftsFromMintLogs(logs, owner));
    })
    .catch(() => {
      /* a later wallet refresh can try the history scan again */
    })
    .finally(() => {
      olderInFlight.delete(key);
    });
}

let scanOlderMints = defaultScanOlderMints;

/** Tests substitute a no-op so a mocked node is not asked for the factory's whole history. */
export function setOlderMintScanForTests(
  scan: ((factory: string, topics: Array<string | null>, owner: string, factoryStart: number) => void) | null,
): void {
  scanOlderMints = scan ?? (() => {});
}

export function resetMintHistoryForTests(): void {
  olderMints.clear();
  olderInFlight.clear();
  scanOlderMints = defaultScanOlderMints;
}

export async function listMintedNfts(owner: string): Promise<ChainNft[]> {
  const factory = nftFactoryAddress();
  if (!factory || !isAddress(owner)) return [];
  const topics = mintLogTopics(owner);
  const factoryStart = nftFactoryScanStart(factory);
  const latestHex = await evmJsonRpc<string>("eth_blockNumber", []).catch(() => "");
  const latest = latestHex ? Number.parseInt(latestHex, 16) : Number.NaN;
  const recentFrom = Number.isFinite(latest) ? recentMintScanStart(latest, factoryStart) : factoryStart;
  const logs = await fetchLogsWindowed(factory, topics, recentFrom);
  const recent = nftsFromMintLogs(logs, owner);
  const older = olderMints.get(owner.toLowerCase()) ?? [];
  if (recentFrom > factoryStart) scanOlderMints(factory, topics, owner, factoryStart);
  const map = new Map<string, ChainNft>();
  for (const row of older) map.set(row.nftId, row);
  for (const row of recent) map.set(row.nftId, row);
  return [...map.values()];
}

/**
 * One token, read with `eth_call`. A revert (unknown id, empty code) is a miss, not a throw,
 * so the page can answer 404 and the list can fall through to the logs it already has.
 */
export async function readNftToken(
  collection: string,
  tokenId: bigint,
  call: ContractCall,
): Promise<ChainNft | null> {
  if (!isAddress(collection) || tokenId < BigInt(0)) return null;
  const address = getAddress(collection);
  try {
    const ownerRaw = await call(
      address,
      encodeFunctionData({ abi: peopleNftAbi, functionName: "ownerOf", args: [tokenId] }),
    );
    if (!ownerRaw || ownerRaw === "0x") return null;
    const owner = decodeFunctionResult({ abi: peopleNftAbi, functionName: "ownerOf", data: ownerRaw });
    if (!isAddress(owner)) return null;
    const uriRaw = await call(
      address,
      encodeFunctionData({ abi: peopleNftAbi, functionName: "tokenURI", args: [tokenId] }),
    );
    const tokenUri = decodeFunctionResult({ abi: peopleNftAbi, functionName: "tokenURI", data: uriRaw });
    let label = `NFT #${tokenId.toString()}`;
    try {
      const nameRaw = await call(
        address,
        encodeFunctionData({ abi: collectionNameAbi, functionName: "name" }),
      );
      const collectionName = decodeFunctionResult({
        abi: collectionNameAbi,
        functionName: "name",
        data: nameRaw,
      }).trim();
      if (collectionName) label = `${collectionName} #${tokenId.toString()}`;
    } catch {
      /* name() is optional; the token id is enough to show the row */
    }
    return {
      nftId: nftIdFor(address, tokenId),
      name: label,
      owner: getAddress(owner),
      creator: getAddress(owner),
      collection: address,
      onChainTokenId: tokenId.toString(),
      tokenUri,
    };
  } catch {
    return null;
  }
}

export async function readNftTokenOnChain(collection: string, tokenId: bigint): Promise<ChainNft | null> {
  return readNftToken(collection, tokenId, async (to, data) => {
    const out = await evmJsonRpc<string>("eth_call", [{ to, data }, "latest"]);
    return (out || "0x") as Hex;
  });
}

function sameToken(row: NftListRow, collection: string, tokenId: string): boolean {
  return row.collection?.toLowerCase() === collection && row.onChainTokenId === tokenId;
}

/**
 * Seed rows keep their curated names when the id matches. A direct read is appended only when
 * neither the seed nor the factory logs already contain that collection and token id, and only
 * when it belongs to `owner`.
 */
export function assembleNftRows(
  seed: readonly NftListRow[],
  minted: readonly NftListRow[],
  direct: NftListRow | null,
  owner?: string,
  collection?: string,
  tokenId?: string,
): NftListRow[] {
  const ownerLc = owner && isAddress(owner) ? getAddress(owner).toLowerCase() : owner?.toLowerCase();
  const map = new Map<string, NftListRow>();
  const owned = (row: NftListRow) => !ownerLc || row.owner.toLowerCase() === ownerLc;
  for (const row of minted) {
    if (!owned(row)) continue;
    map.set(row.nftId, row);
  }
  for (const row of seed) {
    if (!owned(row)) continue;
    const prev = map.get(row.nftId);
    map.set(row.nftId, prev ? { ...prev, ...row, tokenUri: row.tokenUri ?? prev.tokenUri, imageUri: row.imageUri ?? prev.imageUri } : row);
  }
  const wantCollection = collection && isAddress(collection) ? getAddress(collection).toLowerCase() : "";
  if (direct && wantCollection && tokenId && owned(direct) && sameToken(direct, wantCollection, tokenId)) {
    const already = [...map.values()].some((row) => sameToken(row, wantCollection, tokenId) || row.nftId === direct.nftId);
    if (!already) map.set(direct.nftId, direct);
  }
  return [...map.values()];
}
