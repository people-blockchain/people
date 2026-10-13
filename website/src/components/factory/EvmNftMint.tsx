"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAddress, isAddress, type Address } from "viem";
import { useLanguage } from "@/context/LanguageContext";
import { factoryCopy } from "@/lib/factory-content";
import { uxCopy } from "@/lib/ux-copy";
import { Eyebrow, Chip } from "@/components/ui/primitives";
import { ConnectWalletMenu } from "@/components/wallet/ConnectWalletMenu";
import { useExternalWallet, writeViaActiveSigner, readPublicClient } from "@/context/ExternalWalletContext";
import { formatPpl } from "@/lib/asset-amounts";
import { erc20Abi } from "@/lib/evm/client";
import {
  nftFactoryAbi,
  nftFactoryAddress,
  buildCreateCollectionRequest,
  buildMintRequest,
  buildNftTokenUri,
  deriveCollectionSymbol,
  collectionFromReceipt,
  tokenIdFromReceipt,
  classifyNftWriteError,
  feeWeiToPpl,
} from "@/lib/evm/nft-factory";
import {
  GATEWAY_KIND,
  stableFeeAssets,
  stableFeeGatewayAbi,
  stableFeeGatewayAddress,
  type StableAsset,
} from "@/lib/evm/stable-fee-gateway";

type Mode = "single" | "collection";

type Result = {
  collection: Address;
  tokenId: bigint | null;
  mintTx: string;
  createTx: string | null;
};

/** Codes from `classifyNftWriteError` that do not map onto an existing localized string. */
const EXTRA_ERROR_COPY: Record<string, string> = {
  not_collection_creator:
    "This wallet did not create that collection, so the factory will not let it mint into it. Paste a collection you created, or switch to a single item.",
  receipt_failed: "The transaction was mined but reverted. Nothing was minted and the fee was returned.",
};

