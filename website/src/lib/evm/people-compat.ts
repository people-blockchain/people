import { decodeEventLog, encodeFunctionData, formatUnits, getAddress, isAddress, parseAbi, type Address, type Hex } from "viem";
import { readEvmDeployments } from "@/lib/evm/config";
import {
  fetchBlockByHeight,
  fetchLatestBlockNumber,
  fetchRecentBlocks,
  fetchRecentTransactions,
  fetchTransaction,
} from "@/lib/evm/explorer-blocks";
import { fetchAddressHistory } from "@/lib/evm/address-txs";
import { aggregateHoldersDetailed, findTokenCreationBlock } from "@/lib/evm/transfer-index";
import {
  LOG_WINDOW_BLOCKS,
  applyTokenImage,
  catalogListIsPartial,
  discoverPoolsOnChain,
  discoverTokensOnChain,
  fetchLogsWindowed,
  logStartBlock,
  peekCachedCatalogTokens,
  readFreshCreatedTokenAddresses,
} from "@/lib/evm/chain-catalog";
import { TEST_STABLES, testStableMeta } from "@/lib/evm/test-stables";
import { visibleAssets, visibleNfts, visiblePools } from "@/lib/hidden-assets";
import { enrichAssetRow, listSeedNfts, resolveLogicalAssetId, seedAssetMeta } from "@/lib/evm/seed-assets";
import { readTokenIconOverrides } from "@/lib/evm/token-icon-overrides";
import { EvmRpcResponseError, evmJsonRpc, evmJsonRpcBatch, weiToPpl } from "@/lib/evm/rpc-server";
import {
  RequestDeadlineError,
  boundedTimeoutMs,
  currentDeadline,
  deadlineExpired,
  isRequestDeadlineError,
  retryDelayMs,
  runWithRequestDeadline,
  sleepMs,
} from "@/lib/evm/request-deadline";
import { FALLBACK_TOKEN_SYMBOL, TokenReadError, readTokenOnchain, resolveTokenImageUri } from "@/lib/evm/token-onchain";
import { readTokenUriMetadata } from "@/lib/evm/token-uri-metadata";
import { displayTokenImageUrl } from "@/lib/ipfs";
import {
  NFT_MINTED_TOPIC,
  nftFactoryAddress,
  nftMintedEvent,
} from "@/lib/evm/nft-factory";

type AssetRow = {
  assetId: string;
  tokenAddress?: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: number;
  creator?: string;
  status: string;
  type: string;
  verified?: boolean;
  partial?: boolean;
  createdAt?: number;
  imageUri?: string;
  creationMetadata?: { image?: string; description?: string; website?: string; testnet?: boolean };
};

function parseLimit(raw: string | null, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 100);
}

async function erc20Uint(token: string, selector: string): Promise<bigint> {
  const addr = getAddress(token);
  const out = await evmJsonRpc<string>("eth_call", [{ to: addr, data: selector }, "latest"]).catch(() => "0x0");
  try {
    return BigInt(out);
  } catch {
    return BigInt(0);
  }
}

async function erc20Address(token: string, selector: string): Promise<string> {
  const out = await evmJsonRpc<string>("eth_call", [{ to: getAddress(token), data: selector }, "latest"]).catch(() => "0x");
  if (!out || out === "0x" || out.length < 66) return "";
  try {
    return getAddress(`0x${out.slice(-40)}`);
  } catch {
    return "";
  }
}

/**
 * `eth_call` for an optional getter, distinguishing "contract doesn't expose it" from a real 0:
 * a revert/empty result yields null, so the UI omits the field instead of showing a fabricated 0.
 */
async function optionalUint(token: string, selector: string): Promise<bigint | null> {
  const out = await evmJsonRpc<string>("eth_call", [{ to: getAddress(token), data: selector }, "latest"]).catch(() => null);
  if (!out || out === "0x") return null;
  try {
    return BigInt(out);
  } catch {
    return null;
  }
}

type NftCollectionStats = { minted?: number; totalSupply?: number; mintPriceWei?: bigint };

/**
 * On-chain stats for an NFT collection. PeopleNFT exposes `nextTokenId` (monotonic, no burns) as the
 * minted count but no `totalSupply` and no price; a collection that does expose `totalSupply`/a mint
 * price getter reports it. Anything absent stays undefined so the detail view can omit the row.
 */
async function nftCollectionStats(collection: string): Promise<NftCollectionStats> {
  if (!isAddress(collection)) return {};
  const [nextTokenId, totalSupply, mintPrice, price, cost] = await Promise.all([
    optionalUint(collection, "0x75794a3c"),
    optionalUint(collection, "0x18160ddd"),
    optionalUint(collection, "0x6817c76c"),
    optionalUint(collection, "0xa035b1fe"),
    optionalUint(collection, "0x13faede6"),
  ]);
  const minted = totalSupply ?? nextTokenId;
  const priceWei = mintPrice ?? price ?? cost;
  return {
    ...(minted === null ? {} : { minted: Number(minted) }),
    ...(totalSupply === null ? {} : { totalSupply: Number(totalSupply) }),
    ...(priceWei === null ? {} : { mintPriceWei: priceWei }),
  };
}

const TOKEN_READ_TIMEOUT_MS = 8_000;
/** Two retries after the first attempt, short enough that one cold asset read still returns quickly. */
const TOKEN_READ_RETRY_DELAYS_MS = [200, 500] as const;
/** Wallet balances must answer in a few seconds, even when some token calls hang. */
const WALLET_BALANCE_BUDGET_MS = 3_000;
const NATIVE_ATTEMPT_TIMEOUT_MS = 700;
const NATIVE_RETRY_DELAYS_MS = [120, 280] as const;
const ADDRESS_CACHE_TTL_MS = 15_000;
const ADDRESS_PARTIAL_CACHE_TTL_MS = 1_500;
/** Metadata JSON is optional. Basic token fields are returned if this elapses. */
const TOKEN_IMAGE_BUDGET_MS = 1_200;

type AddressBalanceBody = {
  balance?: number;
  /** Exact native balance in wei, alongside the human `balance` number. */
  balanceWei?: string;
  nonce: number;
  balances: Record<string, number>;
  outgoingTxs: number;
  incomingTxs: number;
  partial?: boolean;
};

