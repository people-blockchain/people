"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatEther, getAddress, type Address } from "viem";
import { useLanguage } from "@/context/LanguageContext";
import { factoryCopy } from "@/lib/factory-content";
import { nftMediaCopy } from "@/lib/nft-media-copy";
import { uxCopy } from "@/lib/ux-copy";
import { createTokenLaunchTxStore, outcomeOfReceipt, planTokenRestore, type TokenLaunchStage } from "@/lib/launch-tx";
import { browserStorage } from "@/lib/nft-mint-draft";
import { Eyebrow, Chip } from "@/components/ui/primitives";
import { ConnectWalletMenu } from "@/components/wallet/ConnectWalletMenu";
import { useExternalWallet, writeViaActiveSigner, readPublicClient } from "@/context/ExternalWalletContext";
import { evmContractsReady, readEvmDeployments } from "@/lib/evm/config";
import { erc20Abi, factoryAbi, factoryLaunchAbi } from "@/lib/evm/client";
import { checkBalanceForCost, classifyCreateFlowError, requiredFeeValue } from "@/lib/evm/create-flow-errors";
import { isTokenSupplyWholeAmountValid, wholeTokensToBaseUnits } from "@/lib/token-supply-limits";
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
/** `TokenCreated(address indexed token, address indexed creator, …)` on both factory versions. */
const TOKEN_CREATED_TOPIC = "0x10911c4cd4fbfa42352cbeb31e021abbab48257dff3d94957b57da33a205d724";
const TOKEN_CREATED_LEFTOVER_TOPIC = "0xdcb5d6c49a959a42d0c67fe9b9aa48b4da6065c9f47789f71789f629d84d30f1";
const LAUNCH_DECIMALS = 6;
const RECEIPT_WAIT_TIMEOUT_MS = 120_000;
const RECEIPT_POLL_INTERVAL_MS = 2_000;
const MANUAL_POLL_TIMEOUT_MS = 60_000;
const MANUAL_POLL_INTERVAL_MS = 3_000;

type CreateReceiptLog = { address?: string; topics?: readonly string[] };
type CreateReceipt = { status?: string; logs?: readonly CreateReceiptLog[] };
type CreatedToken = {
  address: Address;
  name: string;
  symbol: string;
  hash: `0x${string}`;
  totalSupply: bigint;
};

class ReceiptTimeoutError extends Error {
  constructor(readonly hash: `0x${string}`) {
    super("receipt timeout");
    this.name = "ReceiptTimeoutError";
  }
}

function formatPplWei(wei: bigint): string {
  const [whole, fraction = ""] = formatEther(wei).split(".");
  const trimmed = fraction.slice(0, 4).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function addressFromTopic(topic: string | undefined): Address | null {
  if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return null;
  try {
    return getAddress(`0x${topic.slice(26)}`);
  } catch {
    return null;
  }
}

function addressFromString(value: string | undefined): Address | null {
  if (!value) return null;
  try {
    return getAddress(value);
  } catch {
    return null;
  }
}

function createReceiptSucceeded(receipt: CreateReceipt): boolean {
  return receipt.status === "success" || receipt.status === "0x1" || receipt.status === "0x01";
}

function tokenAddressFromCreateReceipt(receipt: CreateReceipt, factory: string): Address | null {
  const logs = receipt.logs ?? [];
  for (const log of logs) {
    const topic = log.topics?.[0];
    if (topic !== TOKEN_CREATED_TOPIC && topic !== TOKEN_CREATED_LEFTOVER_TOPIC) continue;
    if (log.address && log.address.toLowerCase() !== factory.toLowerCase()) continue;
    const token = addressFromTopic(log.topics?.[1]);
    if (token) return token;
  }
  for (const log of logs) {
    if (log.topics?.[0] !== ERC20_TRANSFER_TOPIC || log.topics?.[1] !== ZERO_TOPIC) continue;
    const token = addressFromString(log.address);
    if (token) return token;
  }
  return null;
}

async function waitForCreateReceipt(
  client: ReturnType<typeof readPublicClient>,
  hash: `0x${string}`,
): Promise<CreateReceipt> {
  try {
    const receipt = await client.waitForTransactionReceipt({
      hash,
      timeout: RECEIPT_WAIT_TIMEOUT_MS,
      pollingInterval: RECEIPT_POLL_INTERVAL_MS,
    });
    return receipt as unknown as CreateReceipt;
  } catch (error) {
    console.warn("[create] receipt wait failed; polling manually", error);
  }
  const deadline = Date.now() + MANUAL_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const receipt = (await client.request({
        method: "eth_getTransactionReceipt",
        params: [hash],
      })) as unknown as CreateReceipt | null;
      if (receipt) return receipt;
    } catch (error) {
      console.warn("[create] manual receipt poll failed", error);
    }
    await new Promise((resolve) => setTimeout(resolve, MANUAL_POLL_INTERVAL_MS));
  }
  throw new ReceiptTimeoutError(hash);
}

