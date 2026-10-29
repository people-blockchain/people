"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { factoryCopy } from "@/lib/factory-content";
import { uxCopy } from "@/lib/ux-copy";
import { Eyebrow, Chip } from "@/components/ui/primitives";
import { AssetImage } from "@/components/ui/AssetImage";
import { ConnectWalletMenu } from "@/components/wallet/ConnectWalletMenu";
import { useExternalWallet, writeViaActiveSigner, readPublicClient } from "@/context/ExternalWalletContext";
import { evmContractsReady, readEvmDeployments } from "@/lib/evm/config";
import { erc20Abi, factoryAbi, factoryLaunchAbi } from "@/lib/evm/client";
import { isTokenSupplyWholeAmountValid, wholeTokensToBaseUnits } from "@/lib/token-supply-limits";
import { networkJson } from "@/lib/network-client";
import {
  addCreatedToken,
  createdTokensForAddress,
  findDuplicateTokens,
  readCreatedTokens,
  tokenAddressFromReceipt,
  type CreatedTokenRecord,
  type DuplicateToken,
} from "@/lib/created-tokens";
import { uploadTokenIcon } from "@/lib/token-icon-upload";
import { TokenIconUpload } from "./TokenIconUpload";
import {
  PROMO_BPS_OPTIONS,
  PROMO_RECIPIENT_CAP_BPS,
  PROMO_UPFRONT_PERCENT,
  PROMO_WINDOW_DAYS,
  allocationPercent,
  launchAllocation,
  type PromoBps,
} from "@/lib/token-promo";
import { foundersReferralCopy } from "@/lib/founders-referral-content";
import { ISSUER_REFERRAL_DEFAULT_ALLOCATION_BPS } from "@/lib/founders/referral";
import {
  GATEWAY_KIND,
  stableFeeAssets,
  stableFeeGatewayAbi,
  stableFeeGatewayAddress,
  type StableAsset,
} from "@/lib/evm/stable-fee-gateway";

const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_TOPIC = "0x0000000000000000000000000000000000000000000000000000000000000000";
const LAUNCH_DECIMALS = 6;

function nowMs() {
  return Date.now();
}