const addressBalanceCache = new Map<string, { at: number; partial: boolean; body: AddressBalanceBody }>();

function withinBudget<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  const parent = currentDeadline()?.signal;
  const at = currentDeadline()?.at;
  if (parent?.aborted || deadlineExpired(at) || ms <= 0) return Promise.resolve(fallback);
  const wait = typeof at === "number" ? Math.min(ms, Math.max(1, at - Date.now())) : ms;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  return new Promise<T>((resolve) => {
    let settled = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (onAbort) parent?.removeEventListener("abort", onAbort);
      resolve(value);
    };
    onAbort = () => finish(fallback);
    parent?.addEventListener("abort", onAbort);
    timer = setTimeout(() => finish(fallback), wait);
    work.then(
      (value) => finish(value),
      () => finish(fallback),
    );
  });
}

/** 5xx, timeout, and network failures. A contract revert is `EvmRpcResponseError` and is not retried. */
function isTransientTokenRpcError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message === "evm_rpc_unconfigured") return false;
  if (error.name === "TimeoutError" || error.name === "AbortError") return true;
  if (error instanceof TypeError) return true;
  if (error.message === "rpc_backoff") return true;
  return /^rpc_http_(408|425|429|500|502|503|504)$/.test(error.message);
}

/**
 * `eth_call` adapter for `readTokenOnchain`: null = revert/empty, throw = transport failure.
 * Ignores the shared per-URL backoff (a catalog burst of 503s must not fail this read) and retries
 * a transient failure twice.
 */
async function tokenCall(to: Address, data: Hex, signal?: AbortSignal): Promise<Hex | null> {
  const at = currentDeadline()?.at;
  let lastError: unknown;
  for (let attempt = 0; attempt <= TOKEN_READ_RETRY_DELAYS_MS.length; attempt++) {
    if (signal?.aborted || (attempt > 0 && deadlineExpired(at))) break;
    if (attempt > 0) {
      const wait = retryDelayMs(TOKEN_READ_RETRY_DELAYS_MS[attempt - 1] ?? 0, at);
      if (wait === null) break;
      await sleepMs(wait, signal);
      if (signal?.aborted || deadlineExpired(at)) break;
    }
    try {
      return (
        (await evmJsonRpc<Hex>("eth_call", [{ to, data }, "latest"], {
          timeoutMs: boundedTimeoutMs(TOKEN_READ_TIMEOUT_MS, at),
          ignoreBackoff: true,
          deadlineAt: at,
          signal,
        })) ?? null
      );
    } catch (error) {
      if (error instanceof EvmRpcResponseError) return null;
      if (isRequestDeadlineError(error) || deadlineExpired(at)) throw new RequestDeadlineError();
      lastError = error;
      if (attempt === TOKEN_READ_RETRY_DELAYS_MS.length || !isTransientTokenRpcError(error)) throw error;
    }
  }
  if (deadlineExpired(at) || signal?.aborted) throw new RequestDeadlineError();
  throw lastError instanceof Error ? lastError : new Error("token_rpc_failed");
}

/** Throws `TokenReadError` when the node could not be asked (the route must not cache that). */
async function loadAsset(assetId: string): Promise<AssetRow | null> {
  const dep = readEvmDeployments();
  const mapped = dep.assetMap[assetId];
  // A factory token may not be in the catalog cache yet: verify it through the factory registry
  // before reading it, so creator()/metadataURI() come from the token and not from the deployer.
  const known = mapped ?? (await resolveKnownToken(assetId).catch(() => null));
  const tokenAddr = known ?? (isAddress(assetId) ? assetId : null);
  if (!tokenAddr || !isAddress(tokenAddr)) return null;
  const token = getAddress(tokenAddr);
  const inAssetMap = Object.values(dep.assetMap).some((addr) => addr && addr.toLowerCase() === token.toLowerCase());
  // Only deployment-mapped (seed) assets may fall back to the deployer; anything else is read live.
  const factoryToken = !inAssetMap;
  // One failed getter stops the others from retrying. A sibling that kept going would otherwise
  // outlive this read and, in tests, talk to whatever RPC URL is left after the caller returns.
  const reads = new AbortController();
  const onDeadline = () => reads.abort();
  currentDeadline()?.signal.addEventListener("abort", onDeadline);
  let readFailed = false;
  let onchain: Awaited<ReturnType<typeof readTokenOnchain>>;
  try {
  onchain = await readTokenOnchain(async (to, data) => {
    try {
      return await tokenCall(to, data, reads.signal);
    } catch (error) {
      if (readFailed) return null;
      readFailed = true;
      reads.abort();
      throw error;
    }
  }, token);
  } finally {
    currentDeadline()?.signal.removeEventListener("abort", onDeadline);
  }
  const decimals = onchain.decimals ?? 18;
  const logicalAssetId = resolveLogicalAssetId(token);
  const seed = seedAssetMeta(logicalAssetId);
  const creator = onchain.creator ?? (factoryToken ? undefined : dep.deployer || "0x0");
  const base: AssetRow = {
    assetId: logicalAssetId,
    tokenAddress: token,
    name: onchain.name || logicalAssetId,
    symbol: onchain.symbol || FALLBACK_TOKEN_SYMBOL,
    decimals,
    totalSupply: Number(formatUnits(onchain.totalSupply ?? BigInt(0), decimals)),
    ...(creator ? { creator } : {}),
    status: "active",
    type: "token",
    verified: Boolean(seed),
  };
  const enriched = enrichAssetRow({
    ...base,
    name: seed?.name ?? base.name,
    symbol: seed?.symbol ?? base.symbol,
    decimals: seed?.decimals ?? base.decimals,
  });
  const imageStarted = Date.now();
  const [overrides, chainImage] = await withinBudget(
    Promise.all([
      readTokenIconOverrides([token]).catch(() => new Map<string, string>()),
      resolveTokenImageUri(onchain.metadataUri, (uri) =>
        readTokenUriMetadata(uri, boundedTimeoutMs(TOKEN_IMAGE_BUDGET_MS), currentDeadline()?.at),
      ),
    ]),
    TOKEN_IMAGE_BUDGET_MS,
    [new Map<string, string>(), undefined] as [Map<string, string>, string | undefined],
  );
  const overrideRaw = overrides.get(token.toLowerCase());
  const override = overrideRaw ? (displayTokenImageUrl(overrideRaw) ?? undefined) : undefined;
  const image = chainImage ? (displayTokenImageUrl(chainImage) ?? undefined) : undefined;
  const row = applyTokenImage(enriched, override, image);
  // A fast gateway failure is just "no image". Waiting out the image budget or the request
  // deadline means the document was not read, so the row stays partial for the next request.
  const imageBudgetHit = Boolean(onchain.metadataUri) && !image && Date.now() - imageStarted >= TOKEN_IMAGE_BUDGET_MS - 25;
  if (imageBudgetHit || (deadlineExpired() && !image)) return { ...row, partial: true };
  return row;
}

