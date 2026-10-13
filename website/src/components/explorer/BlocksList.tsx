"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { explorerCopy } from "@/lib/explorer-copy";
import { networkJson } from "@/lib/network-client";
import { NetworkStatus } from "@/components/NetworkStatus";
import { Eyebrow } from "@/components/ui/primitives";
import { SkeletonRows } from "./ExplorerSkeleton";
import { ExplorerSubnav } from "./ExplorerSubnav";

export type BlockRow = {
  hash?: string;
  header?: { height: number; proposer?: string; timestamp?: number };
  transactions?: unknown[];
};

function formatTime(ts: number | undefined): string {
  if (!ts) return "—";
  // Node timestamps are unix seconds; a milliseconds value would be off the charts otherwise.
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").replace(".000Z", "Z");
}

/**
 * `initialBlocks` are the rows the server already read through the same compat route (see
 * `app/explorer/blocks/page.tsx`): seeding state from them paints real blocks on the first frame
 * instead of a skeleton that waits for hydration. The effect below still refreshes in the
 * background, and when nothing was prefetched (another chain backend, or an RPC that missed the
 * SSR budget) the skeleton behaves exactly as before.
 */
export function BlocksList({ initialBlocks }: { initialBlocks?: BlockRow[] } = {}) {
  const { lang } = useLanguage();
  const t = explorerCopy[lang];
  const prefetched = Boolean(initialBlocks?.length);
  const [blocks, setBlocks] = useState<BlockRow[]>(initialBlocks ?? []);
  const [loading, setLoading] = useState(!prefetched);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      void networkJson<BlockRow[]>("blocks?limit=50")
        .then((body) => {
          if (!alive) return;
          setBlocks(Array.isArray(body) ? body : []);
          setFailed(false);
        })
        // A failed background refresh must not replace the prefetched rows with an error notice.
        .catch(() => {
          if (alive && !prefetched) setFailed(true);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    load();
    const id = setInterval(load, 12_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [prefetched]);

  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Eyebrow>{t.title.toLocaleUpperCase(lang)}</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold tracking-tight text-ink">{t.blocks}</h1>
      <ExplorerSubnav />
      <div className="mt-4">
        <NetworkStatus />
      </div>
      {failed ? <p role="alert" className="mt-6 text-warm">{t.networkUnavailable}</p> : null}
      {loading ? <SkeletonRows count={8} /> : null}
      <ul
        className="mt-6 divide-y divide-line rounded-2xl border border-line"
        data-testid="block-list"
        aria-busy={loading}
        hidden={loading}
      >
        {!loading && !failed && blocks.length === 0 ? (
          <li className="px-4 py-3 text-sm text-ink-3">{t.empty}</li>
        ) : null}
        {blocks.map((block) => (
          <li key={block.hash ?? block.header?.height} className="flex flex-col gap-1 px-4 py-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <Link
                href={`/explorer/block/${block.header?.height}`}
                className="font-semibold text-brand hover:underline"
                data-testid="block-height"
              >
                #{block.header?.height}
              </Link>
              <span className="text-xs text-ink-3">{formatTime(block.header?.timestamp)}</span>
            </div>
            <p className="break-all font-mono text-xs text-ink-3">{block.hash}</p>
            <p className="text-xs text-ink-3">
              {t.transactions}: {block.transactions?.length ?? 0}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
