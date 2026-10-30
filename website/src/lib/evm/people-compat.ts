import { encodeFunctionData, formatUnits, getAddress, isAddress, parseAbi } from "viem";
import { readEvmDeployments } from "@/lib/evm/config";
import {
  fetchBlockByHeight,
  fetchLatestBlockNumber,
  fetchRecentBlocks,
  fetchRecentTransactions,
  fetchTransaction,
} from "@/lib/evm/explorer-blocks";
import { fetchAddressHistory } from "@/lib/evm/address-txs";
import { aggregateHoldersFromTransfers } from "@/lib/evm/transfer-index";
import {
  discoverPoolsOnChain,
  discoverTokensOnChain,
  partialScan,
  scanIsPartial,
  type CatalogPool,
  type CatalogToken,
} from "@/lib/evm/chain-catalog";
import { visibleAssets, visibleNfts, visiblePools } from "@/lib/hidden-assets";
import { enrichAssetRow, seedAssetMeta } from "@/lib/evm/seed-assets";
import { evmJsonRpc, isIncompleteRpcError, isRequestDeadlineError, weiToPpl } from "@/lib/evm/rpc-server";
import { readAllFactoryNfts, readOwnedFactoryNfts, readTokenBalances } from "@/lib/evm/wallet-holdings";
import { loadContractInfo } from "@/lib/evm/contract-info";
import { transferScanIsPartial } from "@/lib/evm/transfer-index";
import { deadlineExpired, runWithRequestDeadline } from "@/lib/evm/request-deadline";

/** Per-read bound for the address summary; the shared RPC default (20 s) is too long for a page. */
const ADDRESS_READ_TIMEOUT_MS = 8_000;

type AssetRow = {
  assetId: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: number;
  creator: string;
  status: string;
  type: string;
  createdAt?: number;
};

function rethrowDeadline(error: unknown): void {
  if (isRequestDeadlineError(error) || deadlineExpired()) throw error;
}

function parseLimit(raw: string | null, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 100);
}

async function erc20String(token: string, selector: string): Promise<string> {
  const addr = getAddress(token);
  const data = selector;
  const out = await evmJsonRpc<string>("eth_call", [{ to: addr, data }, "latest"]).catch((error: unknown) => {
    if (isIncompleteRpcError(error) || isRequestDeadlineError(error)) throw error;
    return "0x";
  });
  if (!out || out === "0x" || out.length < 130) return "";
  const hex = out.slice(130);
  try {
    const bytes = Buffer.from(hex, "hex");
    return bytes.toString("utf8").replace(/\0/g, "").trim();
  } catch {
    return "";
  }
}

async function erc20Uint(token: string, selector: string): Promise<bigint> {
  const addr = getAddress(token);
  const out = await evmJsonRpc<string>("eth_call", [{ to: addr, data: selector }, "latest"]).catch((error: unknown) => {
    if (isIncompleteRpcError(error) || isRequestDeadlineError(error)) throw error;
    return "0x0";
  });
  try {
    return BigInt(out);
  } catch {
    return BigInt(0);
  }
}

/**
 * `eth_call` for an optional getter, distinguishing "contract doesn't expose it" from a real 0:
 * a revert/empty result yields null, so the UI omits the field instead of showing a fabricated 0.
 */
