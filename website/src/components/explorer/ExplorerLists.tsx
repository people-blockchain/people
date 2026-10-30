"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { explorerCopy } from "@/lib/explorer-copy";
import { networkJson } from "@/lib/network-client";
import { loadExplorerRead, showNetworkUnavailable } from "@/lib/explorer-load";
import { NetworkStatus } from "@/components/NetworkStatus";
import { Eyebrow } from "@/components/ui/primitives";
import { AssetImage } from "@/components/ui/AssetImage";
import { SkeletonRows } from "./ExplorerSkeleton";
import { uxCopy, displaySymbol } from "@/lib/ux-copy";
import { displayAssetName, visibleAssets, visibleNfts, visiblePools } from "@/lib/hidden-assets";
import { ExplorerSubnav } from "./ExplorerSubnav";
import { assetDecimals, formatAssetUnits, formatPpl } from "@/lib/asset-amounts";

export type TokenRow = {
  assetId: string;
  tokenAddress?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: number;
  type?: string;
  creationMetadata?: { image?: unknown; description?: unknown };
};
export type PoolRow = { poolId?: string; tokenAssetId: string; tokenReserve: number; nativeReserve: number };

/**
 * `initialAssets`/`initialPools` are the rows the server already read through the same cached
 * compat route (see `app/explorer/tokens/page.tsx`): seeding state from them paints real tokens on
 * the first frame instead of a skeleton that waits for hydration. The effect below still refreshes
 * in the background, so a stale prefetch corrects itself — and when nothing was prefetched (another
 * chain backend, or an RPC that missed the SSR budget) the skeleton behaves exactly as before.
 */
