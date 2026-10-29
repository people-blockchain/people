import { unstable_cache } from "next/cache";
import { getAddress, formatUnits } from "viem";
import { readEvmDeployments } from "@/lib/evm/config";
import { evmJsonRpc, evmJsonRpcBatch, resetRpcBackoffForTests } from "@/lib/evm/rpc-server";
import { curatedAssetKeys, enrichAssetRow, resolveLogicalAssetId, seedAssetMeta } from "@/lib/evm/seed-assets";
import { warnCatalog } from "@/lib/evm/catalog-log";
import { readCatalogSnapshot, readLogScanCursor, writeCatalogSnapshot, writeLogScanCursor } from "@/lib/evm/log-scan-cursor";
import { readTokenIconOverrides } from "@/lib/evm/token-icon-overrides";

/** `TokenCreated(address,address,string,string,uint8,uint256,(uint256×5))` — pre-leftoverMode factories. */
export const TOKEN_CREATED_TOPIC = "0x10911c4cd4fbfa42352cbeb31e021abbab48257dff3d94957b57da33a205d724";
/** Same event with the trailing `uint8 leftoverMode` (owner rule 2026-10-13 factories). */
export const TOKEN_CREATED_LEFTOVER_TOPIC = "0xdcb5d6c49a959a42d0c67fe9b9aa48b4da6065c9f47789f71789f629d84d30f1";
const PAIR_CREATED_TOPIC = "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9";

// ERC-20 / Uniswap-V2 selectors, spelled out so the catalog scan stays dependency-free.
const SEL_NAME = "0x06fdde03";
const SEL_SYMBOL = "0x95d89b41";
const SEL_DECIMALS = "0x313ce567";
const SEL_TOTAL_SUPPLY = "0x18160ddd";
const SEL_CREATOR = "0x02d05d3f";
const SEL_METADATA_URI = "0x03ee438c";
const SEL_TOKEN0 = "0x0dfe1681";
const SEL_TOKEN1 = "0xd21220a7";
const SEL_RESERVES = "0x0902f1ac";

type RpcLog = {
  address?: string;
  topics?: string[];
  data?: string;
  blockNumber?: string;
};

/**
 * One JSON-RPC log-filter topic position. `null` is a wildcard and an array is an OR of topics
 * (e.g. both `TokenCreated` signatures in a single `eth_getLogs` call).
 */
type LogTopic = string | string[] | null;

export type CatalogToken = {
  assetId: string;
  tokenAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: number;
  creator: string;
  status: string;
  type: string;
  /** True only for assets with curated (seed) metadata; everything else is author-supplied. */
  verified: boolean;
  /** Curated assetId whose name/symbol this uncurated token copies, if any. */
  impersonates?: string;
  creationMetadata?: { image?: string; description?: string; website?: string; testnet?: boolean };
  imageUri?: string;
};

export type CatalogPool = {
  poolId: string;
  tokenAssetId: string;
  tokenAddress: string;
  nativeReserve: number;
  tokenReserve: number;
};

/** Current + legacy (`<base>V1`, `<base>V2`, …) addresses of one contract role, current first. */
function contractVersions(dep: { contracts: Record<string, string | null> }, base: string): string[] {
  const re = new RegExp(`^${base}(V\\d+)?$`);
  return Object.entries(dep.contracts ?? {})
    .filter(([key, addr]) => re.test(key) && Boolean(addr))
    .sort(([a], [b]) => (a === base ? -1 : b === base ? 1 : a.localeCompare(b)))
    .map(([, addr]) => addr as string);
}

function topicAddress(topic: string | undefined): string {
  if (!topic || topic.length < 66) return "";
  return getAddress(`0x${topic.slice(26)}`);
}

/**
 * Cosmos EVM nodes reject eth_getLogs over more than 10,000 blocks
 * ("maximum [from, to] blocks distance: 10000"), so a single 0x1..latest query
 * threw and the whole pool/token scan came back empty on a long-running chain.
 * Scan in windows from the deployment block instead. The catalog's incremental scan isolates a
 * failed window (partial result), while the strict `fetchLogsWindowed` callers still reject so they
 * never treat a partial list as whole.
 */
export const LOG_WINDOW_BLOCKS = 9_000;

export function logWindows(fromBlock: number, latest: number, size = LOG_WINDOW_BLOCKS): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let start = Math.max(0, fromBlock); start <= latest; start += size) {
    out.push([start, Math.min(latest, start + size - 1)]);
  }
  return out;
}

function deploymentStartBlock(): number {
  const dep = readEvmDeployments();
  return typeof dep.deployBlock === "number" && dep.deployBlock > 0 ? dep.deployBlock : 1;
}

/**
 * First block that can possibly hold a log from `address`.
 *
 * The chain's first deploy is block 56, but the token/AMM factories were created around block
 * 220 450 — scanning from 56 walks ~24 windows that can never match and dominated the cold
 * catalog scan. `startBlocks` in the deployment JSON records where each contract really starts;
 * an address with no entry (an AMM pair the factory deployed, say) can only have logged after its
 * factory existed, so it falls back to the AMM factory's start block.
 */
export function logStartBlock(address: string): number {
  const dep = readEvmDeployments();
  const startBlocks = dep.startBlocks ?? {};
  const lower = address.toLowerCase();
  for (const [key, contract] of Object.entries(dep.contracts ?? {})) {
    if (!contract || contract.toLowerCase() !== lower) continue;
    const start = startBlocks[key];
    return typeof start === "number" && start > 0 ? start : deploymentStartBlock();
  }
  // Legacy pairs/tokens of the previous stack predate the current AMM factory, so fall back to
  // the earliest AMM factory start.
  const ammStarts = Object.entries(startBlocks)
    .filter(([key]) => /^ammFactory(V\d+)?$/.test(key))
    .map(([, block]) => block)
    .filter((b): b is number => typeof b === "number" && b > 0);
  return ammStarts.length ? Math.min(...ammStarts) : deploymentStartBlock();
}

export type TokenFactoryScan = {
  key: string;
  address: string;
  fromBlock: number;
  /** Inclusive end block for a superseded factory; `undefined` for the current one (scan to tip). */
  toBlock?: number;
};

/**
 * Token factories ordered by deployment. A factory is superseded by the next one, so its history
 * ends at the block before the newer factory starts: no token can ever be created on it after that.
 * Only the current `tokenFactory` stays open-ended and is scanned up to the chain tip.
 */
export function tokenFactoryScans(): TokenFactoryScan[] {
  const dep = readEvmDeployments();
  const startBlocks = dep.startBlocks ?? {};
  const ordered = Object.entries(dep.contracts ?? {})
    .filter(([key, address]) => /^tokenFactory(V\d+)?$/.test(key) && Boolean(address))
    .map(([key, address]) => {
      const start = startBlocks[key];
      return {
        key,
        address: address as string,
        fromBlock: typeof start === "number" && start > 0 ? start : deploymentStartBlock(),
      };
    })
    .sort((a, b) => a.fromBlock - b.fromBlock || a.key.localeCompare(b.key));

  return ordered.map((entry, index) => {
    const next = ordered[index + 1];
    return {
      ...entry,
      ...(next ? { toBlock: next.fromBlock - 1 } : {}),
    };
  });
}

/**
 * Log results for a window that sits more than a full window behind the tip can never gain new
 * entries (the chain is attested/finalised), so they are reused for a long time. The tip window is
 * always re-read, so a freshly created token or pair appears without any cache flush.
 */
const WINDOW_LOG_TTL_MS = 15 * 60_000;
const MAX_WINDOW_CACHE_ENTRIES = 400;
const windowLogsCache = new Map<string, { at: number; value: RpcLog[] }>();

/** Per-scan `eth_getLogs` concurrency for the non-catalog windowed scans. */
export const MAX_PARALLEL_LOG_WINDOWS = 6;
/**
 * Global in-flight cap across every caller in this server instance. A cold catalog scan runs five
 * factory scans concurrently; without this cap they would fire up to 30 range scans at the shared
 * validator at once (the 2026-10-17 memory incident).
 */
export const MAX_GLOBAL_LOG_WINDOWS = 8;
/**
 * Token-catalog scans run factories one after another, so this is also the global in-flight cap for
 * catalog `eth_getLogs`: the node slows down sharply at six or more parallel range queries.
 */
export const MAX_CATALOG_LOG_WINDOWS = 4;
/** `eth_getLogs` gets a shorter timeout than ordinary calls: a slow window is retried, not awaited. */
export const LOG_GETLOGS_TIMEOUT_MS = 12_000;
let logWindowsInFlight = 0;
const logWindowQueue: Array<() => void> = [];