export function EvmNftMint() {
  const { lang } = useLanguage();
  const copy = factoryCopy[lang];
  const form = copy.form;
  const u = uxCopy[lang];
  const { signer } = useExternalWallet();
  const factory = nftFactoryAddress();
  const gateway = stableFeeGatewayAddress();
  const stableAssets = stableFeeAssets();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [mode, setMode] = useState<Mode>("single");
  const [collectionInput, setCollectionInput] = useState("");
  const [fee, setFee] = useState<bigint | null>(null);
  const [feeFailed, setFeeFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<1 | 2>(1);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [payWith, setPayWith] = useState<"PPL" | StableAsset["id"]>("PPL");
  const [stableFeeUsd6, setStableFeeUsd6] = useState<bigint | null>(null);
  const [stage, setStage] = useState<"idle" | "approving" | "payingFee" | "creating">("idle");

  useEffect(() => {
    if (!gateway || payWith === "PPL") {
      setStableFeeUsd6(null);
      return;
    }
    let cancelled = false;
    void readPublicClient()
      .readContract({ address: gateway, abi: stableFeeGatewayAbi, functionName: "stableFeeUsd6", args: [GATEWAY_KIND.NFT_MINT] })
      .then((value) => {
        if (!cancelled) setStableFeeUsd6(value);
      })
      .catch(() => {
        if (!cancelled) setStableFeeUsd6(null);
      });
    return () => {
      cancelled = true;
    };
  }, [gateway, payWith]);

  // Fee comes from the chain, never a baked-in constant, so a redeploy cannot desync the UI.
  useEffect(() => {
    if (!factory) return;
    let cancelled = false;
    void readPublicClient()
      .readContract({ address: factory, abi: nftFactoryAbi, functionName: "mintFee" })
      .then((value) => {
        if (!cancelled) setFee(value);
      })
      .catch(() => {
        if (!cancelled) {
          setFee(null);
          setFeeFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [factory]);

  const collectionValid = mode === "single" || isAddress(collectionInput.trim());
  const canSubmit = Boolean(
    signer &&
      factory &&
      fee !== null &&
      name.trim().length >= 2 &&
      collectionValid &&
      !busy &&
      (payWith === "PPL" || stableFeeUsd6 !== null),
  );

  const submit = async () => {
    if (!signer || !factory || fee === null) return;
    setBusy(true);
    setError("");
    setResult(null);
    setPhase(1);
    setStage("idle");
    const client = readPublicClient();
    try {
      if (payWith !== "PPL") {
        const stable = stableAssets.find((asset) => asset.id === payWith);
        if (!stable || !gateway || stableFeeUsd6 === null) {
          throw new Error("stable fee unavailable");
        }
        const allowance = await client.readContract({
          address: stable.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [signer.address, gateway],
        });
        if (allowance < stableFeeUsd6) {
          setStage("approving");
          const approveHash = await writeViaActiveSigner(signer, {
            address: stable.address,
            abi: erc20Abi,
            functionName: "approve",
            args: [gateway, stableFeeUsd6],
          });
          await client.waitForTransactionReceipt({ hash: approveHash });
        }
        setStage("payingFee");
        const payHash = await writeViaActiveSigner(signer, {
          address: gateway,
          abi: stableFeeGatewayAbi,
          functionName: "payLaunchFee",
          args: [GATEWAY_KIND.NFT_MINT, stable.address],
        });
        await client.waitForTransactionReceipt({ hash: payHash });
      }
      setStage("creating");
      const tokenUri = buildNftTokenUri({ name: name.trim(), description, image: imageUrl.trim() });
      let collection: Address;
      let createTx: string | null = null;

      if (mode === "collection") {
        collection = getAddress(collectionInput.trim());
        const [isCollection, creator] = await Promise.all([
          client.readContract({ address: factory, abi: nftFactoryAbi, functionName: "isCollection", args: [collection] }),
          client.readContract({ address: factory, abi: nftFactoryAbi, functionName: "creatorOf", args: [collection] }),
        ]);
        if (!isCollection) {
          setError("That address is not a collection made by this factory. Check it, or switch to a single item.");
          return;
        }
        if ((creator as Address).toLowerCase() !== signer.address.toLowerCase()) {
          setError(EXTRA_ERROR_COPY.not_collection_creator ?? "");
          return;
        }
      } else {
        const createHash = await writeViaActiveSigner(
          signer,
          buildCreateCollectionRequest(factory, name.trim(), deriveCollectionSymbol(name)),
        );
        const createReceipt = await client.waitForTransactionReceipt({ hash: createHash });
        if (createReceipt.status !== "success") throw new Error(`receipt: collection create reverted (${createHash})`);
        const parsed = collectionFromReceipt(createReceipt, factory);
        if (!parsed) throw new Error("collection address not found in the create receipt");
        collection = parsed;
        createTx = createHash;
      }

      setPhase(2);
      const mintHash = await writeViaActiveSigner(
        signer,
        buildMintRequest(factory, collection, tokenUri, fee),
      );
      const mintReceipt = await client.waitForTransactionReceipt({ hash: mintHash });
      if (mintReceipt.status !== "success") throw new Error(`receipt: mint reverted (${mintHash})`);
      const tokenId = tokenIdFromReceipt(mintReceipt, factory, collection);
      setResult({ collection, tokenId, mintTx: mintHash, createTx });
    } catch (err) {
      const { code, detail } = classifyNftWriteError(err);
      setError(EXTRA_ERROR_COPY[code] ?? (code === "insufficient_funds" || code === "insufficient_fee" ? u.notEnoughFee : detail));
    } finally {
      setBusy(false);
      setStage("idle");
    }
  };

  const stageLabel =
    stage === "approving" ? form.approvingStable : stage === "payingFee" ? form.payingStableFee : stage === "creating" ? form.creatingAfterStableFee : null;

  if (!factory) {
    return <p className="px-4 py-16 text-center text-ink-2">NFT factory not deployed on chain 97401 yet.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <Eyebrow>{copy.nft.title}</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold tracking-tight text-ink">{copy.nft.title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">{copy.nft.lead}</p>
      <Chip tone="value" className="mt-4">
        People&apos;s Blockchain testnet · chain 97401
      </Chip>

      {!signer ? (
        <div className="mt-8">
          <ConnectWalletMenu />
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("single")}
              className={`rounded-xl px-3 py-2 text-sm ${mode === "single" ? "bg-brand text-brand-ink" : "bg-surface-2"}`}
            >
              {copy.nft.modeSingle}
            </button>
            <button
              type="button"
              onClick={() => setMode("collection")}
              className={`rounded-xl px-3 py-2 text-sm ${mode === "collection" ? "bg-brand text-brand-ink" : "bg-surface-2"}`}
            >
              {copy.nft.modeCollection}
            </button>
          </div>
          <p className="text-xs text-ink-3">{u.nftHint}</p>

          {mode === "collection" ? (
            <label className="block text-sm font-medium text-ink">
              {copy.nft.collectionLabel}
              <input
                value={collectionInput}
                onChange={(event) => setCollectionInput(event.target.value)}
                placeholder="0x…"
                className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 font-mono"
              />
              {collectionInput.trim() && !isAddress(collectionInput.trim()) ? (
                <span className="mt-1 block text-xs font-normal text-warm">Enter a valid 0x address.</span>
              ) : null}
            </label>
          ) : null}

          <label className="block text-sm font-medium text-ink">
            {form.name}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={u.namePlaceholderNft}
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium text-ink">
            {form.description}
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium text-ink">
            {form.imageUrl}
            <input
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="https://…"
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2"
            />
          </label>

          <p className="text-sm text-ink-2">
            {form.feeLabel}: {feeFailed ? form.feeUnset : fee === null ? "…" : `${formatPpl(feeWeiToPpl(fee))} PPL`}
          </p>
          <p className="text-xs text-ink-3">{u.feeHint}</p>

          {stableAssets.length > 0 ? (
            <div className="rounded-xl border border-line p-3" data-testid="stable-fee-option">
              <p className="text-sm font-semibold text-ink">{form.payWithLabel}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPayWith("PPL")}
                  className={`rounded-xl px-3 py-2 text-sm ${payWith === "PPL" ? "bg-brand text-brand-ink" : "bg-surface-2"}`}
                >
                  {form.payWithPpl}
                </button>
                {stableAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => setPayWith(asset.id)}
                    className={`rounded-xl px-3 py-2 text-sm ${payWith === asset.id ? "bg-brand text-brand-ink" : "bg-surface-2"}`}
                  >
                    {asset.symbol}
                  </button>
                ))}
              </div>
              {payWith !== "PPL" ? (
                <div className="mt-2 text-xs text-ink-3">
                  <p>
                    {form.stableFeeLabel}: {stableFeeUsd6 === null ? "…" : `${(Number(stableFeeUsd6) / 1e6).toFixed(2)} USD`}
                  </p>
                  <p>{form.stableFeeBuybackNote}</p>
                  <p>{form.stableFeeNetworkNote}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="text-sm text-warm">
              {form.error}: {error}
            </p>
          ) : null}

          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            className="rounded-xl bg-brand px-6 py-3 font-semibold text-brand-ink disabled:opacity-40"
          >
            {busy ? stageLabel ?? `${u.sending} ${phase}/2` : form.submit}
          </button>
        </div>
      )}

      {result ? (
        <section className="mt-8 space-y-2 rounded-2xl border border-value/40 bg-surface p-4">
          <h2 className="font-bold text-ink">{form.result}</h2>
          <p className="text-sm text-ink-2">{u.sent}</p>
          <p className="break-all text-sm">
            {copy.nft.collectionLabel}:{" "}
            <Link href={`/explorer/address/${result.collection}`} className="font-mono text-brand hover:underline">
              {result.collection}
            </Link>
          </p>
          <p className="text-sm">
            {form.nftId}: <span className="font-mono">{result.tokenId !== null ? result.tokenId.toString() : "—"}</span>
          </p>
          <p className="break-all text-sm">
            {form.txId}:{" "}
            <Link href={`/explorer/tx/${encodeURIComponent(result.mintTx)}`} className="font-mono text-brand hover:underline">
              {result.mintTx}
            </Link>
          </p>
          {result.createTx ? (
            <p className="break-all text-xs text-ink-3">
              {copy.nft.collectionLabel}:{" "}
              <Link href={`/explorer/tx/${encodeURIComponent(result.createTx)}`} className="font-mono text-brand hover:underline">
                {result.createTx}
              </Link>
            </p>
          ) : null}
          <Link href="/create" className="inline-flex text-sm font-semibold text-brand">
            {form.another}
          </Link>
        </section>
      ) : null}
    </div>
  );
}
