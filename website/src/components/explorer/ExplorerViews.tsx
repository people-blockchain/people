"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WalletGateLink } from "@/components/wallet/WalletGateLink";
import { useLanguage } from "@/context/LanguageContext";
import { explorerCopy } from "@/lib/explorer-copy";
import { networkJson } from "@/lib/network-client";
import { fetchCosmosTx, isCosmosTxHash, type CosmosTxSummary } from "@/lib/cosmos-tx";
import { NetworkStatus } from "@/components/NetworkStatus";
import { Eyebrow } from "@/components/ui/primitives";
import { PeopleLoader } from "@/components/ui/PeopleLoader";
import { AssetImage } from "@/components/ui/AssetImage";
import { uxCopy, displaySymbol, txTypeLabel } from "@/lib/ux-copy";
import { isHiddenAsset, visibleNfts } from "@/lib/hidden-assets";
import { txAmountText, txFeeText, txSummary } from "@/lib/tx-display";
import { assetDecimals, formatPpl, formatUnits } from "@/lib/asset-amounts";
import { useAssetRegistry } from "@/hooks/useAssetRegistry";

export function BlockView({ height }: { height: string }) {
  const { lang } = useLanguage();
  const t = explorerCopy[lang];
  const u = uxCopy[lang];
  const assets = useAssetRegistry();
  const [block, setBlock] = useState<{
    hash?: string;
    header?: { height: number; previousHash?: string; proposer?: string; timestamp?: number };
    transactions?: Array<{ id: string; type?: string; from?: string; to?: string; amount?: number; fee?: number; assetId?: string; payload?: Record<string, unknown> | null }>;
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void networkJson<typeof block>(`blocks/${height}`)
      .then(setBlock)
      .catch(() => setError(t.notFound));
  }, [height, t.notFound]);

  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Eyebrow>
        <Link href="/explorer">{t.title}</Link>
      </Eyebrow>
      <h1 className="mt-3 text-h2 font-bold">
        {t.blocks} #{height}
      </h1>
      <div className="mt-4">
        <NetworkStatus />
      </div>
      {error ? <p className="mt-4 text-sm text-warm">{error}</p> : null}
      {!block && !error ? <PeopleLoader /> : null}
      {block ? (
        <dl className="mt-6 space-y-2 text-sm">
          <div>
            <dt className="text-ink-3">{t.hash}</dt>
            <dd className="break-all font-mono">{block.hash}</dd>
          </div>
          <div>
            <dt className="text-ink-3">{t.proposer}</dt>
            <dd>
              {block.header?.proposer ? (
                <Link className="font-mono text-brand" href={`/explorer/address/${block.header.proposer}`}>
                  {block.header.proposer}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
      ) : null}
      <h2 className="mt-8 font-bold">{t.transactions}</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {(block?.transactions ?? []).map((tx) => (
          <li key={tx.id}>
            <Link href={`/explorer/tx/${encodeURIComponent(tx.id)}`} className="font-mono text-brand hover:underline">
              {tx.id}
            </Link>{" "}
            <span className="text-ink-2">{txSummary(tx, assets, u, t.fee)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TxView({ id }: { id: string }) {
  const { lang } = useLanguage();
  const t = explorerCopy[lang];
  const u = uxCopy[lang];
  const assets = useAssetRegistry();
  const [tx, setTx] = useState<{
    id: string;
    type?: string;
    from?: string;
    to?: string;
    amount?: number;
    fee?: number;
    assetId?: string;
    payload?: Record<string, unknown> | null;
    blockHeight?: number;
  } | null>(null);
  const [cosmosTx, setCosmosTx] = useState<CosmosTxSummary | null>(null);
  const [error, setError] = useState("");

  // Cosmos hashes have no `0x` prefix, so the EVM compat lookup (which only accepts
  // `0x` + 64 hex) can never resolve them. Fetch the node's REST tx endpoint instead.
  const cosmosHash = isCosmosTxHash(id);

  useEffect(() => {
    setTx(null);
    setCosmosTx(null);
    setError("");
    if (cosmosHash) {
      void fetchCosmosTx(id)
        .then((summary) => (summary ? setCosmosTx(summary) : setError(t.notFound)))
        .catch(() => setError(t.notFound));
      return;
    }
    void networkJson<typeof tx>(`transactions/${encodeURIComponent(id)}`)
      .then(setTx)
      .catch(() => setError(t.notFound));
  }, [id, cosmosHash, t.notFound]);

  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Eyebrow>
        <Link href="/explorer">{t.title}</Link>
      </Eyebrow>
      <h1 className="mt-3 text-h2 font-bold">{t.transactions}</h1>
      <div className="mt-4">
        <NetworkStatus />
      </div>
      {error ? <p className="mt-4 text-sm text-warm">{error}</p> : null}
      {!tx && !cosmosTx && !error ? <PeopleLoader /> : null}
      {cosmosTx ? (
        <dl className="mt-6 space-y-2 text-sm" data-testid="cosmos-tx">
          <div>
            <dt className="text-ink-3">{t.hash}</dt>
            <dd className="break-all font-mono">{cosmosTx.hash}</dd>
          </div>
          {cosmosTx.height !== undefined ? (
            <div>
              <dt className="text-ink-3">{t.height}</dt>
              <dd className="font-mono">#{cosmosTx.height}</dd>
            </div>
          ) : null}
          {cosmosTx.time ? (
            <div>
              <dt className="text-ink-3">{t.time}</dt>
              <dd className="font-mono">{cosmosTx.time}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-ink-3">{t.status}</dt>
            <dd className={cosmosTx.success ? "text-value" : "text-warm"}>
              {cosmosTx.success ? t.success : `${t.failed} (code ${cosmosTx.code})`}
            </dd>
          </div>
          <div>
            <dt className="text-ink-3">{t.messages}</dt>
            <dd className="space-y-1">
              {cosmosTx.messages.map((message) => (
                <p key={`${message.type}:${message.summary}`}>
                  <span className="font-mono text-ink-2">{message.type}</span> {message.summary}
                </p>
              ))}
            </dd>
          </div>
          {cosmosTx.fee ? (
            <div>
              <dt className="text-ink-3">{t.fee}</dt>
              <dd className="font-mono">{cosmosTx.fee}</dd>
            </div>
          ) : null}
          {cosmosTx.gasWanted !== undefined || cosmosTx.gasUsed !== undefined ? (
            <div>
              <dt className="text-ink-3">{t.gas}</dt>
              <dd className="font-mono">
                {(cosmosTx.gasUsed ?? 0).toLocaleString()} / {(cosmosTx.gasWanted ?? 0).toLocaleString()}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {tx ? (
        <dl className="mt-6 space-y-2 text-sm">
          <div>
            <dt className="text-ink-3">id</dt>
            <dd className="break-all font-mono">{tx.id}</dd>
          </div>
          <div>
            <dt className="text-ink-3">{t.type}</dt>
            <dd>{txTypeLabel(tx.type, u)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">{t.from}</dt>
            <dd>
              <Link className="font-mono text-brand" href={`/explorer/address/${tx.from}`}>
                {tx.from}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-ink-3">{t.to}</dt>
            <dd>
              {tx.to && /^0x[0-9a-fA-F]{40}$/.test(tx.to) ? (
                <Link className="font-mono text-brand" href={`/explorer/address/${tx.to}`}>
                  {tx.to}
                </Link>
              ) : tx.to === "batch" ? (
                u.several
              ) : (
                <span className="font-mono">{tx.to ?? "—"}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-ink-3">{t.amount}</dt>
            <dd data-testid="tx-amount">{txAmountText(tx, assets, u)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">{t.fee}</dt>
            <dd>{txFeeText(tx)}</dd>
          </div>
          {tx.blockHeight !== undefined ? (
            <div>
              <dt className="text-ink-3">{t.height}</dt>
              <dd>
                <Link className="text-brand" href={`/explorer/block/${tx.blockHeight}`}>
                  #{tx.blockHeight}
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}

export function AddressView({ address }: { address: string }) {
  const { lang } = useLanguage();
  const t = explorerCopy[lang];
  const u = uxCopy[lang];
  const assets = useAssetRegistry();
  const [account, setAccount] = useState<{
    balance?: number;
    nonce?: number;
    balances?: Record<string, number>;
    incomingTxs?: number;
    outgoingTxs?: number;
  } | null>(null);
  const [txs, setTxs] = useState<Array<{ id: string; type?: string; amount?: number; fee?: number; assetId?: string; payload?: Record<string, unknown> | null }>>([]);
  const [nfts, setNfts] = useState<Array<{ nftId: string; name: string }>>([]);

  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([
      networkJson<NonNullable<typeof account>>(`address/${encodeURIComponent(address)}`, { signal: controller.signal }),
      networkJson<typeof txs | { items?: typeof txs }>(`address/${encodeURIComponent(address)}/transactions?limit=30`, { signal: controller.signal }),
      networkJson<typeof nfts>(`nfts?owner=${encodeURIComponent(address)}`, { signal: controller.signal }),
    ]).then(([a, x, n]) => {
      if (controller.signal.aborted) return;
      if (a.status === "fulfilled") setAccount(a.value); else setFailed(true);
      if (x.status === "fulfilled") setTxs(Array.isArray(x.value) ? x.value : x.value.items ?? []);
      if (n.status === "fulfilled") setNfts(Array.isArray(n.value) ? visibleNfts(n.value) : []);
      setLoading(false);
    });
    return () => controller.abort();
  }, [address]);

  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Eyebrow>
        <Link href="/explorer">{t.title}</Link>
      </Eyebrow>
      <h1 className="mt-3 text-h2 font-bold">{t.address}</h1>
      <p className="mt-2 break-all font-mono text-sm">{address}</p>
      <div className="mt-4">
        <NetworkStatus />
      </div>
      {loading ? <PeopleLoader /> : failed ? <p role="alert" className="mt-6 text-warm">{t.networkUnavailable}</p> : null}
      <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-ink-3">{t.pplBalance}</p>
      <p className="mt-1 flex items-center gap-3 text-2xl font-black" data-testid="address-ppl">
        <AssetImage assetId="ppl" name="PPL" className="h-9 w-9" />
        {account ? formatPpl(account.balance) : "—"} PPL
      </p>
      <p className="text-sm text-ink-3">
        {u.operations}: {u.sent} {account?.outgoingTxs ?? 0} · {u.received} {account?.incomingTxs ?? 0}
      </p>
      <h2 className="mt-8 font-bold">{t.tokens}</h2>
      <ul className="mt-2 space-y-2 text-sm" data-testid="address-tokens">
        {Object.entries(account?.balances ?? {})
          .filter(([id, value]) => id !== "ppl" && Number(value) > 0 && !isHiddenAsset(id))
          .map(([id, value]) => {
            const asset = assets[id];
            const sym = displaySymbol(id, asset?.symbol, u);
            return (
              <li key={id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
                <Link href={`/explorer/token/${encodeURIComponent(id)}`} className="flex min-w-0 items-center gap-2 text-brand hover:underline">
                  <AssetImage assetId={id} tokenAddress={asset?.tokenAddress} src={asset?.creationMetadata?.image} name={sym} className="h-7 w-7" testBadgeLabel={u.testTokenNote} />
                  <span className="truncate font-semibold">{sym}</span>
                </Link>
                <span className="font-mono">{formatUnits(value, assetDecimals(asset))}</span>
              </li>
            );
          })}
      </ul>
      <h2 className="mt-8 font-bold">{t.nfts}</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {nfts.map((nft) => (
          <li key={nft.nftId} className="font-mono">
            {nft.name} ({nft.nftId})
          </li>
        ))}
      </ul>
      <h2 className="mt-8 font-bold">{t.transactions}</h2>
      <ul className="mt-2 space-y-2 text-sm">
        {!loading && txs.length === 0 ? <li className="text-ink-3">{u.noTx}</li> : null}
        {txs.map((tx) => (
          <li key={tx.id}>
            <Link href={`/explorer/tx/${encodeURIComponent(tx.id)}`} className="font-mono text-brand hover:underline">
              {tx.id}
            </Link>{" "}
            <span className="text-ink-2">{txSummary(tx, assets, u, t.fee)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6">
        <WalletGateLink className="text-sm font-semibold text-brand" connectLabel={u.openWallet}>
          {u.myWallet}
        </WalletGateLink>
      </p>
    </section>
  );
}
