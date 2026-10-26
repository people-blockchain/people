"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { connectExplorer } from "@/lib/explorer-live";
import { connectEvmExplorer } from "@/lib/evm/explorer-live";
import { isCosmosEvmChain } from "@/lib/chain-mode";
import { sendNativeTransfer } from "@/lib/evm/wallet-send";
import type { Hex } from "viem";
import { AssetImage } from "@/components/ui/AssetImage";
import { RecipientField } from "./RecipientField";
import { WalletDialog } from "./WalletDialog";
import { WalletHistory } from "./WalletHistory";
import { WalletConnectPanel } from "./WalletConnectPanel";
import { walletUxCopy } from "@/lib/wallet-ux-copy";
import { maxTransferAmount, parseWalletAddress, readPending, trackPending } from "@/lib/wallet-activity";
import { upsertWallet } from "@/lib/wallet-vault";
import type { UnsignedTx } from "@/lib/people-sign";
import { formatTokenBalance, validateTransfer, type TransferAsset } from "@/lib/token-transfer";
import { formatAssetUnits, formatPpl } from "@/lib/asset-amounts";
import { uxCopy, fill, displaySymbol } from "@/lib/ux-copy";
import { displayAssetName, isHiddenAsset } from "@/lib/hidden-assets";
import { fractionOfBalance } from "@/lib/swap-math";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { partnerCopy } from "@/lib/partner/copy";
import { useWallet } from "@/context/WalletContext";
import { walletCopy } from "@/lib/wallet-copy";
import { signFactoryTx } from "@/lib/people-sign";
import { DEFAULT_TRANSFER_FEE, networkJson } from "@/lib/network-client";
import { NetworkStatus } from "@/components/NetworkStatus";
import type { WalletOnboardingMode } from "./useWalletOnboarding";
import { PeopleWalletMark } from "./PeopleWalletMark";
import { WalletPwaBootstrap } from "./WalletPwaBootstrap";
import { WalletInstallButton } from "./WalletInstallButton";
import { WalletSoonAction } from "./WalletSoonOption";
import { walletFeatures, walletShowsSoonPlaceholders } from "@/lib/wallet-features";
import { disconnectPeopleWallet } from "@/lib/wallet-disconnect";
import { faucetErrorMessage } from "@/lib/faucet-error";

interface AccountView {
  balance: number;
  nonce: number;
  balances: Record<string, number>;
}

interface FaucetFundResult {
  ok?: boolean;
  error?: string;
  message?: string;
  txId?: string;
  chainId?: number;
  pending?: boolean;
}

/** The faucet allows 100 PPL per address per day; the one-tap action always asks for the max. */
const FAUCET_MAX_PPL = "100";

export function WalletApp({ wsUrl, chainId, nftTransfersEnabled = false }: { wsUrl: string; chainId: string; nftTransfersEnabled?: boolean }) {
  const { session } = useWallet();
  return <WalletView key={session?.address ?? "locked"} wsUrl={wsUrl} chainId={chainId} nftTransfersEnabled={nftTransfersEnabled} />;
}

