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
import { aggregateHoldersFromTransfers, findTokenCreationBlock } from "@/lib/evm/transfer-index";
import {
  LOG_WINDOW_BLOCKS,
  applyTokenImage,
  discoverPoolsOnChain,
  discoverTokensOnChain,
  fetchLogsWindowed,
  logStartBlock,
} from "@/lib/evm/chain-catalog";
import { visibleAssets, visibleNfts, visiblePools } from "@/lib/hidden-assets";
import { enrichAssetRow, listSeedNfts, resolveLogicalAssetId, seedAssetMeta } from "@/lib/evm/seed-assets";
import { readTokenIconOverrides } from "@/lib/evm/token-icon-overrides";
import { EvmRpcResponseError, evmJsonRpc, evmJsonRpcBatch, weiToPpl } from "@/lib/evm/rpc-server";
import { FALLBACK_TOKEN_SYMBOL, readTokenOnchain, resolveTokenImageUri } from "@/lib/evm/token-onchain";
import { readTokenUriMetadata } from "@/lib/evm/token-uri-metadata";
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

/** `eth_call` adapter for `readTokenOnchain`: null = revert/empty, throw = transport failure. */
async function tokenCall(to: Address, data: Hex): Promise<Hex | null> {
  try {
    return (await evmJsonRpc<Hex>("eth_call", [{ to, data }, "latest"])) ?? null;
  } catch (error) {
    if (error instanceof EvmRpcResponseError) return null;
    throw error;
  }
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
  const onchain = await readTokenOnchain(tokenCall, token);
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
  const [overrides, chainImage] = await Promise.all([
    readTokenIconOverrides([token]).catch(() => new Map<string, string>()),
    resolveTokenImageUri(onchain.metadataUri),
  ]);
  return applyTokenImage(enriched, overrides.get(token.toLowerCase()), chainImage);
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
    let out: string | undefined;
    try {
      out = await evmJsonRpc<string>("eth_call", [{ to: factory, data }, "latest"]);
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

/**
 * ERC-20 balances for a wallet. Catalog tokens come from the factory scan; `tokens=` lets the
 * wallet ask about its own freshly created tokens before the catalog has indexed them. Only
 * factory tokens are accepted. A read failure yields no token rows rather than failing the whole
 * address response.
 */
async function walletTokenBalances(
  owner: string,
  catalog: Awaited<ReturnType<typeof discoverTokensOnChain>>,
  tokensParam: string | null,
): Promise<Record<string, number>> {
  try {
    const wanted = new Map<string, { assetId: string; decimals: number; creator: string }>();
    for (const row of catalog) {
      if (!row.tokenAddress || !isAddress(row.tokenAddress)) continue;
      wanted.set(row.tokenAddress.toLowerCase(), {
        assetId: row.assetId,
        decimals: row.decimals,
        creator: row.creator,
      });
    }
    for (const raw of extraTokenAddresses(tokensParam)) {
      if (wanted.has(raw)) continue;
      const resolved = await resolveKnownToken(raw).catch(() => null);
      if (!resolved) continue;
      const token = getAddress(resolved);
      const [decimalsRaw, creator] = await Promise.all([
        erc20Uint(token, "0x313ce567"),
        erc20Address(token, "0x02d05d3f"),
      ]);
      wanted.set(token.toLowerCase(), {
        assetId: token.toLowerCase(),
        decimals: Number(decimalsRaw) || 18,
        creator,
      });
    }
    const tokens = [...wanted.keys()].map((lower) => getAddress(lower));
    if (!tokens.length) return {};
    const data = encodeFunctionData({ abi: BALANCE_OF_ABI, functionName: "balanceOf", args: [getAddress(owner)] });
    // A single batch over every catalog token can exceed the public node's limit and lose all
    // balances. Keep chunks small and fall back to one eth_call per item when a chunk fails.
    const BALANCE_BATCH_SIZE = 20;
    const rawBalances: Array<string | null> = [];
    for (let start = 0; start < tokens.length; start += BALANCE_BATCH_SIZE) {
      const chunk = tokens.slice(start, start + BALANCE_BATCH_SIZE);
      let results: Array<string | null>;
      try {
        results = await evmJsonRpcBatch<string>(
          chunk.map((token) => ({ method: "eth_call", params: [{ to: token, data }, "latest"] })),
        );
      } catch {
        results = chunk.map(() => null);
      }
      const resolved = await Promise.all(
        chunk.map((token, index) => {
          const value = results[index] ?? null;
          if (value !== null) return value;
          return evmJsonRpc<string>("eth_call", [{ to: token, data }, "latest"]).catch(() => null);
        }),
      );
      rawBalances.push(...resolved);
    }
    const balances: Record<string, number> = {};
    const ownerLower = owner.toLowerCase();
    tokens.forEach((token, index) => {
      const row = wanted.get(token.toLowerCase());
      if (!row) return;
      const raw = rawBalances[index] ?? null;
      let units = BigInt(0);
      try {
        units = BigInt(raw ?? "0x0");
      } catch {
        units = BigInt(0);
      }
      const value = Number(formatUnits(units, row.decimals));
      // A creator keeps their token listed even with a zero balance or a failed read.
      if (value > 0 || row.creator.toLowerCase() === ownerLower) {
        balances[row.assetId.toLowerCase()] = value;
      }
    });
    return balances;
  } catch {
    return {};
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

export function resetMintedNftCacheForTests(): void {
  mintedNftCache.clear();
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

export async function handleEvmCompatGet(path: string, search: URLSearchParams): Promise<{ status: number; body: unknown }> {
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
    const onChain = await discoverTokensOnChain().catch(() => []);
    if (onChain.length) {
      return {
        status: 200,
        body: visibleAssets(onChain.map((row) => enrichAssetRow(row))).map((enriched) => {
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
        }),
      };
    }
    const dep = readEvmDeployments();
    const rows: AssetRow[] = [];
    for (const assetId of Object.keys(dep.assetMap ?? {})) {
      // One failing RPC read skips that row instead of failing the whole listing.
      try {
        const row = await loadAsset(assetId);
        if (row) rows.push(row);
      } catch {
        // skipped
      }
    }
    return { status: 200, body: rows };
  }

  if (root === "assets" && segments[1]) {
    const onChain = await discoverTokensOnChain().catch(() => []);
    const hit = onChain.find((t) => t.assetId === decodeURIComponent(segments[1]).toLowerCase());
    if (hit) {
      const enriched = enrichAssetRow(hit);
      // The catalog scan cannot read a pinned metadata JSON and falls back to the deployer when
      // creator() was unreadable: complete both from a live single-token read when it can.
      const deployerFallback = (readEvmDeployments().deployer || "0x0").toLowerCase();
      const creatorIsFallback = String(enriched.creator ?? "").toLowerCase() === deployerFallback;
      if (!enriched.imageUri || creatorIsFallback) {
        const live = await loadAsset(hit.tokenAddress ?? hit.assetId).catch(() => null);
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
        },
      };
    }
    const asset = await loadAsset(decodeURIComponent(segments[1]));
    if (!asset) return { status: 404, body: { error: "not_found" } };
    return { status: 200, body: asset };
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
    // Balance + nonce only — never wait on the history scan (that blocked the page for 18–40s).
    let balanceHex: string;
    let nonceHex: string;
    try {
      [balanceHex, nonceHex] = await Promise.all([
        evmJsonRpc<string>("eth_getBalance", [addr, "latest"]),
        evmJsonRpc<string>("eth_getTransactionCount", [addr, "latest"]),
      ]);
    } catch {
      return { status: 502, body: { error: "rpc_unavailable" } };
    }
    const balance = weiToPpl(BigInt(balanceHex));
    const nonce = Number.parseInt(nonceHex, 16);
    // Token rows are additive: a failed scan or balance read still returns the native balance.
    const catalog = await discoverTokensOnChain().catch(() => []);
    const tokenBalances = await walletTokenBalances(addr, catalog, search.get("tokens"));
    return {
      status: 200,
      body: {
        balance,
        nonce,
        balances: { ppl: balance, ...tokenBalances },
        outgoingTxs: nonce,
        incomingTxs: 0,
      },
    };
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
      // The registry could not be asked: say so (the client offers a retry) instead of "unknown".
      return { status: 502, body: { error: "rpc_unavailable" } };
    }
    if (!token || !isAddress(token)) {
      if (assetId) return { status: 404, body: { error: "unknown_token" } };
      return { status: 200, body: [] };
    }
    // Only a factory token can be younger than the deployment block; start its scan at its creation
    // block (null = unknown, scan from the deployment block).
    const isSeedToken = Object.values(dep.assetMap).some((addr) => addr && addr.toLowerCase() === token.toLowerCase());
    const creationBlock = isSeedToken ? null : await findTokenCreationBlock(token);
    let holders: Awaited<ReturnType<typeof aggregateHoldersFromTransfers>>;
    try {
      holders = await aggregateHoldersFromTransfers(token, creationBlock ?? undefined);
    } catch {
      // A failed scan is not an empty holder list.
      return { status: 502, body: { error: "rpc_unavailable" } };
    }
    const asset = await loadAsset(assetId ?? token).catch(() => null);
    const decimals = asset?.decimals ?? 18;
    return {
      status: 200,
      body: holders.map((row) => ({
        address: row.address,
        balance: Number(formatUnits(row.balance, decimals)),
        balances: {
          ppl: 0,
          [(assetId ?? token).toLowerCase()]: Number(formatUnits(row.balance, decimals)),
        },
      })),
    };
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
