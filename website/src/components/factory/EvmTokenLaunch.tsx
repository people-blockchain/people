"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { encodeFunctionData, getAddress, type Abi, type Address } from "viem";
import { formatPplDisplay, formatPplExact } from "@/lib/asset-amounts";
import { useLanguage } from "@/context/LanguageContext";
import { factoryCopy } from "@/lib/factory-content";
import { nftMediaCopy } from "@/lib/nft-media-copy";
import { uxCopy } from "@/lib/ux-copy";
import { Eyebrow, Chip } from "@/components/ui/primitives";
import { AssetImage } from "@/components/ui/AssetImage";
import { ConnectWalletMenu } from "@/components/wallet/ConnectWalletMenu";
import { useExternalWallet, writeViaActiveSigner, readPublicClient } from "@/context/ExternalWalletContext";
import { evmContractsReady, readEvmDeployments } from "@/lib/evm/config";
import { erc20Abi, factoryAbi, factoryLaunchAbi } from "@/lib/evm/client";
import { checkBalanceForCost, classifyCreateFlowError, requiredFeeValue } from "@/lib/evm/create-flow-errors";
import { TxPreflightError, preflightAndSend, preflightTx } from "@/lib/evm/tx-preflight";
import { preflightTokenCreateRpc, preflightTxWithRetry } from "@/lib/factory/token-create-preflight";
import { PEOPLE_EIP155_CHAIN_ID } from "@/lib/wallet-address-scheme";
import { CREATE_FLOW_ERRORS_ABI, preflightErrorDetails, preflightErrorMessage, txPreflightCopy } from "@/lib/evm/tx-preflight-copy";
import { isTokenSupplyWholeAmountValid, wholeTokensToBaseUnits } from "@/lib/token-supply-limits";
import { networkJson } from "@/lib/network-client";
import {
  addCreatedToken,
  type CreatedTokenRecord,
  type DuplicateToken,
} from "@/lib/created-tokens";
import { uploadTokenIcon } from "@/lib/token-icon-upload";
import { findDuplicateTokens, loadDuplicateCatalog } from "@/lib/factory/token-duplicates";
import {
  TOKEN_CREATE_PREFLIGHT_METADATA_URI,
  TokenCreateGateError,
  TokenMetadataPinError,
  pinTokenMetadataAfterChecks,
} from "@/lib/factory/token-metadata";
import { pinTokenMetadata } from "@/lib/token-metadata-client";
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
class ReceiptTimeoutError extends Error {
  constructor(readonly hash: `0x${string}`) {
    super("receipt timeout");
    this.name = "ReceiptTimeoutError";
  }
}