export function TokenList({ initialAssets, initialPools }: { initialAssets?: TokenRow[]; initialPools?: PoolRow[] } = {}) {
  const { lang } = useLanguage();
  const t = explorerCopy[lang];
  const u = uxCopy[lang];
  const prefetched = Boolean(initialAssets?.length);
  const [items, setItems] = useState<TokenRow[]>(() => visibleAssets(initialAssets ?? []));
  const [pools, setPools] = useState<PoolRow[]>(() => visiblePools(initialPools ?? []));

  const [loading, setLoading] = useState(!prefetched);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    // Assets and pools are independent. A failed pool read must not badge the token list, and a
    // failed asset read must not badge it either once rows (including a prefetch) are on screen.
    void loadExplorerRead((signal) => networkJson<TokenRow[]>("assets", { signal }))
      .then((result) => {
        if (!alive) return;
        if (result.ok) setItems(Array.isArray(result.value) ? visibleAssets(result.value) : []);
        else if (!result.missing && !prefetched) setFailed(true);
      })
      .finally(() => { if (alive) setLoading(false); });
    void loadExplorerRead((signal) => networkJson<PoolRow[]>("liquidity-pools", { signal }))
      .then((result) => {
        if (alive && result.ok) setPools(Array.isArray(result.value) ? visiblePools(result.value) : []);
      });
    return () => { alive = false; };
  }, [prefetched]);

  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Eyebrow>
        <Link href="/explorer">{t.title}</Link>
      </Eyebrow>
      <h1 className="mt-3 text-h2 font-bold">{t.tokens}</h1>
      <ExplorerSubnav />
      <div className="mt-4">
        <NetworkStatus />
      </div>
      {showNetworkUnavailable(failed, items.length) ? <p role="alert" className="mt-6 text-warm">{t.networkUnavailable}</p> : null}
      {loading ? <SkeletonRows /> : null}
      <ul className="mt-6 divide-y divide-line rounded-2xl border border-line" data-testid="token-list" aria-busy={loading} hidden={loading}>
        {!loading && !showNetworkUnavailable(failed, items.length) && items.length === 0 ? <li className="px-4 py-3 text-sm text-ink-3">{t.empty}</li> : null}
        {items.map((asset) => {
          const decimals = assetDecimals(asset);
          const isNative = asset.assetId === "ppl";
          const sym = displaySymbol(asset.assetId, asset.symbol, u);
          const pool = pools
            .filter((p) => p.tokenAssetId === asset.assetId)
            .sort((a, b) => b.nativeReserve - a.nativeReserve)[0];
          return (
            <li id={asset.assetId} key={asset.assetId} className="flex gap-4 px-4 py-4 text-sm">
              <AssetImage
                assetId={asset.assetId}
                tokenAddress={asset.tokenAddress}
                src={asset.creationMetadata?.image}
                name={sym}
                className="h-12 w-12"
                testBadgeLabel={u.testTokenNote}
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  <Link href={`/explorer/token/${encodeURIComponent(asset.assetId)}`} className="text-brand hover:underline">{asset.assetId === "usdt" ? u.testUsdt : displayAssetName(asset.assetId, asset.name)}</Link>
                </p>
                <p className="break-all font-mono text-xs text-ink-3">
                  {sym} · {asset.assetId}
                </p>
                {asset.assetId === "usdt" ? <p className="mt-1 text-xs text-warm">{u.testUsdtNote}</p> : null}
                {typeof asset.totalSupply === "number" ? (
                  <p className="mt-1 text-ink-2" data-testid="token-supply">
                    {u.totalSupply}: {isNative ? formatPpl(asset.totalSupply) : formatAssetUnits(asset.totalSupply, decimals)} {sym}
                  </p>
                ) : null}
                {pool ? (
                  <p className="mt-1 text-ink-2" data-testid="token-pool">
                    {u.pool}: {formatAssetUnits(pool.tokenReserve, decimals)} {sym} · {formatPpl(pool.nativeReserve)} PPL{" "}
                    <Link href="/swap" className="text-brand hover:underline">{u.swapNow}</Link>
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export type NftRow = {
  nftId: string;
  name: string;
  owner: string;
  creator?: string;
  collection?: string;
  onChainTokenId?: string;
  minted?: number;
  totalSupply?: number;
  mintPrice?: number;
  imageUri?: string;
};

/**
 * `initialNfts` are the rows the server already read through the same compat route (see
 * `app/explorer/nfts/page.tsx`): seeding state from them paints real collections on the first
 * frame instead of a skeleton that waits for hydration. The effect below still refetches, and when
 * nothing was prefetched (another chain backend, or an RPC that missed the SSR budget) the
 * skeleton behaves exactly as before.
 */
export function NftList({ initialNfts }: { initialNfts?: NftRow[] } = {}) {
  const { lang } = useLanguage();
  const t = explorerCopy[lang];
  const prefetched = Boolean(initialNfts?.length);
  const [items, setItems] = useState<NftRow[]>(() => visibleNfts(initialNfts ?? []));

  const [loading, setLoading] = useState(!prefetched);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadExplorerRead((signal) => networkJson<NftRow[]>("nfts", { signal }))
      .then((result) => {
        if (!alive) return;
        if (result.ok) setItems(Array.isArray(result.value) ? visibleNfts(result.value) : []);
        else if (!result.missing && !prefetched) setFailed(true);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [prefetched]);

  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Eyebrow>
        <Link href="/explorer">{t.title}</Link>
      </Eyebrow>
      <h1 className="mt-3 text-h2 font-bold">{t.nfts}</h1>
      <ExplorerSubnav />
      <div className="mt-4">
        <NetworkStatus />
      </div>
      {showNetworkUnavailable(failed, items.length) ? <p role="alert" className="mt-6 text-warm">{t.networkUnavailable}</p> : null}
      {loading ? <SkeletonRows /> : null}
      <ul className="mt-6 divide-y divide-line rounded-2xl border border-line" aria-busy={loading} hidden={loading}>
        {!loading && !showNetworkUnavailable(failed, items.length) && items.length === 0 ? <li className="px-4 py-3 text-sm text-ink-3">{t.empty}</li> : null}
        {items.map((nft) => {
          const creator = nft.creator ?? nft.owner;
          return (
            <li id={nft.nftId} key={nft.nftId} className="px-4 py-4 text-sm" data-testid="nft-row">
              <AssetImage src={nft.imageUri} name={nft.name} nft className="mb-3 h-32 w-32" />
              <p className="font-semibold">{nft.name}</p>
              <p className="mt-0.5 font-mono text-xs text-ink-3" data-testid="nft-id">{nft.nftId}</p>
              <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                <div className="flex min-w-0 justify-between gap-3">
                  <dt className="text-ink-3">{t.creator}</dt>
                  <dd className="min-w-0 truncate text-right">
                    <Link href={`/explorer/address/${creator}`} className="font-mono text-xs text-brand hover:underline">
                      {creator}
                    </Link>
                  </dd>
                </div>
                <div className="flex min-w-0 justify-between gap-3">
                  <dt className="text-ink-3">{t.owner}</dt>
                  <dd className="min-w-0 truncate text-right">
                    <Link href={`/explorer/address/${nft.owner}`} className="font-mono text-xs text-brand hover:underline">
                      {nft.owner}
                    </Link>
                  </dd>
                </div>
                {nft.collection ? (
                  <div className="flex min-w-0 justify-between gap-3">
                    <dt className="text-ink-3">{t.collection}</dt>
                    <dd className="min-w-0 truncate text-right">
                      <Link href={`/explorer/address/${nft.collection}`} className="font-mono text-xs text-brand hover:underline">
                        {nft.onChainTokenId ? `${t.tokenId} #${nft.onChainTokenId}` : nft.collection}
                      </Link>
                    </dd>
                  </div>
                ) : null}
                {typeof nft.minted === "number" ? (
                  <div className="flex justify-between gap-3" data-testid="nft-minted">
                    <dt className="text-ink-3">{t.minted}</dt>
                    <dd className="text-right font-semibold">{nft.minted}</dd>
                  </div>
                ) : null}
                {typeof nft.totalSupply === "number" ? (
                  <div className="flex justify-between gap-3" data-testid="nft-total-supply">
                    <dt className="text-ink-3">{t.totalSupply}</dt>
                    <dd className="text-right font-semibold">{nft.totalSupply}</dd>
                  </div>
                ) : null}
                {/* Only rendered when the collection exposes a price getter — never fabricated. */}
                {typeof nft.mintPrice === "number" ? (
                  <div className="flex justify-between gap-3" data-testid="nft-mint-price">
                    <dt className="text-ink-3">{t.mintPrice}</dt>
                    <dd className="text-right font-semibold">{formatPpl(nft.mintPrice)} PPL</dd>
                  </div>
                ) : null}
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
