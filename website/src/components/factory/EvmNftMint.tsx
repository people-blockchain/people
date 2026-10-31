/* eslint-disable @next/next/no-img-element -- result media are stored gateway addresses */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getAddress, isAddress, type Address } from "viem";
import { useLanguage } from "@/context/LanguageContext";
import { factoryCopy } from "@/lib/factory-content";
import { uxCopy } from "@/lib/ux-copy";
import { nftMediaCopy } from "@/lib/nft-media-copy";
import { Eyebrow, Chip } from "@/components/ui/primitives";
import { ConnectWalletMenu } from "@/components/wallet/ConnectWalletMenu";
import { useExternalWallet, writeViaActiveSigner, readPublicClient } from "@/context/ExternalWalletContext";
import { formatPplExact } from "@/lib/asset-amounts";
import { erc20Abi } from "@/lib/evm/client";
import {
  nftFactoryAbi,
  nftFactoryAddress,
  buildCreateCollectionRequest,
  buildMintRequest,
  deriveCollectionSymbol,
  collectionFromReceipt,
  tokenIdFromReceipt,
  classifyNftWriteError,
  findExistingMint,
  peoplescanNftUrl,
} from "@/lib/evm/nft-factory";
import { inAppNftPath } from "@/lib/evm/nft-paths";
import {
  GATEWAY_KIND,
  stableFeeAssets,
  stableFeeGatewayAbi,
  stableFeeGatewayAddress,
  type StableAsset,
} from "@/lib/evm/stable-fee-gateway";
import { checkImageFile, checkVideoFile, NftSaveError, type NftErrorKey } from "@/lib/nft-media-client";
import { checkBalanceForCost, classifyCreateFlowError, requiredFeeValue } from "@/lib/evm/create-flow-errors";
import { NFT_DESCRIPTION_MAX, NFT_NAME_MAX, NFT_NAME_MIN, type NftVideoType } from "@/lib/nft-media-rules";
import {
  applyConfirmedMint,
  browserStorage,
  createDraftStore,
  isResumable,
  planResume,
  releaseMintAttempt,
  shouldReleaseAttempt,
  showsResumeNotice,
  type NftMintDraft,
  type NftMintMode,
} from "@/lib/nft-mint-draft";
import { NftMediaPicker } from "./nft/NftMediaPicker";
import { NftPreview } from "./nft/NftPreview";
import { NftStages } from "./nft/NftStages";
import { directUploadAlertText, saveNftFiles, stagesFor, type NftKind, type StageRow } from "./nft/saveNftFiles";

type Mode = NftMintMode;
type PayWith = "PPL" | StableAsset["id"];

type Result = {
  collection: Address;
  tokenId: bigint | null;
  mintTx: string | null;
  createTx: string | null;
};

/** What the page knows about the stored files and metadata (never a `blob:` address). */
type Saved = {
  tokenUri: string;
  metadataUrl: string;
  imagePreviewUrl: string;
  videoPreviewUrl?: string;
  isSvg: boolean;
};

type Picked = { file: File; mime: string };
type ErrorState = { key: NftErrorKey | "notEnoughFee"; neededWei?: bigint; balanceWei?: bigint; uploadCode?: string };

const RECEIPT_TIMEOUT_MS = 180_000;
const ZERO_ADDRESS_FREE = /^0x[0-9a-fA-F]{40}$/;

class MintFlowError extends Error {
  readonly key: NftErrorKey;
  constructor(key: NftErrorKey) {
    super(key);
    this.key = key;
  }
}

function useObjectUrl(picked: Picked | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!picked) {
      setUrl(null);
      return;
    }
    // The MIME type is set explicitly: an untyped blob would not render as SVG in an <img>.
    const objectUrl = URL.createObjectURL(new Blob([picked.file], { type: picked.mime }));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [picked]);
  return url;
}

function attemptFailureCode(err: unknown): string {
  if (err instanceof MintFlowError) return "input";
  const flow = classifyCreateFlowError(err);
  if (flow.code === "network") return "network";
  if (flow.code !== "unknown") return flow.code;
  return classifyNftWriteError(err).code;
}