function WalletView({ wsUrl, chainId, nftTransfersEnabled }: { wsUrl: string; chainId: string; nftTransfersEnabled: boolean }) {
  const { lang } = useLanguage();
  const t = walletCopy[lang];
  const c = walletUxCopy(lang);
  const u = uxCopy[lang];
  const partnerT = partnerCopy[lang];
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("return");
  const {
    wallets,
    session,
    lock,
    exportPrivateKey,
    exportMnemonic,
    exportCloudPrivateKey,
    forget,
    refresh,
    changePassword,
  } = useWallet();
  const isCloud = session?.kind === "cloud";
  const [tab, setTab] = useState<"tokens" | "nft" | "history">("tokens");
  const [sheet, setSheet] = useState<null | "send" | "receive" | "settings">(null);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwNew2, setPwNew2] = useState("");
  const [revision, setRevision] = useState(0);
  const [memo, setMemo] = useState("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<{tx:UnsignedTx; display:string; remaining:string; reviewedNative:number; reviewedAsset:number} | null>(null);
  const [selectedNft, setSelectedNft] = useState<{nftId:string;name:string;imageUri?:string}|null>(null);
  const [nftTo, setNftTo] = useState("");
  const [walletName, setWalletName] = useState("");
  const [connectOverlay, setConnectOverlay] = useState<null | { mode: WalletOnboardingMode; walletId?: string }>(
    null
  );
  const [account, setAccount] = useState<AccountView | null>(null);
  const [nfts, setNfts] = useState<Array<{ nftId: string; name: string; imageUri?: string }>>([]);
  const [qr, setQr] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [faucetAmount, setFaucetAmount] = useState("10");
  const [assetId, setAssetId] = useState("ppl");
  const [assets, setAssets] = useState<TransferAsset[]>([]);
  const [busy, setBusy] = useState(false);
  /** In flight for the one-tap faucet action only (drives its "Requesting…" label). */
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reveal, setReveal] = useState("");
  const chainRequest = useRef<AbortController | null>(null);
  const refreshChain = useRef<((address: string) => Promise<void>) | null>(null);

  const loadChain = useCallback((address: string) => {
    return refreshChain.current?.(address) ?? Promise.resolve();
  }, []);

  useEffect(() => {
    const address = session?.address;
    if (!address) return;
    let stopped = false;
    let pending = false;
    let queued = false;
    const refresh = async (requestedAddress: string) => {
      if (stopped || requestedAddress !== address) return;
      if (pending) { queued = true; return; }
      pending = true;
      do {
        queued = false;
        const controller = new AbortController();
        chainRequest.current = controller;
        const init = { signal: controller.signal, cache: "no-store" as const };
        const [balance, owned, registry] = await Promise.allSettled([
          networkJson<AccountView>(`address/${address}`, init),
          networkJson<Array<{ nftId: string; name: string; imageUri?: string }>>(`nfts?owner=${encodeURIComponent(address)}`, init),
          networkJson<TransferAsset[]>("assets", init),
        ]);
        if (stopped) break;
        if (balance.status === "fulfilled") {
          const acc = balance.value;
          setAccount({ balance: Number(acc.balance ?? 0), nonce: Number(acc.nonce ?? 0), balances: acc.balances ?? {} });
          setRevision(r => r + 1);
        }
        if (owned.status === "fulfilled") setNfts(Array.isArray(owned.value) ? owned.value : []);
        if (registry.status === "fulfilled" && Array.isArray(registry.value)) setAssets(registry.value);
      } while (queued && !stopped);
      pending = false;
    };
    refreshChain.current = refresh;
    const onVisible = () => {
      if (document.visibilityState !== "hidden") void refresh(address);
    };
    void refresh(address);
    const disconnect = isCosmosEvmChain()
      ? connectEvmExplorer({ url: wsUrl, chainId, onPhase: () => {}, onFeed: onVisible })
      : connectExplorer({
      url: wsUrl,
      chainId,
      onPhase: () => {},
      onFeed: onVisible,
    });
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    void import("qrcode").then((QR) =>
      QR.toDataURL(address, { margin: 1, width: 220 }).then((value) => { if (!stopped) setQr(value); })
    ).catch(() => {});
    return () => {
      stopped = true;
      refreshChain.current = null;
      chainRequest.current?.abort();
      disconnect();
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session?.address, wsUrl, chainId]);

  const tokenRows = useMemo(() => {
    const balances = account?.balances ?? {};
    return Object.entries(balances).filter(([id, value]) => id !== "ppl" && Number(value) > 0 && !isHiddenAsset(id));
  }, [account]);

  const selectedAsset = assets.find((asset) => asset.assetId === assetId);
  const selectedSymbol = displaySymbol(assetId, selectedAsset?.symbol, u);
  const selectedBalance = assetId === "ppl" ? account?.balance ?? 0 : account?.balances[assetId] ?? 0;
  const sendLabel = t.send.replace(/PPL/g, selectedSymbol);
  const transferErrors: Record<string, string> = {
    address: c.addressError, amount: c.amountError, precision: c.precisionError,
    asset: c.assetError, balance: c.balanceError, fee: c.feeError,
  };

  /**
   * Request testnet PPL. `sentMessage` overrides the default success line: the one-tap action on
   * the wallet asks for the faucet's maximum and says exactly that, while the Settings form keeps
   * the generic wording. Both share this path (and its error mapping).
   */
  async function doFaucet(amount: string, sentMessage?: string) {
    if (!session) return;
    setBusy(true);
    setFaucetBusy(true);
    setError("");
    setNotice("");
    try {
      const requested = amount.trim().replace(",", ".");
      if (!/^\d+(?:\.\d{1,18})?$/.test(requested) || !Number.isFinite(Number(requested)) || Number(requested) <= 0) throw new Error(c.amountError);
      let result: FaucetFundResult;
      if (isCosmosEvmChain()) {
        try {
          const res = await fetch("/api/evm/faucet/fund", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ address: session.address, amount: requested }),
          });
          result = (await res.json()) as FaucetFundResult;
        } catch {
          // Network failure, or a non-JSON body from the proxy (e.g. its 502).
          throw new Error(c.faucetErrUnavailable);
        }
        // Map the faucet's codes to a sentence a person can act on (daily budget keeps its own).
        if (!result.ok) throw new Error(faucetErrorMessage(result.error, c, result.message));
      } else {
        result = await networkJson<FaucetFundResult>("faucet/fund", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address: session.address, amount: requested }),
        });
        if (!result.ok) throw new Error(result.message ?? result.error ?? t.error);
      }
      setRevision(r=>r+1);
      setNotice(sentMessage ?? `${result.pending ? t.submitted : t.faucetOk}${result.txId ? ` · ${result.txId}` : ""}`);
      await loadChain(session.address);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
      setFaucetBusy(false);
    }
  }

  async function doSend(timestamp: number, nft?: {nftId:string;name:string}) {
    if (!session || !account) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (nft && !nftTransfersEnabled) throw new Error(c.nftUpgrade);
      const [fresh, health] = await Promise.all([
        networkJson<AccountView>(`address/${session.address}`, { cache: "no-store" }),
        networkJson<{ chainId: string }>("health", { cache: "no-store" }),
      ]);
      if (health.chainId !== chainId && String(health.chainId) !== String(chainId)) throw new Error(c.networkMismatch);
      if (readPending(chainId,session.address).some(tx=>tx.from===session.address && tx.nonce===fresh.nonce)) throw new Error(c.pendingOutgoing);
      if (memo.length > 256) throw new Error(c.memoLong);
      let transferAmount: number;
      try {
        if (nft && (!parseWalletAddress(nftTo) || parseWalletAddress(nftTo)?.toLowerCase()===session.address.toLowerCase())) throw new Error("address");
        const fee = isCosmosEvmChain() ? 0 : DEFAULT_TRANSFER_FEE;
        if (nft && fresh.balance < fee) throw new Error("fee");
        transferAmount = nft ? 0 : validateTransfer({
          to, amount, assetId, decimals: selectedAsset?.decimals ?? -1,
          balance: assetId === "ppl" ? fresh.balance : fresh.balances?.[assetId] ?? 0,
          nativeBalance: fresh.balance, fee,
        });
      } catch (err) {
        throw new Error(transferErrors[err instanceof Error ? err.message : "amount"] ?? t.error);
      }
      if (nft) {
        const owned = await networkJson<Array<{nftId:string}>>(`nfts?owner=${session.address}`,{cache:"no-store"});
        if (!owned.some(item=>item.nftId===nft.nftId)) throw new Error(c.unavailable);
      }
      const tx: UnsignedTx = {
        chainId: health.chainId,
        id: `${session.address}-transfer-${timestamp}`,
        from: session.address,
        to: nft ? parseWalletAddress(nftTo)! : to.trim(),
        amount: nft ? 0 : transferAmount,
        assetId: nft ? "ppl" : assetId,
        fee: isCosmosEvmChain() ? 0 : DEFAULT_TRANSFER_FEE,
        nonce: fresh.nonce,
        timestamp,
        type: nft ? "nftTransfer" : "transfer",
        payload: nft ? {nftId:nft.nftId} : memo ? {memo} : undefined,
      };
      setDraft({tx,reviewedNative:fresh.balance,reviewedAsset:fresh.balances?.[tx.assetId??"ppl"]??0,display:nft ? nft.name : `${assetId==="ppl"?transferAmount:formatTokenBalance(transferAmount,selectedAsset?.decimals??-1)} ${selectedSymbol}`,remaining: nft || assetId==="ppl" ? formatPpl(Number(maxTransferAmount(fresh.balance,DEFAULT_TRANSFER_FEE+(nft?0:transferAmount))))+" PPL" : formatTokenBalance((fresh.balances?.[assetId]??0)-transferAmount,selectedAsset?.decimals??-1)+" "+selectedSymbol});
      setSheet(null);
      setSelectedNft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {setBusy(false);}
  }

  async function confirmSend() {
    if (!session || !draft) return;
    setBusy(true);setError("");
    try {
      const [fresh,health] = await Promise.all([networkJson<AccountView>(`address/${session.address}`,{cache:"no-store"}),networkJson<{chainId:string}>("health",{cache:"no-store"})]);
      const txDraft = draft.tx;
      if (txDraft.type==="nftTransfer" && !nftTransfersEnabled) throw new Error(c.nftUpgrade);
      if(fresh.balance!==draft.reviewedNative || (fresh.balances?.[txDraft.assetId??"ppl"]??0)!==draft.reviewedAsset) throw new Error(c.feeChanged);
      if (String(health.chainId)!==String(chainId)) throw new Error(c.networkMismatch);
      if (fresh.nonce!==txDraft.nonce || fresh.balance < txDraft.fee+(txDraft.assetId==="ppl"?txDraft.amount:0) || (txDraft.assetId!=="ppl" && (fresh.balances?.[txDraft.assetId??""]??0)<txDraft.amount)) throw new Error(c.feeChanged);
      if (txDraft.type==="nftTransfer") {
        const owned=await networkJson<Array<{nftId:string}>>(`nfts?owner=${session.address}`,{cache:"no-store"});
        if(!owned.some(n=>n.nftId===txDraft.payload?.nftId)) throw new Error(c.unavailable);
      }
      if (isCosmosEvmChain()) {
        if (txDraft.assetId !== "ppl" || txDraft.type !== "transfer") throw new Error(c.assetError);
        const hash = await sendNativeTransfer({
          privateKey: session.privateKey as Hex,
          to: txDraft.to as `0x${string}`,
          amountPpl: txDraft.amount,
        });
        trackPending(chainId, session.address, { ...txDraft, id: hash });
      } else {
        const tx=signFactoryTx(session.privateKey,txDraft);
        const result = await networkJson<{ accepted?: boolean; error?: string }>("tx", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(tx),
        });
        if (!result.accepted) throw new Error(result.error ?? t.error);
        trackPending(chainId,session.address,tx);
      }
      setRevision(r=>r+1);setDraft(null);setMemo("");setNftTo("");
      setNotice(t.submitted);
      setTo("");
      setAmount("");
      await loadChain(session.address);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  }

  async function showExport(kind: "key" | "seed") {
    try {
      if (isCloud) {
        if (kind === "seed") {
          setNotice(c.noSeed);
          return;
        }
        const value = await exportCloudPrivateKey();
        setReveal(value);
        return;
      }
      const pw = window.prompt(t.password);
      if (!pw) return;
      const value = kind === "key" ? await exportPrivateKey(pw) : await exportMnemonic(pw);
      setReveal(value ?? "");
      if (!value) setNotice(c.noSeed);
    } catch {
      setError(t.password);
    }
  }

  const shortAddress = session ? `${session.address.slice(0, 6)}…${session.address.slice(-4)}` : "";

  async function submitPasswordChange() {
    setError("");
    setNotice("");
    if (pwNew.length < 8) {
      setError(t.minPassword);
      return;
    }
    if (pwNew !== pwNew2) {
      setError(t.passwordConfirm);
      return;
    }
    setBusy(true);
    try {
      await changePassword(pwCurrent, pwNew);
      setPwCurrent("");
      setPwNew("");
      setPwNew2("");
      setNotice(c.changePasswordOk);
    } catch {
      setError(t.password);
    } finally {
      setBusy(false);
    }
  }

  const sendForm = session ? (
    <div className="space-y-3">
      <label className="block text-sm">
        {t.tokens}
        <select value={assetId} disabled={busy} onChange={(event) => { setAssetId(event.target.value); setAmount(""); setError(""); }} className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2">
          <option value="ppl">PEOPLE (PPL)</option>
          {tokenRows.map(([id]) => {
            const asset = assets.find((item) => item.assetId === id);
            return <option key={id} value={id} disabled={!asset}>{asset ? `${id === "usdt" ? u.testUsdt : displayAssetName(id, asset.name)} (${displaySymbol(id, asset.symbol, u)}) · ${id}` : id}</option>;
          })}
        </select>
      </label>
      <p className="flex items-center gap-2 break-all text-sm text-ink-3">
        <AssetImage assetId={assetId} tokenAddress={selectedAsset?.tokenAddress} src={selectedAsset?.creationMetadata?.image} name={selectedSymbol} className="h-8 w-8" testBadgeLabel={u.testTokenNote} />
        {fill(u.available, { amount: `${assetId === "ppl" ? formatPpl(selectedBalance) : formatAssetUnits(selectedBalance, selectedAsset?.decimals ?? -1)} ${selectedSymbol}` })}
      </p>
      <RecipientField value={to} onChange={setTo} label={t.to} storageKey={`people-contacts:${chainId}:${session.address}`} disabled={busy} />
      <label className="block text-sm">
        {t.amount}
        <span className="relative mt-1 block"><input aria-label={t.amount} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-xl border border-line bg-canvas py-2 pl-3 pr-20" /><button type="button" disabled={busy||!account} className="absolute inset-y-0 right-3 text-xs font-semibold text-brand" onClick={()=>setAmount(assetId==="ppl"?maxTransferAmount(selectedBalance,DEFAULT_TRANSFER_FEE):formatTokenBalance(selectedBalance,selectedAsset?.decimals??-1))}>{u.max}</button></span>
      </label>
      <div className="flex flex-wrap gap-2">
        {[0.25, 0.5, 0.75].map((f) => (
          <button key={f} type="button" disabled={busy || !account} onClick={() => setAmount(fractionOfBalance({ fraction: f, pplIn: assetId === "ppl", pplBalance: account?.balance ?? 0, tokenBalance: assetId === "ppl" ? 0 : selectedBalance, decimals: selectedAsset?.decimals ?? 6, fee: DEFAULT_TRANSFER_FEE, pplWholeOnly: false }))} className="min-h-9 rounded-lg border border-line px-2.5 text-xs font-semibold text-ink-2 hover:border-brand disabled:opacity-40">
            {f * 100}%
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-3">{fill(u.maxHint, { fee: formatPpl(DEFAULT_TRANSFER_FEE) })}</p>
      <label className="block text-sm">{c.memo}<textarea value={memo} maxLength={256} onChange={event=>setMemo(event.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2" /><span className="text-xs text-ink-3">{memo.length}/256</span></label>
      <p className="text-xs text-ink-3">{t.fee}: {DEFAULT_TRANSFER_FEE} PPL</p>
      <button type="button" disabled={busy || !account || !to.trim() || !amount.trim() || (assetId !== "ppl" && !selectedAsset)} onClick={() => void doSend(Date.now())} className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-ink disabled:opacity-40">
        {c.review}
      </button>
    </div>
  ) : null;

  const settingsBody = session ? (
    <div className="space-y-4">
      {!isCloud ? (
        <section className="space-y-3 rounded-2xl border border-line bg-surface-2 p-4">
          <h3 className="font-bold">{c.changePassword}</h3>
          <label className="block text-sm">{c.currentPassword}<input type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2" /></label>
          <label className="block text-sm">{c.newPassword}<input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2" /></label>
          <label className="block text-sm">{t.passwordConfirm}<input type="password" value={pwNew2} onChange={(e) => setPwNew2(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2" /></label>
          <button type="button" disabled={busy || !pwCurrent || !pwNew} onClick={() => void submitPasswordChange()} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-40">{c.save}</button>
        </section>
      ) : null}
      <section className="space-y-3 rounded-2xl border border-line bg-surface-2 p-4">
        <h3 className="font-bold">{c.settings}</h3>
        {isCloud ? <p className="text-xs text-ink-3">{t.cloudExportHint}</p> : null}
        {!isCloud ? (
          <>
            <label className="block text-sm">{c.rename}<input value={walletName} placeholder={wallets.find(w=>w.id===session.id)?.label} maxLength={64} onChange={e=>setWalletName(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2" /></label>
            <button type="button" disabled={!walletName.trim()} className="text-sm text-brand disabled:opacity-40" onClick={()=>{const w=wallets.find(w=>w.id===session.id);if(w){try{upsertWallet({...w,label:walletName.trim()});refresh();setWalletName("");}catch{setError(t.error);}}}}>{c.save}</button>
            <p className="text-sm text-ink-3">{wallets.find(w=>w.id===session.id)?.backupConfirmedAt?c.saved:c.unsaved}</p>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={!!wallets.find(w=>w.id===session.id)?.backupConfirmedAt} onChange={e=>{const w=wallets.find(w=>w.id===session.id);if(w){try{upsertWallet({...w,backupConfirmedAt:e.target.checked?Date.now():undefined});refresh();}catch{setError(t.error);}}}} />{c.backedUp}</label>
            <p className="text-xs text-ink-3">{c.backupHint}</p>
            <button type="button" className="text-sm text-brand" onClick={()=>{const w=wallets.find(w=>w.id===session.id);if(!w)return;const blob=new Blob([JSON.stringify({version:1,chainId,wallet:w})],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`people-wallet-${session.address}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>{c.download}</button>
            <div className="flex flex-wrap gap-2">{wallets.filter(w=>w.id!==session.id).map(w=><button type="button" key={w.id} className="rounded-lg border border-line px-3 py-2 text-sm" onClick={()=>setConnectOverlay({ mode: "unlock", walletId: w.id })}>{c.switch}: {w.label}</button>)}</div>
            <button type="button" className="text-sm text-brand" onClick={()=>setConnectOverlay({ mode: "import" })}>{t.import}</button>
          </>
        ) : null}
      </section>
      <details className="rounded-2xl border border-warm/40 bg-surface p-4">
        <summary className="cursor-pointer text-sm font-semibold text-warm">{t.faucet}</summary>
        <p className="mt-1 text-xs text-ink-3">{t.faucetHint}</p>
        <label className="mt-3 block text-sm">{t.amount} · PPL<input className="mt-2 w-full rounded-xl border border-line bg-bg px-3 py-2" inputMode="decimal" value={faucetAmount} onChange={e => setFaucetAmount(e.target.value)} disabled={busy} maxLength={50} /></label>
        <a href="https://node.peopleblockchain.network/faucet" target="_blank" rel="noreferrer" className="mt-3 block text-sm text-brand">PEOPLE Blockchain testnet · PPL · 97401 ↗</a>
        <button type="button" disabled={busy} onClick={() => void doFaucet(faucetAmount)} className="mt-3 rounded-xl border border-warm px-4 py-2 text-sm font-semibold disabled:opacity-40">{t.faucet}</button>
      </details>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="text-sm text-ink-2" onClick={() => void showExport("key")}>{t.exportKey}</button>
        <button type="button" className="text-sm text-ink-2" onClick={() => void showExport("seed")}>{t.exportSeed}</button>
        <button type="button" className="text-sm text-brand" onClick={lock}>{t.lock}</button>
        <button
          type="button"
          className="text-sm text-warm"
          onClick={() => {
            if (isCloud) {
              void disconnectPeopleWallet({ lock });
              return;
            }
            if (window.confirm(t.forget)) forget(session.id);
          }}
        >
          {isCloud ? t.cloudDisconnect : t.forget}
        </button>
      </div>
      <p className="text-xs text-ink-3">{t.nonce}: {account?.nonce ?? "—"}</p>
    </div>
  ) : null;

  return (
    <section className="mx-auto max-w-lg px-4 py-8 sm:px-6 lg:max-w-xl lg:py-10" data-testid="people-wallet-app">
      <WalletPwaBootstrap />
      {returnTo === "/partner" ? (
        <p className="mb-4">
          <Link prefetch={false} href="/partner" className="text-sm font-semibold text-brand hover:underline">
            ← {partnerT.cabinet}
          </Link>
        </p>
      ) : null}
      <div className="mb-4">
        <NetworkStatus />
      </div>

      {error ? <p className="mb-4 text-sm text-warm">{t.error}: {error}</p> : null}
      {notice ? <p className="mb-4 text-sm text-value">{notice}</p> : null}

      {!session ? (
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
          <PeopleWalletMark size="lg" className="mb-3" />
          <p className="text-sm text-ink-2">{t.lead}</p>
          <WalletConnectPanel className="mt-6" />
        </div>
      ) : null}

      {session ? (
        <div className="space-y-6">
          <header className="flex items-start justify-between gap-3">
            <PeopleWalletMark />
            <button type="button" aria-label={c.settingsGearAria} data-testid="wallet-settings-button" onClick={() => setSheet("settings")} className="rounded-xl border border-line p-2.5 text-ink-2 hover:bg-surface-2">
              <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
            </button>
          </header>

          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-sm text-ink-2" title={session.address}>{shortAddress}</p>
              <button
                type="button"
                data-testid="wallet-copy-address"
                className="rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-surface-2"
                onClick={() => {
                  void navigator.clipboard.writeText(session.address);
                  setNotice(t.copied);
                }}
              >
                {c.copy}
              </button>
            </div>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-ink-3">{c.totalBalance}</p>
            <p className="mt-1 flex items-center gap-3 text-3xl font-black text-ink" data-testid="wallet-ppl">
              <AssetImage assetId="ppl" name="PPL" className="h-10 w-10" />
              {account ? formatPpl(account.balance) : "—"} <span className="text-lg font-bold text-ink-2">{t.ppl}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button type="button" data-testid="wallet-action-send" onClick={() => setSheet("send")} className="rounded-2xl bg-brand py-4 text-sm font-bold text-brand-ink shadow-sm">{c.sendTab}</button>
            <button type="button" data-testid="wallet-action-receive" onClick={() => setSheet("receive")} className="rounded-2xl border border-line bg-surface py-4 text-sm font-bold text-ink">{c.receiveQr}</button>
            <Link href="/swap" data-testid="wallet-action-swap" className="flex items-center justify-center rounded-2xl border border-line bg-surface py-4 text-sm font-bold text-ink">{c.swapAction}</Link>
            {walletShowsSoonPlaceholders && !walletFeatures.buy ? (
              <WalletSoonAction label={c.buyAction} testId="wallet-action-buy" />
            ) : null}
            {/*
              Testnet PPL for a fresh wallet. Spans the grid's full width (2 / 4 columns) so the
              action row stays tidy at 390px and on desktop instead of leaving one orphan cell.
            */}
            <button
              type="button"
              data-testid="wallet-action-faucet"
              disabled={busy}
              onClick={() => void doFaucet(FAUCET_MAX_PPL, c.faucetSent)}
              className="col-span-2 rounded-2xl border border-line bg-surface py-3.5 text-sm font-bold text-ink disabled:opacity-40 sm:col-span-4"
            >
              {faucetBusy ? c.faucetRequesting : c.faucetAction}
            </button>
          </div>
          <p className="text-xs text-ink-3">{c.faucetActionHint}</p>

          <WalletInstallButton />

          <div role="tablist" aria-label={c.walletTabsAria} className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-surface p-1.5">
            {(["tokens", "nft", "history"] as const).map((value) => (
              <button key={value} type="button" role="tab" id={`wallet-tab-${value}`} aria-selected={tab === value} aria-controls={`wallet-panel-${value}`} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)} className={`min-w-0 rounded-xl px-1 py-3 text-xs font-semibold sm:text-sm ${tab === value ? "bg-brand text-brand-ink" : "text-ink-3 hover:bg-surface-2 hover:text-ink"}`}>
                {value === "tokens" ? c.tokensTab : value === "nft" ? c.nftTab : c.historyTab}
              </button>
            ))}
          </div>

          <div id="wallet-panel-tokens" role="tabpanel" aria-labelledby="wallet-tab-tokens" hidden={tab !== "tokens"} className="space-y-4">
            <label className="block text-sm">{c.search}<input type="search" value={search} onChange={event=>setSearch(event.target.value)} className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2" /></label>
            <p className="text-xs text-ink-3">{c.identity}</p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                <span className="flex min-w-0 items-center gap-3"><AssetImage assetId="ppl" name="PPL" className="h-9 w-9" /><span className="font-semibold">PEOPLE</span></span>
                <span className="font-mono">{account ? formatPpl(account.balance) : "—"}</span>
              </li>
              {tokenRows.filter(([id])=>{const a=assets.find(a=>a.assetId===id);return `${id} ${a?.name} ${a?.symbol}`.toLowerCase().includes(search.toLowerCase());}).map(([id, value]) => {
                const asset = assets.find((item) => item.assetId === id);
                return (
                  <li key={id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                    <Link href={`/explorer/tokens#${encodeURIComponent(id)}`} className="flex min-w-0 items-center gap-3 text-brand hover:underline">
                      <AssetImage assetId={id} tokenAddress={asset?.tokenAddress} src={asset?.creationMetadata?.image} name={displaySymbol(id, asset?.symbol, u)} testBadgeLabel={u.testTokenNote} />
                      <span className="min-w-0 truncate font-semibold">{id === "usdt" ? u.testUsdt : displayAssetName(id, asset?.name)}</span>
                    </Link>
                    <span className="min-w-0 break-all text-right font-mono">{formatAssetUnits(value, asset?.decimals ?? -1)}</span>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link href={`/explorer/address/${session.address}`} className="font-semibold text-brand hover:underline">{t.explorer}</Link>
              <Link href="/create" className="font-semibold text-brand hover:underline">{t.factory}</Link>
            </div>
          </div>

          <div id="wallet-panel-nft" role="tabpanel" aria-labelledby="wallet-tab-nft" hidden={tab !== "nft"}>
            {nfts.length === 0 ? <p className="text-sm text-ink-3">—</p> : (
              <ul className="grid grid-cols-2 gap-3 text-sm">
                {nfts.filter(n=>`${n.name} ${n.nftId}`.toLowerCase().includes(search.toLowerCase())).map((nft) => (
                  <li key={nft.nftId} className="min-w-0 rounded-2xl border border-line bg-surface p-3">
                    <button type="button" onClick={()=>{setSelectedNft(nft);setNftTo("");}} className="block w-full text-left">
                      <AssetImage src={nft.imageUri} name={nft.name} nft className="aspect-square w-full" />
                      <span className="mt-2 block truncate font-semibold">{nft.name}</span>
                      <span className="block truncate font-mono text-xs text-ink-3">{nft.nftId}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div id="wallet-panel-history" role="tabpanel" aria-labelledby="wallet-tab-history" hidden={tab !== "history"}>
            {tab === "history" && <WalletHistory address={session.address} chainId={chainId} revision={revision} assets={assets} />}
          </div>
        </div>
      ) : null}
      {sheet === "send" && session ? (
        <WalletDialog title={sendLabel} onClose={() => setSheet(null)}>
          {sendForm}
        </WalletDialog>
      ) : null}
      {sheet === "receive" && session ? (
        <WalletDialog title={c.receiveQr} onClose={() => setSheet(null)}>
          <div data-testid="wallet-receive-dialog" className="flex flex-col items-center gap-4">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="" className="h-52 w-52 rounded-xl bg-white p-3" />
            ) : null}
            <p className="break-all text-center font-mono text-xs text-ink-2">{session.address}</p>
            <button
              type="button"
              className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink"
              onClick={() => {
                void navigator.clipboard.writeText(session.address);
                setNotice(t.copied);
              }}
            >
              {t.copyAddress}
            </button>
          </div>
        </WalletDialog>
      ) : null}
      {sheet === "settings" && session ? (
        <WalletDialog title={c.settingsTab} onClose={() => setSheet(null)}>
          <div data-testid="wallet-settings-dialog">
            {reveal ? (
              <>
                <p className="mb-2 text-sm font-semibold text-warm">{t.writeDown}</p>
                <pre className="whitespace-pre-wrap break-all rounded-xl border border-warm/40 bg-surface p-3 font-mono text-xs">{reveal}</pre>
                <button type="button" className="mt-3 text-sm text-brand" onClick={() => setReveal("")}>{c.hide}</button>
              </>
            ) : (
              settingsBody
            )}
          </div>
        </WalletDialog>
      ) : null}
      {selectedNft && session && (
        <WalletDialog title={c.nftDetails} onClose={() => setSelectedNft(null)}>
          <AssetImage src={selectedNft.imageUri} name={selectedNft.name} nft className="mx-auto aspect-square w-48" />
          <h3 className="mt-3 font-bold">{selectedNft.name}</h3>
          <p className="my-3 break-all font-mono text-xs">{c.assetId}: {selectedNft.nftId}</p>
          <p className="mb-3 break-all font-mono text-xs">{c.owner}: {session.address}</p>
          <Link href={`/explorer/nfts#${encodeURIComponent(selectedNft.nftId)}`} className="text-sm text-brand">{t.explorer}</Link>
          {nftTransfersEnabled ? (
            <>
              <div className="mt-4">
                <RecipientField value={nftTo} onChange={setNftTo} label={t.to} storageKey={`people-contacts:${chainId}:${session.address}`} disabled={busy} />
              </div>
              <p className="my-3 text-sm">{t.fee}: {DEFAULT_TRANSFER_FEE} PPL</p>
              <button type="button" disabled={busy || !nftTo.trim()} onClick={() => void doSend(Date.now(), selectedNft)} className="rounded-xl bg-brand px-4 py-2 text-sm text-brand-ink disabled:opacity-40">
                {c.review}
              </button>
            </>
          ) : null}
        </WalletDialog>
      )}
      {draft && <WalletDialog title={c.review} busy={busy} onClose={()=>setDraft(null)}><dl className="space-y-3 text-sm">{[[t.to,draft.tx.to],[t.amount,draft.display],[c.assetId,draft.tx.type==="nftTransfer"?String(draft.tx.payload?.nftId):draft.tx.assetId??"ppl"],[t.fee,`${draft.tx.fee} PPL`],[c.total,`${formatPpl(draft.tx.fee+(draft.tx.assetId==="ppl"?draft.tx.amount:0))} PPL`],[c.remaining,draft.remaining],...(typeof draft.tx.payload?.memo==="string"?[[c.memo,draft.tx.payload.memo]]:[])].map(([label,value])=><div key={label} className="rounded-xl bg-surface-2 p-3"><dt className="text-xs text-ink-3">{label}</dt><dd className="mt-1 break-all font-medium">{value}</dd></div>)}</dl>{error && <p role="alert" className="mt-3 text-sm text-warm">{error}</p>}<div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={()=>void confirmSend()} className="rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-ink disabled:opacity-40">{c.confirm}</button><button type="button" disabled={busy} onClick={()=>setDraft(null)} className="rounded-xl border border-line px-4 py-3 text-sm">{c.cancel}</button></div></WalletDialog>}
      {connectOverlay ? (
        <WalletDialog title={connectOverlay.mode === "import" ? t.import : t.unlock} onClose={() => setConnectOverlay(null)}>
          <WalletConnectPanel
            startMode={connectOverlay.mode}
            startUnlockWalletId={connectOverlay.walletId}
            onConnected={() => setConnectOverlay(null)}
          />
        </WalletDialog>
      ) : null}
    </section>
  );
}