async function withLogWindowSlot<T>(work: () => Promise<T>): Promise<T> {
  if (logWindowsInFlight >= MAX_GLOBAL_LOG_WINDOWS) {
    await new Promise<void>((resolve) => logWindowQueue.push(resolve));
  } else {
    logWindowsInFlight++;
  }
  try {
    return await work();
  } finally {
    const next = logWindowQueue.shift();
    // Hand the slot straight to the next waiter; only free it when nobody is queued.
    if (next) next();
    else logWindowsInFlight--;
  }
}

/** Peak concurrent `eth_getLogs` windows, for tests. */
let logWindowsPeak = 0;
export function logWindowConcurrencyPeakForTests(): number {
  return logWindowsPeak;
}

function windowCacheKey(address: string, topics: readonly LogTopic[], from: number, to: number): string {
  return `${address.toLowerCase()}|${topics
    .map((topic) => (Array.isArray(topic) ? `[${topic.join("+")}]` : topic ?? "*"))
    .join(",")}|${from}|${to}`;
}

function rememberWindowLogs(key: string, value: RpcLog[]): void {
  if (windowLogsCache.size >= MAX_WINDOW_CACHE_ENTRIES) {
    const oldest = windowLogsCache.keys().next().value;
    if (oldest !== undefined) windowLogsCache.delete(oldest);
  }
  windowLogsCache.set(key, { at: Date.now(), value });
}

function rpcLogFilter(address: string, topics: readonly LogTopic[], from: number, to: number) {
  return {
    address: getAddress(address),
    topics,
    fromBlock: `0x${from.toString(16)}`,
    toBlock: `0x${to.toString(16)}`,
  };
}

/** Marks an error raised by the node (as opposed to the Next data cache being unavailable). */
class LogWindowRpcError extends Error {}

async function readLogWindowFromNode(address: string, topics: readonly LogTopic[], from: number, to: number): Promise<RpcLog[]> {
  return withLogWindowSlot(async () => {
    logWindowsPeak = Math.max(logWindowsPeak, logWindowsInFlight);
    let logs: unknown;
    try {
      logs = await evmJsonRpc<RpcLog[]>("eth_getLogs", [rpcLogFilter(address, topics, from, to)], {
        timeoutMs: LOG_GETLOGS_TIMEOUT_MS,
        // A single HTML proxy page or timeout must not block the remaining windows behind the
        // per-URL backoff; the caller retries this window on its own schedule.
        ignoreBackoff: true,
      });
    } catch (error) {
      throw new LogWindowRpcError(error instanceof Error ? error.message : "rpc_logs_failed");
    }
    // Throwing (rather than returning []) keeps a failed window out of every cache.
    if (!Array.isArray(logs)) throw new LogWindowRpcError("rpc_logs_unavailable");
    return logs as RpcLog[];
  });
}

/**
 * Immutable windows are shared across server instances/lambdas through the Next data cache, so a
 * cold instance does not re-scan history that every other instance already read. The arguments
 * (lower-cased address, topics, range) are part of the cache key.
 */
const IMMUTABLE_WINDOW_REVALIDATE_SECONDS = 24 * 60 * 60;
const readImmutableLogWindowShared = unstable_cache(readLogWindowFromNode, ["evm-log-window-v1"], {
  revalidate: IMMUTABLE_WINDOW_REVALIDATE_SECONDS,
  tags: ["evm-log-windows"],
});

async function readLogWindow(
  address: string,
  topics: readonly LogTopic[],
  from: number,
  to: number,
  immutable: boolean,
): Promise<RpcLog[] | null> {
  const lower = address.toLowerCase();
  if (immutable) {
    try {
      return await readImmutableLogWindowShared(lower, topics, from, to);
    } catch (error) {
      if (error instanceof LogWindowRpcError) {
        warnCatalog("eth_getLogs window", error, { address: lower, from, to });
        return null;
      }
      // Outside the Next runtime (node tests, scripts) there is no data cache: read directly.
    }
  }
  try {
    return await readLogWindowFromNode(lower, topics, from, to);
  } catch (error) {
    warnCatalog("eth_getLogs window", error, { address: lower, from, to });
    return null;
  }
}

/**
 * Scans every window from the contract's first block to the tip.
 *
 * - Windows come from the per-process cache, then (for immutable windows) the shared Next data
 *   cache, and only then from the node.
 * - Node reads are capped at `MAX_GLOBAL_LOG_WINDOWS` in flight across the whole process, so a
 *   cold page render cannot fire dozens of range scans at the validator at once.
 * - `rpc-server.ts` backs off exponentially after node failures, so an unhealthy node is not
 *   hammered with retries. A failed window is retried once; if it still fails the scan rejects
 *   with `log_window_unavailable` rather than returning a partial result.
 *
 * `fromBlockHint` can only move the start later (e.g. a pair's own factory start block).
 * `topics` follows the JSON-RPC log filter: `null` is a wildcard position. The window cache key
 * includes every topic, so a buy scan and a sell scan of the same address do not collide.
 */
export async function fetchLogsWindowed(
  address: string,
  topics: readonly LogTopic[],
  fromBlockHint?: number,
): Promise<RpcLog[]> {
  const result = await fetchLogsWindowedCore(address, topics, fromBlockHint, null);
  return result.logs;
}

export type LogScanOutcome = {
  logs: RpcLog[];
  /** False when the history scan stopped at its deadline or at least one window failed. */
  complete: boolean;
  /** Windows that exhausted their retries (the rest of the scan still ran). */
  failedWindows?: number;
};

export type LogScanOptions = {
  /** Capture window failures instead of rejecting; failed windows are left out of the result. */
  resilient?: boolean;
  /** Delays before each retry; `[0]` is the historical single immediate retry. */
  retryDelays?: readonly number[];
  /** Per-scan concurrency cap, bounded by the process-wide cap. */
  maxParallel?: number;
  /** Read recent history first, so new events surface before a long backlog. */
  historyNewestFirst?: boolean;
  /** Called as each window completes, letting a catalog publish partial results early. */
  onWindowLogs?: (logs: RpcLog[]) => void;
  /** Chain tip already read by the caller, so every factory of one scan agrees on it. */
  tip?: number;
  /** Called once the current factory's tail windows (and their rows) are ready. */
  onTailReady?: () => void | Promise<void>;
};

/**
 * Incremental variant used by the token catalog. Immutable windows (those that can no longer gain
 * logs) are persisted per `address` + combined topic key, so a later scan starts at the stored
 * `lastBlock` instead of replaying the whole chain history. For an open-ended (current) factory the
 * last two windows up to the tip are always re-read, so a freshly created token appears on every
 * refresh. Without DATABASE_URL, or on any DB error, this behaves like `fetchLogsWindowed`.
 *
 * `toBlockHint` caps a superseded factory's scan at its successor's first block. `deadlineAt` lets
 * the catalog stop history work early and resume from the persisted cursor on the next request.
 *
 * The incremental scan is resilient by default: a failed window marks the outcome incomplete but
 * never rejects, and the cursor only advances across contiguous successful windows.
 */
export async function fetchLogsWindowedIncrementalResult(
  address: string,
  topic: string | readonly string[],
  fromBlockHint?: number,
  toBlockHint?: number,
  deadlineAt?: number,
  options: LogScanOptions = {},
): Promise<LogScanOutcome> {
  const topics: LogTopic[] = [typeof topic === "string" ? topic : [...topic]];
  return fetchLogsWindowedCore(address, topics, fromBlockHint, cursorKeyForTopics(topics), toBlockHint, deadlineAt, {
    resilient: true,
    retryDelays: [500, 1500],
    ...options,
  });
}

export async function fetchLogsWindowedIncremental(
  address: string,
  topic: string | readonly string[],
  fromBlockHint?: number,
  toBlockHint?: number,
  deadlineAt?: number,
  options: LogScanOptions = {},
): Promise<RpcLog[]> {
  return (await fetchLogsWindowedIncrementalResult(address, topic, fromBlockHint, toBlockHint, deadlineAt, options)).logs;
}

/**
 * Reads only the newest windows of one factory (up to its successor for a superseded factory) and
 * never rejects. The catalog awaits this for every factory before it answers, so a token created
 * moments ago is listed even while older history is still being scanned. Superseded factories can
 * no longer gain logs, so their tail windows are served from the immutable window cache when warm.
 */
