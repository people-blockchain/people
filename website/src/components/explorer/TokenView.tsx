"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isAddress } from "viem";
import { useLanguage } from "@/context/LanguageContext";
import { networkJson } from "@/lib/network-client";
import { explorerCopy } from "@/lib/explorer-copy";
import { tokenExplorerCopy } from "@/lib/token-explorer-copy";
import { ACCOUNT_SCAN_LIMIT, formatShare, tokenHolders, holderChart, creationTimestamp, type ExplorerAccount } from "@/lib/token-explorer";
import { assetDecimals, formatAssetAmount, type AssetInfo } from "@/lib/asset-amounts";
import { uxCopy, displaySymbol } from "@/lib/ux-copy";
import { displayAssetName, isHiddenAsset } from "@/lib/hidden-assets";
import { AssetImage } from "@/components/ui/AssetImage";
import { PeopleLoader } from "@/components/ui/PeopleLoader";
import { NetworkStatus } from "@/components/NetworkStatus";
import { Eyebrow } from "@/components/ui/primitives";
import { TokenMarketPanel } from "@/components/market/TokenMarketPanel";
import { resolveMarketTokenAddress } from "@/lib/evm/market-token";
import { fetchJsonWithTimeout, timeoutSignal } from "@/lib/fetch-timeout";
import { resolveTokenMeta, type Erc20Meta, type ResolvedTokenMeta } from "@/lib/evm-token-meta";
import { compatList, compatPartial } from "@/lib/compat-list";

type Token = AssetInfo & { totalSupply: number; creator: string; createdAt?: number; status: string; type: string };
type Data = { asset: Token; meta: ResolvedTokenMeta; fromCatalog: boolean; accounts: ExplorerAccount[] | null; partial: boolean; timestamp: number | null; fetchedAt: number };
const colors = ["#6366f1", "#14b8a6", "#f59e0b", "#ec4899", "#8b5cf6", "#94a3b8"];

