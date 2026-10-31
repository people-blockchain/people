/**
 * Freshly minted NFTs are not in the seed catalog. The wallet list reads `NftMinted` logs from
 * the factory. A single token page reads `ownerOf` / `tokenURI` directly, so a token still
 * missing from the log index is not a 404.
 *
 * The factory was deployed hundreds of thousands of blocks ago. One request reads the newest
 * windows first, then a bounded page of older windows, and stops at a deadline. Whatever was
 * not read is named by `next` so the client can continue. Nothing keeps scanning after the
 * response.
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
import { fetchLogWindow, LOG_WINDOW_BLOCKS, logStartBlock, logWindows, MAX_PARALLEL_LOG_WINDOWS } from "@/lib/evm/chain-catalog";
import { evmJsonRpc, withRpcCallContext } from "@/lib/evm/rpc-server";
import { nftFactoryAddress, nftMintedEvent, NFT_MINTED_TOPIC, peopleNftAbi } from "@/lib/evm/nft-factory";
import { inAppNftPath, nftIndexPath } from "@/lib/evm/nft-paths";

export { inAppNftPath, nftIndexPath };

/** Recent factory windows read on the wallet request. Four windows is about a day on this chain. */
export const RECENT_MINT_WINDOWS = 4;

/** Hard cap for one owner listing, including the tip, fresh windows, cached windows, and stats. */
export const NFT_OWNER_LIST_BUDGET_MS = 6_000;

/** Older windows read after the fresh ones, per request. The rest wait for a cursor. */
export const NFT_HISTORY_WINDOWS_PER_PAGE = 4;

const NFT_CURSOR_RE = /^(\d+)-(\d+)$/;

let nftOwnerListBudgetOverrideMs: number | null = null;
let nftHistoryPageSizeOverride: number | null = null;

export function setNftOwnerListBudgetForTests(ms: number | null): void {
  nftOwnerListBudgetOverrideMs = ms;
}

export function setNftHistoryPageSizeForTests(count: number | null): void {
  nftHistoryPageSizeOverride = count;
}

export function nftOwnerListBudgetMs(): number {
  return nftOwnerListBudgetOverrideMs ?? NFT_OWNER_LIST_BUDGET_MS;
}

export function nftOwnerListDeadlineAt(now = Date.now()): number {
  return now + nftOwnerListBudgetMs();
}

function historyWindowsPerPage(): number {
  const count = nftHistoryPageSizeOverride ?? NFT_HISTORY_WINDOWS_PER_PAGE;
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : NFT_HISTORY_WINDOWS_PER_PAGE;
}

export type MintedNftPage = {
  items: ChainNft[];
  partial: boolean;
  next?: string;
};

/** `from-to` of the next unread window, or `tip` to start again at the head. */
export function readOwnerNftCursor(search: URLSearchParams): null | "tip" | { from: number; to: number } | "invalid" {
  const explicit = search.get("cursor");
  const fromBlock = search.get("fromBlock");
  const toBlock = search.get("toBlock");
  const raw = explicit && explicit.length > 0 ? explicit : fromBlock && toBlock ? `${fromBlock}-${toBlock}` : null;
  if (raw === null) return null;
  if (raw === "tip") return "tip";
  const match = NFT_CURSOR_RE.exec(raw);
  if (!match) return "invalid";
  const from = Number(match[1]);
  const to = Number(match[2]);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to < from || to - from + 1 > 10_000) return "invalid";
  return { from, to };
}

export function nftOwnerPageHeaders(page: MintedNftPage): Record<string, string> {
  if (!page.partial) return { "X-Nfts-Partial": "0" };
  const headers: Record<string, string> = { "X-Nfts-Partial": "1" };
  if (page.next) headers["X-Nfts-Next"] = page.next;
  return headers;
}

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

/** Clears nothing persistent. Budget overrides stay under the test that set them. */
export function resetMintHistoryForTests(): void {}