export async function fetchLogsTailResult(
  address: string,
  topic: string | readonly string[],
  fromBlockHint?: number,
  toBlockHint?: number,
  options: Pick<LogScanOptions, "retryDelays" | "onWindowLogs"> & { tip?: number } = {},
): Promise<LogScanOutcome> {
  const topics: LogTopic[] = [typeof topic === "string" ? topic : [...topic]];
  const tip = options.tip ?? (await readChainTip());
  if (tip === null) return { logs: [], complete: false, failedWindows: 1 };
  const scanLatest = typeof toBlockHint === "number" && toBlockHint >= 0 ? Math.min(tip, toBlockHint) : tip;
  const start = Math.max(
    logStartBlock(address),
    typeof fromBlockHint === "number" && fromBlockHint > 0 ? fromBlockHint : 0,
  );
  const windows = logWindows(start, scanLatest).slice(-TAIL_WINDOW_COUNT);
  const now = Date.now();
  const scanned = await Promise.all(
    windows.map(async ([from, to]) => {
      try {
        const logs = await readCachedLogWindow(address, topics, from, to, tip, now, {
          endBlock: toBlockHint,
          fresh: typeof toBlockHint !== "number",
          retryDelays: options.retryDelays ?? [500, 1500],
        });
        options.onWindowLogs?.(logs);
        return { logs, ok: true };
      } catch (error) {
        warnCatalog("tail window", error, { address: address.toLowerCase(), from, to });
        return { logs: [] as RpcLog[], ok: false };
      }
    }),
  );
  return {
    logs: scanned.flatMap(({ logs }) => logs),
    complete: scanned.every(({ ok }) => ok),
    failedWindows: scanned.filter(({ ok }) => !ok).length,
  };
}

type ScannedLogWindow = { from: number; to: number; logs: RpcLog[]; ok: boolean };

function cursorKeyForTopics(topics: readonly LogTopic[]): string {
  return topics
    .map((topic) => (Array.isArray(topic) ? [...topic].sort().join("+") : topic ?? "*"))
    .join("|");
}

function logBlockNumber(log: RpcLog): number | null {
  const block = log.blockNumber ? Number.parseInt(log.blockNumber, 16) : Number.NaN;
  return Number.isFinite(block) ? block : null;
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/** Newest windows of a factory, always re-read before the catalog answers. */
const TAIL_WINDOW_COUNT = 2;

/**
 * Chain tip for a catalog scan. It reads through an active RPC backoff (a failure noted for some
 * unrelated call must not blank the scan) and retries once; `null` means the node is unreachable.
 */
async function readChainTip(): Promise<number | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const hex = await evmJsonRpc<string>("eth_blockNumber", [], { timeoutMs: 8_000, ignoreBackoff: true });
      const tip = Number.parseInt(hex, 16);
      if (Number.isFinite(tip)) return tip;
    } catch (error) {
      if (attempt === 1) warnCatalog("eth_blockNumber", error);
    }
    if (attempt === 0) await sleep(300);
  }
  return null;
}

async function readCachedLogWindow(
  address: string,
  topics: readonly LogTopic[],
  from: number,
  to: number,
  latest: number,
  now: number,
  {
    endBlock,
    fresh = false,
    retryDelays = [0],
  }: { endBlock?: number; fresh?: boolean; retryDelays?: readonly number[] } = {},
): Promise<RpcLog[]> {
  const key = windowCacheKey(address, topics, from, to);
  const isImmutable = (typeof endBlock === "number" && to <= endBlock) || to < latest - LOG_WINDOW_BLOCKS;
  if (!fresh) {
    const entry = windowLogsCache.get(key);
    if (entry && (!isImmutable || now - entry.at < WINDOW_LOG_TTL_MS)) return entry.value;
  }
  // Retry a transient node failure a small, bounded number of times before giving up. The catalog
  // passes [500, 1500]; older callers keep the historical single immediate retry.
  let logs: RpcLog[] | null = null;
  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    if (attempt > 0) await sleep(retryDelays[attempt - 1]);
    logs = await readLogWindow(address, topics, from, to, isImmutable);
    if (logs) break;
  }
  if (!logs) throw new Error("log_window_unavailable");
  rememberWindowLogs(key, logs);
  return logs;
}

async function fetchLogsWindowedCore(
  address: string,
  topics: readonly LogTopic[],
  fromBlockHint: number | undefined,
  cursorTopic: string | null,
  toBlockHint?: number,
  deadlineAt?: number,
  options: LogScanOptions = {},
): Promise<LogScanOutcome> {
  const resilient = options.resilient ?? false;
  const retryDelays = options.retryDelays ?? [0];
  const maxParallel = Math.max(1, options.maxParallel ?? MAX_PARALLEL_LOG_WINDOWS);
  const tip = options.tip ?? (await readChainTip());
  if (tip === null) return { logs: [], complete: false, failedWindows: 1 };
  const scanLatest =
    typeof toBlockHint === "number" && toBlockHint >= 0 ? Math.min(tip, toBlockHint) : tip;
  const start = Math.max(
    logStartBlock(address),
    typeof fromBlockHint === "number" && fromBlockHint > 0 ? fromBlockHint : 0,
  );
  const storedCursor = cursorTopic ? await readLogScanCursor(address, cursorTopic) : null;
  // A cursor at/after the reported tip means the node regressed (or was reset): re-scan instead
  // of trusting blocks it no longer serves.
  const cursor = storedCursor && storedCursor.lastBlock < tip ? storedCursor : null;
  const lastBlock = cursor?.lastBlock ?? -1;
  const cursorLogs = cursor?.logs ?? [];
  const allWindows = logWindows(start, scanLatest);
  const tailWindows = typeof toBlockHint === "number" ? [] : allWindows.slice(-TAIL_WINDOW_COUNT);
  const tailStart = tailWindows.length ? tailWindows[0][0] : scanLatest + 1;
  // An old cursor may have scanned past a superseded factory's successor or into the current
  // factory's tail, which is re-read below; drop those blocks so the result has no duplicates.
  const visibleCursorLogs = cursorLogs.filter((log) => {
    const block = logBlockNumber(log);
    if (block === null) return true;
    return typeof toBlockHint === "number" ? block <= scanLatest : block < tailStart;
  });
  // Publish already-persisted history immediately, so a cold instance shows every token the cursor
  // knows about even if the rest of the history scan has not run yet.
  if (cursorTopic && visibleCursorLogs.length) options.onWindowLogs?.(visibleCursorLogs);

  const now = Date.now();
  const scanned: ScannedLogWindow[] = [];
  const readWindow = async (
    [from, to]: [number, number],
    readOptions: { endBlock?: number; fresh?: boolean } = {},
  ): Promise<ScannedLogWindow> => {
    try {
      const logs = await readCachedLogWindow(address, topics, from, to, tip, now, {
        ...readOptions,
        retryDelays,
      });
      options.onWindowLogs?.(logs);
      return { from, to, logs, ok: true };
    } catch (error) {
      // The token catalog cannot let one window blank the whole list: keep the other windows and
      // tell the caller the result is incomplete. Other callers keep their strict behaviour.
      if (!resilient) throw error;
      warnCatalog("log window", error, { address: address.toLowerCase(), from, to });
      return { from, to, logs: [], ok: false };
    }
  };
  const failedWindowCount = () => scanned.filter((window) => !window.ok).length;

  if (!cursorTopic) {
    const windows = logWindows(Math.max(start, lastBlock + 1), scanLatest);
    if (!windows.length) return { logs: cursorLogs, complete: true, failedWindows: 0 };
    scanned.push(...(await Promise.all(windows.map((window) => readWindow(window)))));
    return {
      logs: [...cursorLogs, ...scanned.flatMap(({ logs }) => logs)],
      complete: scanned.every((window) => window.ok),
      failedWindows: failedWindowCount(),
    };
  }

  // The current factory has no successor, so its last two windows are the only place a new token
  // can appear. Read them on every refresh, even when a cursor covers the rest of history.
  const historyFrom = Math.max(start, lastBlock + 1);
  const historyWindows = historyFrom <= tailStart - 1 ? logWindows(historyFrom, tailStart - 1) : [];

  if (!tailWindows.length && !historyWindows.length) {
    return { logs: visibleCursorLogs, complete: true, failedWindows: 0 };
  }

  let complete = true;
  // Tail first: fresh tokens must show even when history work runs out of time below.
  if (tailWindows.length) {
    const tailScanned = await Promise.all(
      tailWindows.map((window) => readWindow(window, { fresh: true })),
    );
    scanned.push(...tailScanned);
    if (tailScanned.some((window) => !window.ok)) complete = false;
    // The caller may publish the tail now; history below is still bounded by the soft deadline.
    if (options.onTailReady) await options.onTailReady();
  }

  // Persist immutable windows as they form a contiguous successful prefix, so a later invocation
  // resumes instead of restarting. A failed or unscanned window is a hard stop: the cursor never
  // advances past it, even if newer windows succeeded.
  const historyScanned: ScannedLogWindow[] = [];
  const immutableEnd = typeof toBlockHint === "number" ? scanLatest + 1 : tip - LOG_WINDOW_BLOCKS;
  let persistedThrough = lastBlock;
  let persistCursor = true;
  const persistContiguous = async () => {
    if (!cursorTopic || !persistCursor) return;
    const byFrom = new Map(historyScanned.map((window) => [window.from, window]));
    const contiguous: ScannedLogWindow[] = [];
    for (const [from] of historyWindows) {
      const window = byFrom.get(from);
      if (!window || !window.ok || window.to >= immutableEnd) break;
      contiguous.push(window);
    }
    if (!contiguous.length) return;
    const end = contiguous[contiguous.length - 1].to;
    if (end <= persistedThrough) return;
    const logs = [...visibleCursorLogs, ...contiguous.flatMap((window) => window.logs)];
    if (await writeLogScanCursor(address, cursorTopic, end, logs)) {
      persistedThrough = end;
    } else {
      // Stop retrying the DB for this scan after the first failure; the next call retries.
      warnCatalog("cursor persist", "write_failed", { address: address.toLowerCase(), through: end });
      persistCursor = false;
    }
  };

  const orderedHistory = options.historyNewestFirst ? [...historyWindows].reverse() : historyWindows;
  for (let i = 0; i < orderedHistory.length; i += maxParallel) {
    if (typeof deadlineAt === "number" && Date.now() >= deadlineAt) {
      complete = false;
      break;
    }
    const chunk = orderedHistory.slice(i, i + maxParallel);
    const chunkLogs = await Promise.all(
      chunk.map((window) => readWindow(window, { endBlock: toBlockHint })),
    );
    scanned.push(...chunkLogs);
    historyScanned.push(...chunkLogs);
    if (chunkLogs.some((window) => !window.ok)) complete = false;
    await persistContiguous();
  }

  return {
    logs: [...visibleCursorLogs, ...scanned.flatMap(({ logs }) => logs)],
    complete,
    failedWindows: failedWindowCount(),
  };
}