const IS_PEOPLE_TOKEN_ABI = parseAbi(["function isPeopleToken(address) view returns (bool)"]);

/** The node could not be asked whether an address is a factory token (timeout, backoff, HTTP 5xx). */
export class KnownTokenLookupError extends Error {
  constructor(message = "known_token_lookup_failed") {
    super(message);
    this.name = "KnownTokenLookupError";
  }
}

/**
 * Token address for an assetId/address the site knows about, else null. The deployment assetMap
 * is checked first (no RPC); otherwise one `isPeopleToken` eth_call per factory version (current
 * and legacy `tokenFactoryVn`) — never a log scan.
 *
 * null means every factory answered "no" (a JSON-RPC revert counts as "no"). When a factory could
 * not be asked at all and no other factory vouched for the token, this throws
 * `KnownTokenLookupError`, so a transient RPC failure is never mistaken for "not a token".
 */
export async function resolveKnownToken(assetIdOrAddress: string): Promise<string | null> {
  const dep = readEvmDeployments();
  const needle = assetIdOrAddress.trim().toLowerCase();
  if (!needle) return null;
  const mapped = dep.assetMap[assetIdOrAddress];
  if (mapped) return mapped;
  const fromMap = Object.values(dep.assetMap).find((addr) => addr && addr.toLowerCase() === needle);
  if (fromMap) return fromMap;
  if (!isAddress(needle)) return null;
  const token = getAddress(needle);
  const data = encodeFunctionData({ abi: IS_PEOPLE_TOKEN_ABI, functionName: "isPeopleToken", args: [token] });
  const factories = Object.entries(dep.contracts ?? {})
    .filter(([key, addr]) => /^tokenFactory(V\d+)?$/.test(key) && addr && isAddress(addr))
    .map(([, addr]) => addr as string);
  let unreachable = false;
  for (const factory of factories) {
    if (deadlineExpired()) {
      unreachable = true;
      break;
    }
    let out: string | undefined;
    try {
      out = await evmJsonRpc<string>("eth_call", [{ to: factory, data }, "latest"], {
        timeoutMs: boundedTimeoutMs(8_000),
        deadlineAt: currentDeadline()?.at,
      });
    } catch (error) {
      if (!(error instanceof EvmRpcResponseError)) unreachable = true;
      continue;
    }
    if (/^0x0*1$/.test(out ?? "")) return token;
  }
  if (unreachable) throw new KnownTokenLookupError();
  return null;
}

const BALANCE_OF_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const OWNER_OF_SELECTOR = "0x6352211e";

function extraTokenAddresses(raw: string | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const value = part.trim();
    if (!isAddress(value)) continue;
    const lower = value.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(lower);
    if (out.length >= 20) break;
  }
  return out;
}

/** One `eth_getBalance`, retried on nginx 503 / timeout. Does not consult the shared backoff. */
async function readNativeWei(addr: string, deadlineAt?: number): Promise<bigint> {
  const at = deadlineAt ?? currentDeadline()?.at;
  let last: unknown;
  for (let attempt = 0; attempt <= NATIVE_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      const wait = retryDelayMs(NATIVE_RETRY_DELAYS_MS[attempt - 1] ?? 0, at);
      if (wait === null) break;
      await sleepMs(wait);
      if (deadlineExpired(at)) break;
    }
    try {
      const hex = await evmJsonRpc<string>("eth_getBalance", [addr, "latest"], {
        timeoutMs: boundedTimeoutMs(NATIVE_ATTEMPT_TIMEOUT_MS, at),
        ignoreBackoff: true,
        deadlineAt: at,
      });
      return BigInt(hex);
    } catch (error) {
      last = error;
      if (isRequestDeadlineError(error) || deadlineExpired(at)) break;
      if (error instanceof EvmRpcResponseError) throw error;
      if (attempt === NATIVE_RETRY_DELAYS_MS.length || !isTransientTokenRpcError(error)) break;
    }
  }
  throw last instanceof Error ? last : new Error("balance_unavailable");
}

async function readAddressNonce(addr: string, deadlineAt?: number): Promise<number> {
  const at = deadlineAt ?? currentDeadline()?.at;
  const hex = await evmJsonRpc<string>("eth_getTransactionCount", [addr, "latest"], {
    timeoutMs: boundedTimeoutMs(NATIVE_ATTEMPT_TIMEOUT_MS, at),
    ignoreBackoff: true,
    deadlineAt: at,
  });
  const nonce = Number.parseInt(hex, 16);
  if (!Number.isFinite(nonce)) throw new Error("nonce_unavailable");
  return nonce;
}

type WalletTokenRow = { assetId: string; decimals: number; creator: string };

/**
 * Tokens whose balances can be read with `balanceOf`. Uses the in-memory catalog and the
 * deployment asset map. Never starts an `eth_getLogs` scan.
 */
