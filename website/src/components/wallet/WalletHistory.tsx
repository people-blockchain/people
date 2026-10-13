"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { networkJson } from "@/lib/network-client";
import { walletUxCopy } from "@/lib/wallet-ux-copy";
import { forgetPending, operationStatus, readPending, type WalletOperation } from "@/lib/wallet-activity";
import { formatTokenBalance, type TransferAsset } from "@/lib/token-transfer";
import { formatPpl, txAmountAssetId } from "@/lib/asset-amounts";
import { uxCopy, displaySymbol, txTypeLabel } from "@/lib/ux-copy";

export function WalletHistory({address, chainId, revision, assets}: {address:string; chainId:string; revision:number; assets:TransferAsset[]}) {
  const {lang} = useLanguage(); const c = walletUxCopy(lang); const u = uxCopy[lang];
  const [rows,setRows] = useState<WalletOperation[]>([]);
  const [limit,setLimit] = useState(50); const [filter,setFilter] = useState("all");
  const [finalized,setFinalized] = useState(0); const [now,setNow] = useState(0);
  const [error,setError] = useState(false); const [more,setMore] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      networkJson<WalletOperation[]>(`address/${address}/transactions?limit=${limit}&offset=0`, {signal:controller.signal,cache:"no-store"}),
      networkJson<{finalizedHeight?:number}>("metrics", {signal:controller.signal,cache:"no-store"}),
    ]).then(([history,metrics]) => {
      if (controller.signal.aborted) return;
      forgetPending(chainId,address,history.map(tx=>tx.id));
      setRows([...readPending(chainId,address),...history].sort((a,b)=>b.timestamp-a.timestamp));
      setFinalized(metrics.finalizedHeight ?? 0); setNow(Date.now()); setError(false); setMore(history.length>=limit);
    }).catch(() => {if (!controller.signal.aborted) {setError(true);setRows(prev => [...readPending(chainId,address),...prev.filter(tx=>tx.blockHeight)]);setNow(Date.now());}});
    return () => controller.abort();
  },[address,chainId,revision,limit]);
  return <section className="rounded-2xl border border-line bg-surface p-4"><h2 className="font-bold">{c.history}</h2>
    <p className="mt-2 text-xs text-ink-3">{c.historyHint}</p>
    <div className="my-3 flex flex-wrap gap-2">{["all","incoming","outgoing"].map(f=><button key={f} type="button" aria-pressed={filter===f} onClick={()=>setFilter(f)} className={`rounded-lg px-3 py-2 text-sm ${filter===f?"bg-brand text-brand-ink":"bg-surface-2"}`}>{c[f as "all"|"incoming"|"outgoing"]}</button>)}</div>
    {error && <p role="status" className="text-sm text-warm">{c.unavailable}</p>}
    {!rows.length && <p className="text-sm text-ink-3">{c.empty}</p>}
    <ul className="divide-y divide-line">{rows.filter(tx=>filter==="all" || (filter==="outgoing" ? tx.from.toLowerCase()===address.toLowerCase() : tx.from.toLowerCase()!==address.toLowerCase())).map(tx=>{
      const outgoing=tx.from.toLowerCase()===address.toLowerCase(); const amountAsset=txAmountAssetId(tx); const asset=assets.find(a=>a.assetId===amountAsset); const native=amountAsset==="ppl";
      const operationName: Record<string,string> = { transfer:c.transferType, nftTransfer:c.nftTransferType, registerParticipant:c.registrationType, participantReferral:c.referralType, growthClaim:c.rewardsType, nftMint:c.nftMintType };
      return <li key={tx.id} className="py-4"><div className="flex flex-wrap justify-between gap-2"><Link href={`/explorer/tx/${encodeURIComponent(tx.id)}`} className="text-brand hover:underline">{outgoing?c.outgoing:c.incoming} · {operationName[tx.type] ?? txTypeLabel(tx.type, u)}</Link><span className="break-all font-mono text-sm">{tx.type==="nftTransfer"?String(tx.payload?.nftId??"NFT"):`${native?formatPpl(tx.amount):formatTokenBalance(tx.amount,asset?.decimals??-1)} ${native?"PPL":displaySymbol(amountAsset, asset?.symbol, u)}`}</span></div><p className="mt-1 break-all font-mono text-xs text-ink-3">{outgoing?tx.to:tx.from==="faucet"?c.faucetSender:tx.from}</p><p className="mt-2 text-xs text-ink-2">{c[operationStatus(tx,finalized,now)]} · {new Date(tx.timestamp).toLocaleString(lang)}</p>{typeof tx.payload?.memo==="string" && <p className="mt-2 break-words text-sm">{c.memo}: {tx.payload.memo}</p>}</li>;
    })}</ul>{more && <button type="button" className="mt-3 text-sm text-brand" onClick={()=>setLimit(l=>l+50)}>{c.more}</button>}
  </section>;
}