const SEL_FACTORY = "0xc45a0155";

/**
 * First block worth scanning for an AMM pair: the start block of the factory that created it
 * (read via `factory()`), so a pair of the 2026-10-16 stack is not scanned from the legacy V1
 * factory's block 58. Falls back to `logStartBlock(pair)` when the factory is unknown.
 */
export async function pairLogStartBlock(pair: string): Promise<number> {
  const fallback = logStartBlock(pair);
  const out = await evmJsonRpc<string>("eth_call", [{ to: getAddress(pair), data: SEL_FACTORY }, "latest"]).catch(() => "");
  if (!out || out.length < 66) return fallback;
  const factory = `0x${out.slice(-40)}`.toLowerCase();
  const dep = readEvmDeployments();
  const known = Object.values(dep.contracts ?? {}).some((contract) => contract?.toLowerCase() === factory);
  return known ? Math.max(fallback, logStartBlock(factory)) : fallback;
}

/**
 * Decodes ABI-encoded `string` return data. Author-controlled: control characters are stripped and
 * length is capped so a token cannot spoof a catalog entry with invisible/homoglyph padding.
 */
function decodeErc20String(out: string | null | undefined): string {
  if (!out || out === "0x" || out.length < 130) return "";
  try {
    return Buffer.from(out.slice(130), "hex")
      .toString("utf8")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 64);
  } catch {
    return "";
  }
}

function decodeUint(out: string | null | undefined): bigint {
  if (!out || out === "0x") return BigInt(0);
  try {
    return BigInt(out);
  } catch {
    return BigInt(0);
  }
}

function decodeAddress(ret: string | null | undefined): string {
  if (!ret || ret === "0x" || ret.length < 66) return "";
  try {
    return getAddress(`0x${ret.slice(-40)}`);
  } catch {
    return "";
  }
}

/**
 * Token `metadataURI()` may be an icon address (ipfs://… or https://…). The old launch flow wrote
 * the non-image placeholder `ipfs://people/<SYMBOL>`, which must never replace the gradient icon.
 */
export function tokenImageFromMetadataUri(uri: string | null | undefined): string | null {
  const value = (uri ?? "").trim();
  if (!value || value === "ipfs://people" || value.startsWith("ipfs://people/")) return null;
  if (/^ipfs:\/\/[^\s]+$/i.test(value)) return value;
  if (/^https:\/\/[^\s]+$/i.test(value)) return value;
  return null;
}

/**
 * Applies the image precedence shared by the catalog and the single-asset fallback: an owner
 * icon override wins, then curated/seed metadata, then the on-chain metadataURI image.
 */
export function applyTokenImage<T extends { imageUri?: string; creationMetadata?: { image?: string; [key: string]: unknown } }>(
  row: T,
  override: string | null | undefined,
  chainImage: string | null | undefined,
): T {
  const imageUri = override ?? (row.imageUri ? undefined : chainImage ?? undefined);
  if (!imageUri) return row;
  return {
    ...row,
    imageUri,
    creationMetadata: { ...(row.creationMetadata ?? {}), image: imageUri },
  } as T;
}

/** On-chain catalog scans are expensive; the cached copy is refreshed in the background. */
const CATALOG_STALE_MS = 30_000;
/** A scan stopped by its deadline is resumed on the next request instead of being cached as whole. */
export const CATALOG_PARTIAL_STALE_MS = 15_000;
/** Wall-clock budget for one cold token catalog scan; the current factory tail is always read. */
export const TOKEN_CATALOG_SCAN_BUDGET_MS = 45_000;
/** A cold request waits at most this long before serving the partial list while the scan continues. */
export const TOKEN_CATALOG_SOFT_DEADLINE_MS = 8_000;
let tokenCatalogSoftDeadlineMs = TOKEN_CATALOG_SOFT_DEADLINE_MS;

/** Shorten the cold-response wait in tests; `null` restores the production 8 s deadline. */
export function setTokenCatalogSoftDeadlineForTests(ms: number | null): void {
  tokenCatalogSoftDeadlineMs = ms ?? TOKEN_CATALOG_SOFT_DEADLINE_MS;
}
const CATALOG_REVALIDATE_SECONDS = 60;
export const CHAIN_CATALOG_TAGS = ["evm-chain-catalog"];

let tokensCache: { at: number; value: CatalogToken[]; partial?: boolean } | null = null;
let poolsCache: { at: number; value: CatalogPool[] } | null = null;
let tokensRefreshing: Promise<CatalogToken[]> | null = null;
/** In-flight tail re-read for a fresh cache; shared by concurrent requests. */
let tailRefreshing: Promise<CatalogToken[]> | null = null;
let poolsRefreshing: Promise<CatalogPool[]> | null = null;
/** Tokens found so far by the in-flight scan, published tail-first for cold requests. */
let tokenCatalogProgress: { addresses: Set<string>; tokens: CatalogToken[] } | null = null;
/** Incremented per on-chain scan so a cold request can wait for the tail of *its* scan. */
let tokenCatalogScanGeneration = 0;
let tokenCatalogTailReady: { generation: number; promise: Promise<void> } | null = null;
/** The current factory's tail is ~2 requests; a cold request always waits up to this long for it. */
export const TOKEN_CATALOG_TAIL_WAIT_MS = 12_000;

type TokenMetadataCacheEntry = {
  name?: string;
  symbol?: string;
  decimals?: number;
  creator?: string;
  totalSupply?: bigint;
  metadataUri?: string;
};

/**
 * Immutable ERC-20 metadata (name/symbol/decimals/creator) is kept per token for the lifetime of the
 * process. A failed batch or a transient node error then reuses the last good values instead of
 * caching a placeholder "TKN" row. totalSupply/metadataURI are refreshed whenever the read works.
 */
const tokenMetadataCache = new Map<string, TokenMetadataCacheEntry>();

