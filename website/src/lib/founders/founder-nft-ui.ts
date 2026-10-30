import type { Address, Hex } from "viem";
import { founderNftAbi } from "./founder-nft-abi.ts";
import type { FounderNftPublicConfig } from "./founder-nft-config.ts";

/** Pure helpers for the Founder NFT card on /founders (no React, no network). */

export type RebindCountdown = {
  /** True once `executeRebind` is allowed (the contract accepts exactly `executeAfter`). */
  ready: boolean;
  remainingSeconds: number;
  days: number;
  hours: number;
  minutes: number;
};

export function rebindCountdown(executeAfter: number, nowSeconds: number): RebindCountdown {
  const remainingSeconds = Math.max(0, Math.ceil(executeAfter - nowSeconds));
  return {
    ready: nowSeconds >= executeAfter,
    remainingSeconds,
    days: Math.floor(remainingSeconds / 86400),
    hours: Math.floor((remainingSeconds % 86400) / 3600),
    minutes: Math.floor((remainingSeconds % 3600) / 60),
  };
}

/** Localized unit labels. Defaults match the English "2d 5h 10m" form. */
export type RebindCountdownUnits = { d: string; h: string; m: string };

const DEFAULT_REBIND_UNITS: RebindCountdownUnits = { d: "d", h: "h", m: "m" };

/** "2d 5h 10m" / "5h 10m" / "10m" (never a zero minute while time remains). */
export function formatRebindCountdown(
  countdown: RebindCountdown,
  units: RebindCountdownUnits = DEFAULT_REBIND_UNITS,
): string {
  if (countdown.ready) return `0${units.m}`;
  const parts: string[] = [];
  if (countdown.days > 0) parts.push(`${countdown.days}${units.d}`);
  if (countdown.days > 0 || countdown.hours > 0) parts.push(`${countdown.hours}${units.h}`);
  const minutes = Math.max(countdown.minutes, countdown.days === 0 && countdown.hours === 0 ? 1 : 0);
  parts.push(`${minutes}${units.m}`);
  return parts.join(" ");
}

export function formatFounderNftNumber(tokenId: string | bigint): string {
  return `#${tokenId.toString()}`;
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export type FounderNftErrorKey =
  | "errRejected"
  | "errNotConfigured"
  | "errNotEligible"
  | "errAlreadyHolder"
  | "errMintClosed"
  | "errExpired"
  | "errSignatureStale"
  | "errNotHolder"
  | "errDelayActive"
  | "errNoPending"
  | "errConflict"
  | "errUnavailable"
  | "errWalletAuth"
  | "errGeneric";

const REVERT_KEYS: Array<[string, FounderNftErrorKey]> = [
  ["MintWindowClosed", "errMintClosed"],
  ["PersonAlreadyMinted", "errAlreadyHolder"],
  ["AddressAlreadyHolder", "errAlreadyHolder"],
  ["Expired", "errExpired"],
  ["InvalidSignature", "errSignatureStale"],
  ["NonceUsed", "errSignatureStale"],
  ["StaleRebind", "errSignatureStale"],
  ["SignerDisabled", "errNotConfigured"],
  ["NotHolder", "errNotHolder"],
  ["RebindDelayActive", "errDelayActive"],
  ["NoPendingRebind", "errNoPending"],
  ["RebindDelayElapsed", "errNoPending"],
  ["OldHolderHasNoToken", "errSignatureStale"],
  ["PersonMismatch", "errSignatureStale"],
  ["NotRecipient", "errGeneric"],
];

/** Maps a thrown wallet/RPC error (viem revert names, wallet rejection) to a localized copy key. */
export function founderNftWriteErrorKey(error: unknown): FounderNftErrorKey {
  const text = [
    error instanceof Error ? error.message : "",
    typeof error === "object" && error !== null && "shortMessage" in error ? String((error as { shortMessage?: unknown }).shortMessage) : "",
    typeof error === "string" ? error : "",
  ].join(" ");
  if (/user rejected|user denied|rejected the request|action_rejected|\b4001\b/i.test(text)) return "errRejected";
  for (const [name, key] of REVERT_KEYS) {
    if (new RegExp(`\\b${name}\\b`).test(text)) return key;
  }
  return "errGeneric";
}

/** Maps an error code from `/api/founders/nft/*` to a localized copy key. */
export function founderNftApiErrorKey(status: number, code: string | undefined): FounderNftErrorKey {
  if (status === 503 || code === "not_configured") return "errNotConfigured";
  if (code === "wallet_auth_expired") return "errExpired";
  if (code?.startsWith("wallet_auth")) return "errWalletAuth";
  if (code === "hp_required") return "errNotEligible";
  if (code === "identity_conflict") return "errConflict";
  if (code === "not_available") return "errAlreadyHolder";
  if (status === 502) return "errUnavailable";
  return "errGeneric";
}

type Signature = { personId: Hex; address: Address; oldHolder?: Address; nonce: string; deadline: string; signature: Hex };

/** `writeContract` requests for the five user-signed calls (passed to `writeViaActiveSigner`). */
export function buildFounderNftMintRequest(config: FounderNftPublicConfig, sig: Signature) {
  return {
    address: config.address,
    abi: founderNftAbi,
    functionName: "mint",
    args: [sig.personId, sig.address, BigInt(sig.nonce), BigInt(sig.deadline), sig.signature],
  } as const;
}

export function buildFounderNftRequestRebindRequest(config: FounderNftPublicConfig, sig: Signature) {
  if (!sig.oldHolder) throw new Error("rebind signature without oldHolder");
  return {
    address: config.address,
    abi: founderNftAbi,
    functionName: "requestRebind",
    args: [sig.personId, sig.oldHolder, sig.address, BigInt(sig.nonce), BigInt(sig.deadline), sig.signature],
  } as const;
}

export function buildFounderNftCancelRequest(config: FounderNftPublicConfig, personId: Hex) {
  return { address: config.address, abi: founderNftAbi, functionName: "cancelRebind", args: [personId] } as const;
}

export function buildFounderNftExecuteRequest(config: FounderNftPublicConfig, personId: Hex) {
  return { address: config.address, abi: founderNftAbi, functionName: "executeRebind", args: [personId] } as const;
}
