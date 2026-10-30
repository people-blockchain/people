"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { isAddress } from "viem";
import { useLanguage } from "@/context/LanguageContext";
import { useExternalWalletOptional, signViaActiveSigner } from "@/context/ExternalWalletContext";
import { networkJson } from "@/lib/network-client";
import { TOKEN_ACCOUNTS_TIMEOUT_MS, TOKEN_TIMESTAMP_TIMEOUT_MS, loadAccounts, loadTokenPage, withTimeout } from "@/lib/explorer/token-load";
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
import { uploadTokenIcon } from "@/lib/token-icon-upload";
import { tokenIconMessage } from "@/lib/token-icon-rules";
import { TokenIconUpload } from "@/components/factory/TokenIconUpload";

type Token = AssetInfo & { totalSupply: number; creator: string; createdAt?: number; status: string; type: string; verified?: boolean };
/** `timestamp` undefined = creation date still loading; null = unavailable. */
type Data = { asset: Token; timestamp: number | null | undefined; fetchedAt: number };
type Holders = { status: "loading" | "ready" | "failed"; accounts: ExplorerAccount[] | null; partial: boolean };
const HOLDERS_LOADING: Holders = { status: "loading", accounts: null, partial: false };
const colors = ["#6366f1", "#14b8a6", "#f59e0b", "#ec4899", "#8b5cf6", "#94a3b8"];