async function optionalUint(token: string, selector: string): Promise<bigint | null> {
  const out = await evmJsonRpc<string>("eth_call", [{ to: getAddress(token), data: selector }, "latest"]).catch((error: unknown) => {
    if (isIncompleteRpcError(error) || isRequestDeadlineError(error)) throw error;
    return null;
  });
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

async function loadAsset(assetId: string): Promise<AssetRow | null> {
  const dep = readEvmDeployments();
  const tokenAddr = dep.assetMap[assetId] ?? (isAddress(assetId) ? assetId : null);
  if (!tokenAddr || !isAddress(tokenAddr)) return null;
  const token = getAddress(tokenAddr);
  const [name, symbol] = await Promise.all([
    erc20String(token, "0x06fdde03"),
    erc20String(token, "0x95d89b41"),
  ]);
  const decimals = Number(await erc20Uint(token, "0x313ce567")) || 18;
  const supplyWei = await erc20Uint(token, "0x18160ddd");
  const base = {
    assetId: assetId.toLowerCase(),
    name: name || assetId,
    symbol: symbol || assetId.slice(0, 6).toUpperCase(),
    decimals,
    totalSupply: Number(formatUnits(supplyWei, decimals)),
    creator: dep.deployer ?? "0x0",
    status: "active",
    type: "token",
  };
  const seed = seedAssetMeta(base.assetId);
  return enrichAssetRow({
    ...base,
    name: seed?.name ?? base.name,
    symbol: seed?.symbol ?? base.symbol,
    decimals: seed?.decimals ?? base.decimals,
  });
}

const IS_PEOPLE_TOKEN_ABI = parseAbi(["function isPeopleToken(address) view returns (bool)"]);

/**
 * Token address for an assetId/address the site knows about, else null. The deployment assetMap
 * is checked first (no RPC); otherwise one `isPeopleToken` eth_call per factory version (current
 * and legacy `tokenFactoryVn`) — never a log scan.
 */
async function resolveKnownToken(assetIdOrAddress: string): Promise<string | null> {
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
  for (const factory of factories) {
    const out = await evmJsonRpc<string>("eth_call", [{ to: factory, data }, "latest"]).catch((error: unknown) => {
      rethrowDeadline(error);
      return "0x";
    });
    if (/^0x0*1$/.test(out ?? "")) return token;
  }
  return null;
}

function deadlineHit(error?: unknown): boolean {
  return isRequestDeadlineError(error) || deadlineExpired();
}

export function handleEvmCompatGet(path: string, search: URLSearchParams): Promise<{ status: number; body: unknown }> {
  return runWithRequestDeadline(() =>
    handleEvmCompatGetInner(path, search).catch((error: unknown) => {
      // Only the shared deadline becomes a partial 200. A single HTTP 503 on a route that does not
      // scan (a transaction lookup) still rejects so callers can tell "node answered 503" from "we stopped".
      if (deadlineHit(error)) return { status: 200, body: { partial: true } };
      throw error;
    }),
  );
}

async function handleEvmCompatGetInner(path: string, search: URLSearchParams): Promise<{ status: number; body: unknown }> {
  const segments = path.replace(/^\//, "").split("/").filter(Boolean);
  const root = segments[0]?.toLowerCase() ?? "";

  if (root === "health") {
    const height = await fetchLatestBlockNumber().catch((error: unknown) => {
      rethrowDeadline(error);
      return 0;
    });
    return { status: 200, body: { status: "ok", chainId: "97401", height } };
  }

  if (root === "blocks" && segments.length === 1) {
    const limit = parseLimit(search.get("limit"), 20);
    const blocks = await fetchRecentBlocks(limit).catch((error: unknown) => {
      rethrowDeadline(error);
      return [];
    });
    return { status: 200, body: blocks };
  }

  if (root === "blocks" && segments[1] && /^\d+$/.test(segments[1])) {
    const height = Number(segments[1]);
    const block = await fetchBlockByHeight(height).catch((error: unknown) => {
      rethrowDeadline(error);
      return null;
    });
    if (!block) return { status: 404, body: { error: "not_found" } };
    return { status: 200, body: block };
  }

  if (root === "transactions" && segments.length === 1) {
    const limit = parseLimit(search.get("limit"), 20);
    const txs = await fetchRecentTransactions(limit).catch((error: unknown) => {
      rethrowDeadline(error);
      return [];
    });
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
    const onChain = await discoverPoolsOnChain().catch((error: unknown) => {
      if (deadlineHit(error) || isIncompleteRpcError(error)) return partialScan<CatalogPool>();
      throw error;
    });
    // Listings only: pools of retired/fixture tokens never reach the swap UI or pool lists.
    const pools = visiblePools(onChain);
    if (scanIsPartial(onChain) || deadlineHit()) return { status: 200, body: { pools, partial: true } };
    return { status: 200, body: pools };
  }

  if (root === "assets" && segments.length === 1) {
    const onChain = await discoverTokensOnChain().catch((error: unknown) => {
      if (deadlineHit(error) || isIncompleteRpcError(error)) return partialScan<CatalogToken>();
      throw error;
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
    if (scanIsPartial(onChain) || deadlineHit()) return { status: 200, body: { assets: mapped, partial: true } };
    if (onChain.length) return { status: 200, body: mapped };
    const dep = readEvmDeployments();
    const rows: AssetRow[] = [];
    for (const assetId of Object.keys(dep.assetMap ?? {})) {
      if (deadlineHit()) return { status: 200, body: { assets: rows, partial: true } };
      try {
        const row = await loadAsset(assetId);
        if (row) rows.push(row);
      } catch (error) {
        if (deadlineHit(error) || isIncompleteRpcError(error)) return { status: 200, body: { assets: rows, partial: true } };
        throw error;
      }
    }
    return { status: 200, body: rows };
  }

  if (root === "assets" && segments[1]) {
    const requested = decodeURIComponent(segments[1]).toLowerCase();
    const onChain = await discoverTokensOnChain().catch((error: unknown) => {
      if (deadlineHit(error) || isIncompleteRpcError(error)) return partialScan<CatalogToken>();
      throw error;
    });
    const hit = onChain.find((t) => t.assetId === requested);
    if (hit) {
      const enriched = enrichAssetRow(hit);
      const partial = scanIsPartial(onChain) || deadlineHit();
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
          ...(partial ? { partial: true } : {}),
        },
      };
    }
    if (scanIsPartial(onChain) || deadlineHit()) return { status: 200, body: { partial: true } };
    try {
      const asset = await loadAsset(decodeURIComponent(segments[1]));
      if (!asset) return { status: 404, body: { error: "not_found" } };
      return { status: 200, body: deadlineHit() ? { ...asset, partial: true } : asset };
    } catch (error) {
      if (deadlineHit(error) || isIncompleteRpcError(error)) return { status: 200, body: { partial: true } };
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
        const partial = deadlineHit() || history.truncated === true && deadlineExpired();
        return {
          status: 200,
          body: {
            items: history.items,
            hasMore: history.hasMore,
            nextBeforeBlock: history.nextBeforeBlock,
            outgoing: history.outgoing,
            incoming: history.incoming,
            truncated: history.truncated ?? false,
            ...(partial ? { partial: true } : {}),
          },
        };
      } catch (error) {
        if (deadlineHit(error)) {
          return {
            status: 200,
            body: { items: [], hasMore: false, outgoing: 0, incoming: 0, truncated: true, partial: true },
          };
        }
        return { status: 502, body: { error: "rpc_unavailable" } };
      }
    }
    // Balance + nonce only — never wait on the history scan (that blocked the page for 18–40s).
    // Each read is independent and time-bounded: one failed read returns the other with
    // `partial: true` instead of failing the whole address with 502.
    const [balanceRead, nonceRead] = await Promise.allSettled([
      evmJsonRpc<string>("eth_getBalance", [addr, "latest"], { timeoutMs: ADDRESS_READ_TIMEOUT_MS }),
      evmJsonRpc<string>("eth_getTransactionCount", [addr, "latest"], { timeoutMs: ADDRESS_READ_TIMEOUT_MS }),
    ]);
    const balance = balanceRead.status === "fulfilled" && balanceRead.value ? weiToPpl(BigInt(balanceRead.value)) : null;
    const nonce = nonceRead.status === "fulfilled" && nonceRead.value ? Number.parseInt(nonceRead.value, 16) : null;
    if (balance === null && nonce === null) {
      const reason = (read: PromiseSettledResult<unknown>) => (read.status === "rejected" ? read.reason : undefined);
      // A node that answered with a JSON-RPC error is still "unavailable". A 503, abort, or the
      // request deadline is an incomplete read: 200 partial, never 502/504.
      if (deadlineHit(reason(balanceRead)) || deadlineHit(reason(nonceRead)) || isIncompleteRpcError(reason(balanceRead)) || isIncompleteRpcError(reason(nonceRead))) {
        return { status: 200, body: { balances: {}, incomingTxs: 0, partial: true } };
      }
      return { status: 502, body: { error: "rpc_unavailable" } };
    }
    // ERC-20 holdings come from live `balanceOf`, not the catalog's own balances (it has none): the
    // wallet lists exactly the keys of `balances`, so without this a created token never shows.
    const dep = readEvmDeployments();
    const catalog = await discoverTokensOnChain().catch((error: unknown) => {
      if (deadlineHit(error) || isIncompleteRpcError(error)) return partialScan<CatalogToken>();
      return [];
    });
    const tokens = [
      ...catalog.map((row) => ({ assetId: row.assetId, address: row.tokenAddress, decimals: row.decimals })),
      ...Object.entries(dep.assetMap ?? {}).map(([assetId, address]) => ({
        assetId,
        address,
        decimals: seedAssetMeta(assetId)?.decimals,
      })),
    ];
    let held: Record<string, number> = {};
    let holdingsIncomplete = scanIsPartial(catalog);
    try {
      held = await readTokenBalances(addr, tokens);
    } catch (error) {
      if (!(deadlineHit(error) || isIncompleteRpcError(error))) throw error;
      holdingsIncomplete = true;
    }
    const partial = balance === null || nonce === null || holdingsIncomplete || deadlineHit();
    return {
      status: 200,
      body: {
        ...(balance === null ? {} : { balance }),
        ...(nonce === null ? {} : { nonce, outgoingTxs: nonce }),
        balances: { ...(balance === null ? {} : { ppl: balance }), ...held },
        incomingTxs: 0,
        ...(partial ? { partial: true } : {}),
      },
    };
  }

  if (root === "accounts") {
    const tokenParam = search.get("token");
    const assetId = search.get("assetId") ?? tokenParam;
    const dep = readEvmDeployments();
    // Holders come from a full Transfer-log scan, so only known tokens (deployment assetMap or
    // the factory registry) may trigger one; an arbitrary address must not buy a chain scan.
    const token = assetId ? await resolveKnownToken(assetId) : (Object.values(dep.assetMap)[0] ?? null);
    if (!token || !isAddress(token)) {
      if (assetId) return { status: 404, body: { error: "unknown_token" } };
      return { status: 200, body: [] };
    }
    let holders: Awaited<ReturnType<typeof aggregateHoldersFromTransfers>> = [];
    try {
      holders = await aggregateHoldersFromTransfers(token);
    } catch (error) {
      if (!(deadlineHit(error) || isIncompleteRpcError(error))) throw error;
      return { status: 200, body: { accounts: [], partial: true } };
    }
    let asset: AssetRow | null = null;
    let assetIncomplete = false;
    try {
      asset = await loadAsset(assetId ?? token);
    } catch (error) {
      if (!(deadlineHit(error) || isIncompleteRpcError(error))) throw error;
      assetIncomplete = true;
    }
    const decimals = asset?.decimals ?? 18;
    const accounts = holders.map((row) => ({
      address: row.address,
      balance: Number(formatUnits(row.balance, decimals)),
      balances: {
        ppl: 0,
        [(assetId ?? token).toLowerCase()]: Number(formatUnits(row.balance, decimals)),
      },
    }));
    if (transferScanIsPartial(holders) || assetIncomplete || deadlineHit()) {
      return { status: 200, body: { accounts, partial: true } };
    }
    return { status: 200, body: accounts };
  }

  if (root === "nfts") {
    const owner = search.get("owner");
    // Real NFTs only, read from the NFT factory's mint logs and confirmed with a live `ownerOf`:
    // the owner's holdings with `?owner=`, otherwise the newest minted tokens. The demo snapshot in
    // the deployment file is never listed.
    const found = await (owner
      ? isAddress(owner) ? readOwnedFactoryNfts(owner) : Promise.resolve([])
      : readAllFactoryNfts()
    ).catch((error: unknown) => {
      rethrowDeadline(error);
      return [];
    });
    const rows = visibleNfts(found);
    // Read per-collection stats once (collections are shared across tokens); absent getters stay
    // undefined so the UI shows only fields the contract actually exposes.
    const collections = [...new Set(rows.map((r) => r.collection).filter((c): c is string => Boolean(c)))];
    const stats = new Map<string, NftCollectionStats>();
    await Promise.all(
      collections.map(async (collection) => {
        try {
          stats.set(collection.toLowerCase(), await nftCollectionStats(collection));
        } catch (error) {
          // One collection's stats must not fail the NFT list that was already read.
          rethrowDeadline(error);
          stats.set(collection.toLowerCase(), {});
        }
      }),
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
      const block = await fetchBlockByHeight(Number(q)).catch((error: unknown) => {
        rethrowDeadline(error);
        return null;
      });
      return { status: 200, body: { blocks: block ? [block] : [], transactions: [], addresses: [] } };
    }
    if (q.startsWith("0x") && q.length === 66) {
      const tx = await fetchTransaction(q).catch((error: unknown) => {
        rethrowDeadline(error);
        return null;
      });
      return { status: 200, body: { blocks: [], transactions: tx ? [tx] : [], addresses: [] } };
    }
    if (isAddress(q)) {
      return { status: 200, body: { blocks: [], transactions: [], addresses: [getAddress(q)] } };
    }
    return { status: 200, body: { blocks: [], transactions: [], addresses: [] } };
  }

  if (root === "contracts" && segments[1] && isAddress(segments[1])) {
    // A failed code read is "node unavailable", not "no contract here": the explorer search uses
    // the 404 to fall back to the plain address page.
    const result = await loadContractInfo(segments[1]);
    if (result.status === "not_found") return { status: 404, body: { error: "not_found" } };
    if (result.status === "unavailable") {
      if (deadlineHit()) return { status: 200, body: { partial: true } };
      return { status: 502, body: { error: "rpc_unavailable" } };
    }
    return { status: 200, body: result.info };
  }

  return { status: 404, body: { error: "not_found" } };
}
