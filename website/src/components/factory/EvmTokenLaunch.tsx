"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { factoryCopy } from "@/lib/factory-content";
import { uxCopy } from "@/lib/ux-copy";
import { Eyebrow, Chip } from "@/components/ui/primitives";
import { ConnectWalletMenu } from "@/components/wallet/ConnectWalletMenu";
import { useExternalWallet, writeViaActiveSigner, readPublicClient } from "@/context/ExternalWalletContext";
import { evmContractsReady, readEvmDeployments } from "@/lib/evm/config";
import { erc20Abi, factoryAbi } from "@/lib/evm/client";
import { isTokenSupplyWholeAmountValid, wholeTokensToBaseUnits } from "@/lib/token-supply-limits";
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

export function EvmTokenLaunch() {
  const { lang } = useLanguage();
  const page = factoryCopy[lang].token;
  const form = factoryCopy[lang].form;
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
  const [stage, setStage] = useState<"idle" | "approving" | "payingFee" | "creating">("idle");
  // Issuer referral program is OFF unless the issuer ticks the box.
  /** 0 = Burn (default), 1 = CommunityPool — owner rule 2026-10-13. */
  const [leftoverMode, setLeftoverMode] = useState<0 | 1>(0);
  const [issuerReferral, setIssuerReferral] = useState(false);
  const [issuerReferralMsg, setIssuerReferralMsg] = useState("");
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

  const submit = async () => {
    if (!signer || !dep.contracts.tokenFactory) return;
    setBusy(true);
    setError("");
    setTx("");
    setStage("idle");
    try {
      const client = readPublicClient();
      if (!isTokenSupplyWholeAmountValid(supply, "6")) {
        setError(u.supplyMinError);
        return;
      }
      const units = wholeTokensToBaseUnits(supply, "6");
      if (units === null) {
        setError(u.supplyMinError);
        return;
      }
      const total = units;

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
          await client.waitForTransactionReceipt({ hash: approveHash });
        }
        setStage("payingFee");
        const payHash = await writeViaActiveSigner(signer, {
          address: gateway,
          abi: stableFeeGatewayAbi,
          functionName: "payLaunchFee",
          args: [GATEWAY_KIND.TOKEN_LAUNCH, stable.address],
        });
        await client.waitForTransactionReceipt({ hash: payHash });
      }

      setStage("creating");
      const fee = await client.readContract({
        address: dep.contracts.tokenFactory as `0x${string}`,
        abi: factoryAbi,
        functionName: "tokenCreateFee",
      });
      const hash = await writeViaActiveSigner(signer, {
        address: dep.contracts.tokenFactory as `0x${string}`,
        abi: factoryAbi,
        functionName: "createToken",
        args: [name.trim(), symbol.trim().toUpperCase(), 6, total, `ipfs://people/${symbol.trim()}`, leftoverMode],
        value: fee,
      });
      setTx(hash);
      const { recordFounderAction } = await import("@/lib/founders/client");
      void recordFounderAction("token_launch", hash);
      if (issuerReferral) {
        void registerIssuerReferral(hash, total);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "submit");
    } finally {
      setBusy(false);
      setStage("idle");
    }
  };

  const stageLabel =
    stage === "approving" ? form.approvingStable : stage === "payingFee" ? form.payingStableFee : stage === "creating" ? form.creatingAfterStableFee : null;

  if (!evmContractsReady()) {
    return <p className="px-4 py-16 text-center text-ink-2">Contracts not deployed on chain 97401 yet.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Eyebrow>{page.title}</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold">{page.title}</h1>
      <Chip tone="value" className="mt-4">
        People&apos;s Blockchain testnet · chain 97401
      </Chip>
      {!signer ? (
        <div className="mt-8">
          <ConnectWalletMenu />
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          <input className="w-full rounded-xl border border-line px-3 py-3" placeholder={form.name} value={name} onChange={(e) => setName(e.target.value)} />
          <input className="w-full rounded-xl border border-line px-3 py-3" placeholder={form.ticker} value={symbol} onChange={(e) => setSymbol(e.target.value)} />
          <input className="w-full rounded-xl border border-line px-3 py-3" placeholder={u.supplyPlaceholder} value={supply} onChange={(e) => setSupply(e.target.value)} />
          <p className="text-xs text-ink-3">{u.supplyHint}</p>

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


          <div className="rounded-xl border border-line p-3" data-testid="leftover-mode">
            <p className="text-sm font-semibold">Curve leftover after migration / 180-day unsold</p>
            <p className="mt-1 text-xs text-ink-3">
              What happens to tokens still on the curve when it migrates to the AMM, or if it does not sell out in 180 days. Never to you or the treasury.
            </p>
            <div className="mt-3 space-y-2 text-sm text-ink-2">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  className="mt-1"
                  name="leftoverMode"
                  checked={leftoverMode === 0}
                  onChange={() => setLeftoverMode(0)}
                />
                <span>
                  <span className="font-semibold">Burn (recommended)</span>
                  <span className="block text-xs text-ink-3">Default. Leftover and unsold tokens are permanently burned.</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  className="mt-1"
                  name="leftoverMode"
                  checked={leftoverMode === 1}
                  onChange={() => setLeftoverMode(1)}
                />
                <span>
                  <span className="font-semibold">To community pool</span>
                  <span className="block text-xs text-ink-3">Send leftover and unsold tokens to this token&apos;s own community pool.</span>
                </span>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-line p-3" data-testid="issuer-referral-option">
            <p className="text-sm font-semibold">{r.launchTitle}</p>
            <label className="mt-2 flex items-start gap-2 text-sm text-ink-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={issuerReferral}
                onChange={(e) => setIssuerReferral(e.target.checked)}
              />
              <span>
                {r.launchLabel.replace("{{pct}}", String(ISSUER_REFERRAL_DEFAULT_ALLOCATION_BPS / 100))}
              </span>
            </label>
            <p className="mt-2 text-xs text-ink-3">{r.launchHint}</p>
          </div>
          {error ? <p className="text-sm text-warm">{error}</p> : null}
          {tx ? <p className="text-sm text-brand">{u.sent}: {tx.slice(0, 18)}…</p> : null}
          {issuerReferralMsg ? <p className="text-sm text-ink-2">{issuerReferralMsg}</p> : null}
          <button
            type="button"
            disabled={
              busy ||
              name.trim().length < 2 ||
              !isTokenSupplyWholeAmountValid(supply, "6") ||
              (payWith !== "PPL" && stableFeeUsd6 === null)
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