function mintErrorState(err: unknown): ErrorState {
  if (err instanceof MintFlowError) return { key: err.key };
  const { code, neededWei, balanceWei } = classifyCreateFlowError(err);
  switch (code) {
    case "stable_fee_unavailable":
      return { key: "errStableFeeUnavailable" };
    case "stable_daily_cap":
      return { key: "errStableDailyCap" };
    case "insufficient_funds":
      return neededWei !== undefined && balanceWei !== undefined
        ? { key: "errInsufficientPpl", neededWei, balanceWei }
        : { key: "errInsufficientPplGeneric" };
    case "network":
      return { key: "errNetworkRpc" };
    case "wallet_rejected":
      return { key: "errWalletRejected" };
  }
  const { code: legacyCode } = classifyNftWriteError(err);
  switch (legacyCode) {
    case "wallet_rejected":
      return { key: "errWalletRejected" };
    case "not_collection_creator":
      return { key: "errNotCreator" };
    case "receipt_failed":
      return { key: "errReverted" };
    case "chain_mismatch":
      return { key: "errWrongNetwork" };
    case "timeout":
      return { key: "errTimeout" };
    default:
      return { key: "errUnknown" };
  }
}

export function EvmNftMint() {
  const { lang } = useLanguage();
  const copy = factoryCopy[lang];
  const form = copy.form;
  const u = uxCopy[lang];
  const nm = nftMediaCopy[lang];
  const { signer } = useExternalWallet();
  const factory = nftFactoryAddress();
  const gateway = stableFeeGatewayAddress();
  const stableAssets = stableFeeAssets();
  const draftStore = useMemo(() => createDraftStore(browserStorage), []);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<NftKind>("image");
  const [imageFile, setImageFile] = useState<Picked | null>(null);
  const [coverFile, setCoverFile] = useState<Picked | null>(null);
  const [videoFile, setVideoFile] = useState<Picked | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [mode, setMode] = useState<Mode>("single");
  const [collectionInput, setCollectionInput] = useState("");
  const [fee, setFee] = useState<bigint | null>(null);
  const [feeFailed, setFeeFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [draft, setDraft] = useState<NftMintDraft | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [errorFrom, setErrorFrom] = useState<"save" | "mint" | null>(null);
  const [payWith, setPayWith] = useState<PayWith>("PPL");
  const [stableFeeUsd6, setStableFeeUsd6] = useState<bigint | null>(null);
  const [mintStep, setMintStep] = useState<"approving" | "payingFee" | "confirmCreate" | "confirmMint" | "waiting" | null>(null);
  const mintLock = useRef(false);
  const saveLock = useRef(false);

  const imageLocalUrl = useObjectUrl(kind === "image" ? imageFile : coverFile);
  const videoLocalUrl = useObjectUrl(kind === "video" ? videoFile : null);

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

  // Bring back an attempt from before a reload: stored files, progress and any sent transactions.
  const signerAddress = signer?.address ?? null;
  useEffect(() => {
    if (!signerAddress) return;
    const stored = draftStore.load(signerAddress);
    if (!stored) return;
    setDraft(stored);
    setSaved({
      tokenUri: stored.tokenUri,
      metadataUrl: "",
      imagePreviewUrl: stored.imagePreviewUrl,
      videoPreviewUrl: stored.videoPreviewUrl,
      isSvg: stored.imagePreviewUrl.startsWith("data:image/svg+xml"),
    });
    setName(stored.name);
    setDescription(stored.description ?? "");
    setKind(stored.kind);
    setMode(stored.mode);
    setCollectionInput(stored.collectionInput ?? "");
    if (stored.payWith === "PPL" || stableAssets.some((asset) => asset.id === stored.payWith)) {
      setPayWith(stored.payWith as PayWith);
    }
    if (stored.status === "done" && stored.collection) {
      setResult({
        collection: getAddress(stored.collection),
        tokenId: stored.tokenId !== undefined ? BigInt(stored.tokenId) : null,
        mintTx: stored.mintTx ?? null,
        createTx: stored.createTx ?? null,
      });
    }
    // Only when the wallet address changes; the draft store is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signerAddress, draftStore]);

  // A receipt wait can time out after the mint is already in a block. The draft then still
  // looks unfinished. If the collection's latest token is this metadata, close the attempt.
  useEffect(() => {
    if (busy || !signerAddress || !draft || draft.status === "done") return;
    if (!draft.mintAttempted && !draft.mintTx) return;
    if (!draft.collection || !isAddress(draft.collection)) return;
    let cancelled = false;
    const collection = getAddress(draft.collection);
    void findExistingMint(readPublicClient(), collection, draft.tokenUri, getAddress(signerAddress))
      .then((tokenId) => {
        if (cancelled || tokenId === null) return;
        const next = applyConfirmedMint(draft, tokenId.toString());
        draftStore.save(next);
        setDraft(next);
        setResult({
          collection,
          tokenId,
          mintTx: next.mintTx ?? null,
          createTx: next.createTx ?? null,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [busy, signerAddress, draft, draftStore]);

  const resuming = isResumable(draft);
  const showResumeNotice = showsResumeNotice(draft, busy);
  const locked = busy || saving || resuming;
  const collectionValid = mode === "single" || isAddress(collectionInput.trim());
  const detailsValid = name.trim().length >= NFT_NAME_MIN && name.trim().length <= NFT_NAME_MAX && description.length <= NFT_DESCRIPTION_MAX;
  const hasMedia =
    kind === "video" ? Boolean(videoFile && coverFile) : Boolean(imageFile || (imageUrl.trim() && !imageFile));
  const canSave = Boolean(signer && detailsValid && hasMedia && !locked && !saved);
  const canMint = Boolean(
    signer &&
      factory &&
      saved &&
      draft &&
      collectionValid &&
      !busy &&
      !saving &&
      (fee !== null || planResume(draft)[0] === "wait_mint") &&
      (payWith === "PPL" || stableFeeUsd6 !== null || draft.payDone),
  );

  /** Any edit after saving invalidates the stored metadata, unless a transaction is already in flight. */
  const touch = () => {
    if (resuming) return;
    if (saved || draft) {
      setSaved(null);
      if (draft && signerAddress) draftStore.clear(signerAddress);
      setDraft(null);
    }
    setStages([]);
    setError(null);
    setErrorFrom(null);
  };

  const pickImage = (target: "image" | "cover") => (file: File | null) => {
    if (!file) return;
    touch();
    const checked = checkImageFile(file);
    if (!checked.ok) {
      setError({ key: checked.key });
      setErrorFrom("save");
      return;
    }
    (target === "image" ? setImageFile : setCoverFile)({ file, mime: checked.mime });
    if (target === "image") setImageUrl("");
  };
  const pickVideo = (file: File | null) => {
    if (!file) return;
    touch();
    const checked = checkVideoFile(file);
    if (!checked.ok) {
      setError({ key: checked.key });
      setErrorFrom("save");
      return;
    }
    setVideoFile({ file, mime: checked.mime });
  };

  const save = async () => {
    if (saveLock.current || !signerAddress) return;
    saveLock.current = true;
    setSaving(true);
    setError(null);
    setErrorFrom(null);
    const rows = stagesFor(kind, Boolean(imageFile));
    setStages(rows);
    try {
      const out = await saveNftFiles({
        kind,
        name: name.trim(),
        description,
        imageFile: kind === "image" ? imageFile?.file ?? null : null,
        imageMime: imageFile?.mime ?? "",
        imageUrl: kind === "image" && !imageFile ? imageUrl : "",
        coverFile: coverFile?.file ?? null,
        coverMime: coverFile?.mime ?? "",
        videoFile: videoFile?.file ?? null,
        videoMime: (videoFile?.mime as NftVideoType | undefined) ?? "",
        onStage: (id, patch) =>
          setStages((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row))),
      });
      const isSvg = out.imagePreviewUrl.startsWith("data:image/svg+xml");
      const next: NftMintDraft = {
        version: 1,
        owner: signerAddress.toLowerCase(),
        status: "saved",
        mode,
        kind,
        name: name.trim(),
        description,
        tokenUri: out.metadata.tokenUri,
        imagePreviewUrl: out.imagePreviewUrl,
        videoPreviewUrl: out.video?.gatewayUrl,
        collectionInput: mode === "collection" ? collectionInput.trim() : undefined,
        payWith,
      };
      draftStore.save(next);
      setDraft(next);
      setSaved({
        tokenUri: out.metadata.tokenUri,
        metadataUrl: out.metadata.gatewayUrl,
        imagePreviewUrl: out.imagePreviewUrl,
        videoPreviewUrl: out.video?.gatewayUrl,
        isSvg,
      });
    } catch (err) {
      console.error(err);
      const key: NftErrorKey = err instanceof NftSaveError ? err.key : "errNetwork";
      setError({ key, uploadCode: err instanceof NftSaveError ? err.uploadCode : undefined });
      setErrorFrom("save");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const mint = async () => {
    if (mintLock.current || !signer || !factory || !draft) return;
    mintLock.current = true;
    setBusy(true);
    setError(null);
    setErrorFrom(null);
    const client = readPublicClient();
    // Every state change goes to storage before the next network step, so a reload can resume.
    let current: NftMintDraft = isResumable(draft)
      ? draft
      : { ...draft, mode, payWith, collectionInput: mode === "collection" ? collectionInput.trim() : undefined };
    const persist = (patch: Partial<NftMintDraft>) => {
      current = { ...current, ...patch };
      draftStore.save(current);
      setDraft(current);
    };
    const waitFor = (hash: `0x${string}`) => client.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
    const finishMint = async (collection: Address, minted: bigint | null, mintTx: string | null) => {
      const tokenId = minted ?? (await findExistingMint(client, collection, current.tokenUri, signer.address));
      if (tokenId === null) return false;
      persist(applyConfirmedMint(current, tokenId.toString(), mintTx ?? undefined));
      setResult({ collection, tokenId, mintTx, createTx: current.createTx ?? null });
      return true;
    };
    try {
      persist({ status: "in_progress" });
      const steps = planResume(current);

      if (steps[0] === "wait_mint" && current.mintTx) {
        setMintStep("waiting");
        const receipt = await waitFor(current.mintTx as `0x${string}`);
        if (receipt.status !== "success") throw new Error(`receipt: mint reverted (${current.mintTx})`);
        const collection = getAddress(current.collection as string);
        const tokenId = tokenIdFromReceipt(receipt, factory, collection);
        if (!(await finishMint(collection, tokenId, current.mintTx ?? null))) {
          throw new Error("mint confirmed but token id was not found");
        }
        return;
      }
      if (fee === null) throw new Error("fee unavailable");

      let collection: Address | null = current.collection ? getAddress(current.collection) : null;
      if (current.mode === "collection" && !collection) {
        const input = (current.collectionInput ?? "").trim();
        if (!ZERO_ADDRESS_FREE.test(input)) throw new MintFlowError("errInvalidAddress");
        const candidate = getAddress(input);
        const [isCollection, creator] = await Promise.all([
          client.readContract({ address: factory, abi: nftFactoryAbi, functionName: "isCollection", args: [candidate] }),
          client.readContract({ address: factory, abi: nftFactoryAbi, functionName: "creatorOf", args: [candidate] }),
        ]);
        if (!isCollection) throw new MintFlowError("errNotCollection");
        if ((creator as Address).toLowerCase() !== signer.address.toLowerCase()) throw new MintFlowError("errNotCreator");
        collection = candidate;
        persist({ collection });
      }

      if (steps.includes("pay") || steps.includes("wait_pay")) {
        const credit = await client.readContract({
          address: factory,
          abi: nftFactoryAbi,
          functionName: "prepaidCredit",
          args: [signer.address],
        });
        if (credit < fee) {
          const stable = stableAssets.find((asset) => asset.id === current.payWith);
          if (!stable || !gateway || stableFeeUsd6 === null) throw new Error("stable fee unavailable");
          const waitForPay = async (hash: `0x${string}`) => {
            const receipt = await waitFor(hash);
            if (receipt.status === "success") return;
            let payError: unknown = new Error(`receipt: payLaunchFee reverted (${hash})`);
            try {
              await client.simulateContract({
                account: signer.address,
                address: gateway,
                abi: stableFeeGatewayAbi,
                functionName: "payLaunchFee",
                args: [GATEWAY_KIND.NFT_MINT, stable.address],
                blockNumber: receipt.blockNumber > BigInt(0) ? receipt.blockNumber - BigInt(1) : undefined,
              });
            } catch (simulationError) {
              payError = simulationError;
            }
            console.error("[mint] payLaunchFee reverted", payError);
            persist({ payTx: undefined });
            throw payError;
          };
          if (current.payTx) {
            setMintStep("waiting");
            await waitForPay(current.payTx as `0x${string}`);
          } else {
            const allowance = await client.readContract({
              address: stable.address,
              abi: erc20Abi,
              functionName: "allowance",
              args: [signer.address, gateway],
            });
            if (allowance < stableFeeUsd6) {
              setMintStep("approving");
              const approveHash = await writeViaActiveSigner(signer, {
                address: stable.address,
                abi: erc20Abi,
                functionName: "approve",
                args: [gateway, stableFeeUsd6],
              });
              setMintStep("waiting");
              await waitFor(approveHash);
            }
            setMintStep("payingFee");
            const payHash = await writeViaActiveSigner(signer, {
              address: gateway,
              abi: stableFeeGatewayAbi,
              functionName: "payLaunchFee",
              args: [GATEWAY_KIND.NFT_MINT, stable.address],
            });
            persist({ payTx: payHash });
            setMintStep("waiting");
            await waitForPay(payHash);
          }
        }
        persist({ payDone: true });
      }

      if (current.mode === "single" && !collection) {
        let createHash = current.createTx as `0x${string}` | undefined;
        if (!createHash) {
          setMintStep("confirmCreate");
          createHash = await writeViaActiveSigner(
            signer,
            buildCreateCollectionRequest(factory, current.name, deriveCollectionSymbol(current.name)),
          );
          persist({ createTx: createHash });
        }
        setMintStep("waiting");
        const createReceipt = await waitFor(createHash);
        if (createReceipt.status !== "success") throw new Error(`receipt: collection create reverted (${createHash})`);
        const parsed = collectionFromReceipt(createReceipt, factory);
        if (!parsed) throw new Error("collection address not found in the create receipt");
        collection = parsed;
        persist({ collection: parsed, createTx: createHash });
      }
      if (!collection) throw new Error("collection unknown");

      if (current.mintAttempted) {
        const existing = await findExistingMint(client, collection, current.tokenUri, signer.address);
        if (existing !== null) {
          await finishMint(collection, existing, current.mintTx ?? null);
          return;
        }
      }

      let mintFeeValue = fee;
      try {
        const mintCredit = await client.readContract({
          address: factory,
          abi: nftFactoryAbi,
          functionName: "prepaidCredit",
          args: [signer.address],
        });
        mintFeeValue = requiredFeeValue(fee, mintCredit);
      } catch {
        // Re-read failed: only trust a stable payment already recorded in this attempt.
        mintFeeValue = current.payWith !== "PPL" && current.payDone ? BigInt(0) : fee;
      }
      const mintRequest = buildMintRequest(factory, collection, current.tokenUri, mintFeeValue);
      try {
        const balance = await client.getBalance({ address: signer.address });
        let gasCost = BigInt(0);
        try {
          const gas = await client.estimateContractGas({ account: signer.address, ...mintRequest });
          gasCost = gas * (await client.getGasPrice());
        } catch {
          try {
            const gas = await client.estimateContractGas({ account: signer.address, ...mintRequest, value: BigInt(0) });
            gasCost = gas * (await client.getGasPrice());
          } catch {
            /* keep the fee-only floor when the node cannot estimate */
          }
        }
        const balanceCheck = checkBalanceForCost(balance, mintFeeValue + gasCost);
        if (!balanceCheck.ok) {
          setError({
            key: "errInsufficientPpl",
            neededWei: balanceCheck.neededWei,
            balanceWei: balanceCheck.balanceWei,
          });
          persist(releaseMintAttempt(current));
          return;
        }
      } catch {
        /* if the balance cannot be read, let the wallet report it */
      }

      setMintStep("confirmMint");
      persist({ mintAttempted: true });
      let mintHash: `0x${string}`;
      try {
        mintHash = await writeViaActiveSigner(signer, mintRequest);
      } catch (err) {
        // A refused prompt sent nothing, so the next try may mint without the "already minted" lookup.
        if (classifyNftWriteError(err).code === "wallet_rejected") persist({ mintAttempted: false });
        throw err;
      }
      persist({ mintTx: mintHash });
      setMintStep("waiting");
      const mintReceipt = await waitFor(mintHash);
      if (mintReceipt.status !== "success") throw new Error(`receipt: mint reverted (${mintHash})`);
      const tokenId = tokenIdFromReceipt(mintReceipt, factory, collection);
      if (!(await finishMint(collection, tokenId, mintHash))) {
        throw new Error("mint confirmed but token id was not found");
      }
    } catch (err) {
      const recoveredCollection =
        current.collection && isAddress(current.collection) ? getAddress(current.collection) : null;
      if (recoveredCollection && (current.mintAttempted || current.mintTx)) {
        try {
          if (await finishMint(recoveredCollection, null, current.mintTx ?? null)) return;
        } catch (recoverErr) {
          console.error(recoverErr);
        }
      }
      console.error(err);
      const code = attemptFailureCode(err);
      if (shouldReleaseAttempt(code, current)) persist(releaseMintAttempt(current, code === "receipt_failed"));
      setError(mintErrorState(err));
      setErrorFrom("mint");
    } finally {
      mintLock.current = false;
      setBusy(false);
      setMintStep(null);
    }
  };

  const discardAttempt = () => {
    if (signerAddress) draftStore.clear(signerAddress);
    setDraft(null);
    setSaved(null);
    setStages([]);
    setError(null);
    setErrorFrom(null);
  };

  const createAnother = () => {
    discardAttempt();
    setResult(null);
    setName("");
    setDescription("");
    setImageFile(null);
    setCoverFile(null);
    setVideoFile(null);
    setImageUrl("");
  };

  const mintStepLabel =
    mintStep === "approving"
      ? form.approvingStable
      : mintStep === "payingFee"
        ? form.payingStableFee
        : mintStep === "confirmCreate"
          ? nm.stageConfirmCreate
          : mintStep === "confirmMint"
            ? nm.stageConfirmMint
            : mintStep === "waiting"
              ? nm.stageWaitingTx
              : null;

  if (!factory) {
    return <p className="px-4 py-16 text-center text-ink-2">{nm.errFactoryMissing}</p>;
  }

  const previewImage = saved ? saved.imagePreviewUrl : kind === "image" && !imageFile && /^https:\/\//.test(imageUrl.trim()) ? imageUrl.trim() : imageLocalUrl;
  const previewVideo = saved ? saved.videoPreviewUrl ?? null : videoLocalUrl;
  const previewIsSvg = saved ? saved.isSvg : (kind === "image" ? imageFile : coverFile)?.mime === "image/svg+xml";
  const errorText = error
    ? directUploadAlertText(lang, error.uploadCode) ??
      (error.key === "notEnoughFee"
      ? u.notEnoughFee
      : error.key === "errInsufficientPpl"
        ? error.neededWei !== undefined && error.balanceWei !== undefined
          ? nm.errInsufficientPpl
              .replaceAll("{needed}", formatPplExact(error.neededWei))
              .replaceAll("{balance}", formatPplExact(error.balanceWei))
          : nm.errInsufficientPplGeneric
        : nm[error.key])
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <Eyebrow>{copy.nft.title}</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold tracking-tight text-ink">{copy.nft.title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">{copy.nft.lead}</p>
      <Chip tone="value" className="mt-4">
        PEOPLE Blockchain testnet · chain 97401
      </Chip>

      {!signer ? (
        <div className="mt-8">
          <ConnectWalletMenu />
        </div>
      ) : result ? null : (
        <div className="mt-8 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={locked}
              onClick={() => setMode("single")}
              className={`rounded-xl px-3 py-2 text-sm disabled:opacity-60 ${mode === "single" ? "bg-brand text-brand-ink" : "bg-surface-2"}`}
            >
              {copy.nft.modeSingle}
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={() => setMode("collection")}
              className={`rounded-xl px-3 py-2 text-sm disabled:opacity-60 ${mode === "collection" ? "bg-brand text-brand-ink" : "bg-surface-2"}`}
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
                disabled={locked}
                dir="ltr"
                placeholder="0x…"
                className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 font-mono"
              />
              {collectionInput.trim() && !isAddress(collectionInput.trim()) ? (
                <span className="mt-1 block text-xs font-normal text-warm">{nm.errInvalidAddress}</span>
              ) : null}
            </label>
          ) : null}

          <NftMediaPicker
            copy={nm}
            kind={kind}
            onKind={(next) => {
              touch();
              setKind(next);
            }}
            disabled={locked}
            imageName={imageFile?.file.name ?? null}
            coverName={coverFile?.file.name ?? null}
            videoName={videoFile?.file.name ?? null}
            onImage={pickImage("image")}
            onCover={pickImage("cover")}
            onVideo={pickVideo}
            imageUrl={imageUrl}
            onImageUrl={(value) => {
              touch();
              setImageUrl(value);
              if (value) setImageFile(null);
            }}
          />

          <label className="block text-sm font-medium text-ink">
            {form.name}
            <input
              value={name}
              maxLength={NFT_NAME_MAX}
              onChange={(event) => {
                touch();
                setName(event.target.value);
              }}
              disabled={locked}
              placeholder={u.namePlaceholderNft}
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium text-ink">
            {form.description}
            <textarea
              value={description}
              maxLength={NFT_DESCRIPTION_MAX}
              onChange={(event) => {
                touch();
                setDescription(event.target.value);
              }}
              disabled={locked}
              rows={4}
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2"
            />
          </label>

          <NftPreview
            copy={nm}
            kind={kind}
            imageSrc={previewImage}
            videoSrc={previewVideo}
            stored={Boolean(saved)}
            isSvg={Boolean(previewIsSvg)}
            name={name.trim()}
            description={description.trim()}
          />

          <p className="text-sm text-ink-2">
            {form.feeLabel}: {feeFailed ? form.feeUnset : fee === null ? "…" : `${formatPplExact(fee)} PPL`}
          </p>
          <p className="text-xs text-ink-3">{u.feeHint}</p>

          {stableAssets.length > 0 ? (
            <div className="rounded-xl border border-line p-3" data-testid="stable-fee-option">
              <p className="text-sm font-semibold text-ink">{form.payWithLabel}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => setPayWith("PPL")}
                  className={`rounded-xl px-3 py-2 text-sm disabled:opacity-60 ${payWith === "PPL" ? "bg-brand text-brand-ink" : "bg-surface-2"}`}
                >
                  {form.payWithPpl}
                </button>
                {stableAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    disabled={locked}
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

          <p className="text-xs text-ink-3">{nm.filesFirst}</p>
          <NftStages copy={nm} rows={stages} />
          {saved && !resuming ? (
            <p role="status" data-testid="nft-files-saved" className="text-sm font-medium text-value">
              {nm.stageReady}
            </p>
          ) : null}
          {showResumeNotice ? (
            <p role="status" data-testid="nft-resume-notice" className="text-sm text-ink-2">
              {nm.resumeNotice}
            </p>
          ) : null}
          {mintStepLabel ? (
            <p role="status" aria-live="polite" data-testid="nft-mint-stage" className="text-sm text-ink-2">
              {mintStepLabel}
            </p>
          ) : null}

          {error && errorText ? (
            <div role="alert" data-testid="nft-error" data-error-key={error.uploadCode ?? error.key} className="rounded-xl border border-warm/40 p-3 text-sm text-warm">
              <p>
                {form.error}: {errorText}
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              data-testid="nft-save"
              disabled={!canSave}
              onClick={() => void save()}
              className="w-full rounded-xl bg-surface-2 px-6 py-3 font-semibold text-ink disabled:opacity-40 sm:w-auto"
            >
              {saving ? nm.savingFiles : errorFrom === "save" && error ? nm.retry : nm.saveFiles}
            </button>
            <button
              type="button"
              data-testid="nft-mint"
              disabled={!canMint}
              onClick={() => void mint()}
              className="w-full rounded-xl bg-brand px-6 py-3 font-semibold text-brand-ink disabled:opacity-40 sm:w-auto"
            >
              {busy ? mintStepLabel ?? u.sending : resuming ? nm.continueMint : errorFrom === "mint" && error ? nm.retry : nm.mintNow}
            </button>
            {resuming && !busy ? (
              <button type="button" onClick={discardAttempt} className="w-full rounded-xl px-6 py-3 text-sm text-ink-2 underline sm:w-auto">
                {nm.resumeDiscard}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {result ? (
        <section className="mt-8 space-y-3 rounded-2xl border border-value/40 bg-surface p-4" data-testid="nft-result">
          <h2 className="font-bold text-ink">{form.result}</h2>
          <p className="text-sm text-ink-2">{u.sent}</p>
          {draft ? (
            <div className="overflow-hidden rounded-xl bg-surface-2">
              {draft.kind === "video" && draft.videoPreviewUrl ? (
                <video
                  controls
                  playsInline
                  preload="none"
                  poster={draft.imagePreviewUrl}
                  src={draft.videoPreviewUrl}
                  data-testid="nft-result-video"
                  className="block max-h-[60vh] w-full"
                />
              ) : (
                <img src={draft.imagePreviewUrl} alt={draft.name} data-testid="nft-result-image" className="mx-auto block max-h-[60vh] w-full object-contain" />
              )}
            </div>
          ) : null}
          {draft ? <p className="break-words font-semibold text-ink">{draft.name}</p> : null}
          {draft?.description ? <p className="whitespace-pre-wrap break-words text-sm text-ink-2">{draft.description}</p> : null}
          <p className="break-all text-sm">
            {copy.nft.collectionLabel}:{" "}
            <Link href={`/explorer/address/${result.collection}`} className="font-mono text-brand hover:underline" dir="ltr">
              {result.collection}
            </Link>
          </p>
          <p className="text-sm">
            {form.nftId}: <span className="font-mono">{result.tokenId !== null ? result.tokenId.toString() : "—"}</span>
          </p>
          {result.mintTx ? (
            <p className="break-all text-sm">
              {form.txId}:{" "}
              <Link href={`/explorer/tx/${encodeURIComponent(result.mintTx)}`} className="font-mono text-brand hover:underline" dir="ltr">
                {result.mintTx}
              </Link>
            </p>
          ) : null}
          {result.createTx ? (
            <p className="break-all text-xs text-ink-3">
              {form.txId}:{" "}
              <Link href={`/explorer/tx/${encodeURIComponent(result.createTx)}`} className="font-mono text-brand hover:underline" dir="ltr">
                {result.createTx}
              </Link>
            </p>
          ) : null}
          {draft ? (
            <p className="break-all text-xs text-ink-3">
              {nm.storedAt}: <span className="font-mono" dir="ltr">{draft.tokenUri}</span>
            </p>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {result.tokenId !== null ? (
              <Link
                href={inAppNftPath(result.collection, result.tokenId)}
                data-testid="nft-result-link"
                className="inline-flex w-full justify-center rounded-xl border border-line px-6 py-3 font-semibold text-ink sm:w-auto"
              >
                {nm.viewHere}
              </Link>
            ) : null}
            {result.tokenId !== null ? (
              <a
                href={peoplescanNftUrl(result.collection, result.tokenId)}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="nft-peoplescan-link"
                className="inline-flex w-full justify-center rounded-xl bg-brand px-6 py-3 font-semibold text-brand-ink sm:w-auto"
              >
                {nm.viewOnPeoplescan}
              </a>
            ) : null}
            <button type="button" onClick={createAnother} className="text-sm font-semibold text-brand">
              {nm.createAnother}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