async function knownWalletTokens(deadlineAt: number): Promise<{ wanted: Map<string, WalletTokenRow>; partial: boolean }> {
  const wanted = new Map<string, WalletTokenRow>();
  let partial = false;
  for (const row of peekCachedCatalogTokens()) {
    if (!row.tokenAddress || !isAddress(row.tokenAddress)) continue;
    wanted.set(row.tokenAddress.toLowerCase(), {
      assetId: row.assetId,
      decimals: row.decimals,
      creator: row.creator,
    });
  }
  // Test stables are not factory tokens and are not in the deployment map, so the catalog never
  // lists them. A non-zero balance still has to be readable.
  for (const stable of TEST_STABLES) {
    const key = stable.tokenAddress.toLowerCase();
    if (wanted.has(key)) continue;
    wanted.set(key, { assetId: stable.assetId, decimals: stable.decimals, creator: "" });
  }
  const missing: string[] = [];
  for (const addr of Object.values(readEvmDeployments().assetMap ?? {})) {
    if (!addr || !isAddress(addr)) continue;
    const token = getAddress(addr);
    if (wanted.has(token.toLowerCase())) continue;
    missing.push(token);
  }
  if (!missing.length) return { wanted, partial };
  const rememberStub = (token: string) => {
    const assetId = resolveLogicalAssetId(token);
    const seed = seedAssetMeta(assetId);
    wanted.set(token.toLowerCase(), {
      assetId,
      decimals: seed?.decimals ?? 18,
      creator: "",
    });
  };
  if (Date.now() >= deadlineAt) {
    for (const token of missing) rememberStub(token);
    return { wanted, partial: true };
  }
  const timeoutMs = Math.max(200, Math.min(1_200, deadlineAt - Date.now()));
  let results: Array<string | null>;
  try {
    results = await evmJsonRpcBatch<string>(
      missing.flatMap((token) => [
        { method: "eth_call", params: [{ to: token, data: "0x313ce567" }, "latest"] },
        { method: "eth_call", params: [{ to: token, data: "0x02d05d3f" }, "latest"] },
      ]),
      { ignoreBackoff: true, timeoutMs, deadlineAt },
    );
  } catch {
    results = missing.flatMap(() => [null, null]);
    partial = true;
  }
  missing.forEach((token, index) => {
    const decRaw = results[index * 2];
    const creatorRaw = results[index * 2 + 1];
    let decimals: number | null = null;
    if (typeof decRaw === "string" && decRaw !== "0x") {
      try {
        const n = Number(BigInt(decRaw));
        if (Number.isInteger(n) && n >= 0 && n <= 18) decimals = n;
      } catch {
        partial = true;
      }
    } else {
      partial = true;
    }
    let creator = "";
    if (typeof creatorRaw === "string" && creatorRaw.length >= 66) {
      try {
        creator = getAddress(`0x${creatorRaw.slice(-40)}`);
      } catch {
        partial = true;
      }
    } else {
      partial = true;
    }
    const assetId = resolveLogicalAssetId(token);
    const seed = seedAssetMeta(assetId);
    wanted.set(token.toLowerCase(), {
      assetId,
      decimals: decimals ?? seed?.decimals ?? 18,
      creator,
    });
  });
  return { wanted, partial };
}

async function readBalanceCall(token: string, data: string, timeoutMs: number, deadlineAt?: number): Promise<string | null> {
  try {
    const value = await evmJsonRpc<string>("eth_call", [{ to: token, data }, "latest"], {
      timeoutMs: boundedTimeoutMs(timeoutMs, deadlineAt),
      ignoreBackoff: true,
      deadlineAt,
    });
    return value && value !== "0x" ? value : null;
  } catch (error) {
    if (isTransientTokenRpcError(error)) return null;
    return null;
  }
}

/**
 * Token contracts that sent this address a Transfer in the last 2,000 blocks. One `eth_getLogs`.
 * A failure is partial and does not drop balances that were already known.
 */
async function recentReceivedTokenAddresses(
  owner: string,
  deadlineAt: number,
): Promise<{ addresses: string[]; partial: boolean }> {
  try {
    if (Date.now() >= deadlineAt) return { addresses: [], partial: true };
    const tipHex = await evmJsonRpc<string>("eth_blockNumber", [], {
      timeoutMs: boundedTimeoutMs(2_000, deadlineAt),
      ignoreBackoff: true,
      deadlineAt,
    });
    const tip = Number.parseInt(tipHex, 16);
    if (!Number.isFinite(tip)) return { addresses: [], partial: true };
    const from = Math.max(0, tip - 2_000);
    const logs = await evmJsonRpc<Array<{ address?: string }>>("eth_getLogs", [{
      fromBlock: `0x${from.toString(16)}`,
      toBlock: `0x${tip.toString(16)}`,
      topics: [TRANSFER_TOPIC, null, addressTopic(owner)],
    }], {
      timeoutMs: boundedTimeoutMs(2_000, deadlineAt),
      ignoreBackoff: true,
      deadlineAt,
    });
    if (!Array.isArray(logs)) return { addresses: [], partial: true };
    const addresses: string[] = [];
    const seen = new Set<string>();
    for (const log of logs) {
      const addr = (log.address ?? "").toLowerCase();
      if (!isAddress(addr) || seen.has(addr)) continue;
      seen.add(addr);
      addresses.push(addr);
    }
    return { addresses, partial: false };
  } catch {
    return { addresses: [], partial: true };
  }
}

/**
 * `decimals()` on a contract found via a recent Transfer. A revert or empty result is a finished
 * read (the contract is not an ERC-20). A timeout or transport error was not read.
 */
async function readDiscoveredTokenDecimals(
  token: string,
  deadlineAt: number,
): Promise<{ decimals: number | null; missed: boolean }> {
  try {
    const out = await evmJsonRpc<string>("eth_call", [{ to: getAddress(token), data: "0x313ce567" }, "latest"], {
      timeoutMs: boundedTimeoutMs(800, deadlineAt),
      ignoreBackoff: true,
      deadlineAt,
    });
    if (!out || out === "0x") return { decimals: null, missed: false };
    const decimals = Number(BigInt(out));
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) return { decimals: 18, missed: false };
    return { decimals, missed: false };
  } catch (error) {
    if (error instanceof EvmRpcResponseError) return { decimals: null, missed: false };
    return { decimals: null, missed: true };
  }
}

/**
 * `balanceOf` for an already identified set. Known catalog rows are read before any `eth_getLogs`,
 * so a slow tail cannot drop balances that were already listed.
 */