export function resetChainCatalogCacheForTests(): void {
  tokensCache = null;
  poolsCache = null;
  tokensRefreshing = null;
  tailRefreshing = null;
  poolsRefreshing = null;
  tokenCatalogProgress = null;
  tokenCatalogScanGeneration = 0;
  tokenCatalogTailReady = null;
  persistedTokens = null;
  persistedTokenCount = 0;
  tokenMetadataCache.clear();
  tokenCatalogSoftDeadlineMs = TOKEN_CATALOG_SOFT_DEADLINE_MS;
  windowLogsCache.clear();
  logWindowsPeak = 0;
  resetRpcBackoffForTests();
}

/** Carries a partial scan out of `unstable_cache` so a deadline-stopped list is never shared. */
class PartialTokenCatalogError extends Error {
  readonly tokens: CatalogToken[];

  constructor(tokens: CatalogToken[]) {
    super("evm_token_catalog_partial");
    this.name = "PartialTokenCatalogError";
    this.tokens = tokens;
  }
}

/**
 * Cross-request cache so a cold server instance (or a second Vercel lambda) does not repeat the
 * full log scan for every visitor. Sanitised by the in-process stale-while-revalidate below, which
 * guarantees no request ever *awaits* a re-scan after the first one.
 *
 * A deadline-stopped scan is deliberately thrown out of the shared cache: the next request must
 * resume from the persisted cursor instead of being served a partial catalog for a minute.
 */
const scanTokensCached = unstable_cache(
  async (): Promise<CatalogToken[]> => {
    const result = await discoverTokensOnChainUncached();
    if (!result.complete) throw new PartialTokenCatalogError(result.tokens);
    return result.tokens;
  },
  ["evm-chain-catalog-tokens-v2"],
  {
    revalidate: CATALOG_REVALIDATE_SECONDS,
    tags: CHAIN_CATALOG_TAGS,
  },
);
const scanPoolsCached = unstable_cache(discoverPoolsOnChainUncached, ["evm-chain-catalog-pools-v1"], {
  revalidate: CATALOG_REVALIDATE_SECONDS,
  tags: CHAIN_CATALOG_TAGS,
});

export type CatalogTokenScanResult = {
  tokens: CatalogToken[];
  /** False when at least one factory history scan failed or hit its deadline; the tail is included. */
  complete: boolean;
};

function staticTokenAddresses(dep: ReturnType<typeof readEvmDeployments>): Set<string> {
  const out = new Set<string>();
  for (const addr of Object.values(dep.assetMap ?? {})) {
    if (addr) out.add(getAddress(addr).toLowerCase());
  }
  return out;
}

/** Curated rows from deployment/seed metadata, used before any on-chain read completes. */
function staticTokenRows(dep: ReturnType<typeof readEvmDeployments>): CatalogToken[] {
  // Only curated tokens: a row without seed metadata would be a placeholder name/symbol.
  return [...staticTokenAddresses(dep)]
    .filter((lower) => seedAssetMeta(resolveLogicalAssetId(getAddress(lower))))
    .map((lower) => {
      const token = getAddress(lower);
      const assetId = resolveLogicalAssetId(token);
      const seed = seedAssetMeta(assetId);
      return enrichAssetRow({
        assetId,
        tokenAddress: token,
        name: seed?.name ?? assetId.slice(0, 10),
        symbol: seed?.symbol ?? "TKN",
        decimals: seed?.decimals ?? 18,
        totalSupply: 0,
        creator: dep.deployer || "0x0",
        status: "active",
        type: "token",
        verified: Boolean(seed),
      });
    });
}

const ROW_READS = 6;
const METADATA_BATCH_TOKENS = 20;
const METADATA_FALLBACK_CONCURRENCY = 4;

type TokenRowBuild = {
  rows: CatalogToken[];
  /** False when some token was left out because its name/symbol could not be read. */
  complete: boolean;
  /** Tokens with no readable name/symbol and no cached or curated metadata (never listed). */
  skipped: number;
};

/** A string return counts as a read when it carries the ABI offset and length words. */
function isStringRead(raw: string | null | undefined): boolean {
  return typeof raw === "string" && raw.length >= 130;
}

function isWordRead(raw: string | null | undefined): boolean {
  return typeof raw === "string" && raw.length > 2;
}

function metadataCalls(tokens: string[]) {
  return tokens.flatMap((token) => [
    { method: "eth_call", params: [{ to: token, data: SEL_NAME }, "latest"] },
    { method: "eth_call", params: [{ to: token, data: SEL_SYMBOL }, "latest"] },
    { method: "eth_call", params: [{ to: token, data: SEL_DECIMALS }, "latest"] },
    { method: "eth_call", params: [{ to: token, data: SEL_TOTAL_SUPPLY }, "latest"] },
    { method: "eth_call", params: [{ to: token, data: SEL_CREATOR }, "latest"] },
    { method: "eth_call", params: [{ to: token, data: SEL_METADATA_URI }, "latest"] },
  ]);
}

/**
 * One batch for a chunk of tokens. A transport-level failure is retried once; after that every slot
 * is `null` and the caller falls back to single calls. Reads go through an active RPC backoff: a
 * failure noted for the log scan must not turn every token into a placeholder.
 */
async function readMetadataChunk(tokens: string[]): Promise<Array<string | null>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await evmJsonRpcBatch<string>(metadataCalls(tokens), { ignoreBackoff: true });
    } catch (error) {
      if (attempt === 1) warnCatalog("metadata batch", error, { tokens: tokens.length });
    }
  }
  return new Array<string | null>(tokens.length * ROW_READS).fill(null);
}

/** Reads ERC-20 metadata for every known address and turns it into catalog rows. */
async function buildTokenRows(addresses: Iterable<string>): Promise<TokenRowBuild> {
  const dep = readEvmDeployments();
  const tokens = [...new Set([...addresses].map((address) => address.toLowerCase()))].map((lower) => getAddress(lower));
  if (!tokens.length) return { rows: [], complete: true, skipped: 0 };

  // Small batches keep one bad chunk from blanking every token. A failed chunk is retried once;
  // tokens whose name/symbol/decimals are still missing then get individual eth_calls.
  const metadata: Array<string | null> = [];
  for (let index = 0; index < tokens.length; index += METADATA_BATCH_TOKENS) {
    metadata.push(...(await readMetadataChunk(tokens.slice(index, index + METADATA_BATCH_TOKENS))));
  }
  const fallbackIndexes: number[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const offset = index * ROW_READS;
    const cached = tokenMetadataCache.get(tokens[index].toLowerCase());
    const missingName = !isStringRead(metadata[offset]) && !cached?.name;
    const missingSymbol = !isStringRead(metadata[offset + 1]) && !cached?.symbol;
    const missingDecimals = !isWordRead(metadata[offset + 2]) && cached?.decimals === undefined;
    if (missingName || missingSymbol || missingDecimals) fallbackIndexes.push(index);
  }
  let fallbackFailures = 0;
  const singleCall = (token: string, data: string) =>
    evmJsonRpc<string>("eth_call", [{ to: token, data }, "latest"], { timeoutMs: 10_000, ignoreBackoff: true }).catch(() => {
      fallbackFailures += 1;
      return null;
    });
  for (let index = 0; index < fallbackIndexes.length; index += METADATA_FALLBACK_CONCURRENCY) {
    const chunk = fallbackIndexes.slice(index, index + METADATA_FALLBACK_CONCURRENCY);
    await Promise.all(
      chunk.map(async (tokenIndex) => {
        const token = tokens[tokenIndex];
        const offset = tokenIndex * ROW_READS;
        const [name, symbol, decimals] = await Promise.all([
          singleCall(token, SEL_NAME),
          singleCall(token, SEL_SYMBOL),
          singleCall(token, SEL_DECIMALS),
        ]);
        if (name !== null) metadata[offset] = name;
        if (symbol !== null) metadata[offset + 1] = symbol;
        if (decimals !== null) metadata[offset + 2] = decimals;
      }),
    );
  }
  if (fallbackFailures) warnCatalog("metadata single reads", "eth_call_failed", { failed: fallbackFailures });

  // Off-chain icon overrides are optional: no DATABASE_URL (or a DB error) simply leaves the
  // on-chain metadataURI in place.
  const iconOverrides = await readTokenIconOverrides(tokens).catch((error) => {
    warnCatalog("icon overrides", error);
    return new Map<string, string>();
  });

  let skipped = 0;
  const rows: CatalogToken[] = [];
  tokens.forEach((token, index) => {
    const offset = index * ROW_READS;
    const cached = tokenMetadataCache.get(token.toLowerCase());
    const name = decodeErc20String(metadata[offset]) || cached?.name || "";
    const symbol = decodeErc20String(metadata[offset + 1]) || cached?.symbol || "";
    const assetId = resolveLogicalAssetId(token);
    const seed = seedAssetMeta(assetId);
    // A row is real when name and symbol were read (an empty on-chain string is a valid read) or are
    // known from the cache/seed. Anything else is a failed read: it is not listed and never cached,
    // so the next scan retries instead of showing a placeholder "TKN" row.
    const nameKnown = Boolean(name) || isStringRead(metadata[offset]);
    const symbolKnown = Boolean(symbol) || isStringRead(metadata[offset + 1]);
    if (!seed && (!nameKnown || !symbolKnown)) {
      skipped += 1;
      return;
    }
    const onChainDecimals = isWordRead(metadata[offset + 2]) ? Number(decodeUint(metadata[offset + 2])) : null;
    const decimals = onChainDecimals !== null && Number.isFinite(onChainDecimals)
      ? onChainDecimals
      : cached?.decimals ?? 18;
    const supplyWei = isWordRead(metadata[offset + 3])
      ? decodeUint(metadata[offset + 3])
      : cached?.totalSupply ?? BigInt(0);
    const onChainCreator = decodeAddress(metadata[offset + 4]);
    const creator = onChainCreator || cached?.creator || dep.deployer || "0x0";
    const uri =
      metadata[offset + 5] === null
        ? cached?.metadataUri ?? ""
        : metadata[offset + 5] === "0x"
          ? ""
          : decodeErc20String(metadata[offset + 5]);
    const chainImage = tokenImageFromMetadataUri(uri);
    // Token metadata is permissionless: anyone can deploy a contract that calls itself
    // "People"/"PPL". Curated assets carry seed metadata, so a row whose assetId has none but
    // whose name/symbol matches a curated one is flagged instead of being presented as it.
    const impersonates = seed ? undefined : curatedAssetKeys().get((symbol || name).trim().toLowerCase());
    const enriched = enrichAssetRow({
      assetId,
      tokenAddress: token,
      name: seed?.name ?? (name || symbol || assetId.slice(0, 10)),
      symbol: seed?.symbol ?? (symbol || name || assetId.slice(0, 6)),
      decimals: seed?.decimals ?? decimals,
      totalSupply: Number(formatUnits(supplyWei, decimals)),
      creator,
      status: "active",
      type: "token",
      verified: Boolean(seed),
      ...(impersonates && impersonates !== assetId ? { impersonates } : {}),
    });
    rows.push(applyTokenImage(enriched, iconOverrides.get(token.toLowerCase()), chainImage));

    // Only successful reads reach the cache.
    const next: TokenMetadataCacheEntry = { ...cached };
    if (name) next.name = name;
    if (symbol) next.symbol = symbol;
    if (onChainDecimals !== null) next.decimals = onChainDecimals;
    if (onChainCreator) next.creator = onChainCreator;
    if (isWordRead(metadata[offset + 3])) next.totalSupply = supplyWei;
    if (metadata[offset + 5] !== null) next.metadataUri = uri;
    tokenMetadataCache.set(token.toLowerCase(), next);
  });
  return { rows: sortTokenRows(rows), complete: skipped === 0, skipped };
}

