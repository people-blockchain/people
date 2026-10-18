"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { factoryCopy } from "@/lib/factory-content";
import type { FactoryPublicConfig } from "@/lib/factory-config";
import { DEFAULT_PUBLIC_CHAIN_ID } from "@/lib/node-rpc";
import { signFactoryTx } from "@/lib/people-sign";
import { networkJson } from "@/lib/network-client";
import { useWallet } from "@/context/WalletContext";
import { Chip, Eyebrow } from "@/components/ui/primitives";
import { uxCopy, fill } from "@/lib/ux-copy";
import { formatPpl } from "@/lib/asset-amounts";
import { FactoryIconGenerator } from "@/components/factory/FactoryIconGenerator";
import { isCosmosEvmChain } from "@/lib/chain-mode";
import { EvmTokenLaunch } from "@/components/factory/EvmTokenLaunch";
import { EvmNftMint } from "@/components/factory/EvmNftMint";
import {
  isTokenSupplyWholeAmountValid,
  wholeTokensToBaseUnits,
} from "@/lib/token-supply-limits";

type Kind = "token" | "nft";

interface Props {
  kind: Kind;
}

// No prefilled numbers: people type their own ticker and supply. Decimals
// default to 6 (the same as PPL) and the field explains what that means.
const TOKEN_DEFAULTS = {
  ticker: "",
  supply: "",
  decimals: "6",
};