async function readWantedBalances(
  owner: string,
  wanted: Map<string, WalletTokenRow>,
  keys: string[],
  deadlineAt: number,
): Promise<{ balances: Record<string, number>; partial: boolean }> {
  const tokens = keys.map((lower) => getAddress(lower));
  if (!tokens.length) return { balances: {}, partial: false };
  let partial = false;
  const data = encodeFunctionData({ abi: BALANCE_OF_ABI, functionName: "balanceOf", args: [getAddress(owner)] });
  const BALANCE_BATCH_SIZE = 20;
  const rawBalances: Array<{ ok: true; value: string } | { ok: false }> = [];
  for (let start = 0; start < tokens.length; start += BALANCE_BATCH_SIZE) {
    if (Date.now() >= deadlineAt) {
      partial = true;
      rawBalances.push(...tokens.slice(start).map(() => ({ ok: false as const })));
      break;
    }
    const chunk = tokens.slice(start, start + BALANCE_BATCH_SIZE);
    const timeoutMs = Math.max(200, Math.min(1_200, deadlineAt - Date.now()));
    let results: Array<string | null>;
    try {
      results = await evmJsonRpcBatch<string>(
        chunk.map((token) => ({ method: "eth_call", params: [{ to: token, data }, "latest"] })),
        { ignoreBackoff: true, timeoutMs, deadlineAt },
      );
    } catch {
      results = chunk.map(() => null);
    }
    const resolved = await Promise.all(
      chunk.map(async (token, index) => {
        const value = results[index];
        if (typeof value === "string" && value !== "0x") return { ok: true as const, value };
        if (Date.now() >= deadlineAt) return { ok: false as const };
        const singleTimeout = Math.max(200, Math.min(800, deadlineAt - Date.now()));
        const single = await readBalanceCall(token, data, singleTimeout, deadlineAt);
        if (single) return { ok: true as const, value: single };
        if (Date.now() >= deadlineAt) return { ok: false as const };
        const retried = await readBalanceCall(token, data, Math.max(200, Math.min(800, deadlineAt - Date.now())), deadlineAt);
        return retried ? { ok: true as const, value: retried } : { ok: false as const };
      }),
    );
    rawBalances.push(...resolved);
  }
  const balances: Record<string, number> = {};
  const ownerLower = owner.toLowerCase();
  tokens.forEach((token, index) => {
    const row = wanted.get(token.toLowerCase());
    if (!row) return;
    const raw = rawBalances[index];
    if (!raw?.ok) {
      partial = true;
      return;
    }
    let units = BigInt(0);
    try {
      units = BigInt(raw.value);
    } catch {
      partial = true;
      return;
    }
    const value = Number(formatUnits(units, row.decimals));
    // A creator keeps their token listed even with a zero balance. A failed read is omitted
    // and flagged partial instead of being shown as zero or failing the whole address.
    if (value > 0 || row.creator.toLowerCase() === ownerLower) {
      balances[row.assetId.toLowerCase()] = value;
    }
  });
  return { balances, partial };
}

/**
 * ERC-20 balances for a wallet. Tokens come from the in-memory catalog, the deployment map,
 * test stables, the fresh factory tail, and recent Transfer logs. `tokens=` asks about freshly
 * created tokens before the catalog has indexed them. A failed or hung read is omitted and flagged partial.
 */
async function walletTokenBalances(
  owner: string,
  tokensParam: string | null,
  deadlineAt: number,
): Promise<{ balances: Record<string, number>; partial: boolean }> {
  let partial = false;
  try {
    const known = await knownWalletTokens(deadlineAt);
    partial = known.partial;
    const wanted = known.wanted;
    const knownBalances = await readWantedBalances(owner, wanted, [...wanted.keys()], deadlineAt);
    partial = partial || knownBalances.partial;
    const balances = knownBalances.balances;
    const fresh = await readFreshCreatedTokenAddresses(deadlineAt);
    if (!fresh.complete) partial = true;
    const received = await recentReceivedTokenAddresses(owner, deadlineAt);
    if (received.partial) partial = true;
    const discovered: string[] = [];
    for (const addr of [...fresh.addresses, ...received.addresses]) {
      if (wanted.has(addr)) continue;
      if (Date.now() >= deadlineAt) {
        partial = true;
        break;
      }
      const stable = testStableMeta(addr);
      if (stable) {
        wanted.set(stable.tokenAddress.toLowerCase(), {
          assetId: stable.assetId,
          decimals: stable.decimals,
          creator: "",
        });
        discovered.push(stable.tokenAddress.toLowerCase());
        continue;
      }
      // ERC-721 transfers share this topic. A revert or empty `decimals()` is a completed read
      // (not an ERC-20); only a transport failure means the balance was not read.
      const decimalsRead = await readDiscoveredTokenDecimals(addr, deadlineAt);
      if (decimalsRead.missed) {
        partial = true;
        continue;
      }
      if (decimalsRead.decimals === null) continue;
      wanted.set(addr, {
        assetId: addr,
        decimals: decimalsRead.decimals,
        creator: "",
      });
      discovered.push(addr);
    }
    for (const raw of extraTokenAddresses(tokensParam)) {
      if (wanted.has(raw)) continue;
      if (Date.now() >= deadlineAt) {
        partial = true;
        break;
      }
      const resolved = await resolveKnownToken(raw).catch(() => null);
      if (!resolved) continue;
      const token = getAddress(resolved);
      const [decimalsRaw, creator] = await Promise.all([
        erc20Uint(token, "0x313ce567"),
        erc20Address(token, "0x02d05d3f"),
      ]);
      const key = token.toLowerCase();
      wanted.set(key, {
        assetId: key,
        decimals: Number(decimalsRaw) || 18,
        creator,
      });
      discovered.push(key);
    }
    const discoveredBalances = await readWantedBalances(owner, wanted, discovered, deadlineAt);
    partial = partial || discoveredBalances.partial;
    Object.assign(balances, discoveredBalances.balances);
    return { balances, partial };
  } catch {
    return { balances: {}, partial: true };
  }
}

type MintedNftRow = {
  nftId: string;
  name: string;
  description?: string;
  imageUri?: string;
  owner: string;
  creator: string;
  collection: string;
  onChainTokenId: string;
};