function sortTokenRows(rows: CatalogToken[]): CatalogToken[] {
  return rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/**
 * Union of catalogs by address; later arguments win. Used with the last good catalog so a partial
 * or failed scan can add tokens but never remove one.
 */
function mergeTokenRows(...lists: ReadonlyArray<readonly CatalogToken[]>): CatalogToken[] {
  const byAddress = new Map<string, CatalogToken>();
  for (const list of lists) {
    for (const row of list) byAddress.set(row.tokenAddress.toLowerCase(), row);
  }
  return sortTokenRows([...byAddress.values()]);
}

function isCatalogTokenRow(value: unknown): value is CatalogToken {
  const row = value as Partial<CatalogToken> | null;
  return (
    Boolean(row) &&
    typeof row?.tokenAddress === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(row.tokenAddress) &&
    typeof row.assetId === "string" &&
    typeof row.name === "string" &&
    typeof row.symbol === "string" &&
    row.symbol !== "" &&
    typeof row.decimals === "number"
  );
}

/** Last good catalog from the shared `evm_log_scan_cursor` table; memoised per instance. */
let persistedTokens: Promise<CatalogToken[]> | null = null;
/** Row count of the stored snapshot, so a scan only writes it back when the list grew. */
let persistedTokenCount = 0;

function loadPersistedTokens(): Promise<CatalogToken[]> {
  if (!persistedTokens) {
    const load = readCatalogSnapshot()
      .then((rows) => {
        const valid = (rows ?? []).filter(isCatalogTokenRow);
        persistedTokenCount = Math.max(persistedTokenCount, valid.length);
        // An empty read may be a DB blip: do not pin it for the lifetime of the process.
        if (!valid.length && persistedTokens === load) persistedTokens = null;
        return valid;
      })
      .catch((error) => {
        warnCatalog("catalog snapshot read", error);
        if (persistedTokens === load) persistedTokens = null;
        return [] as CatalogToken[];
      });
    persistedTokens = load;
  }
  return persistedTokens;
}

async function persistCatalogSnapshot(tokens: CatalogToken[], tip: number, force = false): Promise<void> {
  if (!tokens.length || (!force && tokens.length <= persistedTokenCount)) return;
  if (await writeCatalogSnapshot(tip, tokens)) {
    persistedTokenCount = tokens.length;
    persistedTokens = Promise.resolve(tokens);
  } else {
    warnCatalog("catalog snapshot write", "write_failed", { tokens: tokens.length });
  }
}

function addLogTokenAddresses(addresses: Set<string>, logs: readonly RpcLog[]): boolean {
  let added = false;
  for (const log of logs) {
    let token: string;
    try {
      token = topicAddress(log.topics?.[1]);
    } catch {
      continue;
    }
    if (!token) continue;
    const lower = token.toLowerCase();
    if (addresses.has(lower)) continue;
    addresses.add(lower);
    added = true;
  }
  return added;
}

const TOKEN_CREATED_TOPICS = [TOKEN_CREATED_TOPIC, TOKEN_CREATED_LEFTOVER_TOPIC];

export async function discoverTokensOnChainUncached(
  deadlineAt = Date.now() + TOKEN_CATALOG_SCAN_BUDGET_MS,
): Promise<CatalogTokenScanResult> {
  const startedAt = Date.now();
  const dep = readEvmDeployments();
  const factory = dep.contracts.tokenFactory;
  if (!factory) return { tokens: [], complete: true };

  // Tokens launched on earlier stacks (`tokenFactoryVn`) stay on their old contracts but must
  // keep showing up in the catalog. Each superseded factory stops at its successor's start block;
  // both event signatures are OR-ed into one getLogs filter per window.
  // Current factory first (tail, then history newest-first), then superseded factories whose
  // history is immutable and shared through the existing 24h cache.
  const scans = tokenFactoryScans();
  const current = scans.find((scan) => scan.key === "tokenFactory") ?? scans[scans.length - 1];
  const ordered = current ? [current, ...scans.filter((scan) => scan !== current).reverse()] : [];
  const addresses = staticTokenAddresses(dep);
  const generation = ++tokenCatalogScanGeneration;
  let resolveTail!: () => void;
  const tailReady = new Promise<void>((resolve) => {
    resolveTail = resolve;
  });
  tokenCatalogTailReady = { generation, promise: tailReady };

  // Everything a previous scan or instance found is the floor of this scan's result.
  const baseline = mergeTokenRows(await loadPersistedTokens(), tokensCache?.value ?? []);
  tokenCatalogProgress = { addresses: new Set(addresses), tokens: mergeTokenRows(staticTokenRows(dep), baseline) };

  const tip = await readChainTip();
  let progressBuilding: Promise<void> | null = null;
  let progressDirty = false;
  const refreshProgress = () => {
    progressDirty = true;
    if (progressBuilding) return;
    progressBuilding = (async () => {
      while (progressDirty) {
        progressDirty = false;
        const snapshot = new Set(addresses);
        try {
          const built = await buildTokenRows(snapshot);
          tokenCatalogProgress = { addresses: snapshot, tokens: mergeTokenRows(baseline, built.rows) };
        } catch (error) {
          // Keep the previous (static or earlier) partial list.
          warnCatalog("progress rows", error);
        }
      }
      progressBuilding = null;
    })();
  };

  let complete = true;
  let failedWindows = 0;
  let failedFactories = 0;
  if (tip === null) {
    complete = false;
    failedWindows += 1;
  }

  // The newest windows of every superseded factory are awaited as well, so the tail published to
  // a cold request covers all factories. A failure here is only logged: the history pass below
  // re-reads the same windows and decides whether the scan is complete.
  const supersededTails =
    tip === null
      ? Promise.resolve()
      : Promise.all(
          ordered
            .filter((scan) => scan !== current)
            .map((scan) =>
              fetchLogsTailResult(scan.address, TOKEN_CREATED_TOPICS, scan.fromBlock, scan.toBlock, {
                tip,
                onWindowLogs: (logs) => {
                  if (addLogTokenAddresses(addresses, logs)) refreshProgress();
                },
              }).catch((error) => {
                warnCatalog("factory tail", error, { factory: scan.key });
              }),
            ),
        ).then(() => undefined);

  let tailPublished = false;
  const publishTail = async () => {
    if (tailPublished) return;
    tailPublished = true;
    try {
      await supersededTails;
      if (progressBuilding) await progressBuilding;
      await persistCatalogSnapshot(tokenCatalogProgress?.tokens ?? [], tip ?? 0);
    } finally {
      resolveTail();
    }
  };

  for (let index = 0; index < ordered.length && tip !== null; index++) {
    // The first (current) factory always gets its tail read; later factories stop at the deadline.
    if (index > 0 && Date.now() >= deadlineAt) {
      complete = false;
      break;
    }
    const scan = ordered[index];
    const isCurrent = scan === current;
    try {
      const result = await fetchLogsWindowedIncrementalResult(
        scan.address,
        TOKEN_CREATED_TOPICS,
        scan.fromBlock,
        scan.toBlock,
        deadlineAt,
        {
          resilient: true,
          retryDelays: [500, 1500],
          maxParallel: MAX_CATALOG_LOG_WINDOWS,
          historyNewestFirst: true,
          tip,
          onWindowLogs: (logs) => {
            if (addLogTokenAddresses(addresses, logs)) refreshProgress();
          },
          // Publish the tail rows before the cold request returns, even if history is slow.
          onTailReady: isCurrent ? publishTail : undefined,
        },
      );
      if (!result.complete) complete = false;
      failedWindows += result.failedWindows ?? 0;
      if (addLogTokenAddresses(addresses, result.logs)) refreshProgress();
    } catch (error) {
      // One factory must never blank the catalog; the other factories' tokens still show.
      warnCatalog("factory scan", error, { factory: scan.key, address: scan.address.toLowerCase() });
      failedFactories += 1;
      complete = false;
    } finally {
      // A failed current factory must not leave a cold request waiting for a tail that never comes.
      if (isCurrent) await publishTail();
    }
  }
  await publishTail();

  if (progressBuilding) await progressBuilding;
  const built = await buildTokenRows(addresses);
  if (!built.complete) complete = false;
  // The result never drops a token an earlier scan (or instance) already knew about.
  const tokens = mergeTokenRows(baseline, built.rows);
  tokenCatalogProgress = { addresses: new Set(addresses), tokens };
  await persistCatalogSnapshot(tokens, tip ?? 0, complete);
  if (!complete) {
    const elapsedMs = Date.now() - startedAt;
    console.warn(
      `[evm-catalog] token scan incomplete: failedWindows=${failedWindows} failedFactories=${failedFactories} skippedTokens=${built.skipped} elapsedMs=${elapsedMs}`,
    );
  }
  return { tokens, complete };
}

async function loadTokens(): Promise<CatalogToken[]> {
  try {
    let value: CatalogToken[] = [];
    let partial = false;
    try {
      value = await scanTokensCached();
    } catch (error) {
      if (error instanceof PartialTokenCatalogError) {
        value = error.tokens;
        partial = true;
      } else {
        warnCatalog("shared catalog cache", error);
        const direct = await discoverTokensOnChainUncached();
        value = direct.tokens;
        partial = !direct.complete;
      }
    }
    // Keep the union even if the shared cache handed us a smaller list.
    value = mergeTokenRows(await loadPersistedTokens(), tokensCache?.value ?? [], value);
    tokensCache = { at: Date.now(), value, partial };
    return value;
  } catch (error) {
    // Both the shared cache and the direct scan failed: serve the last good catalog rather than
    // an empty or partial one.
    warnCatalog("token catalog load", error);
    if (tokensCache) return tokensCache.value;
    const persisted = await loadPersistedTokens();
    if (persisted.length) return persisted;
    throw error;
  }
}

/** Waits until the scan that started at/after `sinceGeneration` has published its tail. */
async function waitForTailReady(sinceGeneration: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tail = tokenCatalogTailReady;
    if (tail && (sinceGeneration > 0 ? tail.generation >= sinceGeneration : tail.generation > 0)) {
      await Promise.race([tail.promise, sleep(Math.max(0, deadline - Date.now()))]);
      return;
    }
    await sleep(20);
  }
}

