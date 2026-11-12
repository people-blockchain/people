/* eslint-disable @next/next/no-img-element -- the image URL comes from token metadata (IPFS or HTTPS) */
"use client";

import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { explorerCopy } from "@/lib/explorer-copy";
import { nftMediaCopy } from "@/lib/nft-media-copy";
import type { NftTokenMetadata } from "@/lib/nft-token-metadata";

export function NftTokenView({
  name,
  collection,
  tokenId,
  owner,
  tokenUri,
  metadata,
}: {
  name: string;
  collection: string;
  tokenId: string;
  owner: string;
  tokenUri: string;
  metadata: NftTokenMetadata | null;
}) {
  const { lang } = useLanguage();
  const t = explorerCopy[lang];
  const media = nftMediaCopy[lang];
  const displayName = metadata?.name ?? name;
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6" data-testid="nft-token">
      <h1 className="break-words text-h2 font-bold text-ink">{displayName}</h1>
      {metadata?.imageUrl ? (
        <img
          src={metadata.imageUrl}
          alt={displayName}
          loading="lazy"
          className="mt-6 block h-auto w-full max-w-full rounded-2xl border border-line bg-surface-2 object-contain"
          data-testid="nft-token-image"
        />
      ) : tokenUri && !metadata ? (
        <p className="mt-6 rounded-xl bg-surface-2 p-3 text-sm text-warm" role="status">
          {media.metadataUnavailable}
        </p>
      ) : null}
      {metadata?.description ? (
        <section className="mt-6">
          <h2 className="font-bold text-ink">{media.aboutNft}</h2>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-2">{metadata.description}</p>
        </section>
      ) : null}
      <dl className="mt-6 space-y-3 text-sm">
        <div className="rounded-xl bg-surface-2 p-3">
          <dt className="text-xs text-ink-3">{t.collection}</dt>
          <dd className="mt-1 break-all font-mono">
            <Link href={`/explorer/address/${collection}`} className="text-brand hover:underline" dir="ltr">
              {collection}
            </Link>
          </dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <dt className="text-xs text-ink-3">{t.tokenId}</dt>
          <dd className="mt-1 font-mono">{tokenId}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <dt className="text-xs text-ink-3">{t.owner}</dt>
          <dd className="mt-1 break-all font-mono">
            <Link href={`/explorer/address/${owner}`} className="text-brand hover:underline" dir="ltr">
              {owner}
            </Link>
          </dd>
        </div>
        {tokenUri ? (
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="text-xs text-ink-3">{media.metadataLabel}</dt>
            <dd className="mt-1 break-all font-mono" dir="ltr">
              {tokenUri}
            </dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}