const MINTED_NFT_CACHE_TTL_MS = 60_000;
const MINTED_NFT_CACHE_MAX = 100;
const mintedNftCache = new Map<string, { at: number; value: MintedNftRow[] }>();
const MINTED_NFT_SCAN_WINDOWS = 100;

export function resetAddressBalanceCacheForTests(): void {
  addressBalanceCache.clear();
}

export function resetMintedNftCacheForTests(): void {
  mintedNftCache.clear();
  addressBalanceCache.clear();
}

function addressTopic(address: string): string {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

/** NFTs minted through NftFactory to `owner`, verified by a current `ownerOf` read. */
async function mintedNftsForOwner(owner: string): Promise<MintedNftRow[]> {
  const cacheKey = owner.toLowerCase();
  const cached = mintedNftCache.get(cacheKey);
  if (cached && Date.now() - cached.at < MINTED_NFT_CACHE_TTL_MS) return cached.value;

  const factory = nftFactoryAddress();
  if (!factory) return [];
  const latest = await fetchLatestBlockNumber().catch(() => 0);
  if (!latest) return [];
  // Bounded window: recent mints only, never a full-chain scan on every wallet open.
  const from = Math.max(logStartBlock(factory), latest - MINTED_NFT_SCAN_WINDOWS * LOG_WINDOW_BLOCKS);
  const logs = await fetchLogsWindowed(
    factory,
    [NFT_MINTED_TOPIC, null, null, addressTopic(owner)],
    from,
  ).catch(() => []);

  const candidates = new Map<string, { collection: string; tokenId: bigint; tokenUri: string }>();
  for (const log of logs) {
    if (log.address && log.address.toLowerCase() !== factory.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: [nftMintedEvent],
        data: (log.data ?? "0x") as Hex,
        topics: (log.topics ?? []) as [Hex, ...Hex[]],
      });
      if (decoded.eventName !== "NftMinted") continue;
      if (decoded.args.owner.toLowerCase() !== cacheKey) continue;
      const collection = getAddress(decoded.args.collection);
      candidates.set(`${collection.toLowerCase()}:${decoded.args.tokenId.toString()}`, {
        collection,
        tokenId: decoded.args.tokenId,
        tokenUri: decoded.args.tokenURI,
      });
    } catch {
      // A log from a different ABI in the same topic slot is ignored.
    }
  }
  if (!candidates.size) {
    rememberMintedNfts(cacheKey, []);
    return [];
  }

  const list = [...candidates.values()];
  const owners = await evmJsonRpcBatch<string>(
    list.map((item) => ({
      method: "eth_call",
      params: [
        {
          to: item.collection,
          data: `${OWNER_OF_SELECTOR}${item.tokenId.toString(16).padStart(64, "0")}`,
        },
        "latest",
      ],
    })),
  ).catch(() => list.map(() => null));

  const stillOwned = list.filter((item, index) => {
    const out = owners[index];
    if (!out || out === "0x" || out.length < 66) return false;
    return `0x${out.slice(-40)}`.toLowerCase() === cacheKey;
  });

  const rows = await Promise.all(
    stillOwned.map(async (item): Promise<MintedNftRow> => {
      const meta = await readTokenUriMetadata(item.tokenUri);
      return {
        nftId: `${item.collection.toLowerCase()}-${item.tokenId.toString()}`,
        name: meta?.name ?? `NFT #${item.tokenId.toString()}`,
        ...(meta?.description ? { description: meta.description } : {}),
        ...(meta?.image ? { imageUri: meta.image } : {}),
        owner: getAddress(owner),
        creator: getAddress(owner),
        collection: item.collection,
        onChainTokenId: item.tokenId.toString(),
      };
    }),
  );
  rememberMintedNfts(cacheKey, rows);
  return rows;
}

function rememberMintedNfts(owner: string, rows: MintedNftRow[]): void {
  mintedNftCache.delete(owner);
  while (mintedNftCache.size >= MINTED_NFT_CACHE_MAX) {
    const oldest = mintedNftCache.keys().next().value;
    if (oldest === undefined) break;
    mintedNftCache.delete(oldest);
  }
  mintedNftCache.set(owner, { at: Date.now(), value: rows });
}

export function handleEvmCompatGet(path: string, search: URLSearchParams): Promise<{ status: number; body: unknown }> {
  return runWithRequestDeadline(() => handleEvmCompatGetInner(path, search));
}