function startTokenRefresh(): Promise<CatalogToken[]> {
  const task: Promise<CatalogToken[]> = loadTokens()
    .catch((error) => {
      warnCatalog("token refresh", error);
      return tokensCache?.value ?? tokenCatalogProgress?.tokens ?? [];
    })
    .finally(() => {
      if (tokensRefreshing === task) tokensRefreshing = null;
    });
  tokensRefreshing = task;
  return task;
}

/**
 * A cache younger than the stale window still answers with the newest windows of every factory:
 * tokens created since the cached scan are added before returning. Concurrent requests share one
 * in-flight read, and superseded factories are served from the immutable window cache.
 */
function refreshCachedTail(): Promise<CatalogToken[]> {
  if (tailRefreshing) return tailRefreshing;
  const task: Promise<CatalogToken[]> = (async () => {
    const base = tokensCache?.value ?? [];
    const tip = await readChainTip();
    if (tip === null) return base;
    const known = new Set(base.map((row) => row.tokenAddress.toLowerCase()));
    const seen = new Set<string>();
    await Promise.all(
      tokenFactoryScans().map((scan) =>
        fetchLogsTailResult(scan.address, TOKEN_CREATED_TOPICS, scan.fromBlock, scan.toBlock, {
          tip,
          onWindowLogs: (logs) => {
            addLogTokenAddresses(seen, logs);
          },
        }).catch((error) => {
          warnCatalog("cached tail", error, { factory: scan.key });
        }),
      ),
    );
    const added = [...seen].filter((lower) => !known.has(lower));
    if (!added.length) return base;
    const built = await buildTokenRows(added);
    if (!built.rows.length) return base;
    const value = mergeTokenRows(tokensCache?.value ?? base, built.rows);
    if (tokensCache) tokensCache = { ...tokensCache, value };
    await persistCatalogSnapshot(value, tip);
    return value;
  })()
    .catch((error) => {
      warnCatalog("cached tail", error);
      return tokensCache?.value ?? [];
    })
    .finally(() => {
      if (tailRefreshing === task) tailRefreshing = null;
    });
  tailRefreshing = task;
  return task;
}

export async function discoverTokensOnChain(): Promise<CatalogToken[]> {
  const cached = tokensCache;
  if (cached) {
    const staleAfter = cached.partial ? CATALOG_PARTIAL_STALE_MS : CATALOG_STALE_MS;
    if (Date.now() - cached.at < staleAfter) return refreshCachedTail();
  }

  // Stale or cold: (re)start the scan, but do not keep the request waiting for long history. The
  // newest windows of every factory are always awaited (up to their own, longer budget) before
  // answering, so freshly created tokens cannot be missed.
  const scanAlreadyRunning = Boolean(tokensRefreshing);
  const generationAtStart = scanAlreadyRunning ? tokenCatalogScanGeneration : tokenCatalogScanGeneration + 1;
  const task = tokensRefreshing ?? startTokenRefresh();

  if (!cached) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<{ timedOut: true }>((resolve) => {
      timer = setTimeout(() => resolve({ timedOut: true }), tokenCatalogSoftDeadlineMs);
    });
    const outcome = await Promise.race([
      task.then((value) => ({ timedOut: false as const, value })),
      timeout,
    ]);
    if (timer) clearTimeout(timer);
    if (!outcome.timedOut) return outcome.value;
  }

  const tailOutcome = await Promise.race([
    task.then((value) => ({ settled: true as const, value })),
    waitForTailReady(generationAtStart, TOKEN_CATALOG_TAIL_WAIT_MS).then(() => ({ settled: false as const })),
  ]);
  if (tailOutcome.settled) return tailOutcome.value;
  // Static + tail + whatever history finished meanwhile; never an empty list or a shrunk one.
  if (tokenCatalogProgress?.tokens.length) return tokenCatalogProgress.tokens;
  return cached?.value ?? tokensCache?.value ?? (await loadPersistedTokens());
}