function cursorKey(from: number, to: number): string {
  return `${from}-${to}`;
}

function resumeWindowIndex(windows: Array<[number, number]>, cursor: string | null | undefined): number {
  if (!cursor || cursor === "tip") return windows.length - 1;
  const match = NFT_CURSOR_RE.exec(cursor);
  if (!match) return windows.length - 1;
  const from = Number(match[1]);
  const to = Number(match[2]);
  const exact = windows.findIndex(([start, end]) => start === from && end === to);
  if (exact >= 0) return exact;
  const sameStart = windows.findIndex(([start]) => start === from);
  if (sameStart >= 0) return sameStart;
  return windows.length - 1;
}

async function listMintedNftsWithin(owner: string, cursor: string | null, deadlineAt: number): Promise<MintedNftPage> {
  const factory = nftFactoryAddress();
  if (!factory || !isAddress(owner)) return { items: [], partial: false };
  const topics = mintLogTopics(owner);
  const factoryStart = nftFactoryScanStart(factory);
  const latestHex = await evmJsonRpc<string>("eth_blockNumber", []).catch(() => "");
  const latest = latestHex ? Number.parseInt(latestHex, 16) : Number.NaN;
  if (!Number.isFinite(latest)) return { items: [], partial: true, next: "tip" };
  const windows = logWindows(factoryStart, latest);
  if (!windows.length) return { items: [], partial: false };

  const recentFloor = Math.max(0, windows.length - RECENT_MINT_WINDOWS);
  const pageSize = historyWindowsPerPage();
  const logs: Array<{ address?: string; topics?: readonly string[]; data?: string }> = [];
  let historyRead = 0;
  let index = resumeWindowIndex(windows, cursor);
  while (index >= 0) {
    if (Date.now() >= deadlineAt) {
      const [from, to] = windows[index];
      return { items: nftsFromMintLogs(logs, owner), partial: true, next: cursorKey(from, to) };
    }
    const batch: number[] = [];
    let look = index;
    let historyInBatch = 0;
    while (look >= 0 && batch.length < MAX_PARALLEL_LOG_WINDOWS) {
      const isRecent = look >= recentFloor;
      if (!isRecent && historyRead + historyInBatch >= pageSize) break;
      batch.push(look);
      if (!isRecent) historyInBatch += 1;
      look -= 1;
    }
    if (!batch.length) {
      const [from, to] = windows[index];
      return { items: nftsFromMintLogs(logs, owner), partial: true, next: cursorKey(from, to) };
    }
    // Fresh windows use the recent lane and are listed first. A batch stays inside the
    // process-wide log limit so a slow window cannot queue extra reads past the deadline.
    const chunks = await Promise.all(
      batch.map((windowIndex) => {
        const [from, to] = windows[windowIndex];
        const priority = windowIndex >= recentFloor ? "recent" : "history";
        return withRpcCallContext({ deadlineAt, logPriority: priority }, () =>
          fetchLogWindow(factory, topics, from, to, latest),
        );
      }),
    );
    for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
      const windowIndex = batch[batchIndex];
      const [from, to] = windows[windowIndex];
      const chunk = chunks[batchIndex];
      if (chunk === null) {
        return { items: nftsFromMintLogs(logs, owner), partial: true, next: cursorKey(from, to) };
      }
      logs.push(...chunk);
      if (windowIndex < recentFloor) historyRead += 1;
    }
    index = look;
  }
  return { items: nftsFromMintLogs(logs, owner), partial: false };
}

export async function listMintedNfts(
  owner: string,
  options?: { cursor?: string | null; deadlineAt?: number },
): Promise<MintedNftPage> {
  const deadlineAt = options?.deadlineAt ?? nftOwnerListDeadlineAt();
  return withRpcCallContext({ deadlineAt }, () => listMintedNftsWithin(owner, options?.cursor ?? null, deadlineAt));
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