async function handleEvmCompatGetInner(path: string, search: URLSearchParams): Promise<{ status: number; body: unknown }> {
  const segments = path.replace(/^\//, "").split("/").filter(Boolean);
  const root = segments[0]?.toLowerCase() ?? "";

  if (root === "health") {
    const height = await fetchLatestBlockNumber().catch(() => 0);
    return { status: 200, body: { status: "ok", chainId: "97401", height } };
  }

  if (root === "blocks" && segments.length === 1) {
    const limit = parseLimit(search.get("limit"), 20);
    const blocks = await fetchRecentBlocks(limit).catch(() => []);
    return { status: 200, body: blocks };
  }

  if (root === "blocks" && segments[1] && /^\d+$/.test(segments[1])) {
    const height = Number(segments[1]);
    const block = await fetchBlockByHeight(height).catch(() => null);
    if (!block) return { status: 404, body: { error: "not_found" } };
    return { status: 200, body: block };
  }

  if (root === "transactions" && segments.length === 1) {
    const limit = parseLimit(search.get("limit"), 20);
    const txs = await fetchRecentTransactions(limit).catch(() => []);
    return { status: 200, body: txs };
  }

  if (root === "transactions" && segments.length === 2) {
    const hash = segments[1];
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      return { status: 400, body: { error: "invalid_transaction_hash" } };
    }
    const tx = await fetchTransaction(hash);
    if (!tx) return { status: 404, body: { error: "not_found" } };
    return { status: 200, body: tx };
  }

  if (root === "liquidity-pools") {
    // Reserves must come from live `getReserves()` reads only. The deployment JSON is a
    // build-time snapshot; serving it here would let swap quotes price against stale
    // reserves, so an unavailable scan yields no pools instead.
    const onChain = await discoverPoolsOnChain().catch(() => []);
    // Listings only: pools of retired/fixture tokens never reach the swap UI or pool lists.
    return { status: 200, body: visiblePools(onChain) };
  }

  if (root === "assets" && segments.length === 1) {
    let catalogFailed = false;
    const onChain = await discoverTokensOnChain().catch(() => {
      catalogFailed = true;
      return peekCachedCatalogTokens();
    });
    const mapped = visibleAssets(onChain.map((row) => enrichAssetRow(row))).map((enriched) => {
      return {
        assetId: enriched.assetId,
        tokenAddress: enriched.tokenAddress,
        name: enriched.name,
        symbol: enriched.symbol,
        decimals: enriched.decimals,
        totalSupply: enriched.totalSupply,
        creator: enriched.creator,
        status: enriched.status,
        type: enriched.type,
        verified: enriched.verified,
        ...(enriched.impersonates ? { impersonates: enriched.impersonates } : {}),
        creationMetadata: enriched.creationMetadata,
        imageUri: enriched.imageUri,
      };
    });
    const listPartial = catalogFailed || catalogListIsPartial(onChain) || deadlineExpired();
    if (onChain.length || (listPartial && deadlineExpired())) {
      return { status: 200, body: listPartial ? { assets: mapped, partial: true } : mapped };
    }
    console.warn("[evm-compat] token catalog empty; serving static assetMap fallback");
    const dep = readEvmDeployments();
    const rows: AssetRow[] = [];
    let skipped = listPartial;
    for (const assetId of Object.keys(dep.assetMap ?? {})) {
      if (deadlineExpired()) {
        skipped = true;
        break;
      }
      // One failing RPC read skips that row instead of failing the whole listing.
      try {
        const row = await loadAsset(assetId);
        if (row) rows.push(row);
      } catch {
        skipped = true;
      }
    }
    if (skipped || deadlineExpired()) return { status: 200, body: { assets: rows, partial: true } };
    return { status: 200, body: rows };
  }

  if (root === "assets" && segments[1]) {
    const rawId = decodeURIComponent(segments[1]);
    const key = rawId.toLowerCase();
    // A warm catalog row is enough to paint the page. Cold instances do single eth_calls,
    // never a getLogs scan, so the first paint is not stuck behind the catalog history.
    const hit = peekCachedCatalogTokens().find(
      (row) => row.assetId.toLowerCase() === key || row.tokenAddress.toLowerCase() === key,
    );
    if (hit?.name && hit.symbol) {
      const enriched = enrichAssetRow(hit);
      const deployerFallback = (readEvmDeployments().deployer || "0x0").toLowerCase();
      const creatorIsFallback = String(enriched.creator ?? "").toLowerCase() === deployerFallback;
      if (!enriched.imageUri || creatorIsFallback) {
        const live = await withinBudget(
          loadAsset(hit.tokenAddress ?? hit.assetId),
          TOKEN_IMAGE_BUDGET_MS,
          null,
        );
        if (live) {
          if (!enriched.imageUri && live.imageUri) {
            enriched.imageUri = live.imageUri;
            enriched.creationMetadata = { ...(enriched.creationMetadata ?? {}), image: live.imageUri };
          }
          if (creatorIsFallback && live.creator && live.creator.toLowerCase() !== deployerFallback) {
            enriched.creator = live.creator;
          }
        }
      }
      const imageMissed = deadlineExpired() && !enriched.imageUri;
      return {
        status: 200,
        body: {
          assetId: enriched.assetId,
          name: enriched.name,
          symbol: enriched.symbol,
          decimals: enriched.decimals,
          totalSupply: enriched.totalSupply,
          creator: enriched.creator,
          status: enriched.status,
          type: enriched.type,
          verified: enriched.verified,
          ...(enriched.impersonates ? { impersonates: enriched.impersonates } : {}),
          creationMetadata: enriched.creationMetadata,
          imageUri: enriched.imageUri,
          ...(imageMissed ? { partial: true } : {}),
        },
      };
    }
    try {
      const asset = await loadAsset(rawId);
      if (!asset) {
        if (deadlineExpired()) return { status: 200, body: { partial: true } };
        return { status: 404, body: { error: "not_found" } };
      }
      return { status: 200, body: asset };
    } catch (error) {
      if (error instanceof TokenReadError || isRequestDeadlineError(error) || deadlineExpired()) {
        return { status: 200, body: { partial: true } };
      }
      throw error;
    }
  }

  if (root === "address" && segments[1] && isAddress(segments[1])) {
    const addr = getAddress(segments[1]);
    if (segments[2] === "transactions") {
      try {
        const limit = Number(search.get("limit") ?? 30) || 30;
        const beforeRaw = search.get("beforeBlock");
        const beforeBlock =
          beforeRaw && /^\d+$/.test(beforeRaw) ? Number(beforeRaw) : undefined;
        const history = await fetchAddressHistory(addr, limit, { beforeBlock });
        return {
          status: 200,
          body: {
            items: history.items,
            hasMore: history.hasMore,
            nextBeforeBlock: history.nextBeforeBlock,
            outgoing: history.outgoing,
            incoming: history.incoming,
            truncated: history.truncated ?? false,
          },
        };
      } catch {
        return { status: 502, body: { error: "rpc_unavailable" } };
      }
    }
    // Native balance is one eth_getBalance with short retries (including nginx 503). Token rows
    // are balanceOf against the known catalog, inside a hard budget. A hung call does not wait
    // on a getLogs scan and does not turn the whole response into 502.
    const cacheKey = `${addr.toLowerCase()}|${(search.get("tokens") ?? "").toLowerCase()}`;
    const cachedBalance = addressBalanceCache.get(cacheKey);
    if (
      cachedBalance &&
      Date.now() - cachedBalance.at < (cachedBalance.partial ? ADDRESS_PARTIAL_CACHE_TTL_MS : ADDRESS_CACHE_TTL_MS)
    ) {
      return { status: 200, body: cachedBalance.body };
    }
    const deadline = Math.min(Date.now() + WALLET_BALANCE_BUDGET_MS, currentDeadline()?.at ?? Number.POSITIVE_INFINITY);
    const [native, nonceResult, tokenBalances] = await Promise.all([
      readNativeWei(addr, deadline).then((value) => ({ ok: true as const, value })).catch(() => ({ ok: false as const })),
      readAddressNonce(addr, deadline).then((value) => ({ ok: true as const, value })).catch(() => ({ ok: false as const })),
      walletTokenBalances(addr, search.get("tokens"), deadline),
    ]);
    const balance = native.ok ? weiToPpl(native.value) : undefined;
    const nonce = nonceResult.ok ? nonceResult.value : 0;
    const partial = !native.ok || !nonceResult.ok || tokenBalances.partial || deadlineExpired(deadline);
    const body: AddressBalanceBody = {
      ...(balance === undefined || !native.ok ? {} : { balance, balanceWei: native.value.toString() }),
      nonce,
      balances: { ...(balance === undefined ? {} : { ppl: balance }), ...tokenBalances.balances },
      outgoingTxs: nonce,
      incomingTxs: 0,
      ...(partial ? { partial: true } : {}),
    };
    addressBalanceCache.set(cacheKey, { at: Date.now(), partial, body });
    return { status: 200, body };
  }

  if (root === "accounts") {
    const tokenParam = search.get("token");
    const assetId = search.get("assetId") ?? tokenParam;
    const dep = readEvmDeployments();
    // Holders come from a full Transfer-log scan, so only known tokens (deployment assetMap or
    // the factory registry) may trigger one; an arbitrary address must not buy a chain scan.
    let token: string | null;
    try {
      token = assetId ? await resolveKnownToken(assetId) : (Object.values(dep.assetMap)[0] ?? null);
    } catch {
      // The registry could not be asked. A partial list is retryable and is not "unknown token".
      return { status: 200, body: { accounts: [], partial: true } };
    }
    if (!token || !isAddress(token)) {
      if (assetId) return { status: 404, body: { error: "unknown_token" } };
      return { status: 200, body: [] };
    }
    // Only a factory token can be younger than the deployment block; start its scan at its creation
    // block (null = unknown, scan from the deployment block).
    const isSeedToken = Object.values(dep.assetMap).some((addr) => addr && addr.toLowerCase() === token.toLowerCase());
    // Seed tokens are scanned from the deployment block. A factory token whose creation block
    // cannot be found also starts there, but keeps the newest windows so a mint at the tip is included.
    const creationBlock = isSeedToken ? null : await findTokenCreationBlock(token);
    const creationUnknown = !isSeedToken && creationBlock == null;
    let scan: Awaited<ReturnType<typeof aggregateHoldersDetailed>>;
    try {
      scan = await aggregateHoldersDetailed(token, creationBlock ?? undefined, {
        preferHead: creationUnknown,
        deadlineAt: currentDeadline()?.at,
      });
    } catch {
      // A failed scan is not an empty holder list. Whatever was read is returned as partial.
      return { status: 200, body: { accounts: [], partial: true } };
    }
    const asset = await loadAsset(assetId ?? token).catch(() => null);
    const decimals = asset?.decimals ?? 18;
    const accounts = scan.holders.map((row) => ({
      address: row.address,
      balance: Number(formatUnits(row.balance, decimals)),
      balances: {
        ppl: 0,
        [(assetId ?? token).toLowerCase()]: Number(formatUnits(row.balance, decimals)),
      },
    }));
    if (scan.partial) return { status: 200, body: { accounts, partial: true } };
    return { status: 200, body: accounts };
  }

  if (root === "nfts") {
    const ownerRaw = search.get("owner");
    const owner = ownerRaw && isAddress(ownerRaw) ? getAddress(ownerRaw) : null;
    const seedRows = visibleNfts(listSeedNfts(ownerRaw ?? undefined));
    const mintedRows = owner ? await mintedNftsForOwner(owner).catch(() => []) : [];
    // Dedupe by collection+token id (falling back to nftId) so a seeded NFT that was also minted
    // through the factory is listed once.
    const seen = new Set<string>();
    const rows: typeof seedRows = [];
    for (const row of [...seedRows, ...mintedRows]) {
      const key = row.collection && row.onChainTokenId
        ? `${row.collection.toLowerCase()}:${row.onChainTokenId}`
        : row.nftId.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
    // Read per-collection stats once (collections are shared across tokens); absent getters stay
    // undefined so the UI shows only fields the contract actually exposes.
    const collections = [...new Set(rows.map((r) => r.collection).filter((c): c is string => Boolean(c)))];
    const stats = new Map<string, NftCollectionStats>();
    await Promise.all(
      collections.map(async (collection) => {
        stats.set(collection.toLowerCase(), await nftCollectionStats(collection));
      })
    );
    return {
      status: 200,
      body: rows.map((row) => {
        const s = row.collection ? stats.get(row.collection.toLowerCase()) : undefined;
        return {
          ...row,
          ...(s?.minted === undefined ? {} : { minted: s.minted }),
          ...(s?.totalSupply === undefined ? {} : { totalSupply: s.totalSupply }),
          ...(s?.mintPriceWei === undefined ? {} : { mintPrice: Number(formatUnits(s.mintPriceWei, 18)) }),
        };
      }),
    };
  }

  if (root === "search") {
    const q = (search.get("q") ?? "").trim();
    if (/^\d+$/.test(q)) {
      const block = await fetchBlockByHeight(Number(q)).catch(() => null);
      return { status: 200, body: { blocks: block ? [block] : [], transactions: [], addresses: [] } };
    }
    if (q.startsWith("0x") && q.length === 66) {
      const tx = await fetchTransaction(q).catch(() => null);
      return { status: 200, body: { blocks: [], transactions: tx ? [tx] : [], addresses: [] } };
    }
    if (isAddress(q)) {
      return { status: 200, body: { blocks: [], transactions: [], addresses: [getAddress(q)] } };
    }
    return { status: 200, body: { blocks: [], transactions: [], addresses: [] } };
  }

  if (root === "contracts" && segments[1] && isAddress(segments[1])) {
    const code = await evmJsonRpc<string>("eth_getCode", [getAddress(segments[1]), "latest"]).catch(() => "0x");
    if (!code || code === "0x") return { status: 404, body: { error: "not_found" } };
    return { status: 200, body: { address: getAddress(segments[1]), verified: false } };
  }

  return { status: 404, body: { error: "not_found" } };
}