function isSenderBalanceMiss(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes("insufficient funds") || text.includes("exceeds the balance");
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
  const nm = nftMediaCopy[lang];
  const pf = txPreflightCopy[lang];
  const { signer } = useExternalWallet();
  const dep = readEvmDeployments();
  const gateway = stableFeeGatewayAddress();
  const stableAssets = stableFeeAssets();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [supply, setSupply] = useState("");
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState("");
  const [error, setErrorText] = useState("");
  const [errorDetails, setErrorDetails] = useState("");
  const setError = (text: string, details = "") => {
    setErrorText(text);
    setErrorDetails(details);
  };
  const [created, setCreated] = useState<CreatedTokenRecord | null>(null);
  const [pendingHash, setPendingHash] = useState<`0x${string}` | "">("");
  const [confirmationTimedOut, setConfirmationTimedOut] = useState(false);
  const [pplBalance, setPplBalance] = useState<bigint | null>(null);
  const submitLock = useRef(false);
  const [payWith, setPayWith] = useState<"PPL" | StableAsset["id"]>("PPL");
  const [stableFeeUsd6, setStableFeeUsd6] = useState<bigint | null>(null);
  const [stage, setStage] = useState<
    "idle" | "uploading" | "approving" | "payingFee" | "creating" | "confirming" | "waiting"
  >("idle");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconUri, setIconUri] = useState("");
  const [iconUploadFailed, setIconUploadFailed] = useState(false);
  const [knownTokens, setKnownTokens] = useState<DuplicateToken[]>([]);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
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

  // Duplicate source: the server-side whole catalog (every creator). No localStorage, no wallet
  // needed, so a clean browser warns exactly like a returning one.
  useEffect(() => {
    let cancelled = false;
    void loadDuplicateCatalog(() => networkJson<unknown>("assets", { cache: "no-store" }))
      .then((chain) => {
        if (cancelled) return;
        setKnownTokens((current) => {
          const byAddress = new Map(chain.map((row) => [row.address.toLowerCase(), row]));
          for (const row of current) {
            if (!byAddress.has(row.address.toLowerCase())) byAddress.set(row.address.toLowerCase(), row);
          }
          return [...byAddress.values()];
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const duplicates = useMemo(
    () => findDuplicateTokens(knownTokens, { name, symbol }),
    [knownTokens, name, symbol],
  );

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

  const submit = async (options?: { skipIcon?: boolean }) => {
    if (submitLock.current || pendingHash || !signer || !dep.contracts.tokenFactory) return;
    const skipIcon = options?.skipIcon === true;
    submitLock.current = true;
    setBusy(true);
    setTx("");
    setError("");
    setConfirmationTimedOut(false);
    setIssuerReferralMsg("");
    setStage("idle");
    let sentHash: `0x${string}` | null = null;
    try {
      const client = readPublicClient();
      // Simulate (eth_call + estimateGas) before the wallet prompt: a tx that would revert is never
      // sent, and the real send carries the estimate plus a 20% gas buffer.
      const sendChecked = async (request: { address: Address; abi: Abi; functionName: string; args: readonly unknown[]; value?: bigint }) => {
        const tx = {
          account: signer.address,
          to: request.address,
          data: encodeFunctionData({ abi: request.abi, functionName: request.functionName, args: request.args }),
          value: request.value,
        };
        return preflightAndSend(
          client,
          (ready) => writeViaActiveSigner(signer, { ...request, gas: ready.gas }),
          tx,
          { abi: CREATE_FLOW_ERRORS_ABI, simulate: (c, t, o) => preflightTxWithRetry(c, t, o) },
        );
      };
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
      const existing = findDuplicateTokens(knownTokens, { name, symbol });
      if (existing.length && !confirmDuplicate) {
        setError(u.tokenDuplicateTitle);
        return;
      }

      if (payWith !== "PPL") {
        const stableReady = stableAssets.find((asset) => asset.id === payWith);
        if (!stableReady || !gateway || stableFeeUsd6 === null) {
          setError(form.stableFeeBuybackNote);
          return;
        }
      }

      // Chain id, payer balance, and a placeholder createToken simulation. Nothing is pinned until this passes.
      const rpcReady = await preflightTokenCreateRpc({
        expectedChainId: PEOPLE_EIP155_CHAIN_ID,
        payer: signer.address,
        client: {
          getChainId: () => client.getChainId(),
          getBalance: () => client.getBalance({ address: signer.address }),
          simulateCreate: async () => {
            const factory = dep.contracts.tokenFactory as `0x${string}`;
            const fee = await client.readContract({
              address: factory,
              abi: factoryAbi,
              functionName: "tokenCreateFee",
            });
            let credit = BigInt(0);
            try {
              credit = await client.readContract({
                address: factory,
                abi: factoryLaunchAbi,
                functionName: "prepaidCredit",
                args: [signer.address],
              });
            } catch {
              credit = BigInt(0);
            }
            const payingWithStable = payWith !== "PPL";
            const createValue = requiredFeeValue(fee, credit);
            if (payingWithStable && credit < fee && gateway) {
              const stable = stableAssets.find((asset) => asset.id === payWith);
              if (!stable) throw new Error("stable_fee_unavailable");
              const pay = await preflightTx(
                client,
                {
                  account: signer.address,
                  to: gateway,
                  data: encodeFunctionData({
                    abi: stableFeeGatewayAbi,
                    functionName: "payLaunchFee",
                    args: [GATEWAY_KIND.TOKEN_LAUNCH, stable.address],
                  }),
                },
                { abi: CREATE_FLOW_ERRORS_ABI },
              );
              if (!pay.ok) throw new TxPreflightError(pay.reason);
            }
            const created = await preflightTx(
              client,
              {
                account: signer.address,
                to: factory,
                data: encodeFunctionData({
                  abi: factoryLaunchAbi,
                  functionName: "createToken",
                  args: [
                    name.trim(),
                    symbol.trim().toUpperCase(),
                    LAUNCH_DECIMALS,
                    total,
                    TOKEN_CREATE_PREFLIGHT_METADATA_URI,
                    promoBps,
                    leftoverMode,
                  ],
                }),
                value: createValue,
              },
              { abi: CREATE_FLOW_ERRORS_ABI },
            );
            if (!created.ok) {
              // A stable payer does not hold the PPL shortfall; that value is only on the simulation.
              if (payingWithStable && createValue > BigInt(0) && isSenderBalanceMiss(created.reason.message)) return;
              if (isSenderBalanceMiss(created.reason.message)) throw new Error(created.reason.message);
              throw new TxPreflightError(created.reason);
            }
          },
        },
      });
      if (!rpcReady.ok) {
        setError(nm.errNetworkRpc);
        return;
      }

      let iconImage = iconUri;
      if (iconFile && !iconUri && !skipIcon) {
        setStage("uploading");
        try {
          const uploaded = await uploadTokenIcon(iconFile);
          setIconUri(uploaded);
          setIconUploadFailed(false);
          iconImage = uploaded;
        } catch {
          setIconUploadFailed(true);
          setError(u.tokenIconErrUpload);
          return;
        }
      }

      // Metadata is pinned only after the duplicate check and the RPC preflight. The real
      // metadata URI is simulated again in sendChecked before the wallet prompt.
      setStage("uploading");
      let metadataURI: string;
      try {
        metadataURI = await pinTokenMetadataAfterChecks(
          { name, symbol: symbol.trim().toUpperCase(), image: iconImage || undefined },
          (json) => pinTokenMetadata(json),
          {
            duplicates: existing,
            confirmed: confirmDuplicate,
            preflight: async () => true,
          },
        );
      } catch (err) {
        if (err instanceof TokenCreateGateError && err.reason === "duplicate") {
          setError(u.tokenDuplicateTitle);
          return;
        }
        if (err instanceof TxPreflightError) throw err;
        if (err instanceof TokenMetadataPinError) {
          setError(u.tokenMetadataErrPin);
          return;
        }
        throw err;
      }

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
          const payHash = await sendChecked({
            address: gateway,
            abi: stableFeeGatewayAbi,
            functionName: "payLaunchFee",
            args: [GATEWAY_KIND.TOKEN_LAUNCH, stable.address],
          });
          const payReceipt = await client.waitForTransactionReceipt({ hash: payHash });
          if (payReceipt.status !== "success") {
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
                .replaceAll("{needed}", formatPplExact(balanceCheck.neededWei))
                .replaceAll("{balance}", formatPplExact(balanceCheck.balanceWei)),
            );
            return;
          }
        } catch {
          /* if the balance cannot be read, let the wallet report it */
        }
      }

      setStage("confirming");
      const hash = await sendChecked(request);
      sentHash = hash;
      setTx(hash);
      setPendingHash(hash);
      setStage("waiting");
      const { recordFounderAction } = await import("@/lib/founders/client");
      void recordFounderAction("token_launch", hash);
      const receipt = await waitForCreateReceipt(client, hash);
      if (!createReceiptSucceeded(receipt)) {
        console.error("[create] createToken reverted", receipt);
        setPendingHash("");
        setError(nm.errUnknown);
        return;
      }
      const tokenAddress = tokenAddressFromCreateReceipt(receipt, factory);
      if (!tokenAddress) throw new Error("token address not found in createToken receipt");
      const record: CreatedTokenRecord = {
        creator: signer.address.toLowerCase(),
        address: tokenAddress.toLowerCase(),
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        tx: hash,
        image: iconImage,
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
      if (err instanceof TxPreflightError) {
        setError(
          preflightErrorMessage(err.reason, pf, { payingWithStable: payWith !== "PPL" }),
          preflightErrorDetails(err.reason),
        );
        return;
      }
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
                  .replaceAll("{needed}", formatPplExact(neededWei))
                  .replaceAll("{balance}", formatPplExact(balanceWei))
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
    stage === "uploading"
      ? u.tokenIconUploading
      : stage === "approving"
        ? form.approvingStable
        : stage === "payingFee"
          ? form.payingStableFee
          : stage === "creating"
            ? form.creatingAfterStableFee
            : stage === "confirming"
              ? u.tokenStepConfirm
              : stage === "waiting"
                ? nm.stageWaitingTx
                : null;

  const activeStep =
    stage === "uploading"
      ? 0
      : stage === "approving" || stage === "payingFee" || stage === "creating" || stage === "confirming"
        ? 1
        : stage === "waiting"
          ? 2
          : -1;
  const progressSteps = [u.tokenStepIcon, u.tokenStepConfirm, u.tokenStepWaiting];

  const resetFlow = () => {
    setCreated(null);
    setPendingHash("");
    setConfirmationTimedOut(false);
    setError("");
    setIssuerReferralMsg("");
    setName("");
    setSymbol("");
    setSupply("");
    setIconFile(null);
    setIconUri("");
    setIconUploadFailed(false);
    setTx("");
    setConfirmDuplicate(false);
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
            {pplBalance !== null ? (
              <div className="sm:col-span-2">
                <dt className="text-xs text-ink-3">{form.balance}</dt>
                <dd className="text-ink" title={`${formatPplExact(pplBalance)} PPL`}>{formatPplDisplay(pplBalance)} PPL</dd>
              </div>
            ) : null}
          </dl>
          {issuerReferralMsg ? <p className="text-sm text-ink-2">{issuerReferralMsg}</p> : null}
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
            <Link
              href={`/explorer/address/${created.address}`}
              className="inline-flex w-full justify-center rounded-xl border border-line px-6 py-3 font-semibold text-brand sm:w-auto"
            >
              {nm.createViewAddress}
            </Link>
            <button type="button" onClick={resetFlow} className="text-sm font-semibold text-brand">
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
          {error ? (
            <div className="text-sm text-warm">
              <p>{error}</p>
              {errorDetails ? (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-ink-3">{pf.preflightDetails}</summary>
                  <p className="mt-1 break-all font-mono text-xs text-ink-3">{errorDetails}</p>
                </details>
              ) : null}
            </div>
          ) : null}
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
              Boolean(pendingHash) ||
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
