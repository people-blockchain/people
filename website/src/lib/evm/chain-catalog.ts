import { unstable_cache } from "next/cache";
import { getAddress, formatUnits } from "viem";
import { readEvmDeployments } from "@/lib/evm/config";
import { evmJsonRpc, evmJsonRpcBatch, resetRpcBackoffForTests } from "@/lib/evm/rpc-server";
import { curatedAssetKeys, enrichAssetRow, resolveLogicalAssetId, seedAssetMeta } from "@/lib/evm/seed-assets";
import { warnCatalog } from "@/lib/evm/catalog-log";
import { readCatalogSnapshot, readLogScanCursor, writeCatalogSnapshot, writeLogScanCursor } from "@/lib/evm/log-scan-cursor";
import { readTokenIconOverrides } from "@/lib/evm/token-icon-overrides";
import { fetchCachedMetadataImage, peekCachedMetadataImage, peekCachedMetadataImageEntry } from "@/lib/evm/token-uri-metadata";
import { displayTokenImageUrl } from "@/lib/ipfs";
import { withStableImage } from "@/lib/token-image-merge";
import {
  API_REQUEST_DEADLINE_MS,
  RequestDeadlineError,
  boundedTimeoutMs,
  currentDeadline,
  deadlineExpired,
  retryDelayMs,
  runOutsideRequestDeadline,
  sleepMs,
} from "@/lib/evm/request-deadline";

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
/**
 * Catalog `eth_getLogs` stays under this. A 9k-block query to the public node does not return,
 * so the history scan would abort the same windows on every request.
 */
export const CATALOG_LOG_WINDOW_BLOCKS = 800;

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
/**
 * Backoff before each extra read of a current-factory tail window. A public node answers 503 to a
 * burst of range queries and then serves the same window in under a second, so the tail is retried
 * on its own schedule instead of being dropped.
 */
export const TAIL_LOG_RETRY_DELAYS = [500, 1_500, 4_000] as const;
/** `eth_getLogs` gets a shorter timeout than ordinary calls: a slow window is retried, not awaited. */
export const LOG_GETLOGS_TIMEOUT_MS = 12_000;

const CATALOG_PARTIAL = Symbol("catalogPartial");

function stampPartial<T extends CatalogToken[]>(tokens: T, partial: boolean): T {
  if (partial) Object.assign(tokens, { [CATALOG_PARTIAL]: true });
  return tokens;
}

/** True when a catalog list stopped early and the next request must resume it. */
export function catalogListIsPartial(tokens: object): boolean {
  return Boolean((tokens as { [CATALOG_PARTIAL]?: boolean })[CATALOG_PARTIAL]);
}
let logWindowsInFlight = 0;
/** Peak concurrent `eth_getLogs` windows, for tests. */
let logWindowsPeak = 0;
/** Address and fresh-tail reads keep these slots, so a history scan cannot queue them. */
const INTERACTIVE_LOG_SLOTS = 2;
type LogSlotWaiter = { interactive: boolean; resolve: () => void };
const logWindowQueue: LogSlotWaiter[] = [];

function logSlotLimit(interactive: boolean): number {
  return interactive ? MAX_GLOBAL_LOG_WINDOWS : Math.max(1, MAX_GLOBAL_LOG_WINDOWS - INTERACTIVE_LOG_SLOTS);
}

function takeLogSlot(interactive: boolean): boolean {
  if (logWindowsInFlight >= logSlotLimit(interactive)) return false;
  logWindowsInFlight += 1;
  logWindowsPeak = Math.max(logWindowsPeak, logWindowsInFlight);
  return true;
}

function releaseLogSlot(): void {
  logWindowsInFlight = Math.max(0, logWindowsInFlight - 1);
  for (let index = 0; index < logWindowQueue.length; index++) {
    const waiter = logWindowQueue[index];
    if (!takeLogSlot(waiter.interactive)) continue;
    logWindowQueue.splice(index, 1);
    waiter.resolve();
    return;
  }
}

async function withLogWindowSlot<T>(
  work: () => Promise<T>,
  options?: { interactive?: boolean; deadlineAt?: number },
): Promise<T> {
  const interactive = Boolean(options?.interactive);
  let acquired = takeLogSlot(interactive);
  if (!acquired) {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const waiter: LogSlotWaiter = {
        interactive,
        resolve: () => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          resolve();
        },
      };
      if (typeof options?.deadlineAt === "number") {
        timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          const index = logWindowQueue.indexOf(waiter);
          if (index >= 0) logWindowQueue.splice(index, 1);
          reject(new RequestDeadlineError());
        }, Math.max(0, options.deadlineAt - Date.now()));
      }
      logWindowQueue.push(waiter);
    });
    acquired = true;
  }
  try {
    return await work();
  } finally {
    if (acquired) releaseLogSlot();
  }
}

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