export function TokenView({ assetId }: { assetId: string }) {
  const { lang } = useLanguage();
  const t = explorerCopy[lang];
  const u = uxCopy[lang];
  const c = tokenExplorerCopy[lang === "ru" ? "ru" : "en"];
  const [data, setData] = useState<Data | null>(null);
  const [holders, setHolders] = useState<Holders>(HOLDERS_LOADING);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [visible, setVisible] = useState(25);
  const { signer } = useExternalWalletOptional() ?? { signer: null };
  const [iconOpen, setIconOpen] = useState(false);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconBusy, setIconBusy] = useState(false);
  const [iconNotice, setIconNotice] = useState("");
  const [iconError, setIconError] = useState("");

  const fetchHolders = useCallback((signal: AbortSignal) =>
    networkJson<ExplorerAccount[]>(`accounts?limit=${ACCOUNT_SCAN_LIMIT + 1}&assetId=${encodeURIComponent(assetId)}`, { signal })
      .then(accounts => Array.isArray(accounts) ? accounts : null), [assetId]);
  const holdersAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    holdersAbort.current = controller;
    setHolders(HOLDERS_LOADING);
    setData(null);
    setError(false);
    setLoading(true);
    if (isHiddenAsset(assetId)) { setError(true); setLoading(false); return () => controller.abort(); }
    void loadTokenPage<Token, ExplorerAccount[]>({
      signal: controller.signal,
      fetchAsset: signal => networkJson<Token>(`assets/${encodeURIComponent(assetId)}`, { signal }),
      fetchAccounts: fetchHolders,
      needsTimestamp: asset => asset.createdAt !== undefined,
      fetchTimestamp: async (asset, signal) => {
        const createdAt = asset.createdAt as number;
        const block = await withTimeout(s => networkJson<{ header?: { height?: number; timestamp?: number } }>(`blocks/${createdAt}`, { signal: s }), TOKEN_TIMESTAMP_TIMEOUT_MS, signal).catch(() => null);
        const direct = creationTimestamp(block, createdAt);
        if (direct !== null || signal.aborted) return direct;
        const archived = await withTimeout(s => fetch(`/api/explorer/token/${encodeURIComponent(assetId)}/created`, { signal: s }).then(r => r.ok ? r.json() : null), TOKEN_TIMESTAMP_TIMEOUT_MS, signal).catch(() => null);
        return typeof archived?.timestamp === "number" ? archived.timestamp : null;
      },
      // The page is shown once the asset is known; distribution and date fill in later.
      onAsset: asset => { setData({ asset, timestamp: asset.createdAt === undefined ? null : undefined, fetchedAt: Date.now() }); setLoading(false); },
      onAssetFailed: () => { setError(true); setLoading(false); },
      onAccounts: result => setHolders(result.ok
        ? { status: "ready", accounts: result.value.slice(0, ACCOUNT_SCAN_LIMIT), partial: result.value.length > ACCOUNT_SCAN_LIMIT }
        : { status: "failed", accounts: null, partial: false }),
      onTimestamp: timestamp => setData(prev => prev ? { ...prev, timestamp } : prev),
    });
    return () => controller.abort();
  }, [assetId, refresh, fetchHolders]);

  function retryHolders() {
    holdersAbort.current?.abort();
    const controller = new AbortController();
    holdersAbort.current = controller;
    setHolders(HOLDERS_LOADING);
    void loadAccounts(fetchHolders, TOKEN_ACCOUNTS_TIMEOUT_MS, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setHolders(result.ok
        ? { status: "ready", accounts: result.value.slice(0, ACCOUNT_SCAN_LIMIT), partial: result.value.length > ACCOUNT_SCAN_LIMIT }
        : { status: "failed", accounts: null, partial: false });
    });
  }

  function reload() { setLoading(true); setError(false); setRefresh(v => v + 1); }
  const asset = data?.asset;
  const symbol = displaySymbol(assetId, asset?.symbol, u);
  const distribution = tokenHolders(holders.accounts ?? [], assetId);
  const chart = holderChart(distribution.holders);
  const amount = (value: number) => formatAssetAmount(assetId, value, asset);
  const marketTokenAddress = assetId === "ppl" || assetId === "usdt" ? null : resolveMarketTokenAddress(assetId);
  const gradient = chart.map((slice, i) => { const start = chart.slice(0, i).reduce((sum, row) => sum + row.share, 0); return `${colors[i]} ${start}% ${start + slice.share}%`; }).join(", ");
  const iconTokenAddress = asset?.tokenAddress && isAddress(asset.tokenAddress)
    ? asset.tokenAddress
    : isAddress(assetId) ? assetId : null;
  const canEditIcon = Boolean(
    signer &&
      asset &&
      iconTokenAddress &&
      typeof asset.creator === "string" &&
      isAddress(asset.creator) &&
      asset.creator.toLowerCase() === signer.address.toLowerCase(),
  );
  // Only curated seed assets predate the chain. A factory token without a known block must not
  // claim to be a genesis asset; the row is omitted instead.
  const isSeedAsset = asset?.verified === true;
  const showCreated = Boolean(asset && (asset.createdAt !== undefined || isSeedAsset));

  async function saveIcon() {
    if (!signer || !asset || !iconTokenAddress || !iconFile || iconBusy) return;
    setIconBusy(true);
    setIconError("");
    setIconNotice("");
    try {
      const imageUri = await uploadTokenIcon(iconFile);
      const issuedAt = new Date().toISOString();
      const token = iconTokenAddress.toLowerCase();
      const signature = await signViaActiveSigner(signer, tokenIconMessage(token, imageUri, issuedAt));
      const response = await fetch("/api/evm/token-icon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, imageUri, signature, issuedAt }),
      });
      if (!response.ok) throw new Error("token_icon_update_failed");
      setIconNotice(u.tokenIconUpdateSuccess);
      setIconOpen(false);
      setIconFile(null);
      reload();
    } catch {
      setIconError(u.tokenIconUpdateFailed);
    } finally {
      setIconBusy(false);
    }
  }

  return <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
    <Eyebrow><Link href="/explorer">{t.title}</Link> / <Link href="/explorer/tokens">{t.tokens}</Link></Eyebrow>
    <NetworkStatus />
    {loading ? <PeopleLoader /> : error || !asset ? <div className="mt-8 rounded-2xl border border-line p-6"><p>{t.networkUnavailable} / {t.notFound}</p><button onClick={reload} className="mt-3 text-brand">{c.retry}</button></div> : <>
      <header className="mt-8 flex flex-wrap items-center gap-4">
        <AssetImage assetId={assetId} tokenAddress={asset.tokenAddress} src={asset.creationMetadata?.image ?? asset.imageUri} name={symbol} className="h-16 w-16" testBadgeLabel={u.testTokenNote} />
        <div className="min-w-0 flex-1"><h1 className="break-words text-h2 font-bold">{assetId === "usdt" ? u.testUsdt : displayAssetName(assetId, asset.name)}</h1><p className="break-all font-mono text-sm text-ink-3">{symbol} · {assetId}</p></div>
        {canEditIcon ? (
          <button
            type="button"
            onClick={() => { setIconOpen((open) => !open); setIconError(""); setIconNotice(""); }}
            className="rounded-xl border border-line px-4 py-2 text-sm text-brand"
          >
            {u.tokenChangeIcon}
          </button>
        ) : null}
        <button onClick={reload} className="rounded-xl border border-line px-4 py-2 text-sm text-brand">{c.refresh}</button>
      </header>
      {canEditIcon && iconOpen ? (
        <div className="mt-4 rounded-2xl border border-line bg-surface p-4" data-testid="token-icon-editor">
          <h2 className="font-bold text-ink">{u.tokenIconUpdateTitle}</h2>
          <p className="mt-1 text-xs text-ink-3">{u.tokenIconUpdateHint}</p>
          <div className="mt-3">
            <TokenIconUpload
              copy={u}
              file={iconFile}
              disabled={iconBusy}
              currentImage={typeof asset.creationMetadata?.image === "string" ? asset.creationMetadata.image : asset.imageUri}
              onFile={(file) => { setIconFile(file); setIconError(""); }}
            />
          </div>
          {iconError ? <p role="alert" className="mt-2 text-sm text-warm">{iconError}</p> : null}
          <button
            type="button"
            disabled={iconBusy || !iconFile}
            onClick={() => void saveIcon()}
            className="mt-3 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-40"
          >
            {iconBusy ? u.tokenIconUpdateSave : u.tokenIconUpdateSign}
          </button>
        </div>
      ) : null}
      {iconNotice ? <p className="mt-4 text-sm text-value">{iconNotice}</p> : null}
      {assetId === "usdt" ? <p className="mt-4 text-sm text-warm">{u.testUsdtNote}</p> : null}
      {marketTokenAddress ? <TokenMarketPanel tokenAddress={marketTokenAddress} symbol={symbol} className="mt-8" /> : null}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[[u.totalSupply, `${amount(asset.totalSupply)} ${symbol}`], [c.holders, holders.accounts ? `${holders.partial ? "≥ " : ""}${distribution.holders.length}` : "—"], [c.held, holders.accounts ? `${amount(distribution.total)} ${symbol}` : "—"]].map(([label, value]) => <div key={label} className="rounded-2xl border border-line bg-surface p-5"><p className="text-sm text-ink-3">{label}</p><p className="mt-2 break-words text-xl font-bold">{value}</p></div>)}
      </div>
      <dl className="mt-6 grid gap-5 rounded-2xl border border-line p-5 text-sm sm:grid-cols-2">
        {showCreated ? <div><dt className="text-ink-3">{c.created}</dt><dd className="mt-1">{data?.timestamp === undefined ? "…" : data.timestamp ? new Date(data.timestamp).toLocaleString(lang) : asset.createdAt === undefined ? c.genesis : c.unknownDate}{asset.createdAt !== undefined ? <Link className="ml-2 text-brand" href={`/explorer/block/${asset.createdAt}`}>#{asset.createdAt}</Link> : null}</dd></div> : null}
        <div><dt className="text-ink-3">{t.creator}</dt><dd className="mt-1 break-all font-mono">{asset.creator.startsWith("0x") ? <Link className="text-brand" href={`/explorer/address/${asset.creator}`}>{asset.creator}</Link> : asset.creator}</dd></div>
        <div><dt className="text-ink-3">{c.status}</dt><dd>{asset.status}</dd></div>
        <div><dt className="text-ink-3">{c.decimals}</dt><dd>{assetDecimals(asset)}</dd></div>
      </dl>
      {typeof asset.creationMetadata?.description === "string" ? <div className="mt-6"><h2 className="font-bold">{c.description}</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-2">{asset.creationMetadata.description}</p></div> : null}
      <section className="mt-10" aria-labelledby="holder-title">
        <h2 id="holder-title" className="text-xl font-bold">{c.distribution}</h2>
        <p className="mt-2 max-w-3xl text-sm text-ink-3">{c.note}</p>
        {holders.partial ? <p role="status" className="mt-3 text-sm text-warm">{c.partial}</p> : null}
        {holders.status === "loading" ? <p role="status" aria-live="polite" className="mt-5 text-ink-3">{c.loadingDistribution}</p> : holders.status === "failed" ? <div role="alert" className="mt-5"><p className="text-warm">{c.failed}</p><button type="button" onClick={retryHolders} className="mt-3 text-sm text-brand">{c.retry}</button></div> : !distribution.holders.length ? <p className="mt-5 text-ink-3">{c.noHolders}</p> : <>
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
