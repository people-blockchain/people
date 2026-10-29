"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { explorerCopy } from "@/lib/explorer-copy";
import { nftExplorerCopy } from "@/lib/nft-explorer-copy";
import { fetchJsonWithTimeout } from "@/lib/fetch-timeout";
import { nftDisplayName, type NftMetadata } from "@/lib/nft-explorer";
import { PeopleLoader } from "@/components/ui/PeopleLoader";
import { NetworkStatus } from "@/components/NetworkStatus";
import { Eyebrow } from "@/components/ui/primitives";

type NftData = {
  collection: string;
  tokenId: string;
  collectionName: string | null;
  owner: string;
  tokenUri: string | null;
  gatewayUrl: string | null;
  metadata: NftMetadata | null;
};

export function NftView({ collection, tokenId }: { collection: string; tokenId: string }) {
  const { lang } = useLanguage();
  const t = explorerCopy[lang];
  const c = nftExplorerCopy[lang];
  const [data, setData] = useState<NftData | null>(null);
  const [error, setError] = useState<"notFound" | "unavailable" | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        // Hard deadline: the loader always ends, with an error + retry on timeout.
        const next = await fetchJsonWithTimeout<NftData>(
          `/api/explorer/nft/${encodeURIComponent(collection)}/${encodeURIComponent(tokenId)}`,
          { timeoutMs: 15_000, signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setData(next);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error && e.message === "http_404" ? "notFound" : "unavailable");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [collection, tokenId, refresh]);

  function reload() { setLoading(true); setError(null); setImageFailed(false); setRefresh(v => v + 1); }

  const meta = data?.metadata ?? null;
  const name = data ? nftDisplayName(meta?.name ?? null, data.collectionName, data.tokenId) : "";
  const isHttpUri = data?.tokenUri ? /^https?:\/\//i.test(data.tokenUri) : false;

  return <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6" data-testid="nft-explorer-page">
    <Eyebrow><Link href="/explorer">{t.title}</Link> / <Link href="/explorer/nfts">{c.breadcrumb}</Link></Eyebrow>
    <NetworkStatus />
    {loading ? <PeopleLoader /> : error || !data ? <div role="alert" className="mt-8 rounded-2xl border border-line p-6" data-testid="nft-explorer-error">
      <p>{error === "notFound" ? c.notFound : c.unavailable}</p>
      <button onClick={reload} className="mt-3 text-brand">{c.retry}</button>
    </div> : <>
      <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-2xl border border-line bg-surface-2">
          {meta?.imageUrl && !imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meta.imageUrl} alt={name} data-testid="nft-explorer-image" onError={() => setImageFailed(true)} className="mx-auto block max-h-[70vh] w-full object-contain" />
          ) : <p className="p-8 text-center text-sm text-ink-3" data-testid="nft-explorer-no-image">{meta?.imageUrl ? c.imageUnavailable : c.noImage}</p>}
        </div>
        <div className="min-w-0">
          <h1 className="break-words text-h2 font-bold" data-testid="nft-explorer-name">{name}</h1>
          {meta?.description ? <p className="mt-3 whitespace-pre-wrap break-words text-sm text-ink-2">{meta.description}</p> : null}
          {!meta && data.tokenUri ? <p role="status" className="mt-3 text-sm text-warm">{c.metadataUnavailable}</p> : null}
          <dl className="mt-6 space-y-4 text-sm">
            <div><dt className="text-ink-3">{c.collection}</dt><dd className="mt-1 break-all"><Link className="font-mono text-brand" href={`/explorer/address/${data.collection}`} dir="ltr">{data.collectionName ? `${data.collectionName} · ` : ""}{data.collection}</Link></dd></div>
            <div><dt className="text-ink-3">{c.tokenId}</dt><dd className="mt-1 break-all font-mono" dir="ltr">{data.tokenId}</dd></div>
            <div><dt className="text-ink-3">{c.owner}</dt><dd className="mt-1 break-all"><Link className="font-mono text-brand" href={`/explorer/address/${data.owner}`} dir="ltr" data-testid="nft-explorer-owner">{data.owner}</Link></dd></div>
            {data.tokenUri ? <div><dt className="text-ink-3">{c.tokenUri}</dt><dd className="mt-1 break-all font-mono text-xs" dir="ltr" data-testid="nft-explorer-token-uri">{data.tokenUri}</dd>
              {isHttpUri ? <dd className="mt-1 text-xs text-ink-3">{c.externalUriNote}</dd> : null}
            </div> : null}
          </dl>
          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            {data.gatewayUrl ? <a href={data.gatewayUrl} target="_blank" rel="noopener noreferrer" data-testid="nft-explorer-ipfs-link" className="font-semibold text-brand">{c.openOnIpfs}</a> : null}
            {meta?.imageUrl ? <a href={meta.imageUrl} target="_blank" rel="noopener noreferrer" data-testid="nft-explorer-original-link" className="font-semibold text-brand">{c.openOriginalImage}</a> : null}
          </div>
        </div>
      </div>
    </>}
  </section>;
}
