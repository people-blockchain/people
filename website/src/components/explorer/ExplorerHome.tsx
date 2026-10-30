"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { WalletGateLink } from "@/components/wallet/WalletGateLink";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { explorerCopy } from "@/lib/explorer-copy";
import { networkJson } from "@/lib/network-client";
import { NetworkStatus } from "@/components/NetworkStatus";
import { Eyebrow } from "@/components/ui/primitives";
import { connectExplorer, type LivePhase } from "@/lib/explorer-live";
import { connectEvmExplorer, explorerHomePhase } from "@/lib/evm/explorer-live";
import { isCosmosEvmChain } from "@/lib/chain-mode";
import { uxCopy } from "@/lib/ux-copy";
import { txSummary } from "@/lib/tx-display";
import { useAssetRegistry } from "@/hooks/useAssetRegistry";
import { SkeletonRows } from "./ExplorerSkeleton";
import { ExplorerSubnav } from "./ExplorerSubnav";

export interface BlockRow {
  hash?: string;
  header?: { height: number; proposer?: string; timestamp?: number };
  transactions?: unknown[];
}

export interface TxRow {
  id: string;
  type?: string;
  from?: string;
  to?: string;
  amount?: number;
  fee?: number;
  assetId?: string;
  payload?: Record<string, unknown> | null;
  blockHeight?: number;
}

/**
 * `initialBlocks`/`initialTxs` are the rows the server already read through the same compat
 * handlers the browser hits (see `app/explorer/page.tsx`): on EVM chains the first paint shows
 * the real feed instead of a skeleton that lasts until the websocket snapshot arrives. The live
 * socket still overwrites both the moment it publishes, and an empty prefetch behaves as before.
 */
export function ExplorerHome({
  wsUrl,
  chainId,
  initialBlocks = [],
  initialTxs = [],
}: {
  wsUrl: string;
  chainId: string;
  initialBlocks?: BlockRow[];
  initialTxs?: TxRow[];
}) {
  const { lang } = useLanguage();
  const t = explorerCopy[lang];
  const u = uxCopy[lang];
  const assets = useAssetRegistry();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [blocks, setBlocks] = useState<BlockRow[]>(initialBlocks);
  const [txs, setTxs] = useState<TxRow[]>(initialTxs);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(initialBlocks.length > 0 || initialTxs.length > 0);
  const [phase, setPhase] = useState<LivePhase>("checking");

  // Legacy HTTP snapshot; EVM obtains its initial feed over the same socket
  // as its newHeads subscription.
  useEffect(() => {
    if (isCosmosEvmChain()) return;
    let alive = true;
    void Promise.allSettled([
      networkJson<BlockRow[]>("blocks?limit=20"),
      networkJson<TxRow[]>("transactions?limit=20"),
    ]).then(([b, x]) => {
      if (!alive) return;
      setLoaded(true);
      if (b.status === "fulfilled" && Array.isArray(b.value)) setBlocks((cur) => (cur.length ? cur : b.value));
      if (x.status === "fulfilled" && Array.isArray(x.value)) setTxs((cur) => (cur.length ? cur : x.value));
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (isCosmosEvmChain()) {
      return connectEvmExplorer({
        url: wsUrl,
        chainId,
        onPhase: setPhase,
        onFeed: (feed) => {
          setLoaded(true);
          setBlocks(feed.blocks);
          setTxs(feed.transactions);
        },
      });
    }
    return connectExplorer({
      url: wsUrl,
      chainId,
      onPhase: setPhase,
      onFeed: (feed) => {
        setLoaded(true);
        if (feed.blocks.length) setBlocks(feed.blocks);
        if (feed.transactions.length) setTxs(feed.transactions);
      },
    });
  }, [wsUrl, chainId]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (/^\d+$/.test(q)) {
      router.push(`/explorer/block/${q}`);
      return;
    }
    if (q.startsWith("0x") && q.length === 42) {
      void networkJson(`contracts/${encodeURIComponent(q)}`)
        .then(() => router.push(`/explorer/contract/${q}`))
        .catch(() => router.push(`/explorer/address/${q}`));
      return;
    }
    void networkJson<{
      blocks?: BlockRow[];
      transactions?: TxRow[];
      addresses?: string[];
    }>(`search?q=${encodeURIComponent(q)}`)
      .then((result) => {
        const tx = result.transactions?.[0];
        const block = result.blocks?.[0];
        const addr = result.addresses?.[0];
        if (tx?.id) router.push(`/explorer/tx/${encodeURIComponent(tx.id)}`);
        else if (block?.header?.height !== undefined) router.push(`/explorer/block/${block.header.height}`);
        else if (addr) router.push(`/explorer/address/${addr}`);
        else setError(t.notFound);
      })
      .catch(() => setError(t.notFound));
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <Eyebrow>{t.title.toLocaleUpperCase(lang)}</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold tracking-tight text-ink">{t.title}</h1>
      <p className="mt-3 max-w-2xl text-lead text-ink-2">{t.lead}</p>
      <ExplorerSubnav />
      <div className="mt-4">
        <NetworkStatus phase={explorerHomePhase(phase, blocks.length, txs.length)} />
      </div>
      <nav className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
        <Link href="/explorer/contracts" className="text-brand">
          {t.contracts}
        </Link>
        <WalletGateLink className="text-brand" connectLabel={u.openWallet}>
          {u.myWallet}
        </WalletGateLink>
      </nav>
      <form onSubmit={onSearch} className="mt-6 flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.searchHint}
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink">
          {t.search}
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-warm">{error}</p> : null}

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <div>
          <h2 className="font-bold text-ink">{t.blocks}</h2>
          {!loaded ? (
            <SkeletonRows className="mt-3" />
          ) : blocks.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">{t.empty}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
              {blocks.map((block) => (
                <li key={block.hash ?? block.header?.height} className="px-4 py-3 text-sm">
                  <Link href={`/explorer/block/${block.header?.height}`} className="font-semibold text-brand hover:underline">
                    #{block.header?.height}
                  </Link>
                  <p className="mt-1 truncate font-mono text-xs text-ink-3">{block.hash}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="font-bold text-ink">{t.transactions}</h2>
          {!loaded ? (
            <SkeletonRows className="mt-3" />
          ) : txs.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">{isCosmosEvmChain() ? (t.recentTransactionsEmpty ?? t.empty) : u.noTx}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
              {txs.map((tx) => (
                <li key={tx.id} className="px-4 py-3 text-sm">
                  <Link href={`/explorer/tx/${encodeURIComponent(tx.id)}`} className="font-mono text-xs text-brand hover:underline">
                    {tx.id.slice(0, 18)}…
                  </Link>
                  <p className="mt-1 text-ink-2">
                    {txSummary(tx, assets, u, t.fee)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