export function EvmTokenLaunch() {
  const { lang } = useLanguage();
  const page = factoryCopy[lang].token;
  // Locale files that predate a copy key fall back to English per key, the same way
  // `litepaper-content.ts` merges with EN at read time — a locale we have not translated yet
  // shows English text rather than nothing at all.
  const form = { ...factoryCopy.en.form, ...factoryCopy[lang].form };
  const u = uxCopy[lang];
  const nm = nftMediaCopy[lang];
  const { signer } = useExternalWallet();
  const dep = readEvmDeployments();
  const gateway = stableFeeGatewayAddress();
  const stableAssets = stableFeeAssets();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [supply, setSupply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [pendingHash, setPendingHash] = useState<`0x${string}` | "">("");
  const [confirmationTimedOut, setConfirmationTimedOut] = useState(false);
  const [pplBalance, setPplBalance] = useState<bigint | null>(null);
  const submitLock = useRef(false);
  const txStore = useMemo(() => createTokenLaunchTxStore(browserStorage), []);
  // Set while a transaction from an earlier visit is being checked, or after it was settled.
  const [restoreNotice, setRestoreNotice] = useState<"checking" | "payment_counted" | "failed" | null>(null);
  const [payWith, setPayWith] = useState<"PPL" | StableAsset["id"]>("PPL");
  const [stableFeeUsd6, setStableFeeUsd6] = useState<bigint | null>(null);
  const [stage, setStage] = useState<"idle" | "approving" | "payingFee" | "creating" | "waiting">("idle");
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

  useEffect(() => {
    if (!signer) {
      setPplBalance(null);
      return;
    }
    let cancelled = false;
    void readPublicClient()
      .getBalance({ address: signer.address })
      .then((value) => {
        if (!cancelled) setPplBalance(value);
      })
      .catch(() => {
        if (!cancelled) setPplBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [signer]);

  const refreshPplBalance = async (address: Address) => {
    try {
      setPplBalance(await readPublicClient().getBalance({ address }));
    } catch {
      setPplBalance(null);
    }
  };

  // A closed tab must not leave the form waiting: read the stored hash's receipt on return.
  const signerAddress = signer?.address ?? null;
  useEffect(() => {
    if (!signerAddress) return;
    const stored = txStore.load(signerAddress);
    if (!stored) return;
    let cancelled = false;
    setName(stored.name);
    setSymbol(stored.symbol);
    setSupply(stored.supply);
    setRestoreNotice("checking");
    if (stored.stage === "create") setPendingHash(stored.hash);
    void (async () => {
      const client = readPublicClient();
      let receipt: CreateReceipt | null = null;
      try {
        receipt = (await client.getTransactionReceipt({ hash: stored.hash })) as unknown as CreateReceipt;
      } catch {
        // not mined yet (or the node could not answer): wait for it like a fresh submit would
        try {
          receipt = await waitForCreateReceipt(client, stored.hash);
        } catch {
          receipt = null;
        }
      }
      if (cancelled) return;
      const plan = planTokenRestore(stored.stage, outcomeOfReceipt(receipt));
      if (plan === "pending") {
        setRestoreNotice(null);
        if (stored.stage === "create") setConfirmationTimedOut(true);
        return;
      }
      txStore.clear(signerAddress);
      setPendingHash("");
      if (plan === "created" && receipt) {
        const factory = dep.contracts.tokenFactory;
        const tokenAddress = factory ? tokenAddressFromCreateReceipt(receipt, factory) : null;
        const total = wholeTokensToBaseUnits(stored.supply, String(LAUNCH_DECIMALS));
        if (tokenAddress && total !== null) {
          setCreated({ address: tokenAddress, name: stored.name, symbol: stored.symbol, hash: stored.hash, totalSupply: total });
          setRestoreNotice(null);
          return;
        }
        // The receipt succeeded but carries no token: send the user to their address page.
        setPendingHash(stored.hash);
        setConfirmationTimedOut(true);
        setRestoreNotice(null);
        return;
      }
      setRestoreNotice(plan === "payment_counted" ? "payment_counted" : "failed");
    })();
    return () => {
      cancelled = true;
    };
    // Only when the wallet address changes; the store and contract addresses are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signerAddress, txStore]);

  const registerIssuerReferral = async (receipt: CreateReceipt, totalSupply: bigint, factory: string) => {
    try {
      const tokenAddress = tokenAddressFromCreateReceipt(receipt, factory);
      if (!tokenAddress) throw new Error("token address not found");
      const res = await fetch("/api/founders/referral/issuer", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tokenAddress,
          totalSupplyBaseUnits: totalSupply.toString(),
          enabled: true,
        }),
      });
      setIssuerReferralMsg(res.ok ? r.launchRegistered : r.launchFailed);
    } catch (err) {
      console.error(err);
      setIssuerReferralMsg(r.launchFailed);
    }
  };

  const submit = async () => {
    if (submitLock.current || pendingHash || !signer || !dep.contracts.tokenFactory) return;
    submitLock.current = true;
    setBusy(true);
    setError("");
    setConfirmationTimedOut(false);
    setIssuerReferralMsg("");
    setStage("idle");
    setRestoreNotice(null);
    let sentHash: `0x${string}` | null = null;
    // Written before the receipt wait so a closed tab can restore the outcome (see the restore effect).
    const remember = (stage: TokenLaunchStage, hash: `0x${string}`) =>
      txStore.save({
        version: 1,
        owner: signer.address.toLowerCase(),
        stage,
        hash,
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        supply,
      });
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

      let stableFeePaid = false;
      if (payWith !== "PPL") {
        const stable = stableAssets.find((asset) => asset.id === payWith);
        if (!stable || !gateway || stableFeeUsd6 === null) {
          setError(form.stableFeeBuybackNote);
          return;
        }
        // Prepaid credit already covers the fee: skip approve + payLaunchFee so we do not charge twice.
        const [fee, credit] = await Promise.all([
          client.readContract({
            address: dep.contracts.tokenFactory as `0x${string}`,
            abi: factoryAbi,
            functionName: "tokenCreateFee",
          }),
          client.readContract({
            address: dep.contracts.tokenFactory as `0x${string}`,
            abi: factoryLaunchAbi,
            functionName: "prepaidCredit",
            args: [signer.address],
          }),
        ]);
        if (credit >= fee) {
          stableFeePaid = true;
        } else {
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
          remember("pay", payHash);
          const payReceipt = await client.waitForTransactionReceipt({ hash: payHash });
          if (payReceipt.status !== "success") {
            txStore.clear(signer.address);
            let payError: unknown = new Error(`payLaunchFee reverted (${payHash})`);
            try {
              await client.simulateContract({
                account: signer.address,
                address: gateway,
                abi: stableFeeGatewayAbi,
                functionName: "payLaunchFee",
                args: [GATEWAY_KIND.TOKEN_LAUNCH, stable.address],
                blockNumber: payReceipt.blockNumber > BigInt(0) ? payReceipt.blockNumber - BigInt(1) : undefined,
              });
            } catch (simulationError) {
              payError = simulationError;
            }
            console.error("[create] payLaunchFee reverted", payError);
            throw payError;
          }
          stableFeePaid = true;
        }
      }

      setStage("creating");
      const factory = dep.contracts.tokenFactory as `0x${string}`;
      const fee = await client.readContract({
        address: factory,
        abi: factoryAbi,
        functionName: "tokenCreateFee",
      });
      let feeValue = fee;
      try {
        const credit = await client.readContract({
          address: factory,
          abi: factoryLaunchAbi,
          functionName: "prepaidCredit",
          args: [signer.address],
        });
        feeValue = requiredFeeValue(fee, credit);
      } catch {
        // A failed read must not make us underpay: only a stable payment that just succeeded
        // proves the fee is already covered by credit.
        feeValue = payWith !== "PPL" && stableFeePaid ? BigInt(0) : fee;
      }
      const metadataURI = `ipfs://people/${symbol.trim()}`;
      // One entry point carries both creator choices: the promo share (0/5/10%) and what happens
      // to curve leftovers / the unsold remainder (0 = burn, 1 = the token's community pool).
      const request = {
        address: factory,
        abi: factoryLaunchAbi,
        functionName: "createToken",
        args: [name.trim(), symbol.trim().toUpperCase(), LAUNCH_DECIMALS, total, metadataURI, promoBps, leftoverMode],
        value: feeValue,
      } as const;

      if (payWith === "PPL") {
        try {
          const balance = await client.getBalance({ address: signer.address });
          let gasCost = BigInt(0);
          try {
            const gas = await client.estimateContractGas({ account: signer.address, ...request });
            gasCost = gas * (await client.getGasPrice());
          } catch {
            try {
              const gas = await client.estimateContractGas({ account: signer.address, ...request, value: BigInt(0) });
              gasCost = gas * (await client.getGasPrice());
            } catch {
              /* keep the fee-only floor when the node cannot estimate */
            }
          }
          const balanceCheck = checkBalanceForCost(balance, feeValue + gasCost);
          if (!balanceCheck.ok) {
            setError(
              nm.errInsufficientPpl
                .replaceAll("{needed}", formatPplWei(balanceCheck.neededWei))
                .replaceAll("{balance}", formatPplWei(balanceCheck.balanceWei)),
            );
            return;
          }
        } catch {
          /* if the balance cannot be read, let the wallet report it */
        }
      }

      const hash = await writeViaActiveSigner(signer, { ...request });
      sentHash = hash;
      remember("create", hash);
      setPendingHash(hash);
      setStage("waiting");
      const { recordFounderAction } = await import("@/lib/founders/client");
      void recordFounderAction("token_launch", hash);
      const receipt = await waitForCreateReceipt(client, hash);
      if (!createReceiptSucceeded(receipt)) {
        console.error("[create] createToken reverted", receipt);
        txStore.clear(signer.address);
        setPendingHash("");
        setError(nm.errUnknown);
        return;
      }
      const tokenAddress = tokenAddressFromCreateReceipt(receipt, factory);
      if (!tokenAddress) throw new Error("token address not found in createToken receipt");
      setCreated({
        address: tokenAddress,
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        hash,
        totalSupply: total,
      });
      txStore.clear(signer.address);
      setPendingHash("");
      setStage("idle");
      if (issuerReferral) {
        void registerIssuerReferral(receipt, total, factory);
      }
      void refreshPplBalance(signer.address);
    } catch (err) {
      if (err instanceof ReceiptTimeoutError) {
        console.error("[create] createToken confirmation timed out", err.hash);
        setConfirmationTimedOut(true);
        setError("");
        return;
      }
      if (sentHash) {
        console.error("[create] createToken receipt could not be processed", err);
        setConfirmationTimedOut(true);
        setError("");
        return;
      }
      console.error(err);
      const { code, neededWei, balanceWei } = classifyCreateFlowError(err);
      switch (code) {
        case "stable_fee_unavailable":
          setError(nm.errStableFeeUnavailable);
          break;
        case "stable_daily_cap":
          setError(nm.errStableDailyCap);
          break;
        case "insufficient_funds":
          setError(
            neededWei !== undefined && balanceWei !== undefined
              ? nm.errInsufficientPpl
                  .replaceAll("{needed}", formatPplWei(neededWei))
                  .replaceAll("{balance}", formatPplWei(balanceWei))
              : nm.errInsufficientPplGeneric,
          );
          break;
        case "wallet_rejected":
          setError(nm.errWalletRejected);
          break;
        case "network":
          setError(nm.errNetworkRpc);
          break;
        default:
          setError(nm.errUnknown);
      }
    } finally {
      submitLock.current = false;
      setBusy(false);
      setStage("idle");
    }
  };

  const stageLabel =
    stage === "approving"
      ? form.approvingStable
      : stage === "payingFee"
        ? form.payingStableFee
        : stage === "creating"
          ? form.creatingAfterStableFee
          : stage === "waiting"
            ? nm.stageWaitingTx
            : null;

  const resetFlow = () => {
    if (signerAddress) txStore.clear(signerAddress);
    setRestoreNotice(null);
    setCreated(null);
    setPendingHash("");
    setConfirmationTimedOut(false);
    setError("");
    setIssuerReferralMsg("");
    setName("");
    setSymbol("");
    setSupply("");
    setPromoBps(0);
    setLeftoverMode(0);
    setIssuerReferral(false);
    setPayWith("PPL");
    setStage("idle");
    if (signer) void refreshPplBalance(signer.address);
  };

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
        <section className="mt-8 space-y-3 rounded-2xl border border-value/40 bg-surface p-4" data-testid="token-result">
          <h2 className="font-bold text-ink">{nm.createSuccessTitle}</h2>
          <p className="text-sm text-ink-2">{nm.createSuccessLead}</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-3">{form.name}</dt>
              <dd className="font-semibold text-ink">{created.name}</dd>
            </div>
            <div>
              <dt className="text-ink-3">{form.ticker}</dt>
              <dd className="font-semibold text-ink">{created.symbol}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-ink-3">{form.address}</dt>
              <dd className="break-all font-mono">
                <Link href={`/explorer/address/${created.address}`} className="text-brand hover:underline" dir="ltr">
                  {created.address}
                </Link>
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-ink-3">{form.txId}</dt>
              <dd className="break-all font-mono">
                <Link href={`/explorer/tx/${encodeURIComponent(created.hash)}`} className="text-brand hover:underline" dir="ltr">
                  {created.hash}
                </Link>
              </dd>
            </div>
            {pplBalance !== null ? (
              <div className="sm:col-span-2">
                <dt className="text-ink-3">{form.balance}</dt>
                <dd className="text-ink">{formatPplWei(pplBalance)} PPL</dd>
              </div>
            ) : null}
          </dl>
          {issuerReferralMsg ? <p className="text-sm text-ink-2">{issuerReferralMsg}</p> : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={`/explorer/token/${created.address}`}
              className="inline-flex w-full justify-center rounded-xl bg-brand px-6 py-3 font-semibold text-brand-ink sm:w-auto"
            >
              {nm.createViewToken}
            </Link>
            <Link
              href={`/explorer/address/${created.address}`}
              className="inline-flex w-full justify-center rounded-xl border border-line px-6 py-3 font-semibold text-brand sm:w-auto"
            >
              {nm.createViewAddress}
            </Link>
            <button type="button" onClick={resetFlow} className="text-sm font-semibold text-brand">
              {nm.createAnother}
            </button>
          </div>
        </section>
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
                  onClick={() => setPromoBps(bps)}
                  className={`rounded-xl px-3 py-2 text-sm ${promoBps === bps ? "bg-brand text-brand-ink" : "bg-surface-2"}`}
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
                onChange={(e) => setIssuerReferral(e.target.checked)}
              />
              <span>
                {r.launchLabel.replace("{{pct}}", String(ISSUER_REFERRAL_DEFAULT_ALLOCATION_BPS / 100))}
              </span>
            </label>
            <p className="mt-2 text-xs text-ink-3">{r.launchHint}</p>
          </div>
          {confirmationTimedOut && pendingHash ? (
            <div role="status" data-testid="token-confirmation-pending" className="space-y-2 rounded-xl border border-warm/40 p-3 text-sm text-ink-2">
              <p className="font-semibold text-warm">{nm.createTimeoutTitle}</p>
              <p>{nm.createTimeoutBody}</p>
              <p className="break-all font-mono text-xs" dir="ltr">{pendingHash}</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Link href={`/explorer/address/${signer.address}`} className="font-semibold text-brand">
                  {nm.createTimeoutExplorer}
                </Link>
                <button type="button" onClick={resetFlow} className="text-sm font-semibold text-brand">
                  {nm.createAnother}
                </button>
              </div>
            </div>
          ) : null}
          {restoreNotice ? (
            <p role="status" data-testid="token-restore-notice" className={restoreNotice === "failed" ? "text-sm text-warm" : "text-sm text-ink-2"}>
              {restoreNotice === "checking"
                ? nm.txRestoring
                : restoreNotice === "payment_counted"
                  ? nm.txPaymentCounted
                  : nm.txFailedBefore}
            </p>
          ) : null}
          {error ? <p className="text-sm text-warm">{error}</p> : null}
          {issuerReferralMsg ? <p className="text-sm text-ink-2">{issuerReferralMsg}</p> : null}
          <button
            type="button"
            disabled={
              busy ||
              Boolean(pendingHash) ||
              name.trim().length < 2 ||
              !isTokenSupplyWholeAmountValid(supply, String(LAUNCH_DECIMALS)) ||
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