async function readLogWindowFromNode(
  address: string,
  topics: readonly LogTopic[],
  from: number,
  to: number,
  timeoutMs = boundedTimeoutMs(LOG_GETLOGS_TIMEOUT_MS),
  rpc?: { deadlineAt?: number; signal?: AbortSignal; interactive?: boolean },
): Promise<RpcLog[]> {
  return withLogWindowSlot(async () => {
    let logs: unknown;
    try {
      logs = await evmJsonRpc<RpcLog[]>("eth_getLogs", [rpcLogFilter(address, topics, from, to)], {
        timeoutMs,
        // A single HTML proxy page or timeout must not block the remaining windows behind the
        // per-URL backoff; the caller retries this window on its own schedule.
        ignoreBackoff: true,
        // Do not fall back to the request deadline. A history scan passes its own signal and
        // budget; linking the request abort here kills every in-flight window when that
        // request returns.
        deadlineAt: rpc?.deadlineAt,
        signal: rpc?.signal,
      });
    } catch (error) {
      if (error instanceof RequestDeadlineError) throw error;
      throw new LogWindowRpcError(error instanceof Error ? error.message : "rpc_logs_failed");
    }
    // Throwing (rather than returning []) keeps a failed window out of every cache.
    if (!Array.isArray(logs)) throw new LogWindowRpcError("rpc_logs_unavailable");
    return logs as RpcLog[];
  }, { interactive: rpc?.interactive, deadlineAt: rpc?.deadlineAt });
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
  deadlineAt?: number,
  signal?: AbortSignal,
): Promise<RpcLog[] | null> {
  const lower = address.toLowerCase();
  // Request-scoped reads stay on the short timeout. A background history window may take longer
  // than the compat deadline; aborting it at 12s is what made the same ranges repeat forever.
  const timeoutCap = typeof deadlineAt === "number" && deadlineAt - Date.now() > 30_000 ? 20_000 : LOG_GETLOGS_TIMEOUT_MS;
  const timeoutMs = boundedTimeoutMs(timeoutCap, deadlineAt);
  // A live deadline must not sit behind the shared data cache: that wrapper cannot see the
  // abort signal, so a hung window would keep the request open for its own full timeout.
  if (immutable && typeof deadlineAt !== "number" && !signal && !currentDeadline()) {
    try {
      return await readImmutableLogWindowShared(lower, topics, from, to);
    } catch (error) {
      if (error instanceof LogWindowRpcError || error instanceof RequestDeadlineError) {
        warnCatalog("eth_getLogs window", error, { address: lower, from, to });
        return null;
      }
      // Outside the Next runtime (node tests, scripts) there is no data cache: read directly.
    }
  }
  try {
    return await readLogWindowFromNode(lower, topics, from, to, timeoutMs, { deadlineAt, signal });
  } catch (error) {
    if (error instanceof RequestDeadlineError) throw error;
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
  options?: LogScanOptions & { deadlineAt?: number },
): Promise<RpcLog[]> {
  const result = await fetchLogsWindowedCore(
    address,
    topics,
    fromBlockHint,
    null,
    undefined,
    options?.deadlineAt,
    options,
  );
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
  /** Backoff for current-factory tail windows. History keeps `retryDelays`. */
  tailRetryDelays?: readonly number[];
  /** Per-scan concurrency cap, bounded by the process-wide cap. */
  maxParallel?: number;
  /** Read recent history first, so new events surface before a long backlog. */
  historyNewestFirst?: boolean;
  /** Called as each window completes, letting a catalog publish partial results early. */
  onWindowLogs?: (logs: RpcLog[]) => void;
  /** Chain tip already read by the caller, so every factory of one scan agrees on it. */
  tip?: number;
  /** Called once the current factory's tail windows (and their rows) are ready. */
  onTailReady?: (ok: boolean, historyPending?: boolean) => void | Promise<void>;
  /** Abort that belongs to this scan. Not the compat request's signal. */
  signal?: AbortSignal;
  /** Block span of each `eth_getLogs`. Defaults to `LOG_WINDOW_BLOCKS`. */
  windowBlocks?: number;
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
 * never rejects, and the cursor only advances across contiguous successful windows. A current-factory
 * tail window that still fails after its own backoff is read once more after history, so a 503
 * during the rest of the scan is not stored as "no new tokens".
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
    tailRetryDelays: TAIL_LOG_RETRY_DELAYS,
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
  options: Pick<LogScanOptions, "retryDelays" | "onWindowLogs" | "signal" | "windowBlocks"> & { tip?: number; deadlineAt?: number } = {},
): Promise<LogScanOutcome> {
  const topics: LogTopic[] = [typeof topic === "string" ? topic : [...topic]];
  const tip = options.tip ?? (await readChainTip(options.deadlineAt, options.signal));
  if (tip === null) return { logs: [], complete: false, failedWindows: 1 };
  const scanLatest = typeof toBlockHint === "number" && toBlockHint >= 0 ? Math.min(tip, toBlockHint) : tip;
  const start = Math.max(
    logStartBlock(address),
    typeof fromBlockHint === "number" && fromBlockHint > 0 ? fromBlockHint : 0,
  );
  const windows = logWindows(start, scanLatest, options.windowBlocks ?? LOG_WINDOW_BLOCKS).slice(-TAIL_WINDOW_COUNT);
  const now = Date.now();
  const scanned = await Promise.all(
    windows.map(async ([from, to]) => {
      try {
        const logs = await readCachedLogWindow(address, topics, from, to, tip, now, {
          endBlock: toBlockHint,
          fresh: typeof toBlockHint !== "number",
          retryDelays: options.retryDelays ?? TAIL_LOG_RETRY_DELAYS,
          deadlineAt: options.deadlineAt,
          signal: options.signal,
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
  return sleepMs(ms);
}

/** Newest windows of a factory, always re-read before the catalog answers. */
const TAIL_WINDOW_COUNT = 2;

/**
 * Chain tip for a catalog scan. It reads through an active RPC backoff (a failure noted for some
 * unrelated call must not blank the scan) and retries once; `null` means the node is unreachable.
 */
async function readChainTip(deadlineAt?: number, signal?: AbortSignal): Promise<number | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      const wait = retryDelayMs(300, deadlineAt);
      if (wait === null) return null;
      await sleep(wait);
      if (deadlineExpired(deadlineAt)) return null;
    }
    try {
      const hex = await evmJsonRpc<string>("eth_blockNumber", [], {
        timeoutMs: boundedTimeoutMs(8_000, deadlineAt),
        ignoreBackoff: true,
        deadlineAt,
        signal,
      });
      const tip = Number.parseInt(hex, 16);
      if (Number.isFinite(tip)) return tip;
    } catch (error) {
      if (error instanceof RequestDeadlineError) return null;
      if (attempt === 1) warnCatalog("eth_blockNumber", error);
    }
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
    deadlineAt,
    signal,
  }: { endBlock?: number; fresh?: boolean; retryDelays?: readonly number[]; deadlineAt?: number; signal?: AbortSignal } = {},
): Promise<RpcLog[]> {
  const key = windowCacheKey(address, topics, from, to);
  const isImmutable = (typeof endBlock === "number" && to <= endBlock) || to < latest - LOG_WINDOW_BLOCKS;
  if (!fresh) {
    const entry = windowLogsCache.get(key);
    if (entry && (!isImmutable || now - entry.at < WINDOW_LOG_TTL_MS)) return entry.value;
  }
  // Retry a transient node failure a small, bounded number of times before giving up. The catalog
  // passes [500, 1500]; older callers keep the historical single immediate retry. Sleeps and the
  // getLogs timeout both stop at `deadlineAt`, so a 503 storm cannot outlive the request.
  let logs: RpcLog[] | null = null;
  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    if (attempt > 0) {
      const wait = retryDelayMs(retryDelays[attempt - 1] ?? 0, deadlineAt);
      if (wait === null) break;
      await sleep(wait);
      if (deadlineExpired(deadlineAt)) break;
    }
    try {
      logs = await readLogWindow(address, topics, from, to, isImmutable, deadlineAt, signal);
    } catch (error) {
      if (error instanceof RequestDeadlineError) break;
      throw error;
    }
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
  const tailRetryDelays = options.tailRetryDelays ?? TAIL_LOG_RETRY_DELAYS;
  const maxParallel = Math.max(1, options.maxParallel ?? MAX_PARALLEL_LOG_WINDOWS);
  const windowBlocks = Math.max(1, options.windowBlocks ?? LOG_WINDOW_BLOCKS);
  const tip = options.tip ?? (await readChainTip(deadlineAt, options.signal));
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
  const allWindows = logWindows(start, scanLatest, windowBlocks);
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
    readOptions: { endBlock?: number; fresh?: boolean; retryDelays?: readonly number[] } = {},
  ): Promise<ScannedLogWindow> => {
    try {
      const logs = await readCachedLogWindow(address, topics, from, to, tip, now, {
        endBlock: readOptions.endBlock,
        fresh: readOptions.fresh,
        retryDelays: readOptions.retryDelays ?? retryDelays,
        deadlineAt,
        signal: options.signal,
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
    const windows = logWindows(Math.max(start, lastBlock + 1), scanLatest, windowBlocks);
    if (!windows.length) return { logs: cursorLogs, complete: true, failedWindows: 0 };
    // Callers that set a concurrency cap (market history) must not enqueue every window at once:
    // a 9k-block getLogs never returns on the public node and the queued retries restart from the
    // same ranges. Uncapped callers keep the previous all-at-once read.
    const ordered = options.historyNewestFirst ? [...windows].reverse() : windows;
    const step = options.maxParallel ? maxParallel : ordered.length;
    for (let i = 0; i < ordered.length; i += step) {
      if (typeof deadlineAt === "number" && deadlineExpired(deadlineAt)) break;
      const chunk = ordered.slice(i, i + step);
      scanned.push(...(await Promise.all(chunk.map((window) => readWindow(window)))));
    }
    return {
      logs: [...cursorLogs, ...scanned.flatMap(({ logs }) => logs)],
      complete: scanned.length === ordered.length && scanned.every((window) => window.ok),
      failedWindows: failedWindowCount(),
    };
  }

  // The current factory has no successor, so its last two windows are the only place a new token
  // can appear. Read them on every refresh, even when a cursor covers the rest of history.
  const historyFrom = Math.max(start, lastBlock + 1);
  const historyWindows = historyFrom <= tailStart - 1 ? logWindows(historyFrom, tailStart - 1, windowBlocks) : [];

  if (!tailWindows.length && !historyWindows.length) {
    return { logs: visibleCursorLogs, complete: true, failedWindows: 0 };
  }

  let complete = true;
  let historyTruncated = false;
  // Tail first, and alone: superseded factories and history must not compete with these windows.
  if (tailWindows.length) {
    const tailScanned = await Promise.all(
      tailWindows.map((window) => readWindow(window, { fresh: true, retryDelays: tailRetryDelays })),
    );
    scanned.push(...tailScanned);
    if (tailScanned.some((window) => !window.ok)) complete = false;
    // The caller may publish the tail now; history below is still bounded by the soft deadline.
    if (options.onTailReady) await options.onTailReady(tailScanned.every((window) => window.ok), historyWindows.length > 0);
  }

  // Persist immutable windows as they form a contiguous successful prefix, so a later invocation
  // resumes instead of restarting. A failed or unscanned window is a hard stop: the cursor never
  // advances past it, even if newer windows succeeded.
  const historyScanned: ScannedLogWindow[] = [];
  const immutableEnd = typeof toBlockHint === "number" ? scanLatest + 1 : tip - windowBlocks;
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
    if (deadlineExpired(deadlineAt)) {
      complete = false;
      historyTruncated = true;
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

  // The tail is not part of history or the cursor, so a window that failed while the node was
  // busy is invisible forever unless it is read again after that work has finished.
  if (tailWindows.length) {
    const tailFroms = new Set(tailWindows.map(([from]) => from));
    for (let index = 0; index < scanned.length; index++) {
      const window = scanned[index];
      if (!window || !tailFroms.has(window.from) || window.ok) continue;
      if (deadlineExpired(deadlineAt)) {
        complete = false;
        break;
      }
      scanned[index] = await readWindow([window.from, window.to], { fresh: true, retryDelays: tailRetryDelays });
    }
    const tailsOk = scanned.filter((window) => tailFroms.has(window.from)).every((window) => window.ok);
    const historyOk = historyScanned.every((window) => window.ok);
    complete = tailsOk && historyOk && !historyTruncated;
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
function decodeErc20String(out: string | null | undefined, maxLength = 64): string {
  if (!out || out === "0x" || out.length < 130) return "";
  try {
    return Buffer.from(out.slice(130), "hex")
      .toString("utf8")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, maxLength);
  } catch {
    return "";
  }
}

/** A `metadataURI` (`ipfs://<CIDv0>/metadata.json` is ~67 chars) needs a longer cap than a name/symbol. */
const METADATA_URI_MAX_LENGTH = 256;

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
 * A `.../metadata.json` address is a JSON document, not an image; the catalog fetches it and reads `image`.
 */
export function tokenImageFromMetadataUri(uri: string | null | undefined): string | null {
  const value = (uri ?? "").trim();
  if (!value || value === "ipfs://people" || value.startsWith("ipfs://people/")) return null;
  // New launches point at a pinned metadata JSON (`ipfs://<CID>/metadata.json`), not an image.
  if (/\/metadata\.json(?:[?#].*)?$/i.test(value)) return null;
  if (/^ipfs:\/\/[^\s]+$/i.test(value)) return value;
  if (/^https:\/\/[^\s]+$/i.test(value)) return value;
  return null;
}

/** Gateway https for a real image URI. Invalid ipfs stays unchanged so a non-CID placeholder is not dropped. */
function shownTokenImage(uri: string | null | undefined): string | null {
  const direct = tokenImageFromMetadataUri(uri);
  if (!direct) return null;
  // Same gateway URL the token page uses at every width. A raw `ipfs://` value is not an `<img>` src.
  return displayTokenImageUrl(direct);
}

const METADATA_JSON_SUFFIX = /\/metadata\.json(?:[?#].*)?$/i;

/**
 * Applies the image precedence shared by the catalog and the single-asset fallback: an owner
 * icon override wins, then curated/seed metadata, then the on-chain metadataURI image.
 */
export function applyTokenImage<T extends { imageUri?: string; creationMetadata?: { image?: string; [key: string]: unknown } }>(
  row: T,
  override: string | null | undefined,
  chainImage: string | null | undefined,
): T {
  const current = row.imageUri ?? "";
  // A metadata document URL is a placeholder until the JSON `image` is known. A real logo replaces it.
  const placeholder = METADATA_JSON_SUFFIX.test(current);
  const imageUri = override ?? (!current || placeholder ? chainImage ?? undefined : undefined);
  if (!imageUri) return row;
  return {
    ...row,
    imageUri,
    creationMetadata: { ...(row.creationMetadata ?? {}), image: imageUri },
  } as T;
}

/**
 * Gateway URL for a token logo without waiting on a gateway. A direct image URI is rewritten
 * immediately. A `metadata.json` URI uses the cached `image` or, until that read finishes, the
 * document URL itself so the client can resolve the picture.
 */
export function immediateTokenImageUrl(uri: string | null | undefined): string | null {
  const value = (uri ?? "").trim();
  const direct = shownTokenImage(value);
  if (direct) return direct;
  if (!value || !METADATA_JSON_SUFFIX.test(value) || value === "ipfs://people" || value.startsWith("ipfs://people/")) return null;
  const cached = peekCachedMetadataImageEntry(value);
  if (cached.hit) return shownTokenImage(cached.value);
  return displayTokenImageUrl(value);
}

/** On-chain catalog scans are expensive; the cached copy is refreshed in the background. */
const CATALOG_STALE_MS = 30_000;
/** A scan stopped by its deadline is resumed on the next request instead of being cached as whole. */
export const CATALOG_PARTIAL_STALE_MS = 15_000;
/** Wall-clock budget for one cold token catalog scan that a request is still waiting on. */
export const TOKEN_CATALOG_SCAN_BUDGET_MS = API_REQUEST_DEADLINE_MS;
/**
 * Background history keeps running after the compat request returns. Its windows use this
 * budget and their own abort signal, so a request deadline cannot restart the scan.
 */
const BACKGROUND_CATALOG_BUDGET_MS = 180_000;
/** A cold request waits at most this long before serving the partial list while the scan continues. */
export const TOKEN_CATALOG_SOFT_DEADLINE_MS = 8_000;
let tokenCatalogSoftDeadlineMs = TOKEN_CATALOG_SOFT_DEADLINE_MS;

/** Shorten the cold-response wait in tests; `null` restores the production 8 s deadline. */
export function setTokenCatalogSoftDeadlineForTests(ms: number | null): void {
  tokenCatalogSoftDeadlineMs = ms ?? TOKEN_CATALOG_SOFT_DEADLINE_MS;
}
const CATALOG_REVALIDATE_SECONDS = 60;
export const CHAIN_CATALOG_TAGS = ["evm-chain-catalog"];

let tokensCache: { at: number; value: CatalogToken[]; partial?: boolean; provisional?: boolean; tip?: number } | null = null;
let poolsCache: { at: number; value: CatalogPool[] } | null = null;
let tokensRefreshing: Promise<CatalogToken[]> | null = null;
/** Deadline and abort for the single in-flight history scan. Independent of any request. */
let backgroundScan: { deadlineAt: number; signal: AbortSignal } | null = null;
let backgroundAbort: AbortController | null = null;
/** Bumped when tests reset the cache so an in-flight scan cannot republish after the reset. */
let catalogGeneration = 0;
let catalogWriteGeneration = 0;
/** In-flight tail re-read for a fresh cache; shared by concurrent requests. */
let tailRefreshing: Promise<CatalogToken[]> | null = null;
let poolsRefreshing: Promise<CatalogPool[]> | null = null;
/** Tokens found so far by the in-flight scan, published tail-first for cold requests. */
let tokenCatalogProgress: { addresses: Set<string>; tokens: CatalogToken[] } | null = null;
/** Incremented per on-chain scan so a cold request can wait for the tail of *its* scan. */
let tokenCatalogScanGeneration = 0;
let tokenCatalogTailReady: { generation: number; promise: Promise<void> } | null = null;
/** Whether the current scan's tail windows were read. History may still be running. */
let tokenCatalogTailPublish: { generation: number; ok: boolean } | null = null;
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

/** In-memory catalog only. Does not start a log scan. */
export function peekCachedCatalogTokens(): CatalogToken[] {
  return tokensCache?.value ?? [];
}

/** Install a catalog snapshot for tests. Pass `null` to clear it. `tip` is the last block already merged. */
export function seedTokenCatalogCacheForTests(tokens: CatalogToken[] | null, tip?: number): void {
  tokensCache = tokens ? { at: Date.now(), value: tokens, partial: false, ...(typeof tip === "number" ? { tip } : {}) } : null;
}

export function resetChainCatalogCacheForTests(): void {
  catalogGeneration += 1;
  backgroundAbort?.abort();
  backgroundAbort = null;
  backgroundScan = null;
  tokensCache = null;
  poolsCache = null;
  tokensRefreshing = null;
  tailRefreshing = null;
  poolsRefreshing = null;
  tokenCatalogProgress = null;
  tokenCatalogScanGeneration = 0;
  tokenCatalogTailReady = null;
  tokenCatalogTailPublish = null;
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
async function readMetadataChunk(tokens: string[], deadlineAt?: number, signal?: AbortSignal): Promise<Array<string | null>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0 && deadlineExpired(deadlineAt)) break;
    try {
      return await evmJsonRpcBatch<string>(metadataCalls(tokens), {
        ignoreBackoff: true,
        timeoutMs: boundedTimeoutMs(8_000, deadlineAt),
        deadlineAt,
        signal,
      });
    } catch (error) {
      if (error instanceof RequestDeadlineError || deadlineExpired(deadlineAt)) break;
      if (attempt === 1) warnCatalog("metadata batch", error, { tokens: tokens.length });
    }
  }
  return new Array<string | null>(tokens.length * ROW_READS).fill(null);
}

/** Reads ERC-20 metadata for every known address and turns it into catalog rows. */
async function buildTokenRows(addresses: Iterable<string>, deadlineAt?: number, signal?: AbortSignal): Promise<TokenRowBuild> {
  const dep = readEvmDeployments();
  const tokens = [...new Set([...addresses].map((address) => address.toLowerCase()))].map((lower) => getAddress(lower));
  if (!tokens.length) return { rows: [], complete: true, skipped: 0 };

  // Small batches keep one bad chunk from blanking every token. A failed chunk is retried once;
  // tokens whose name/symbol/decimals are still missing then get individual eth_calls.
  const metadata: Array<string | null> = [];
  let stopped = false;
  for (let index = 0; index < tokens.length; index += METADATA_BATCH_TOKENS) {
    if (deadlineExpired(deadlineAt)) {
      stopped = true;
      metadata.push(...new Array<string | null>((tokens.length - index) * ROW_READS).fill(null));
      break;
    }
    metadata.push(...(await readMetadataChunk(tokens.slice(index, index + METADATA_BATCH_TOKENS), deadlineAt, signal)));
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
  const singleCall = (token: string, data: string) => {
    if (deadlineExpired(deadlineAt)) return Promise.resolve(null);
    return evmJsonRpc<string>("eth_call", [{ to: token, data }, "latest"], {
      timeoutMs: boundedTimeoutMs(10_000, deadlineAt),
      ignoreBackoff: true,
      deadlineAt,
      signal,
    }).catch(() => {
      fallbackFailures += 1;
      return null;
    });
  };
  for (let index = 0; index < fallbackIndexes.length; index += METADATA_FALLBACK_CONCURRENCY) {
    if (deadlineExpired(deadlineAt)) {
      stopped = true;
      break;
    }
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
  const metadataByToken = new Map<string, string>();
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
          : decodeErc20String(metadata[offset + 5], METADATA_URI_MAX_LENGTH);
    const chainImage = immediateTokenImageUrl(uri);
    metadataByToken.set(token.toLowerCase(), uri);
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
    const overrideRaw = iconOverrides.get(token.toLowerCase());
    const override = overrideRaw ? (displayTokenImageUrl(overrideRaw) ?? overrideRaw) : undefined;
    rows.push(applyTokenImage(enriched, override, chainImage));

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
  // Images are best-effort. A gateway miss must not mark the token list partial or hold the response:
  // use a cached image when one exists, and fill the rest after the rows are already returned.
  applyCachedCatalogImages(rows, metadataByToken);
  scheduleCatalogImages(rows, metadataByToken);
  return { rows: sortTokenRows(rows), complete: skipped === 0 && !stopped, skipped };
}

function sortTokenRows(rows: CatalogToken[]): CatalogToken[] {
  return rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/**
 * Union of catalogs by address; later arguments win. Used with the last good catalog so a partial
 * or failed scan can add tokens but never remove one.
 */
/** Union of catalogs by address. A later row wins, except an empty image never erases a known one. */
export function mergeCatalogTokens(...lists: ReadonlyArray<readonly CatalogToken[]>): CatalogToken[] {
  return mergeTokenRows(...lists);
}

function mergeTokenRows(...lists: ReadonlyArray<readonly CatalogToken[]>): CatalogToken[] {
  const byAddress = new Map<string, CatalogToken>();
  for (const list of lists) {
    for (const row of list) {
      const key = row.tokenAddress.toLowerCase();
      byAddress.set(key, withStableImage(byAddress.get(key), row));
    }
  }
  return sortTokenRows([...byAddress.values()]);
}

/** Copies already-fetched metadata images onto rows. Does not call a gateway. */
function applyCachedCatalogImages(rows: CatalogToken[], uris: Map<string, string>): void {
  for (const row of rows) {
    if (row.imageUri) continue;
    const uri = uris.get(row.tokenAddress.toLowerCase()) ?? "";
    if (!METADATA_JSON_SUFFIX.test(uri)) continue;
    const image = shownTokenImage(peekCachedMetadataImage(uri));
    if (!image) continue;
    const next = applyTokenImage(row, undefined, image);
    row.imageUri = next.imageUri;
    row.creationMetadata = next.creationMetadata;
  }
}

/**
 * Fills missing metadata images after the catalog response. A slow gateway updates the in-memory
 * rows for the next request and never flips the list to partial.
 */
function scheduleCatalogImages(rows: CatalogToken[], uris: Map<string, string>): void {
  const pending = rows.filter((row) => {
    const uri = uris.get(row.tokenAddress.toLowerCase()) ?? "";
    if (!METADATA_JSON_SUFFIX.test(uri) || uri === "ipfs://people" || uri.startsWith("ipfs://people/")) return false;
    if (peekCachedMetadataImageEntry(uri).hit) return false;
    return !row.imageUri || METADATA_JSON_SUFFIX.test(row.imageUri);
  });
  if (!pending.length) return;
  const generation = tokenCatalogScanGeneration;
  const queue = pending.slice();
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      if (generation !== tokenCatalogScanGeneration && tokenCatalogScanGeneration !== 0) return;
      const row = queue.shift();
      if (!row) return;
      const uri = uris.get(row.tokenAddress.toLowerCase()) ?? "";
      const image = shownTokenImage(await fetchCachedMetadataImage(uri, undefined, Date.now() + 8_000));
      if (!tokensCache) continue;
      const value = tokensCache.value.map((item) => {
        if (item.tokenAddress.toLowerCase() !== row.tokenAddress.toLowerCase()) return item;
        if (image) return applyTokenImage(item, undefined, image);
        if (!METADATA_JSON_SUFFIX.test(item.imageUri ?? "")) return item;
        const creation = { ...(item.creationMetadata ?? {}) };
        delete creation.image;
        return { ...item, imageUri: undefined, creationMetadata: creation };
      });
      tokensCache = { ...tokensCache, value };
    }
  });
  void Promise.all(workers).catch((error) => {
    warnCatalog("catalog image", error);
  });
}

export type FreshTokenTail = { addresses: string[]; complete: boolean; tip: number | null };

/**
 * One `eth_getLogs` from the last merged block through the current tip (capped at one window).
 * Bypasses the immutable log cache so a token mined in the latest block is visible immediately.
 */
export async function readFreshCreatedTokenAddresses(deadlineAt?: number): Promise<FreshTokenTail> {
  const scans = tokenFactoryScans();
  const current = scans.find((scan) => scan.key === "tokenFactory") ?? scans[scans.length - 1];
  if (!current) return { addresses: [], complete: true, tip: null };
  const tip = await readChainTip(deadlineAt);
  if (tip === null) return { addresses: [], complete: false, tip: null };
  const remembered = tokensCache?.tip;
  const uncapped = typeof remembered === "number" ? Math.min(remembered, tip) : Math.max(current.fromBlock, tip - CATALOG_LOG_WINDOW_BLOCKS + 1);
  const from = Math.max(current.fromBlock, tip - CATALOG_LOG_WINDOW_BLOCKS + 1, Math.min(uncapped, tip));
  const gapped = uncapped < from;
  if (from > tip) return { addresses: [], complete: !gapped, tip };
  try {
    const logs = await readLogWindowFromNode(
      current.address,
      [TOKEN_CREATED_TOPICS],
      from,
      tip,
      boundedTimeoutMs(3_000, deadlineAt),
      { deadlineAt, interactive: true },
    );
    const addresses: string[] = [];
    const seen = new Set<string>();
    for (const log of logs) {
      let token = "";
      try {
        token = topicAddress(log.topics?.[1]);
      } catch {
        token = "";
      }
      if (!token) continue;
      const lower = token.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      addresses.push(lower);
    }
    return { addresses, complete: !gapped, tip };
  } catch (error) {
    warnCatalog("fresh tail", error, { factory: current.key });
    return { addresses: [], complete: false, tip };
  }
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

/** Merges rows into the in-memory catalog. A finished list is never flipped back to partial. */
function rememberCatalog(tokens: CatalogToken[], partial: boolean, tip?: number | null): void {
  if (catalogWriteGeneration !== catalogGeneration) return;
  const merged = mergeTokenRows(tokensCache?.value ?? [], tokens);
  const nextPartial = tokensCache?.partial === false ? false : partial;
  const nextTip = typeof tip === "number" ? tip : tokensCache?.tip;
  tokensCache = {
    at: tokensCache?.at ?? Date.now(),
    value: merged,
    partial: nextPartial,
    ...(tokensCache?.provisional ? { provisional: true } : {}),
    ...(typeof nextTip === "number" ? { tip: nextTip } : {}),
  };
}

export async function discoverTokensOnChainUncached(deadlineAt?: number): Promise<CatalogTokenScanResult> {
  catalogWriteGeneration = catalogGeneration;
  const usingBackground = typeof deadlineAt !== "number" ? backgroundScan : null;
  const signal = usingBackground?.signal;
  const budgetAt = deadlineAt ?? usingBackground?.deadlineAt ?? currentDeadline()?.at ?? Date.now() + TOKEN_CATALOG_SCAN_BUDGET_MS;
  deadlineAt = budgetAt;
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

  const tip = await readChainTip(deadlineAt, signal);
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
          const built = await buildTokenRows(snapshot, deadlineAt, signal);
          const tokens = mergeTokenRows(baseline, built.rows);
          tokenCatalogProgress = { addresses: snapshot, tokens };
          rememberCatalog(tokens, true, tip);
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

  // Superseded tails start only after the current factory tail has been read. Starting them
  // together is the burst that makes the public node answer 503 for the newest window.
  const readSupersededTails = async () => {
    if (tip === null) return;
    await Promise.all(
      ordered
        .filter((scan) => scan !== current)
        .map((scan) =>
          fetchLogsTailResult(scan.address, TOKEN_CREATED_TOPICS, scan.fromBlock, scan.toBlock, {
            tip,
            retryDelays: TAIL_LOG_RETRY_DELAYS,
            deadlineAt,
            signal,
            windowBlocks: CATALOG_LOG_WINDOW_BLOCKS,
            onWindowLogs: (logs) => {
              if (addLogTokenAddresses(addresses, logs)) refreshProgress();
            },
          }).catch((error) => {
            warnCatalog("factory tail", error, { factory: scan.key });
          }),
        ),
    );
  };

  let tailPublished = false;
  let tailWindowsOk: boolean | null = null;
  let tailHistoryPending = false;
  const publishTail = async () => {
    if (tailPublished) return;
    tailPublished = true;
    try {
      await readSupersededTails();
      if (progressBuilding) await progressBuilding;
      const tailTokens = tokenCatalogProgress?.tokens ?? [];
      const ok = tailWindowsOk !== false && tip !== null;
      rememberCatalog(tailTokens, !ok, tip);
      // History can keep walking. A successful tail is enough to serve the list; a later failed
      // window may still mark the cache partial when the scan finishes.
      if (ok && tokensCache) {
        // A saved catalog, or a factory whose whole range was the tail, is the list. Older
        // windows that have not been read yet are missing tokens, so that response stays partial.
        const open = persistedTokenCount === 0 && tailHistoryPending;
        tokensCache = { ...tokensCache, partial: open, provisional: open };
      }
      tokenCatalogTailPublish = { generation, ok };
      await persistCatalogSnapshot(tailTokens, tip ?? 0);
    } finally {
      resolveTail();
    }
  };

  for (let index = 0; index < ordered.length && tip !== null; index++) {
    // The first (current) factory always gets its tail read; later factories stop at the deadline.
    if (index > 0 && deadlineExpired(deadlineAt)) {
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
          retryDelays: [1_000],
          maxParallel: 2,
          // Oldest first so each successful chunk advances the cursor. The tail was already read,
          // and newest-first never persisted a prefix when the request aborted the first chunk.
          historyNewestFirst: false,
          signal,
          windowBlocks: CATALOG_LOG_WINDOW_BLOCKS,
          tip,
          onWindowLogs: (logs) => {
            if (addLogTokenAddresses(addresses, logs)) refreshProgress();
          },
          // Publish the tail rows before the cold request returns, even if history is slow.
          onTailReady: isCurrent
            ? (ok, historyPending) => {
                tailWindowsOk = ok;
                tailHistoryPending = Boolean(historyPending);
                return publishTail();
              }
            : undefined,
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
      if (isCurrent && tailWindowsOk === null) tailWindowsOk = false;
    } finally {
      // A failed current factory must not leave a cold request waiting for a tail that never comes.
      if (isCurrent) await publishTail();
    }
  }
  await publishTail();

  if (progressBuilding) await progressBuilding;
  const built = await buildTokenRows(addresses, deadlineAt, signal);
  if (!built.complete) complete = false;
  // The result never drops a token an earlier scan (or instance) already knew about.
  const tokens = mergeTokenRows(baseline, built.rows);
  tokenCatalogProgress = { addresses: new Set(addresses), tokens };
  rememberCatalog(tokens, !complete, tip);
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
      // A background history scan must not throw out of `unstable_cache`. Next logs that
      // revalidation error into the open page render and the browser reloads mid-paint.
      if (backgroundScan) {
        const direct = await discoverTokensOnChainUncached();
        value = direct.tokens;
        partial = !direct.complete;
      } else {
        value = await scanTokensCached();
      }
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
    const tip = partial ? tokensCache?.tip : await readChainTip();
    // Image fills land on the cache while the tip read is in flight. Merging again keeps them.
    value = mergeTokenRows(value, tokensCache?.value ?? []);
    if (catalogWriteGeneration !== catalogGeneration) return value;
    // A later incomplete rescan must not mark a finished catalog partial again. A tail that was
    // served while history was still running is provisional, so this scan's own result still wins.
    const finished = tokensCache?.partial === false && tokensCache?.provisional !== true;
    const nextPartial = finished ? false : partial;
    tokensCache = { at: Date.now(), value, partial: nextPartial, ...(typeof tip === "number" ? { tip } : {}) };
    return nextPartial ? stampPartial(value, true) : value;
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
  if (tokensRefreshing) return tokensRefreshing;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BACKGROUND_CATALOG_BUDGET_MS);
  timer.unref?.();
  backgroundAbort = controller;
  backgroundScan = { deadlineAt: Date.now() + BACKGROUND_CATALOG_BUDGET_MS, signal: controller.signal };
  const task: Promise<CatalogToken[]> = runOutsideRequestDeadline(() => loadTokens())
    .catch((error) => {
      warnCatalog("token refresh", error);
      return tokensCache?.value ?? tokenCatalogProgress?.tokens ?? [];
    })
    .finally(() => {
      clearTimeout(timer);
      if (tokensRefreshing === task) tokensRefreshing = null;
      if (backgroundAbort === controller) {
        backgroundAbort = null;
        backgroundScan = null;
      }
    });
  tokensRefreshing = task;
  return task;
}

/**
 * Serves the in-memory catalog immediately and merges one fresh `getLogs` from the last merged
 * block to the tip. A miss of that read is partial. An image miss is not. Superseded factories
 * cannot gain tokens, so they are not scanned on this path.
 */
function refreshCachedTail(): Promise<CatalogToken[]> {
  if (tailRefreshing) return tailRefreshing;
  const generation = catalogGeneration;
  const task: Promise<CatalogToken[]> = (async () => {
    const base = tokensCache?.value ?? [];
    // The request must not sit behind history. Two and a half seconds is the whole tail budget.
    const requestAt = currentDeadline()?.at;
    const deadlineAt = Math.min(Date.now() + 2_500, requestAt ?? Number.POSITIVE_INFINITY);
    const fresh = await readFreshCreatedTokenAddresses(deadlineAt);
    const known = new Set(base.map((row) => row.tokenAddress.toLowerCase()));
    const added = fresh.addresses.filter((lower) => !known.has(lower));
    let value = base;
    let builtComplete = true;
    if (added.length) {
      const built = await buildTokenRows(added, deadlineAt);
      builtComplete = built.complete;
      if (built.rows.length) value = mergeTokenRows(base, built.rows);
    }
    const tailPartial = !fresh.complete || (added.length > 0 && !builtComplete);
    // A tail read awaits the network. Metadata images may have been written onto the cache in
    // that gap; publishing the pre-await list would wipe them and the next response would
    // render letter fallbacks for logos that were already known.
    value = mergeTokenRows(value, tokensCache?.value ?? []);
    if (generation !== catalogGeneration) return value;
    if (tokensCache) {
      const historyDone = tokensCache.partial === false;
      // An in-flight history scan is not a missing asset list. Only a failed tail or a cache
      // already marked partial (a real RPC miss) makes this response partial.
      const historyOpen = Boolean(tokensCache.partial);
      const responsePartial = historyOpen || tailPartial;
      tokensCache = {
        ...tokensCache,
        value,
        // A finished history stays finished when the tip read misses, so the next request does
        // not walk the chain again. The response itself is still partial for that miss.
        partial: historyDone ? false : responsePartial,
        ...(tailPartial || fresh.tip === null ? {} : { tip: fresh.tip }),
      };
    }
    if (!tailPartial && fresh.tip !== null && value.length) await persistCatalogSnapshot(value, fresh.tip);
    const listPartial = tailPartial || Boolean(tokensCache?.partial);
    return listPartial ? stampPartial(value.slice(), true) : value;
  })()
    .catch((error) => {
      warnCatalog("cached tail", error);
      const base = (tokensCache?.value ?? []).slice();
      if (tokensCache && tokensCache.partial !== false) tokensCache = { ...tokensCache, partial: true };
      return stampPartial(base, true);
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
    // A finished catalog only re-reads the tip below. Walking history again evicts the log
    // cache and the public node aborts those windows, which reloads the explorer page.
    if (cached.partial !== false && Date.now() - cached.at >= staleAfter && !tokensRefreshing) void startTokenRefresh();
    return refreshCachedTail();
  }

  // Cold: answer when the tail is published. Do not sit out the soft deadline first — that wait
  // is what turned a ready list into an 8s partial response. History keeps running afterwards.
  // The tail itself is still awaited up to the request deadline, including when it is slower
  // than the soft deadline. The soft deadline stays settable for tests; it does not delay this return.
  void tokenCatalogSoftDeadlineMs;
  const scanAlreadyRunning = Boolean(tokensRefreshing);
  const generationAtStart = scanAlreadyRunning ? tokenCatalogScanGeneration : tokenCatalogScanGeneration + 1;
  const task = tokensRefreshing ?? startTokenRefresh();
  const deadlineAt = currentDeadline()?.at ?? Date.now() + TOKEN_CATALOG_SCAN_BUDGET_MS;
  const tailWait = Math.min(TOKEN_CATALOG_TAIL_WAIT_MS, Math.max(0, deadlineAt - Date.now()));
  const tailOutcome = await Promise.race([
    task.then((value) => ({ settled: true as const, value })),
    waitForTailReady(generationAtStart, tailWait).then(() => ({ settled: false as const })),
  ]);
  if (tailOutcome.settled) return tailOutcome.value;
  const ready = (tokenCatalogProgress?.tokens ?? tokensCache?.value ?? []).slice();
  const published = tokenCatalogTailPublish;
  const tailOk = Boolean(published && published.generation >= generationAtStart && published.ok);
  if (tailOk && ready.length) return tokensCache?.partial ? stampPartial(ready, true) : ready;
  if (ready.length) return stampPartial(ready, true);
  return stampPartial((await loadPersistedTokens()).slice(), true);
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
      const fromLogs = await fetchLogsWindowed(factory, [PAIR_CREATED_TOPIC], undefined, {
        deadlineAt: Date.now() + 8_000,
        windowBlocks: CATALOG_LOG_WINDOW_BLOCKS,
        maxParallel: 1,
        resilient: true,
        historyNewestFirst: true,
      }).catch(() => []);
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