async function pairReserves(pair: string, wppl: string): Promise<CatalogPool | null> {
  const pairAddr = getAddress(pair);
  const wpplAddr = getAddress(wppl);
  const token0 = decodeAddress(await evmJsonRpc<string>("eth_call", [{ to: pairAddr, data: SEL_TOKEN0 }, "latest"]).catch(() => "0x"));
  const token1 = decodeAddress(await evmJsonRpc<string>("eth_call", [{ to: pairAddr, data: SEL_TOKEN1 }, "latest"]).catch(() => "0x"));
  const reservesRaw = await evmJsonRpc<string>("eth_call", [{ to: pairAddr, data: SEL_RESERVES }, "latest"]).catch(() => "0x");
  if (!token0 || !token1 || !reservesRaw || reservesRaw.length < 130) return null;
  const r0 = BigInt(`0x${reservesRaw.slice(2, 66)}`);
  const r1 = BigInt(`0x${reservesRaw.slice(66, 130)}`);
  const tokenAddr = token0.toLowerCase() === wpplAddr.toLowerCase() ? token1 : token0;
  if (tokenAddr.toLowerCase() === wpplAddr.toLowerCase()) return null;
  const decimalsOut = await evmJsonRpc<string>("eth_call", [{ to: tokenAddr, data: SEL_DECIMALS }, "latest"]).catch(() => "0x");
  const tokenDecimals = Number(decodeUint(decimalsOut)) || 6;
  const tokenReserve =
    token0.toLowerCase() === tokenAddr.toLowerCase()
      ? Number(formatUnits(r0, tokenDecimals))
      : Number(formatUnits(r1, tokenDecimals));
  const nativeReserve =
    token0.toLowerCase() === wpplAddr.toLowerCase() ? Number(r0) / 1e18 : Number(r1) / 1e18;
  return {
    poolId: pairAddr,
    tokenAssetId: resolveLogicalAssetId(tokenAddr),
    tokenAddress: tokenAddr,
    nativeReserve,
    tokenReserve,
  };
}

/**
 * Resolves many pairs in two batched phases (token0/token1/reserves, then decimals) instead of
 * four sequential round-trips per pair. Falls back to the per-pair path on a node without batch
 * support.
 */
async function pairReservesBatch(pairs: string[], wppl: string): Promise<CatalogPool[]> {
  const raw = await evmJsonRpcBatch<string>(
    pairs.flatMap((pair) => [
      { method: "eth_call", params: [{ to: pair, data: SEL_TOKEN0 }, "latest"] },
      { method: "eth_call", params: [{ to: pair, data: SEL_TOKEN1 }, "latest"] },
      { method: "eth_call", params: [{ to: pair, data: SEL_RESERVES }, "latest"] },
    ]),
  ).catch(() => null);
  if (!raw) {
    const pools: CatalogPool[] = [];
    for (const pair of pairs) {
      const row = await pairReserves(pair, wppl);
      if (row) pools.push(row);
    }
    return pools;
  }

  const wpplLower = wppl.toLowerCase();
  const drafts = pairs
    .map((pair, index) => {
      const token0 = decodeAddress(raw[index * 3]);
      const token1 = decodeAddress(raw[index * 3 + 1]);
      const reservesRaw = raw[index * 3 + 2];
      if (!token0 || !token1 || !reservesRaw || reservesRaw.length < 130) return null;
      const tokenAddr = token0.toLowerCase() === wpplLower ? token1 : token0;
      if (tokenAddr.toLowerCase() === wpplLower) return null;
      return {
        pair,
        token0,
        tokenAddr,
        r0: BigInt(`0x${reservesRaw.slice(2, 66)}`),
        r1: BigInt(`0x${reservesRaw.slice(66, 130)}`),
      };
    })
    .filter((draft): draft is NonNullable<typeof draft> => draft !== null);

  const uniqueTokens = [...new Set(drafts.map((draft) => draft.tokenAddr.toLowerCase()))].map((lower) => getAddress(lower));
  const decimalsRaw = await evmJsonRpcBatch<string>(
    uniqueTokens.map((token) => ({ method: "eth_call", params: [{ to: token, data: SEL_DECIMALS }, "latest"] })),
  ).catch(() => uniqueTokens.map(() => null as string | null));
  const decimalsByToken = new Map(
    uniqueTokens.map((token, index) => [token.toLowerCase(), Number(decodeUint(decimalsRaw[index])) || 6]),
  );

  return drafts.map(({ pair, token0, tokenAddr, r0, r1 }) => {
    const tokenDecimals = decimalsByToken.get(tokenAddr.toLowerCase()) ?? 6;
    const tokenIsToken0 = token0.toLowerCase() === tokenAddr.toLowerCase();
    return {
      poolId: pair,
      tokenAssetId: resolveLogicalAssetId(tokenAddr),
      tokenAddress: tokenAddr,
      tokenReserve: Number(formatUnits(tokenIsToken0 ? r0 : r1, tokenDecimals)),
      nativeReserve: token0.toLowerCase() === wpplLower ? Number(r0) / 1e18 : Number(r1) / 1e18,
    };
  });
}

/** `allPairsLength()` + `allPairs(uint256)` in two batched calls; null when the factory rejects them. */
async function factoryPairAddresses(ammFactory: string): Promise<string[] | null> {
  try {
    const [lenHex] = await evmJsonRpcBatch<string>([
      { method: "eth_call", params: [{ to: ammFactory, data: "0x574f2ba3" }, "latest"] },
    ]);
    const len = Math.min(Number(decodeUint(lenHex)) || 0, 500);
    if (len <= 0) return [];
    const addrs = await evmJsonRpcBatch<string>(
      Array.from({ length: len }, (_, i) => ({
        method: "eth_call",
        params: [{ to: ammFactory, data: `0x1e3dd18b${i.toString(16).padStart(64, "0")}` }, "latest"],
      })),
    );
    return addrs.map(decodeAddress).filter(Boolean);
  } catch {
    return null;
  }
}

async function discoverPoolsOnChainUncached(): Promise<CatalogPool[]> {
  const dep = readEvmDeployments();
  const wppl = dep.contracts.wppl;
  const ammFactory = dep.contracts.ammFactory;
  if (!wppl || !ammFactory) return [];

  const staticPools = dep.pools ?? [];
  const pairAddrs = new Set<string>();
  for (const p of staticPools) {
    if (p.poolId) pairAddrs.add(getAddress(p.poolId).toLowerCase());
  }

  // The factory's own `allPairs` index is authoritative (the contract only ever pushes to it, so it
  // is a superset of every PairCreated log) and costs two batched calls. The log scan re-reads each
  // 9 000-block window and measured ~16 s cold against the live node, which put the whole pool list
  // behind a multi-second skeleton, so it now runs only when the index is unavailable — an older
  // factory, or a node that rejects the calls.
  // Every AMM factory (current and legacy `ammFactoryVn`) is listed, so old pools stay visible.
  for (const factory of contractVersions(dep, "ammFactory")) {
    const indexed = await factoryPairAddresses(factory);
    if (indexed && indexed.length) {
      for (const addr of indexed) pairAddrs.add(addr.toLowerCase());
    } else {
      const fromLogs = await fetchLogsWindowed(factory, [PAIR_CREATED_TOPIC]).catch(() => []);
      for (const log of fromLogs) {
        const pair = topicAddress(log.topics?.[2]);
        if (pair) pairAddrs.add(pair.toLowerCase());
      }
    }
  }

  const pairs = [...pairAddrs].map((lower) => getAddress(lower));
  if (!pairs.length) return [];

  return pairReservesBatch(pairs, getAddress(wppl));
}

async function loadPools(): Promise<CatalogPool[]> {
  const value = await scanPoolsCached().catch(() => discoverPoolsOnChainUncached());
  poolsCache = { at: Date.now(), value };
  return value;
}

export async function discoverPoolsOnChain(): Promise<CatalogPool[]> {
  const cached = poolsCache;
  if (cached) {
    if (Date.now() - cached.at < CATALOG_STALE_MS) return cached.value;
    if (!poolsRefreshing) {
      poolsRefreshing = loadPools()
        .catch(() => cached.value)
        .finally(() => {
          poolsRefreshing = null;
        });
    }
    return cached.value;
  }
  return loadPools();
}
