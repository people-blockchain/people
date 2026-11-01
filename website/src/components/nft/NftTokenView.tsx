"use client";

import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { explorerCopy } from "@/lib/explorer-copy";
import { nftMediaCopy } from "@/lib/nft-media-copy";

export function NftTokenView({
  name,
  collection,
  tokenId,
  owner,
  tokenUri,
}: {
  name: string;
  collection: string;
  tokenId: string;
  owner: string;
  tokenUri: string;
}) {
  const { lang } = useLanguage();
  const t = explorerCopy[lang];
  const media = nftMediaCopy[lang];
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6" data-testid="nft-token">
      <h1 className="text-h2 font-bold text-ink">{name}</h1>
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
