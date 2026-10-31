"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownUp } from "lucide-react";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import { useExternalWallet, writeViaActiveSigner, readPublicClient } from "@/context/ExternalWalletContext";
import { approveErc20IfNeeded } from "@/lib/evm/erc20-allowance";
import { swapCopy } from "@/lib/swap-content";
import { uxCopy, fill, displaySymbol } from "@/lib/ux-copy";
import { useAssetRegistry } from "@/hooks/useAssetRegistry";
import { AssetImage } from "@/components/ui/AssetImage";
import { Eyebrow, Chip } from "@/components/ui/primitives";
import { readEvmDeployments, evmContractsReady } from "@/lib/evm/config";
import { networkJson } from "@/lib/network-client";
import { erc20Abi, pairAbi, routerAbi } from "@/lib/evm/client";
import { ConnectWalletMenu } from "@/components/wallet/ConnectWalletMenu";
import { minAmountOutWithSlippageBaseUnits, quoteExactInBaseUnits } from "@/lib/amm-math";
import { assetDecimals, formatPpl, formatPplDisplay, formatPplExact, fractionOfPplWei, parsePplInput, parseUnits } from "@/lib/asset-amounts";
import { fractionOfBalance, priceImpactPercent, quotePoolSwap, spotTokenPerPpl } from "@/lib/swap-math";
import { isHiddenAssetRow, visiblePools } from "@/lib/hidden-assets";
import { TEST_STABLES, normalizePoolTokenId } from "@/lib/evm/test-stables";
import { SwapTokenPicker } from "@/components/swap/SwapTokenPicker";
import { TokenMarketPanel } from "@/components/market/TokenMarketPanel";
import type { AssetInfo } from "@/lib/asset-amounts";

/** Price impact in percent from wei reserves. The scaled ratio stays inside 1e6. */
function impactPercentFromWei(reserveIn: bigint, amountIn: bigint): number {
  if (reserveIn <= BigInt(0) || amountIn <= BigInt(0)) return 0;
  const scaled = (amountIn * BigInt(1_000_000)) / (reserveIn + amountIn);
  return Number(scaled) / 10_000;
}

/**
 * Pairs created by a legacy AMM factory (`ammFactoryVn`, earlier stacks) must be traded through
 * that stack's router (`routerVn`); everything else uses the live router.
 */