export function EvmTokenLaunch() {
  const { lang } = useLanguage();
  const page = factoryCopy[lang].token;
  // Locale files that predate a copy key fall back to English per key, the same way
  // `litepaper-content.ts` merges with EN at read time — a locale we have not translated yet
  // shows English text rather than nothing at all.
  const form = { ...factoryCopy.en.form, ...factoryCopy[lang].form };
  const u = uxCopy[lang];
  const { signer } = useExternalWallet();
  const dep = readEvmDeployments();
  const gateway = stableFeeGatewayAddress();
  const stableAssets = stableFeeAssets();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [supply, setSupply] = useState("");
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState("");
  const [error, setError] = useState("");
  const [payWith, setPayWith] = useState<"PPL" | StableAsset["id"]>("PPL");
  const [stableFeeUsd6, setStableFeeUsd6] = useState<bigint | null>(null);
  const [stage, setStage] = useState<
    "idle" | "uploading" | "approving" | "payingFee" | "confirming" | "waiting"
  >("idle");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconUri, setIconUri] = useState("");
  const [iconUploadFailed, setIconUploadFailed] = useState(false);
  const [knownTokens, setKnownTokens] = useState<DuplicateToken[]>([]);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [created, setCreated] = useState<CreatedTokenRecord | null>(null);
  const submitLock = useRef(false);
  // Issuer referral program is OFF unless the issuer ticks the box.
  /** 0 = Burn (default), 1 = CommunityPool — owner rule 2026-10-13. */
  const [leftoverMode, setLeftoverMode] = useState<0 | 1>(0);
  const [issuerReferral, setIssuerReferral] = useState(false);
  const [issuerReferralMsg, setIssuerReferralMsg] = useState("");
  // Optional creator promo share, owner decision 2026-10-13. 0 is the default and keeps the
  // launch on the unchanged five-argument `createToken` path.
  const [promoBps, setPromoBps] = useState<PromoBps>(0);
  const r = foundersReferralCopy(lang);

  useEffect(() => {
    if (!gateway || payWith === "PPL") {
      setStableFeeUsd6(null);
      return;
    }
    let cancelled = false;
    void readPublicClient()
      .readContract({ address: gateway, abi: stableFeeGatewayAbi, functionName: "stableFeeUsd6", args: [GATEWAY_KIND.TOKEN_LAUNCH] })
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

  // Duplicate source: local records from earlier launches + the on-chain catalog's creator field.
  // The catalog is best-effort; local records work even before the factory scan indexes the token.
  const signerAddress = signer?.address ?? "";
  useEffect(() => {
    if (!signerAddress) {
      setKnownTokens([]);
      return;
    }
    let cancelled = false;
    const local = createdTokensForAddress(
      readCreatedTokens(typeof window !== "undefined" ? window.localStorage : null),
      signerAddress,
    );
    setKnownTokens(local);
    void networkJson<Array<{ assetId: string; tokenAddress?: string; name?: string; symbol?: string; creator?: string; imageUri?: string }>>(
      "assets",
      { cache: "no-store" },
    )
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return;
        const creator = signerAddress.toLowerCase();
        const chain: DuplicateToken[] = rows
          .filter((row) => row.creator?.toLowerCase() === creator)
          .map((row) => ({
            creator,
            address: (row.tokenAddress ?? row.assetId).toLowerCase(),
            name: row.name ?? "",
            symbol: row.symbol ?? "",
            ...(row.imageUri ? { image: row.imageUri } : {}),
          }));
        setKnownTokens((current) => {
          const byAddress = new Map(current.map((row) => [row.address.toLowerCase(), row]));
          for (const row of chain) {
            if (!byAddress.has(row.address.toLowerCase())) byAddress.set(row.address.toLowerCase(), row);
          }
          return [...byAddress.values()];
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signerAddress]);

  const duplicates = useMemo(
    () => findDuplicateTokens(knownTokens, { creator: signerAddress, name, symbol }),
    [knownTokens, signerAddress, name, symbol],
  );

  const registerIssuerReferral = async (hash: `0x${string}`, totalSupply: bigint) => {
    try {
      const receipt = await readPublicClient().waitForTransactionReceipt({ hash });
      const mint = receipt.logs.find(
        (log) => log.topics[0] === ERC20_TRANSFER_TOPIC && log.topics[1] === ZERO_TOPIC,
      );
      if (!mint) throw new Error("token address not found");
      const res = await fetch("/api/founders/referral/issuer", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tokenAddress: mint.address,
          totalSupplyBaseUnits: totalSupply.toString(),
          enabled: true,
        }),
      });
      setIssuerReferralMsg(res.ok ? r.launchRegistered : r.launchFailed);
    } catch {
      setIssuerReferralMsg(r.launchFailed);
    }
  };

  const submit = async (options?: { skipIcon?: boolean }) => {
    if (submitLock.current || !signer || !dep.contracts.tokenFactory) return;
    const skipIcon = options?.skipIcon === true;
    submitLock.current = true;
    setBusy(true);
    setError("");
    setTx("");
    setStage("idle");
    try {
      const client = readPublicClient();
      if (!isTokenSupplyWholeAmountValid(supply, String(LAUNCH_DECIMALS))) {
        setError(u.supplyMinError);
        return;
      }
      const units = wholeTokensToBaseUnits(supply, String(LAUNCH_DECIMALS));
      if (units === null) {
        setError(u.supplyMinError);
        return;
      }
      const total = units;
      const existing = findDuplicateTokens(knownTokens, { creator: signer.address, name, symbol });
      if (existing.length && !confirmDuplicate) {
        setError(u.tokenDuplicateTitle);
        return;
      }

      let metadataURI = iconUri || `ipfs://people/${symbol.trim()}`;
      if (iconFile && !iconUri && !skipIcon) {
        setStage("uploading");
        try {
          const uploaded = await uploadTokenIcon(iconFile);
          setIconUri(uploaded);
          setIconUploadFailed(false);
          metadataURI = uploaded;
        } catch {
          setIconUploadFailed(true);
          setError(u.tokenIconErrUpload);
          return;
        }
      }

      if (payWith !== "PPL") {
        const stable = stableAssets.find((asset) => asset.id === payWith);
        if (!stable || !gateway || stableFeeUsd6 === null) {
          setError(form.stableFeeBuybackNote);
          return;
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
          setStage("waiting");
          await client.waitForTransactionReceipt({ hash: approveHash });
        }
        setStage("payingFee");
        const payHash = await writeViaActiveSigner(signer, {
          address: gateway,
          abi: stableFeeGatewayAbi,
          functionName: "payLaunchFee",
          args: [GATEWAY_KIND.TOKEN_LAUNCH, stable.address],
        });
        setStage("waiting");
        await client.waitForTransactionReceipt({ hash: payHash });
      }

      setStage("confirming");
      const factory = dep.contracts.tokenFactory as `0x${string}`;
      const fee = await client.readContract({
        address: factory,
        abi: factoryAbi,
        functionName: "tokenCreateFee",
      });
      // One entry point carries both creator choices: the promo share (0/5/10%) and what happens
      // to curve leftovers / the unsold remainder (0 = burn, 1 = the token's community pool).
      const hash = await writeViaActiveSigner(signer, {
        address: factory,
        abi: factoryLaunchAbi,
        functionName: "createToken",
        args: [name.trim(), symbol.trim().toUpperCase(), LAUNCH_DECIMALS, total, metadataURI, promoBps, leftoverMode],
        value: fee,
      });
      setTx(hash);
      setStage("waiting");
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 180_000 });
      if (receipt.status !== "success") throw new Error("receipt: token create reverted");
      const tokenAddress = tokenAddressFromReceipt(receipt.logs, factory);
      if (!tokenAddress) throw new Error("token address not found");
      const record: CreatedTokenRecord = {
        creator: signer.address.toLowerCase(),
        address: tokenAddress.toLowerCase(),
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        tx: hash,
        image: metadataURI.startsWith("ipfs://people/") ? "" : metadataURI,
        createdAt: nowMs(),
      };
      const nextRecords = addCreatedToken(
        typeof window !== "undefined" ? window.localStorage : null,
        record,
      );
      setKnownTokens((current) => {
        const byAddress = new Map(current.map((row) => [row.address.toLowerCase(), row]));
        byAddress.set(record.address, record);
        return [...byAddress.values()];
      });
      void nextRecords;
      setCreated(record);
      const { recordFounderAction } = await import("@/lib/founders/client");
      void recordFounderAction("token_launch", hash);
      if (issuerReferral) {
        void registerIssuerReferral(hash, total);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "submit");
    } finally {
      submitLock.current = false;
      setBusy(false);
      setStage("idle");
    }
  };

  const createAnother = () => {
    setCreated(null);
    setName("");
    setSymbol("");
    setSupply("");
    setIconFile(null);
    setIconUri("");
    setIconUploadFailed(false);
    setTx("");
    setError("");
    setConfirmDuplicate(false);
    setIssuerReferralMsg("");
    setIssuerReferral(false);
    setPromoBps(0);
    setLeftoverMode(0);
    setPayWith("PPL");
    setStage("idle");
  };

  const stageLabel =
    stage === "uploading"
      ? u.tokenIconUploading
      : stage === "approving"
        ? form.approvingStable
        : stage === "payingFee"
          ? form.payingStableFee
          : stage === "confirming"
            ? u.tokenStepConfirm
            : stage === "waiting"
              ? u.tokenStepWaiting
              : null;

  const activeStep =
    stage === "uploading"
      ? 0
      : stage === "approving" || stage === "payingFee" || stage === "confirming"
        ? 1
        : stage === "waiting"
          ? 2
          : -1;
  const progressSteps = [u.tokenStepIcon, u.tokenStepConfirm, u.tokenStepWaiting];

  const previewSupply = isTokenSupplyWholeAmountValid(supply, String(LAUNCH_DECIMALS))
    ? wholeTokensToBaseUnits(supply, String(LAUNCH_DECIMALS))
    : null;
  const allocation = previewSupply === null ? null : launchAllocation(previewSupply, promoBps);
  const wholeTokens = (baseUnits: bigint) =>
    (baseUnits / BigInt(10) ** BigInt(LAUNCH_DECIMALS)).toLocaleString(lang);
  const allocationRows: { label: string; amount: bigint }[] =
    allocation === null
      ? []
      : [
          { label: form.allocationCurve, amount: allocation.bondingCurve },
          { label: form.allocationPromo, amount: allocation.promo },
          { label: form.allocationCreator, amount: allocation.creator },
          { label: form.allocationCommunity, amount: allocation.communityPool },
          { label: form.allocationLiquidity, amount: allocation.liquidityReserve },
          { label: form.allocationEcosystem, amount: allocation.ecosystemReserve },
        ].filter((row) => row.amount > BigInt(0));

  if (!evmContractsReady()) {
    return <p className="px-4 py-16 text-center text-ink-2">Contracts not deployed on chain 97401 yet.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Eyebrow>{page.title}</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold">{page.title}</h1>
      <Chip tone="value" className="mt-4">
        PEOPLE Blockchain testnet · chain 97401
      </Chip>
      {!signer ? (
        <div className="mt-8">
          <ConnectWalletMenu />
        </div>
      ) : created ? (
        <section className="mt-8 space-y-4 rounded-2xl border border-value/40 bg-surface p-5" data-testid="token-create-result">
          <div className="flex items-center gap-4">
            <AssetImage
              assetId={created.address}
              tokenAddress={created.address}
              src={created.image || undefined}
              name={created.symbol || created.name}
              className="h-16 w-16"
            />
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-ink">{u.tokenCreateSuccess}</h2>
              <p className="mt-1 text-sm text-ink-2">{u.tokenCreateSuccessLead}</p>
            </div>
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-3">{form.name}</dt>
              <dd className="font-semibold text-ink">{created.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">{form.ticker}</dt>
              <dd className="font-semibold text-ink">{created.symbol}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-ink-3">{u.tokenAddressLabel}</dt>
              <dd className="break-all font-mono text-sm text-ink">{created.address}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-ink-3">{form.txId}</dt>
              <dd className="break-all">
                <Link href={`/explorer/tx/${encodeURIComponent(created.tx)}`} className="font-mono text-sm text-brand hover:underline" dir="ltr">
                  {created.tx}
                </Link>
              </dd>
            </div>
          </dl>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={`/explorer/token/${created.address}`}
              className="inline-flex w-full justify-center rounded-xl bg-brand px-6 py-3 font-semibold text-brand-ink sm:w-auto"
            >
              {u.tokenViewToken}
            </Link>
            <Link href="/wallet" className="inline-flex w-full justify-center rounded-xl border border-line px-6 py-3 font-semibold text-ink sm:w-auto">
              {u.tokenOpenWallet}
            </Link>
            <button type="button" onClick={createAnother} className="text-sm font-semibold text-brand">
              {u.tokenCreateAnother}
            </button>
          </div>
        </section>
      ) : (
        <div className="mt-8 space-y-4">
          <TokenIconUpload
            copy={u}
            file={iconFile}
            disabled={busy}
            onFile={(file) => {
              setIconFile(file);
              setIconUri("");
              setIconUploadFailed(false);
              setError("");
            }}
          />
          <input
            className="w-full rounded-xl border border-line px-3 py-3"
            placeholder={form.name}
            value={name}
            disabled={busy}
            onChange={(e) => {
              setName(e.target.value);
              setConfirmDuplicate(false);
            }}
          />
          <input
            className="w-full rounded-xl border border-line px-3 py-3"
            placeholder={form.ticker}
            value={symbol}
            disabled={busy}
            onChange={(e) => {
              setSymbol(e.target.value);
              setConfirmDuplicate(false);
            }}
          />
          <input
            className="w-full rounded-xl border border-line px-3 py-3"
            placeholder={u.supplyPlaceholder}
            value={supply}
            disabled={busy}
            onChange={(e) => setSupply(e.target.value)}
          />
          <p className="text-xs text-ink-3">{u.supplyHint}</p>

          {duplicates.length > 0 ? (
            <div className="rounded-xl border border-warm/50 bg-surface p-3 text-sm" data-testid="token-duplicate-warning">
              <p className="font-semibold text-warm">{u.tokenDuplicateTitle}</p>
              <p className="mt-1 text-xs text-ink-3">{u.tokenDuplicateLead}</p>
              <ul className="mt-2 space-y-1">
                {duplicates.map((row) => (
                  <li key={row.address} className="break-all">
                    <Link href={`/explorer/token/${row.address.toLowerCase()}`} className="font-semibold text-brand hover:underline">
                      {row.name || row.symbol} ({row.symbol || row.address})
                    </Link>
                  </li>
                ))}
              </ul>
              <label className="mt-3 flex items-start gap-2 text-sm text-ink-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={confirmDuplicate}
                  disabled={busy}
                  onChange={(e) => setConfirmDuplicate(e.target.checked)}
                />
                <span>{u.tokenDuplicateConfirm}</span>
              </label>
              <p className="mt-2 text-xs text-ink-3">{u.tokenDuplicateInline}</p>
            </div>
          ) : null}

          <ol className="space-y-2 rounded-xl border border-line p-3 text-sm" data-testid="token-create-progress">
            {progressSteps.map((label, index) => {
              const done = activeStep >= 0 && index < activeStep;
              const active = activeStep === index;
              return (
                <li
                  key={label}
                  className={`flex items-center gap-2 ${active ? "font-semibold text-brand" : done ? "text-value" : "text-ink-3"}`}
                >
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs ${active ? "border-brand text-brand" : done ? "border-value text-value" : "border-line"}`}>
                    {done ? "✓" : index + 1}
                  </span>
                  <span>{label}</span>
                </li>
              );
            })}
          </ol>

          {stableAssets.length > 0 ? (
            <div className="rounded-xl border border-line p-3" data-testid="stable-fee-option">
              <p className="text-sm font-semibold text-ink">{form.payWithLabel}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPayWith("PPL")}
                  className={`rounded-xl px-3 py-2 text-sm disabled:opacity-60 ${payWith === "PPL" ? "bg-brand text-brand-ink" : "bg-surface-2"}`}
                >
                  {form.payWithPpl}
                </button>
                {stableAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    disabled={busy}
                    onClick={() => setPayWith(asset.id)}
                    className={`rounded-xl px-3 py-2 text-sm disabled:opacity-60 ${payWith === asset.id ? "bg-brand text-brand-ink" : "bg-surface-2"}`}
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


          <p className="text-sm text-ink-2" data-testid="launch-summary">
            {form.launchSummary}
          </p>
          <div className="rounded-xl border border-line p-3" data-testid="leftover-mode">
            <p className="text-sm font-semibold">{form.leftoverTitle}</p>
            <p className="mt-1 text-xs text-ink-3">{form.leftoverHint}</p>
            <div className="mt-3 space-y-2 text-sm text-ink-2">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  className="mt-1"
                  name="leftoverMode"
                  checked={leftoverMode === 0}
                  disabled={busy}
                  onChange={() => setLeftoverMode(0)}
                />
                <span>
                  <span className="font-semibold">{form.leftoverBurnLabel}</span>
                  <span className="block text-xs text-ink-3">{form.leftoverBurnHint}</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  className="mt-1"
                  name="leftoverMode"
                  checked={leftoverMode === 1}
                  disabled={busy}
                  onChange={() => setLeftoverMode(1)}
                />
                <span>
                  <span className="font-semibold">{form.leftoverPoolLabel}</span>
                  <span className="block text-xs text-ink-3">{form.leftoverPoolHint}</span>
                </span>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-line p-3" data-testid="promo-share-option">
            <p className="text-sm font-semibold text-ink">{form.promoTitle}</p>
            <p className="mt-1 text-xs text-ink-3">{form.promoLead}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PROMO_BPS_OPTIONS.map((bps) => (
                <button
                  key={bps}
                  type="button"
                  aria-pressed={promoBps === bps}
                  disabled={busy}
                  onClick={() => setPromoBps(bps)}
                  className={`rounded-xl px-3 py-2 text-sm disabled:opacity-60 ${promoBps === bps ? "bg-brand text-brand-ink" : "bg-surface-2"}`}
                >
                  {bps === 0 ? form.promoOptionNone : form.promoOptionLabel.replace("{{pct}}", String(bps / 100))}
                </button>
              ))}
            </div>
            {promoBps > 0 ? (
              <div className="mt-2 space-y-1 text-xs text-ink-3">
                <p>{form.promoSource}</p>
                <p>
                  {form.promoRules
                    .replaceAll("{{cap}}", String(PROMO_RECIPIENT_CAP_BPS / 100))
                    .replaceAll("{{upfront}}", String(PROMO_UPFRONT_PERCENT))
                    .replaceAll("{{days}}", String(PROMO_WINDOW_DAYS))}
                </p>
              </div>
            ) : null}
          </div>

          {allocation !== null && previewSupply !== null ? (
            <div className="rounded-xl border border-line p-3" data-testid="launch-allocation">
              <p className="text-sm font-semibold text-ink">{form.allocationTitle}</p>
              <dl className="mt-2 space-y-1 text-sm">
                {allocationRows.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-ink-2">{row.label}</dt>
                    <dd className="text-right tabular-nums text-ink">
                      {allocationPercent(row.amount, previewSupply)}% · {wholeTokens(row.amount)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          <div className="rounded-xl border border-line p-3" data-testid="issuer-referral-option">
            <p className="text-sm font-semibold">{r.launchTitle}</p>
            <label className="mt-2 flex items-start gap-2 text-sm text-ink-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={issuerReferral}
                disabled={busy}
                onChange={(e) => setIssuerReferral(e.target.checked)}
              />
              <span>
                {r.launchLabel.replace("{{pct}}", String(ISSUER_REFERRAL_DEFAULT_ALLOCATION_BPS / 100))}
              </span>
            </label>
            <p className="mt-2 text-xs text-ink-3">{r.launchHint}</p>
          </div>
          {error ? <p className="text-sm text-warm">{error}</p> : null}
          {iconUploadFailed ? (
            <button
              type="button"
              disabled={busy}
              data-testid="token-create-without-icon"
              onClick={() => {
                setIconUploadFailed(false);
                setIconFile(null);
                setIconUri("");
                setError("");
                void submit({ skipIcon: true });
              }}
              className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-brand disabled:opacity-40"
            >
              {u.tokenCreateWithoutIcon}
            </button>
          ) : null}
          {tx ? <p className="text-sm text-brand">{u.sent}: {tx.slice(0, 18)}…</p> : null}
          {issuerReferralMsg ? <p className="text-sm text-ink-2">{issuerReferralMsg}</p> : null}
          <button
            type="button"
            disabled={
              busy ||
              name.trim().length < 2 ||
              !isTokenSupplyWholeAmountValid(supply, String(LAUNCH_DECIMALS)) ||
              (payWith !== "PPL" && stableFeeUsd6 === null) ||
              (duplicates.length > 0 && !confirmDuplicate)
            }
            onClick={() => void submit()}
            className="rounded-xl bg-brand px-6 py-3 font-semibold text-brand-ink disabled:opacity-40"
          >
            {busy ? stageLabel ?? u.sending : form.submit}
          </button>
        </div>
      )}
    </div>
  );
}