export function TokenView({ assetId }: { assetId: string }) {
  const { lang } = useLanguage();
  const t = explorerCopy[lang];
  const u = uxCopy[lang];
  const c = { ...tokenExplorerCopy.en, ...(tokenExplorerCopy[lang] ?? {}) };
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [visible, setVisible] = useState(25);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        if (isHiddenAsset(assetId)) throw new Error("hidden_asset");
        // Every request has its own deadline so the loader always ends (error + retry on failure).
        const evm = isAddress(assetId, { strict: false });
        let catalogPartial = false;
        const [catalog, accountResult, contract] = await Promise.all([
          networkJson<Token & { partial?: boolean }>(`assets/${encodeURIComponent(assetId)}`, { signal: timeoutSignal(8000, controller.signal) })
            .then(value => {
              if (!value || typeof value !== "object") return null;
              if (value.partial) catalogPartial = true;
              if (value.assetId || value.symbol || value.name) return value;
              return null;
            })
            .catch(error => { if (!evm && !catalogPartial) throw error; return null; }),
          networkJson<ExplorerAccount[] | { accounts?: ExplorerAccount[]; partial?: boolean }>(
            `accounts?limit=${ACCOUNT_SCAN_LIMIT + 1}&assetId=${encodeURIComponent(assetId)}`,
            { signal: timeoutSignal(8000, controller.signal) },
          )
            .then(accounts => ({ rows: compatList<ExplorerAccount>(accounts, "accounts"), partial: compatPartial(accounts) }))
            .catch(() => null),
          evm
            ? fetchJsonWithTimeout<Erc20Meta>(`/api/explorer/token/${encodeURIComponent(assetId)}/meta`, { timeoutMs: 8000, signal: controller.signal }).catch(() => null)
            : Promise.resolve(null),
        ]);
        const meta = resolveTokenMeta({ assetId, contract, catalog });
        if (!catalog && !evm && !catalogPartial) throw new Error("not_found");
        const asset: Token = evm
          ? { assetId, tokenAddress: assetId, status: "—", type: "token", creator: "", totalSupply: 0, ...(catalog ?? {}), name: meta.name, symbol: meta.symbol, decimals: meta.decimals ?? catalog?.decimals }
          : catalog ?? { assetId, name: assetId, symbol: assetId, decimals: 18, totalSupply: 0, creator: "", status: "—", type: "token" };
        let timestamp: number | null = null;
        if (asset.createdAt !== undefined) {
          const block = await networkJson<{ header?: { height?: number; timestamp?: number } }>(`blocks/${asset.createdAt}`, { signal: timeoutSignal(5000, controller.signal) }).catch(() => null);
          timestamp = creationTimestamp(block, asset.createdAt);
          if (timestamp === null && !controller.signal.aborted) {
            const archived = await fetch(`/api/explorer/token/${encodeURIComponent(assetId)}/created`, { signal: timeoutSignal(5000, controller.signal) }).then(r => r.ok ? r.json() : null).catch(() => null);
            if (typeof archived?.timestamp === "number" && Number.isFinite(archived.timestamp) && archived.timestamp > 0) timestamp = archived.timestamp;
          }
        }
        if (controller.signal.aborted) return;
        const holderRows = accountResult?.rows ?? null;
        setData({
          asset,
          meta,
          fromCatalog: Boolean(catalog),
          accounts: holderRows ? holderRows.slice(0, ACCOUNT_SCAN_LIMIT) : null,
          partial: Boolean(accountResult?.partial) || catalogPartial || (holderRows?.length ?? 0) > ACCOUNT_SCAN_LIMIT || Boolean(catalog?.partial),
          timestamp,
          fetchedAt: Date.now(),
        });
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [assetId, refresh]);

  function reload() { setLoading(true); setError(false); setRefresh(v => v + 1); }
  const asset = data?.asset;
  const symbol = displaySymbol(assetId, asset?.symbol, u);
  const distribution = tokenHolders(data?.accounts ?? [], assetId);
  const chart = holderChart(distribution.holders);
  const amount = (value: number) => formatAssetAmount(assetId, value, asset);
  const marketTokenAddress = assetId === "ppl" || assetId === "usdt" ? null : resolveMarketTokenAddress(assetId);
  const supplyText = data?.meta.supplyText ?? (data?.meta.catalogSupply != null ? amount(data.meta.catalogSupply) : null);
  const supplyValue = supplyText === null ? "—" : `${supplyText} ${symbol}`;
  const gradient = chart.map((slice, i) => { const start = chart.slice(0, i).reduce((sum, row) => sum + row.share, 0); return `${colors[i]} ${start}% ${start + slice.share}%`; }).join(", ");

  return <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
    <Eyebrow><Link href="/explorer">{t.title}</Link> / <Link href="/explorer/tokens">{t.tokens}</Link></Eyebrow>
    <NetworkStatus />
    {loading ? <PeopleLoader /> : error || !asset ? <div className="mt-8 rounded-2xl border border-line p-6"><p>{t.networkUnavailable} / {t.notFound}</p><button onClick={reload} className="mt-3 text-brand">{c.retry}</button></div> : <>
      <header className="mt-8 flex flex-wrap items-center gap-4">
        <AssetImage assetId={assetId} tokenAddress={asset.tokenAddress} src={asset.creationMetadata?.image} name={symbol} className="h-16 w-16" testBadgeLabel={u.testTokenNote} />
        <div className="min-w-0 flex-1"><h1 className="break-words text-h2 font-bold">{assetId === "usdt" ? u.testUsdt : displayAssetName(assetId, asset.name)}</h1><p className="break-all font-mono text-sm text-ink-3">{symbol} · {assetId}</p></div>
        <button onClick={reload} className="rounded-xl border border-line px-4 py-2 text-sm text-brand">{c.refresh}</button>
      </header>
      {assetId === "usdt" ? <p className="mt-4 text-sm text-warm">{u.testUsdtNote}</p> : null}
      {marketTokenAddress ? <TokenMarketPanel tokenAddress={marketTokenAddress} symbol={symbol} className="mt-8" /> : null}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[[u.totalSupply, supplyValue], [c.holders, data?.accounts ? `${data.partial ? "≥ " : ""}${distribution.holders.length}` : "—"], [c.held, data?.accounts ? `${amount(distribution.total)} ${symbol}` : "—"]].map(([label, value]) => <div key={label} className="rounded-2xl border border-line bg-surface p-5"><p className="text-sm text-ink-3">{label}</p><p className="mt-2 break-words text-xl font-bold">{value}</p></div>)}
      </div>
      <dl className="mt-6 grid gap-5 rounded-2xl border border-line p-5 text-sm sm:grid-cols-2">
        <div><dt className="text-ink-3">{c.created}</dt><dd className="mt-1">{data?.timestamp ? new Date(data.timestamp).toLocaleString(lang) : asset.createdAt === undefined && data?.fromCatalog ? c.genesis : c.unknownDate}{asset.createdAt !== undefined ? <Link className="ml-2 text-brand" href={`/explorer/block/${asset.createdAt}`}>#{asset.createdAt}</Link> : null}</dd></div>
        <div><dt className="text-ink-3">{t.creator}</dt><dd className="mt-1 break-all font-mono">{!asset.creator ? "—" : asset.creator.startsWith("0x") ? <Link className="text-brand" href={`/explorer/address/${asset.creator}`}>{asset.creator}</Link> : asset.creator}</dd></div>
        <div><dt className="text-ink-3">{c.status}</dt><dd>{asset.status}</dd></div>
        <div><dt className="text-ink-3">{c.decimals}</dt><dd>{asset.decimals === undefined ? "—" : assetDecimals(asset)}</dd></div>
      </dl>
      {typeof asset.creationMetadata?.description === "string" ? <div className="mt-6"><h2 className="font-bold">{c.description}</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-2">{asset.creationMetadata.description}</p></div> : null}
      <section className="mt-10" aria-labelledby="holder-title">
        <h2 id="holder-title" className="text-xl font-bold">{c.distribution}</h2>
        <p className="mt-2 max-w-3xl text-sm text-ink-3">{c.note}</p>
        {data?.partial ? <p role="status" className="mt-3 text-sm text-warm">{c.partial}</p> : null}
        {data?.accounts === null ? <p role="alert" className="mt-5 text-warm">{c.failed}</p> : !distribution.holders.length ? <p className="mt-5 text-ink-3">{c.noHolders}</p> : <>
          <div className="mt-6 grid items-center gap-8 rounded-2xl border border-line p-6 sm:grid-cols-[240px_1fr]">
            <div role="img" aria-label={`${c.distribution}: ${chart.map(row => `${row.label === "other" ? c.other : row.label} ${formatShare(row.share)}`).join(", ")}`} className="relative mx-auto grid h-52 w-52 place-items-center rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
              <div className="grid h-36 w-36 place-content-center rounded-full bg-surface text-center"><strong className="text-3xl">{distribution.holders.length}</strong><span className="mt-1 text-xs text-ink-3">{c.holders}</span></div>
            </div>
            <ul className="space-y-3">{chart.map((row, i) => <li key={row.label} className="flex items-center gap-3 text-sm"><span className="h-3 w-3 shrink-0 rounded-full" style={{ background: colors[i] }} /><span className="min-w-0 flex-1 truncate font-mono">{row.label === "other" ? c.other : <Link href={`/explorer/address/${row.label}`} className="text-brand">{row.label}</Link>}</span><strong>{formatShare(row.share)}</strong></li>)}</ul>
          </div>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-left text-sm"><thead className="bg-surface text-ink-3"><tr><th className="p-4">{t.address}</th><th className="p-4">{c.balance}</th><th className="p-4">{c.share}</th><th className="p-4">{c.supplyShare}</th></tr></thead>
              <tbody className="divide-y divide-line">{distribution.holders.slice(0, visible).map(row => <tr key={row.address}><td className="p-4"><Link href={`/explorer/address/${row.address}`} className="font-mono text-xs text-brand">{row.address}</Link></td><td className="whitespace-nowrap p-4 font-mono">{amount(row.balance)} {symbol}</td><td className="min-w-36 p-4"><span>{formatShare(row.share)}</span><div className="mt-1 h-1.5 rounded-full bg-surface"><div className="h-full rounded-full bg-brand" style={{ width: `${row.share}%` }} /></div></td><td className="p-4">{asset.totalSupply > 0 ? formatShare(row.balance / asset.totalSupply * 100) : "—"}</td></tr>)}</tbody>
            </table>
          </div>
          {distribution.holders.length > visible ? <button onClick={() => setVisible(v => v + 25)} className="mt-4 text-sm text-brand">{c.more}</button> : null}
        </>}
        <p className="mt-4 text-xs text-ink-3">{c.updated}: {data ? new Date(data.fetchedAt).toLocaleString(lang) : "—"}</p>
      </section>
    </>}
  </section>;
}