async function routerForPair(pair: string): Promise<Address> {
  const dep = readEvmDeployments();
  const live = dep.contracts.router as Address;
  if (!isAddress(pair)) return live;
  const staticPool = dep.pools.find((p) => p.poolId.toLowerCase() === pair.toLowerCase()) as
    | { router?: string }
    | undefined;
  if (staticPool?.router && isAddress(staticPool.router)) return getAddress(staticPool.router);
  try {
    const factory = (await readPublicClient().readContract({
      address: getAddress(pair),
      abi: [{ type: "function", name: "factory", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const,
      functionName: "factory",
    })) as Address;
    for (const [key, addr] of Object.entries(dep.contracts)) {
      const m = /^ammFactory(V\d+)$/.exec(key);
      if (!m || !addr || addr.toLowerCase() !== factory.toLowerCase()) continue;
      const legacyRouter = dep.contracts[`router${m[1]}`];
      if (legacyRouter && isAddress(legacyRouter)) return getAddress(legacyRouter);
    }
    return live;
  } catch {
    return live;
  }
}


export type PoolRow = {
  poolId: string;
  tokenAssetId: string;
  tokenAddress: Address;
  nativeReserve: number;
  tokenReserve: number;
};

type RawPoolRow = { poolId: string; tokenAssetId: string; tokenAddress?: string; nativeReserve: number | string; tokenReserve: number | string };

/** Shared by the SSR-seeded initial props and every client refresh, so both agree on shape. */
function mapPoolRows(rows: RawPoolRow[]): PoolRow[] {
  const mapped = rows
    .filter((p) => p.tokenAddress || p.tokenAssetId)
    .map((p) =>
      normalizePoolTokenId({
        poolId: p.poolId,
        tokenAssetId: p.tokenAssetId,
        tokenAddress: (p.tokenAddress ?? p.tokenAssetId) as Address,
        nativeReserve: Number(p.nativeReserve),
        tokenReserve: Number(p.tokenReserve),
      }),
    );
  return visiblePools(mapped).sort((a, b) => b.nativeReserve - a.nativeReserve);
}

/**
 * The default token on the "you receive" side: tUSDC, then tUSDT, then the deepest pool. When the
 * pool list is not available yet (the SSR prefetch timed out, the node is unreachable, the cache
 * is cold) it still returns tUSDC rather than an empty id, so the receive side renders a real
 * token with its brand icon instead of a bare "—" placeholder.
 */
function preferredTokenId(pools: PoolRow[]): string {
  const stable = TEST_STABLES.map((s) => pools.find((p) => p.tokenAssetId === s.assetId)).find(Boolean);
  return (stable ?? pools[0])?.tokenAssetId ?? TEST_STABLES[0].assetId;
}

const SLIPPAGE_CHOICES = [50, 100, 300] as const;
const SMALL_POOL_PPL = 100;
const EVM_SWAP_FEE_PPL = 0;

const inputClass =
  "w-full rounded-xl border border-line bg-canvas px-3 py-3 text-lg font-semibold text-ink outline-none focus:border-brand";
const chipBtn =
  "min-h-9 rounded-lg border border-line px-2.5 text-xs font-semibold text-ink-2 hover:border-brand hover:text-ink disabled:opacity-40";

function resolveTokenContract(assetId: string, pool: PoolRow | null, dep: ReturnType<typeof readEvmDeployments>): Address | null {
  if (pool?.tokenAddress) return pool.tokenAddress;
  const mapped = dep.assetMap?.[assetId];
  if (mapped && isAddress(mapped)) return getAddress(mapped);
  if (isAddress(assetId)) return getAddress(assetId);
  return null;
}

export function EvmSwapApp({ initialPools, initialAssets }: { initialPools?: RawPoolRow[]; initialAssets?: AssetInfo[] } = {}) {
  const { lang } = useLanguage();
  const t = swapCopy[lang];
  const u = uxCopy[lang];
  const assets = useAssetRegistry(initialAssets);
  const { session } = useWallet();
  const { signer, connectEmbedded } = useExternalWallet();
  const dep = readEvmDeployments();

  // Seeded from the SSR prefetch so the first paint already has the pool list; `tokenId` is seeded
  // from the same rows rather than left empty for the effect below to fill in, which keeps the
  // receive side from rendering "—" in the server HTML (and forever, if the client fetch fails).
  const [pools, setPools] = useState<PoolRow[]>(() => (initialPools?.length ? mapPoolRows(initialPools) : []));
  const [tokenId, setTokenId] = useState(() => preferredTokenId(initialPools?.length ? mapPoolRows(initialPools) : []));
  const [pplIn, setPplIn] = useState(true);
  const [amountText, setAmountText] = useState("");
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [pplBalanceWei, setPplBalanceWei] = useState<bigint>(BigInt(0));
  const [tokenBalanceUnits, setTokenBalanceUnits] = useState<bigint>(BigInt(0));
  const [wpplAddress, setWpplAddress] = useState<Address | null>(null);
  const [pairReserves, setPairReserves] = useState<{ reserve0: bigint; reserve1: bigint; token0: Address } | null>(
    null
  );
  const [reachable, setReachable] = useState(true);
  const [poolsLoaded, setPoolsLoaded] = useState(Boolean(initialPools?.length));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSide, setPickerSide] = useState<"in" | "out">("in");
  const [defaultApplied, setDefaultApplied] = useState(false);

  useEffect(() => {
    if (session && !signer) connectEmbedded();
  }, [session, signer, connectEmbedded]);

  // Test stables are not part of the asset registry (they are not factory tokens), so their
  // metadata is merged in here for symbol/decimals only — see `test-stables.ts`.
  const metaById = useMemo(() => {
    const stables: Record<string, AssetInfo> = {};
    for (const stable of TEST_STABLES) {
      stables[stable.assetId] = {
        assetId: stable.assetId,
        tokenAddress: stable.tokenAddress,
        symbol: stable.symbol,
        name: stable.name,
        decimals: stable.decimals,
      };
    }
    return { ...stables, ...assets };
  }, [assets]);
  const metaFor = useCallback((id: string | null | undefined): AssetInfo | undefined => {
    if (!id) return undefined;
    return metaById[id.toLowerCase()];
  }, [metaById]);

  // Only pooled tokens are offerable: a picker entry without a pool cannot be swapped and used to
  // produce the "no PPL pool for this token" dead end. Fixture/E2E tokens are denied here too.
  const tokenOptions = useMemo(() => {
    const seen = new Set<string>();
    const rows: AssetInfo[] = [];
    for (const pool of pools) {
      const id = pool.tokenAssetId.toLowerCase();
      if (id === "ppl" || seen.has(id)) continue;
      seen.add(id);
      const meta = metaFor(id);
      const row: AssetInfo = {
        assetId: id,
        tokenAddress: pool.tokenAddress,
        symbol: meta?.symbol,
        name: meta?.name,
        decimals: meta?.decimals,
        creationMetadata: meta?.creationMetadata,
      };
      if (!isHiddenAssetRow(row)) rows.push(row);
    }
    // Stables first (default PPL+stable pairs), then the rest alphabetically.
    const stableRank = (id: string) => {
      const i = TEST_STABLES.findIndex((s) => s.assetId === id);
      return i === -1 ? TEST_STABLES.length : i;
    };
    return rows.sort(
      (a, b) =>
        stableRank(a.assetId) - stableRank(b.assetId) ||
        (a.symbol ?? a.assetId).localeCompare(b.symbol ?? b.assetId),
    );
  }, [pools, metaFor]);

  // Re-aligns the default once the client fetch returns real pool rows: applies once, and never
  // overrides a selection that already has a pool. `tokenId` starts at the SSR default (tUSDC), so
  // this only has work to do if that token turns out to have no pool.
  useEffect(() => {
    if (defaultApplied || !pools.length) return;
    if (tokenId && pools.some((p) => p.tokenAssetId === tokenId)) {
      setDefaultApplied(true);
      return;
    }
    setTokenId(preferredTokenId(pools));
    setDefaultApplied(true);
  }, [pools, tokenId, defaultApplied]);

  const selectedPool =
    pools.find((p) => p.tokenAssetId === tokenId) ??
    pools.find((p) => p.tokenAddress.toLowerCase() === tokenId.toLowerCase()) ??
    null;

  const tokenAsset = metaFor(tokenId) ?? tokenOptions.find((a) => a.assetId === tokenId);
  const decimals = assetDecimals(tokenAsset);
  const tokenSymbol = tokenId ? displaySymbol(tokenId, tokenAsset?.symbol, u) : "—";
  const tokenContract = tokenId ? resolveTokenContract(tokenId, selectedPool, dep) : null;

  const loadPools = useCallback(async () => {
    try {
      const rows = await networkJson<RawPoolRow[]>("liquidity-pools");
      setPools(mapPoolRows(Array.isArray(rows) ? rows : []));
      setReachable(true);
    } catch {
      setReachable(false);
    } finally {
      setPoolsLoaded(true);
    }
  }, []);

  // One batched tick per interval instead of three independent 12 s effects. Balances and pair
  // reserves are read concurrently (`Promise.all`), removing the getBalance -> balanceOf
  // waterfall that serialised the two reads on every refresh.
  const poolId = selectedPool?.poolId ?? null;
  const refreshChain = useCallback(async () => {
    const client = readPublicClient();
    const balances = (async () => {
      if (!signer) {
        setPplBalanceWei(BigInt(0));
        setTokenBalanceUnits(BigInt(0));
        return;
      }
      const [native, tokenBal] = await Promise.all([
        client.getBalance({ address: signer.address }).catch(() => BigInt(0)),
        tokenContract
          ? client
              .readContract({ address: tokenContract, abi: erc20Abi, functionName: "balanceOf", args: [signer.address] })
              .catch(() => BigInt(0))
          : Promise.resolve(BigInt(0)),
      ]);
      setPplBalanceWei(native);
      setTokenBalanceUnits(tokenBal as bigint);
    })();

    // Pair reserves straight from the chain, read fresh right before quoting/signing: the
    // `/api/evm/compat/liquidity-pools` snapshot used for display can be stale or spoofed, and
    // minOut must be computed against what the contract will actually see.
    const reserves = (async () => {
      if (!poolId) {
        setPairReserves(null);
        return;
      }
      try {
        const [rawReserves, token0] = await Promise.all([
          client.readContract({ address: poolId as Address, abi: pairAbi, functionName: "getReserves" }),
          client.readContract({ address: poolId as Address, abi: pairAbi, functionName: "token0" }),
        ]);
        const [reserve0, reserve1] = rawReserves as readonly [bigint, bigint, number];
        setPairReserves({ reserve0, reserve1, token0: token0 as Address });
      } catch {
        setPairReserves(null);
      }
    })();

    await Promise.all([loadPools(), balances, reserves]);
  }, [loadPools, signer, tokenContract, poolId]);

  useEffect(() => {
    void refreshChain();
    const id = setInterval(() => void refreshChain(), 12_000);
    return () => clearInterval(id);
  }, [refreshChain]);

  useEffect(() => {
    if (!dep.contracts.router) return;
    let cancelled = false;
    void readPublicClient()
      .readContract({ address: dep.contracts.router as Address, abi: routerAbi, functionName: "WETH" })
      .then((w) => {
        if (!cancelled) setWpplAddress(w as Address);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [dep.contracts.router]);

  const tokenBalance = Number(tokenBalanceUnits) / 10 ** decimals;

  // `amountIn` stays a human number for price-impact preview. PPL amounts are parsed and
  // compared in wei; `amountInBaseUnits` is what the quote and the transaction use.
  const parsed = useMemo(() => {
    const text = amountText.trim();
    if (!text || !selectedPool) return { kind: "empty" as const };
    if (pplIn) {
      const amountInBaseUnits = parsePplInput(text);
      if (amountInBaseUnits === null) return { kind: "invalid" as const };
      if (amountInBaseUnits <= BigInt(0)) return { kind: "empty" as const };
      return { kind: "ok" as const, amountIn: 0, amountInBaseUnits };
    }
    const units = parseUnits(text, decimals);
    return units && units > 0
      ? { kind: "ok" as const, amountIn: units / 10 ** decimals, amountInBaseUnits: BigInt(units) }
      : { kind: "invalid" as const };
  }, [amountText, pplIn, decimals, selectedPool]);

  // Preview only. The compat API reports reserves as human amounts, so the quote runs in
  // base units (see `quotePoolSwap`); the amount actually sent on-chain is guarded by
  // `bigintQuote` below, computed from reserves read straight from the pair.
  const quote = useMemo(() => {
    if (!selectedPool || parsed.kind !== "ok") return null;
    const reserveIn = pplIn ? selectedPool.nativeReserve : selectedPool.tokenReserve;
    const q = quotePoolSwap({
      nativeReserve: selectedPool.nativeReserve,
      tokenReserve: selectedPool.tokenReserve,
      decimals,
      pplIn,
      amountInBaseUnits: parsed.amountInBaseUnits,
      slippageBps,
    });
    if (!q) return null;
    let impact = priceImpactPercent(reserveIn, parsed.amountIn);
    if (pplIn && pairReserves && wpplAddress) {
      const wpplIsToken0 = pairReserves.token0.toLowerCase() === wpplAddress.toLowerCase();
      const reserveWppl = wpplIsToken0 ? pairReserves.reserve0 : pairReserves.reserve1;
      impact = impactPercentFromWei(reserveWppl, parsed.amountInBaseUnits);
    }
    return { ...q, impact };
  }, [selectedPool, parsed, pplIn, slippageBps, decimals, pairReserves, wpplAddress]);

  // The real slippage guard sent on-chain: computed in bigint base units from reserves read
  // straight from the pair contract (see the effect above), independent of `quote`'s
  // float/scale math above, which is for preview only and can throw for non-6-decimal tokens.
  const bigintQuote = useMemo(() => {
    if (!pairReserves || !wpplAddress || parsed.kind !== "ok") return null;
    const wpplIsToken0 = pairReserves.token0.toLowerCase() === wpplAddress.toLowerCase();
    const reserveWppl = wpplIsToken0 ? pairReserves.reserve0 : pairReserves.reserve1;
    const reserveToken = wpplIsToken0 ? pairReserves.reserve1 : pairReserves.reserve0;
    const reserveIn = pplIn ? reserveWppl : reserveToken;
    const reserveOut = pplIn ? reserveToken : reserveWppl;
    try {
      const amountOut = quoteExactInBaseUnits(reserveIn, reserveOut, parsed.amountInBaseUnits);
      const amountOutMin = minAmountOutWithSlippageBaseUnits(amountOut, slippageBps);
      return { amountOut, amountOutMin };
    } catch {
      return null;
    }
  }, [pairReserves, wpplAddress, parsed, pplIn, slippageBps]);

  // All quote amounts are human numbers now, so both directions format the same way (wei
  // and 10^decimals scaling already happened in `quotePoolSwap`).
  const fmtIn = (v: number) => formatPpl(v);
  const fmtOut = (v: number) => formatPpl(v);
  const symIn = pplIn ? "PPL" : tokenSymbol;
  const symOut = pplIn ? tokenSymbol : "PPL";
  const spotTokensPerPpl = selectedPool ? spotTokenPerPpl(selectedPool) : 0;

  let blocker: string | null = null;
  if (!tokenId) blocker = u.chooseToken;
  else if (!selectedPool) blocker = u.chooseToken;
  else if (parsed.kind === "empty") blocker = u.enterAmount;
  else if (parsed.kind === "invalid") blocker = u.enterAmount;
  else if (signer) {
    if (pplIn && parsed.amountInBaseUnits > pplBalanceWei) blocker = fill(u.insufficient, { symbol: "PPL" });
    else if (!pplIn && parsed.amountIn > tokenBalance) blocker = fill(u.insufficient, { symbol: tokenSymbol });
  }
  if (!blocker && parsed.kind === "ok" && selectedPool) {
    if (!quote || quote.amountOut <= 0) blocker = u.tooSmall;
    else if (quote.amountOut >= (pplIn ? selectedPool.tokenReserve : selectedPool.nativeReserve)) blocker = u.tooBig;
  }

  const setFraction = (fraction: number) => {
    if (!signer) return;
    if (pplIn) {
      const parts = BigInt(Math.round(fraction * 100));
      setAmountText(formatPplExact(fractionOfPplWei(pplBalanceWei, BigInt(0), parts, BigInt(100))));
      return;
    }
    setAmountText(
      fractionOfBalance({
        fraction,
        pplIn,
        pplBalance: 0,
        tokenBalance,
        decimals,
        fee: EVM_SWAP_FEE_PPL,
        pplWholeOnly: false,
      })
    );
  };

  const swap = async () => {
    if (!signer || !selectedPool || parsed.kind !== "ok" || !quote || !dep.contracts.router || !tokenContract) return;
    // amountOutMin must come from bigintQuote (on-chain reserves, bigint base units): the
    // float-based `quote.minOut` above is display-only and was once sent to the contract
    // directly as base units, which under-protected slippage by 10^decimals for any token
    // whose decimals weren't 6 (see M09-1). Refuse to swap rather than fall back to that.
    if (!wpplAddress || !bigintQuote) {
      setError(t.error);
      return;
    }
    setBusy(true);
    setError("");
    setTxHash("");
    try {
      const router = await routerForPair(selectedPool.poolId);
      const wppl = wpplAddress;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      let hash: Hex;
      if (pplIn) {
        hash = await writeViaActiveSigner(signer, {
          address: router,
          abi: routerAbi,
          functionName: "swapExactETHForTokens",
          args: [bigintQuote.amountOutMin, [wppl, tokenContract], signer.address, deadline],
          value: parsed.amountInBaseUnits,
        });
      } else {
        const client = readPublicClient();
        const routerAddress = router;
        const approved = await approveErc20IfNeeded({
          amount: parsed.amountInBaseUnits,
          readAllowance: () =>
            client.readContract({
              address: tokenContract,
              abi: erc20Abi,
              functionName: "allowance",
              args: [signer.address, routerAddress],
            }),
          approve: () =>
            writeViaActiveSigner(signer, {
              address: tokenContract,
              abi: erc20Abi,
              functionName: "approve",
              args: [routerAddress, parsed.amountInBaseUnits],
            }),
          waitForReceipt: (approveHash) => client.waitForTransactionReceipt({ hash: approveHash }),
        });
        if (!approved.ok) {
          throw new Error(approved.reason === "reverted" ? "approval reverted" : "allowance unchanged");
        }
        hash = await writeViaActiveSigner(signer, {
          address: router,
          abi: routerAbi,
          functionName: "swapExactTokensForETH",
          args: [parsed.amountInBaseUnits, bigintQuote.amountOutMin, [tokenContract, wppl], signer.address, deadline],
        });
      }
      setTxHash(hash);
      const { recordFounderAction } = await import("@/lib/founders/client");
      void recordFounderAction("swap", hash);
      void refreshChain();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  };

  const openPicker = (side: "in" | "out") => {
    setPickerSide(side);
    setPickerOpen(true);
  };

  const pickToken = (id: string) => {
    setTokenId(id);
    setAmountText("");
    if (pickerSide === "in" && !pplIn) return;
    if (pickerSide === "out" && pplIn) setPplIn(false);
  };

  if (!evmContractsReady()) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-ink-2">{t.noRpc}</p>
        <p className="mt-2 text-sm text-ink-3">{t.networkBadge}</p>
      </div>
    );
  }

  const showConnect = !signer && !session;

  return (
    <section className="relative mx-auto max-w-5xl overflow-hidden px-4 py-12 sm:px-6 lg:px-8">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(45%_70%_at_85%_0%,rgba(245,158,11,0.14),transparent_70%),radial-gradient(35%_55%_at_0%_10%,rgba(3,105,161,0.10),transparent_70%)] dark:bg-[radial-gradient(45%_70%_at_85%_0%,rgba(251,191,36,0.12),transparent_70%),radial-gradient(35%_55%_at_0%_10%,rgba(76,196,248,0.12),transparent_70%)]"
        aria-hidden="true"
      />
      <div className="relative">
      <Eyebrow>{t.tag}</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold tracking-tight text-ink">{t.title}</h1>
      <p className="mt-3 max-w-2xl text-lead text-ink-2">{t.lead}</p>
      <Chip tone="value" className="mt-4">{t.networkBadge}</Chip>
      {!reachable ? <p className="mt-4 text-sm text-warm">{t.noRpc}</p> : null}
      </div>

      <div className="relative mt-10 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="surface-elevated rounded-3xl p-6">
          <h2 className="text-lg font-semibold">{t.poolsTitle}</h2>
          {!poolsLoaded ? (
            <div className="mt-4 space-y-3" aria-busy="true" data-testid="swap-pools-skeleton">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-2" />
              ))}
            </div>
          ) : pools.length === 0 ? (
            <p className="mt-3 text-sm text-ink-3">{t.poolsEmpty}</p>
          ) : null}
          <ul className="mt-4 space-y-3">
            {pools.map((pool) => {
              const a = metaFor(pool.tokenAssetId) ?? { assetId: pool.tokenAssetId };
              const sym = displaySymbol(pool.tokenAssetId, a.symbol, u);
              const active = tokenId === pool.tokenAssetId;
              return (
                <li key={pool.poolId}>
                  <button
                    type="button"
                    onClick={() => {
                      setTokenId(pool.tokenAssetId);
                      setAmountText("");
                    }}
                    aria-pressed={active}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm ${active ? "border-brand bg-surface-2" : "border-line hover:border-line-strong"}`}
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      <span className="flex -space-x-2">
                        <AssetImage assetId={pool.tokenAssetId} tokenAddress={pool.tokenAddress} src={a.creationMetadata?.image} name={sym} className="h-7 w-7" testBadgeLabel={u.testTokenNote} />
                        <AssetImage assetId="ppl" name="PPL" className="h-7 w-7" />
                      </span>
                      {sym} / PPL
                    </div>
                    <p className="mt-1 text-ink-3">
                      {u.poolDepth}: {formatPpl(pool.tokenReserve)} {sym} · {formatPpl(pool.nativeReserve)} PPL
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
          <h3 className="mt-8 text-sm font-semibold text-ink">{t.selectToken}</h3>
          {tokenOptions.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">{t.tokensEmpty}</p>
          ) : (
            <ul className="mt-2 max-h-96 space-y-1 overflow-y-auto text-sm" data-testid="swap-token-list">
              {tokenOptions.map((row) => (
                <li key={row.assetId}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${tokenId === row.assetId ? "bg-brand/10 font-semibold" : "hover:bg-surface"}`}
                    onClick={() => {
                      setTokenId(row.assetId);
                      setAmountText("");
                    }}
                  >
                    <AssetImage assetId={row.assetId} tokenAddress={row.tokenAddress} src={row.creationMetadata?.image} name={displaySymbol(row.assetId, row.symbol, u)} className="h-6 w-6" testBadgeLabel={u.testTokenNote} />
                    {displaySymbol(row.assetId, row.symbol, u)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="surface-elevated rounded-3xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t.swapTitle}</h2>
            {selectedPool ? (
              <span className="text-xs text-ink-3" data-testid="swap-pool-depth">
                {u.poolDepth}: {formatPpl(selectedPool.tokenReserve)} {tokenSymbol} · {formatPpl(selectedPool.nativeReserve)} PPL
              </span>
            ) : null}
          </div>
          {selectedPool && selectedPool.nativeReserve < SMALL_POOL_PPL ? (
            <p className="mt-2 text-xs text-warm">{u.smallPool}</p>
          ) : null}

          {showConnect ? (
            <div className="mt-6">
              <ConnectWalletMenu />
            </div>
          ) : (
            <>
              <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-center justify-between gap-2 text-sm text-ink-3">
                  <span>{t.tokenIn}</span>
                  {signer ? (
                    <span data-testid="swap-balance-in" title={pplIn ? `${formatPplExact(pplBalanceWei)} PPL` : undefined}>
                      {fill(u.balance, {
                        amount: pplIn
                          ? `${formatPplDisplay(pplBalanceWei)} PPL`
                          : `${fmtIn(tokenBalance)} ${symIn}`,
                      })}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    className="flex shrink-0 items-center gap-1 rounded-xl border border-line bg-canvas px-2 py-1.5 text-sm font-semibold hover:border-brand"
                    onClick={() => (pplIn ? undefined : openPicker("in"))}
                    disabled={pplIn}
                    aria-label={t.selectToken}
                  >
                    <AssetImage
                      assetId={pplIn ? "ppl" : tokenId}
                      tokenAddress={pplIn ? undefined : tokenAsset?.tokenAddress}
                      src={pplIn ? undefined : tokenAsset?.creationMetadata?.image}
                      name={symIn}
                      className="h-8 w-8"
                      testBadgeLabel={u.testTokenNote}
                    />
                    {!pplIn ? <span className="max-w-[5rem] truncate">{symIn}</span> : <span>PPL</span>}
                  </button>
                  <input
                    aria-label={t.amountIn}
                    data-testid="swap-amount"
                    className={inputClass}
                    value={amountText}
                    placeholder="0"
                    onChange={(e) => setAmountText(e.target.value.replace(",", "."))}
                    inputMode="decimal"
                    autoComplete="off"
                  />
                </div>
                {signer ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[0.25, 0.5, 0.75].map((f) => (
                      <button key={f} type="button" className={chipBtn} disabled={busy} onClick={() => setFraction(f)}>
                        {f * 100}%
                      </button>
                    ))}
                    <button type="button" className={chipBtn} disabled={busy} onClick={() => setFraction(1)}>
                      {u.max}
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="relative z-10 -my-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setPplIn((v) => !v);
                    setAmountText("");
                  }}
                  aria-label={u.flip}
                  title={u.flip}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-canvas text-ink-2 hover:border-brand hover:text-ink"
                >
                  <ArrowDownUp className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-center justify-between gap-2 text-sm text-ink-3">
                  <span>{t.tokenOut}</span>
                  {signer ? (
                    <span data-testid="swap-balance-out" title={!pplIn ? `${formatPplExact(pplBalanceWei)} PPL` : undefined}>
                      {fill(u.balance, {
                        amount: pplIn
                          ? `${fmtOut(tokenBalance)} ${symOut}`
                          : `${formatPplDisplay(pplBalanceWei)} PPL`,
                      })}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    className="flex shrink-0 items-center gap-1 rounded-xl border border-line bg-canvas px-2 py-1.5 text-sm font-semibold hover:border-brand"
                    onClick={() => (pplIn ? openPicker("out") : undefined)}
                    disabled={!pplIn}
                    aria-label={t.selectToken}
                  >
                    <AssetImage
                      assetId={pplIn ? tokenId : "ppl"}
                      tokenAddress={pplIn ? tokenAsset?.tokenAddress : undefined}
                      src={pplIn ? tokenAsset?.creationMetadata?.image : undefined}
                      name={symOut}
                      className="h-8 w-8"
                      testBadgeLabel={u.testTokenNote}
                    />
                    {pplIn ? <span className="max-w-[5rem] truncate">{symOut}</span> : <span>PPL</span>}
                  </button>
                  <span
                    className="min-w-0 flex-1 truncate text-lg font-semibold text-ink"
                    data-testid="swap-out"
                    title={!pplIn && bigintQuote ? `${formatPplExact(bigintQuote.amountOut)} PPL` : undefined}
                  >
                    {quote
                      ? !pplIn && bigintQuote
                        ? formatPplDisplay(bigintQuote.amountOut)
                        : fmtOut(quote.amountOut)
                      : "0"}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-ink" data-testid="swap-selected-symbol">{symOut}</span>
                </div>
              </div>

              <dl className="mt-4 space-y-1.5 text-sm">
                {selectedPool ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-3">{u.rate}</dt>
                    <dd className="text-right" data-testid="swap-rate">
                      1 PPL = {formatPpl(spotTokensPerPpl)} {tokenSymbol}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">{u.receiveApprox}</dt>
                  <dd className="text-right font-semibold" title={!pplIn && bigintQuote ? `${formatPplExact(bigintQuote.amountOut)} PPL` : undefined}>
                    {quote
                      ? !pplIn && bigintQuote
                        ? `${formatPplDisplay(bigintQuote.amountOut)} PPL`
                        : `${fmtOut(quote.amountOut)} ${symOut}`
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">{u.minReceived}</dt>
                  <dd className="text-right" title={!pplIn && bigintQuote ? `${formatPplExact(bigintQuote.amountOutMin)} PPL` : undefined}>
                    {quote
                      ? !pplIn && bigintQuote
                        ? `${formatPplDisplay(bigintQuote.amountOutMin)} PPL`
                        : `${fmtOut(quote.minOut)} ${symOut}`
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">{u.priceImpact}</dt>
                  <dd
                    data-testid="swap-impact"
                    className={`text-right font-semibold ${quote && quote.impact > 15 ? "text-red-500" : quote && quote.impact > 5 ? "text-amber-500" : ""}`}
                  >
                    {quote ? `${quote.impact < 0.01 ? "<0.01" : quote.impact.toFixed(2)}%` : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">{u.networkFee}</dt>
                  <dd className="text-right">{t.gasFeeNote}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">{u.poolFee}</dt>
                  <dd className="text-right">
                    {quote && parsed.kind === "ok"
                      ? pplIn
                        ? `${formatPplDisplay((parsed.amountInBaseUnits * BigInt(30)) / BigInt(10_000))} PPL`
                        : `${fmtIn((parsed.amountIn * 30) / 10_000)} ${symIn}`
                      : "—"}
                  </dd>
                </div>
              </dl>
              {quote && quote.impact > 15 ? (
                <p role="alert" className="mt-3 rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-500">{u.impactDanger}</p>
              ) : quote && quote.impact > 5 ? (
                <p className="mt-3 rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">{u.impactWarn}</p>
              ) : null}

              <div className="mt-4">
                <p className="text-sm text-ink-3">{u.slippage}</p>
                <div className="mt-2 flex gap-2" role="radiogroup" aria-label={u.slippage}>
                  {SLIPPAGE_CHOICES.map((bps) => (
                    <button
                      key={bps}
                      type="button"
                      role="radio"
                      aria-checked={slippageBps === bps}
                      onClick={() => setSlippageBps(bps)}
                      className={`min-h-9 rounded-lg border px-3 text-sm font-semibold ${slippageBps === bps ? "border-brand bg-brand text-brand-ink" : "border-line text-ink-2 hover:border-line-strong"}`}
                    >
                      {bps / 100}%
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-ink-3">{u.slippageHint}</p>
              </div>

              <div className="mt-5">
                {!signer ? (
                  <ConnectWalletMenu />
                ) : (
                  <button
                    type="button"
                    data-testid="swap-submit"
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand px-4 text-base font-semibold text-brand-ink disabled:opacity-50"
                    onClick={() => void swap()}
                    disabled={busy || Boolean(blocker)}
                  >
                    {busy ? u.sending : blocker ?? u.swapNow}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {tokenContract ? <TokenMarketPanel tokenAddress={tokenContract} symbol={tokenSymbol} className="mt-8" /> : null}

      <SwapTokenPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        tokens={tokenOptions}
        selectedId={tokenId}
        onSelect={pickToken}
        labels={{ title: t.selectToken, search: t.searchTokens, empty: t.tokensEmpty, close: t.closePicker }}
        ux={u}
      />

      {error ? <p className="mt-4 text-sm text-warm">{error}</p> : null}
      {txHash ? (
        <p className="mt-4 text-sm text-value">
          {t.success}{" "}
          <Link href={`/explorer/tx/${txHash}`} className="underline">
            {txHash.slice(0, 18)}…
          </Link>
        </p>
      ) : null}
      <p className="mt-6 text-xs text-ink-3">{t.helpK}</p>
    </section>
  );
}