/** Whole-token supply typed by a person -> integer base units for the protocol. */
function supplyToBaseUnits(supply: string, decimals: string): number | null {
  if (!isTokenSupplyWholeAmountValid(supply, decimals)) return null;
  const units = wholeTokensToBaseUnits(supply, decimals);
  if (units === null || units > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(units);
}

export function FactoryWizard({ kind }: Props) {
  // On the EVM chain both wizards sign through the connected EVM wallet (E2E-M3): the legacy
  // compat submit target answers 405 use_evm_wallet there.
  if (isCosmosEvmChain()) {
    return kind === "token" ? <EvmTokenLaunch /> : <EvmNftMint />;
  }
  return <PeopleFactoryWizard kind={kind} />;
}

function PeopleFactoryWizard({ kind }: Props) {
  const { lang } = useLanguage();
  const copy = factoryCopy[lang];
  const page = kind === "token" ? copy.token : copy.nft;
  const u = uxCopy[lang];
  const [configLoaded, setConfigLoaded] = useState(false);
  const [config, setConfig] = useState<FactoryPublicConfig>({
    rpcUrl: null,
    chainId: DEFAULT_PUBLIC_CHAIN_ID,
    tokenFeePpl: null,
    nftFeePpl: null,
    publicSubmit: false,
    mediaPersist: false,
    aiIconEnabled: false,
    networkStatus: "unavailable",
  });
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<string>("");
  const [imageUri, setImageUri] = useState("");
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ticker, setTicker] = useState(TOKEN_DEFAULTS.ticker);
  const [supply, setSupply] = useState(TOKEN_DEFAULTS.supply);
  const [decimals, setDecimals] = useState(TOKEN_DEFAULTS.decimals);
  const [nftMode, setNftMode] = useState<"single" | "collection">("single");
  const [collectionId, setCollectionId] = useState("");
  const { session } = useWallet();
  const [accountSnapshot, setAccount] = useState<{ address: string; nonce: number; balance: number } | null>(null);
  const account = accountSnapshot?.address === session?.address ? accountSnapshot : null;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ txId: string; idHint: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/factory/config")
      .then((res) => res.json())
      .then((data: FactoryPublicConfig) => setConfig(data))
      .catch(() => {
        /* keep preview defaults */
      })
      .finally(() => setConfigLoaded(true));
  }, []);

  const fee = kind === "token" ? config?.tokenFeePpl ?? null : config?.nftFeePpl ?? null;
  const canSubmit = Boolean(config?.publicSubmit && session && fee !== null && !busy);

  const onFile = useCallback(async (file: File | null) => {
    if (!file) return;
    setError("");
    const local = URL.createObjectURL(file);
    setPreview(local);
    const body = new FormData();
    body.set("file", file);
    const res = await fetch("/api/factory/media", { method: "POST", body });
    const data = (await res.json()) as { uri?: string; previewUrl?: string; error?: string };
    if (!res.ok || !data.uri) {
      setError(data.error ?? "upload");
      return;
    }
    setImageUri(data.uri);
    if (data.previewUrl) {
      setPreview(data.previewUrl);
    }
  }, []);

  const applyUrl = () => {
    const url = imageUrlInput.trim();
    if (!url) return;
    setImageUri(url);
    setPreview(url);
  };

  useEffect(() => {
    if (!session) return;
    void networkJson<{ nonce?: number; balance?: number }>(`address/${session.address}`)
      .then((body) =>
        setAccount({ address: session.address, nonce: Number(body.nonce ?? 0), balance: Number(body.balance ?? 0) })
      )
      .catch(() => setAccount(null));
  }, [session]);

  const idHint = useMemo(() => {
    if (kind === "token") return ticker.trim().toLowerCase();
    return name.trim() || "nft";
  }, [kind, ticker, name]);

  const submit = async () => {
    if (!session || !config?.publicSubmit || fee === null) return;
    setBusy(true);
    setError("");
    try {
      const live = await networkJson<{ nonce?: number; balance?: number }>(`address/${session.address}`);
      setAccount({ address: session.address, nonce: Number(live.nonce ?? 0), balance: Number(live.balance ?? 0) });
      const image = imageUri || imageUrlInput.trim();
      const tx =
        kind === "token"
          ? signFactoryTx(session.privateKey, {
              chainId: (await networkJson<{ chainId: string }>("health")).chainId,
              id: `${session.address}-tokenCreate-${Date.now()}`,
              from: session.address,
              to: "network",
              amount: 0,
              fee,
              nonce: Number(live.nonce ?? 0),
              timestamp: Date.now(),
              type: "tokenCreate",
              payload: {
                name: name.trim(),
                symbol: ticker.trim().toUpperCase(),
                decimals: Number(decimals),
                totalSupply: supplyToBaseUnits(supply, decimals) ?? 0,
                metadata: {
                  description: description.trim(),
                  image: image,
                },
              },
            })
          : signFactoryTx(session.privateKey, {
              chainId: (await networkJson<{ chainId: string }>("health")).chainId,
              id: `${session.address}-nftMint-${Date.now()}`,
              from: session.address,
              to: "nft",
              amount: 0,
              fee,
              nonce: Number(live.nonce ?? 0),
              timestamp: Date.now(),
              type: "nftMint",
              payload: {
                name: name.trim(),
                description: description.trim(),
                imageUri: image,
                ...(nftMode === "collection" && collectionId.trim()
                  ? { collectionId: collectionId.trim() }
                  : {}),
              },
            });
      const sent = await networkJson<{ accepted?: boolean; error?: string }>("tx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(tx),
      });
      if (!sent.accepted) {
        setError(sent.error ?? "rejected");
        return;
      }
      setResult({ txId: tx.id, idHint });
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "submit");
    } finally {
      setBusy(false);
    }
  };

  const detailsValid =
    name.trim().length >= 2 &&
    (kind === "nft" || (/^[A-Za-z0-9_-]{2,16}$/.test(ticker) && supplyToBaseUnits(supply, decimals) !== null));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <Eyebrow>{page.title}</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold tracking-tight text-ink">{page.title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">{page.lead}</p>

      <p className="mt-4">
        {!configLoaded ? (
          <Chip tone="neutral">{u.checking}</Chip>
        ) : (
          <Chip tone={config.networkStatus === "testnet" ? "value" : "warm"}>
            {config.networkStatus === "testnet" ? copy.hub.statusTestnet : copy.hub.statusUnavailable}
          </Chip>
        )}
      </p>

      <ol className="mt-8 flex flex-wrap gap-2" aria-label="Steps">
        {page.steps.map((label, index) => (
          <li
            key={label}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              index === step ? "bg-brand text-brand-ink" : "bg-surface-2 text-ink-3"
            }`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="mt-8 space-y-4">
          <h2 className="text-base font-bold text-ink">{copy.form.image}</h2>
          <p className="text-sm text-ink-2">{copy.form.imageHint}</p>
          {config.mediaPersist ? (
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
              className="block w-full text-sm text-ink-2"
            />
          ) : null}
          {config.aiIconEnabled ? (
            <FactoryIconGenerator
              copy={copy}
              onPicked={(uri, preview) => {
                setImageUri(uri);
                setPreview(preview);
                setImageUrlInput("");
              }}
            />
          ) : null}
          <label className="block text-sm text-ink-2">
            {copy.form.imageUrl}
            <input
              value={imageUrlInput}
              onChange={(event) => setImageUrlInput(event.target.value)}
              onBlur={applyUrl}
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink"
            />
          </label>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="max-h-56 rounded-2xl border border-line object-contain" />
          ) : null}
        </section>
      )}

      {step === 1 && (
        <section className="mt-8 grid gap-4">
          <label className="text-sm font-medium text-ink">
            {copy.form.name}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={kind === "token" ? u.namePlaceholderToken : u.namePlaceholderNft}
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium text-ink">
            {copy.form.description}
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2"
            />
          </label>
          {kind === "token" ? (
            <>
              <label className="text-sm font-medium text-ink">
                {copy.form.ticker}
                <input
                  value={ticker}
                  onChange={(event) => setTicker(event.target.value)}
                  placeholder={u.tickerPlaceholder}
                  className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 uppercase placeholder:normal-case"
                />
                <span className="mt-1 block text-xs font-normal text-ink-3">{u.tickerHint}</span>
              </label>
              <label className="text-sm font-medium text-ink">
                {copy.form.supply}
                <input
                  value={supply}
                  onChange={(event) => setSupply(event.target.value)}
                  placeholder={u.supplyPlaceholder}
                  inputMode="numeric"
                  className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2"
                />
                <span className="mt-1 block text-xs font-normal text-ink-3">{u.supplyHint}</span>
                {supply && !isTokenSupplyWholeAmountValid(supply, decimals) ? (
                  <span className="mt-1 block text-xs font-normal text-warm">{u.supplyMinError}</span>
                ) : null}
              </label>
              <label className="text-sm font-medium text-ink">
                {copy.form.decimals}
                <input
                  value={decimals}
                  onChange={(event) => setDecimals(event.target.value)}
                  inputMode="numeric"
                  className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2"
                />
                <span className="mt-1 block text-xs font-normal text-ink-3">{u.decimalsHint}</span>
              </label>
            </>
          ) : (
            <>
              <p className="text-xs text-ink-3">{u.nftHint}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setNftMode("single")}
                  className={`rounded-xl px-3 py-2 text-sm ${nftMode === "single" ? "bg-brand text-brand-ink" : "bg-surface-2"}`}
                >
                  {copy.nft.modeSingle}
                </button>
                <button
                  type="button"
                  onClick={() => setNftMode("collection")}
                  className={`rounded-xl px-3 py-2 text-sm ${nftMode === "collection" ? "bg-brand text-brand-ink" : "bg-surface-2"}`}
                >
                  {copy.nft.modeCollection}
                </button>
              </div>
              {nftMode === "collection" ? (
                <label className="text-sm font-medium text-ink">
                  {copy.nft.collectionLabel}
                  <input
                    value={collectionId}
                    onChange={(event) => setCollectionId(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2"
                  />
                </label>
              ) : null}
            </>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="mt-8 space-y-2 rounded-2xl border border-line bg-surface p-4 text-sm text-ink-2">
          <h2 className="font-bold text-ink">{copy.form.review}</h2>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="max-h-40 rounded-xl object-contain" />
          ) : null}
          <p>
            {copy.form.name}: <span className="text-ink">{name}</span>
          </p>
          <p>
            {copy.form.description}: <span className="text-ink">{description || "—"}</span>
          </p>
          {kind === "token" ? (
            <>
              <p>
                {copy.form.ticker}: <span className="text-ink">{ticker.toUpperCase()}</span>
              </p>
              <p>
                {copy.form.supply}: <span className="text-ink">{supply.replace(/[\s,_]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",")} {ticker.toUpperCase()}</span>
              </p>
              <p className="text-xs">{copy.form.allocation}</p>
            </>
          ) : (
            <p>
              {copy.nft.collectionLabel}:{" "}
              <span className="text-ink">{nftMode === "collection" ? collectionId || "—" : copy.nft.modeSingle}</span>
            </p>
          )}
          <p>
            {copy.form.feeLabel}:{" "}
            <span className="text-ink">{fee === null ? copy.form.feeUnset : `${fee} PPL`}</span>
          </p>
        </section>
      )}

      {step === 3 && (
        <section className="mt-8 space-y-4">
          <h2 className="font-bold text-ink">{copy.form.pay}</h2>
          {!config?.publicSubmit ? <p className="text-sm text-warm">{copy.form.noRpc}</p> : null}
          {session ? (
            <dl className="grid gap-1 text-sm text-ink-2">
              <div>
                {copy.form.address}: <span className="break-all font-mono text-ink">{session.address}</span>
              </div>
              <div data-testid="factory-balance">
                {fill(u.yourBalance, { amount: account ? formatPpl(account.balance) : "…" })}
              </div>
            </dl>
          ) : (
            <p className="text-sm text-ink-2">
              <ConnectWalletButton variant="link">{u.connectWallet}</ConnectWalletButton>
            </p>
          )}
          <p>
            {copy.form.feeLabel}: {fee === null ? copy.form.feeUnset : `${formatPpl(fee)} PPL`}
          </p>
          <p className="text-xs text-ink-3">{u.feeHint}</p>
          {account && fee !== null && account.balance < fee ? (
            <p className="text-sm text-warm">
              {u.notEnoughFee}{" "}
              <ConnectWalletButton variant="link">{u.connectWallet}</ConnectWalletButton>
            </p>
          ) : null}
          <button
            type="button"
            disabled={!canSubmit || Boolean(account && fee !== null && account.balance < fee)}
            onClick={() => void submit()}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-ink disabled:opacity-40"
          >
            {copy.form.submit}
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>
      )}

      {step === 4 && result && (
        <section className="mt-8 space-y-2 rounded-2xl border border-value/40 bg-surface p-4">
          <h2 className="font-bold text-ink">{copy.form.result}</h2>
          <p className="text-sm text-ink-2">{copy.form.success}</p>
          <p className="text-sm">
            {kind === "token" ? copy.form.assetId : copy.form.nftId}:{" "}
            <span className="font-mono">{result.idHint}</span>
          </p>
          <p className="break-all text-sm">
            {copy.form.txId}:{" "}
            <Link href={`/explorer/tx/${encodeURIComponent(result.txId)}`} className="font-mono text-brand hover:underline">
              {result.txId}
            </Link>
          </p>
          <Link href="/create" className="inline-flex text-sm font-semibold text-brand">
            {copy.form.another}
          </Link>
        </section>
      )}

      {error ? (
        <p className="mt-4 text-sm text-warm">
          {copy.form.error}: {error}
        </p>
      ) : null}

      <div className="mt-8 flex gap-3">
        {step > 0 && step < 4 ? (
          <button
            type="button"
            onClick={() => setStep((value) => value - 1)}
            className="rounded-xl border border-line px-4 py-2 text-sm"
          >
            {copy.form.back}
          </button>
        ) : null}
        {step < 3 ? (
          <button
            type="button"
            disabled={step === 1 && !detailsValid}
            onClick={() => setStep((value) => value + 1)}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-40"
          >
            {copy.form.next}
          </button>
        ) : null}
      </div>
    </div>
  );
}
