import { concatHex, getAddress, hashTypedData, isAddress, isHex, recoverAddress, size, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { createLocalVerifierSigner } from "../verifier/local.ts";
import { createAwsKmsClient, createKmsVerifierSigner } from "../verifier/kms-aws.ts";
import type { VerifierSigner } from "../verifier/signer.ts";

import {
  MAINNET_RETURN_TYPES,
  PEOPLE_MAINNET_CHAIN_ID,
  decodeReturnBurned,
  type ReturnLog,
} from "./return-burn";

export const ATTESTATION_TTL_SECONDS = 15 * 60;
/** Slack allowed when the cosigner is handed the primary attestation's deadline. */
const DEADLINE_SKEW_SECONDS = 60;

/**
 * PEOPLE blocks required before a `MainnetReturn` is signed, counting the
 * receipt block. A receipt already in a finalized block is accepted even when
 * the numeric depth is still below this constant. Twelve is the bar documented
 * for this signer.
 */
export const MIN_RETURN_CONFIRMATIONS = BigInt(12);

export { PEOPLE_MAINNET_CHAIN_ID, decodeReturnBurned };

/** Local return-verifier key. Named like `SALE_VERIFIER_LOCAL_KEY`; absent means sell-back signing is off. */
export function readReturnVerifierKey(
  raw: string | undefined = process.env.SALE_RETURN_VERIFIER_LOCAL_KEY,
): Hex | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const prefixed = `0x${value.replace(/^0x/i, "")}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(prefixed)) return null;
  return prefixed as Hex;
}

/**
 * Resolves the `MainnetReturn` signer the same way as the purchase verifier.
 *
 * - `SALE_RETURN_VERIFIER_MODE=kms`: AWS KMS key `SALE_RETURN_VERIFIER_KMS_KEY_ID` (production; the
 *   private key never leaves KMS).
 * - `SALE_RETURN_VERIFIER_MODE=local` (or mode unset with `SALE_RETURN_VERIFIER_LOCAL_KEY` set):
 *   env-held key, Base Sepolia only. Any other hub chain, including Base mainnet (8453), is refused.
 *
 * Returns null (sell-back signing off) when nothing is configured or the configuration is refused,
 * so a misconfiguration never falls through to a signature.
 */
export function getReturnVerifierSigner(
  hubChainId: number,
  env: Record<string, string | undefined> = process.env,
): VerifierSigner | null {
  return resolveSigner(hubChainId, env, "SALE_RETURN_VERIFIER");
}

/**
 * Second, independent `MainnetReturn` signer, run on a separate server (scripts/return-cosigner.ts).
 * Same rules as the primary: `SALE_RETURN_COSIGNER_MODE=kms` with `SALE_RETURN_COSIGNER_KMS_KEY_ID`,
 * or `local` with `SALE_RETURN_COSIGNER_LOCAL_KEY` on Base Sepolia only.
 */
export function getReturnCosignerSigner(
  hubChainId: number,
  env: Record<string, string | undefined> = process.env,
): VerifierSigner | null {
  return resolveSigner(hubChainId, env, "SALE_RETURN_COSIGNER");
}

function resolveSigner(
  hubChainId: number,
  env: Record<string, string | undefined>,
  prefix: "SALE_RETURN_VERIFIER" | "SALE_RETURN_COSIGNER",
): VerifierSigner | null {
  const rawMode = (env[`${prefix}_MODE`] ?? "").trim().toLowerCase();
  const localKey = env[`${prefix}_LOCAL_KEY`]?.trim();
  const mode = rawMode || (localKey ? "local" : "");
  try {
    if (mode === "kms") {
      const keyId = env[`${prefix}_KMS_KEY_ID`]?.trim();
      if (!keyId) return null;
      return createKmsVerifierSigner({ client: createAwsKmsClient(), keyId });
    }
    if (mode === "local") {
      if (!localKey || !readReturnVerifierKey(localKey)) return null;
      return createLocalVerifierSigner(hubChainId, localKey);
    }
  } catch {
    return null;
  }
  return null;
}

export function mainnetReturnDomain(chainId: number, hub: Address) {
  return {
    name: "PplCurveHubV2",
    version: "1",
    chainId,
    verifyingContract: hub,
  } as const;
}

export async function signMainnetReturn(input: {
  privateKey: Hex;
  chainId: number;
  hub: Address;
  message: {
    personId: Hex;
    hub: Address;
    seller: Address;
    pplAmount: bigint;
    sourceChainId: number;
    destChainId: number;
    returnId: Hex;
    deadline: bigint;
  };
}): Promise<Hex> {
  const account = privateKeyToAccount(input.privateKey);
  return account.signTypedData({
    domain: mainnetReturnDomain(input.chainId, input.hub),
    types: MAINNET_RETURN_TYPES,
    primaryType: "MainnetReturn",
    message: {
      personId: input.message.personId,
      hub: input.message.hub,
      seller: input.message.seller,
      pplAmount: input.message.pplAmount,
      sourceChainId: BigInt(input.message.sourceChainId),
      destChainId: BigInt(input.message.destChainId),
      returnId: input.message.returnId,
      deadline: input.message.deadline,
    },
  });
}

export function mainnetReturnDigest(input: {
  chainId: number;
  hub: Address;
  message: Parameters<typeof signMainnetReturn>[0]["message"];
}): Hex {
  return hashTypedData({
    domain: mainnetReturnDomain(input.chainId, input.hub),
    types: MAINNET_RETURN_TYPES,
    primaryType: "MainnetReturn",
    message: {
      personId: input.message.personId,
      hub: input.message.hub,
      seller: input.message.seller,
      pplAmount: input.message.pplAmount,
      sourceChainId: BigInt(input.message.sourceChainId),
      destChainId: BigInt(input.message.destChainId),
      returnId: input.message.returnId,
      deadline: input.message.deadline,
    },
  });
}

export type AttestationFailure = { ok: false; status: 202 | 400 | 422 | 503; error: string };
export type AttestationSuccess = {
  ok: true;
  status: 200;
  body: {
    personId: Hex;
    hub: Address;
    seller: Address;
    pplAmount: string;
    sourceChainId: number;
    destChainId: number;
    returnId: Hex;
    deadline: number;
    signature: Hex;
    chainId: number;
  };
};

function validBytes32(raw: string | undefined): Hex | undefined {
  if (!raw) return undefined;
  return isHex(raw) && raw.length === 66 ? raw : undefined;
}

/**
 * Confirms a PEOPLE-mainnet `ReturnBurned` receipt and signs `MainnetReturn`
 * for that exact burn. Signing waits until the receipt is in a finalized block
 * or has `MIN_RETURN_CONFIRMATIONS` confirmations. A missing key is a 503 and
 * never falls through to a signature.
 */
export async function createReturnAttestation(input: {
  txHash: string;
  returnId?: string;
  /** From `getReturnVerifierSigner`; null means signing is off. */
  signer: VerifierSigner | null;
  burnAddress: string | undefined;
  hubAddress: string | undefined;
  hubChainId: number;
  nowSec: number;
  getReceipt: (txHash: Hex) => Promise<{ status: string; blockNumber: bigint; logs: readonly ReturnLog[] }>;
  headBlock: () => Promise<bigint>;
  finalizedBlock?: () => Promise<bigint | null>;
  /** On-chain address `signer` must match (`returnVerifier`, or `returnCosigner` for the cosigner). */
  returnVerifier: () => Promise<Address>;
  /** Cosigner only: sign for the primary attestation's deadline instead of now + TTL. */
  deadlineSec?: number;
}): Promise<AttestationSuccess | AttestationFailure> {
  if (!input.signer) return { ok: false, status: 503, error: "signer_unavailable" };
  if (
    input.deadlineSec !== undefined &&
    (!Number.isSafeInteger(input.deadlineSec) ||
      input.deadlineSec <= input.nowSec ||
      input.deadlineSec > input.nowSec + ATTESTATION_TTL_SECONDS + DEADLINE_SKEW_SECONDS)
  ) {
    return { ok: false, status: 400, error: "invalid_deadline" };
  }
  if (!input.burnAddress || !isAddress(input.burnAddress) || !input.hubAddress || !isAddress(input.hubAddress)) {
    return { ok: false, status: 503, error: "not_configured" };
  }
  if (!isHex(input.txHash) || input.txHash.length !== 66) {
    return { ok: false, status: 400, error: "invalid_input" };
  }
  const requestedId = input.returnId ? validBytes32(input.returnId) : undefined;
  if (input.returnId && !requestedId) return { ok: false, status: 400, error: "invalid_input" };

  const burn = getAddress(input.burnAddress);
  const hub = getAddress(input.hubAddress);
  let receipt: { status: string; blockNumber: bigint; logs: readonly ReturnLog[] };
  try {
    receipt = await input.getReceipt(input.txHash);
  } catch {
    return { ok: false, status: 503, error: "onchain_unavailable" };
  }
  if (receipt.status !== "success") return { ok: false, status: 422, error: "return_not_found" };

  let finalized = false;
  if (input.finalizedBlock) {
    try {
      const tag = await input.finalizedBlock();
      finalized = tag != null && receipt.blockNumber <= tag;
    } catch {
      return { ok: false, status: 503, error: "onchain_unavailable" };
    }
  }
  if (!finalized) {
    let head: bigint;
    try {
      head = await input.headBlock();
    } catch {
      return { ok: false, status: 503, error: "onchain_unavailable" };
    }
    const depth = head >= receipt.blockNumber ? head - receipt.blockNumber + BigInt(1) : BigInt(0);
    if (depth < MIN_RETURN_CONFIRMATIONS) {
      return { ok: false, status: 202, error: "awaiting_confirmations" };
    }
  }

  const burned = decodeReturnBurned(receipt.logs, {
    burn,
    hub,
    returnId: requestedId,
    destChainId: BigInt(input.hubChainId),
  });
  if (!burned || burned.destChainId !== BigInt(input.hubChainId)) {
    return { ok: false, status: 422, error: "return_not_found" };
  }

  let verifier: Address;
  try {
    verifier = getAddress(await input.returnVerifier());
  } catch {
    return { ok: false, status: 503, error: "onchain_unavailable" };
  }
  let signerAddress: Address;
  try {
    signerAddress = getAddress(await input.signer.getAddress());
  } catch {
    return { ok: false, status: 503, error: "signer_unavailable" };
  }
  if (verifier === ZERO_ADDRESS || signerAddress !== verifier) {
    return { ok: false, status: 503, error: "verifier_mismatch" };
  }

  const deadline = BigInt(input.deadlineSec ?? input.nowSec + ATTESTATION_TTL_SECONDS);
  let signature: Hex;
  try {
    signature = await input.signer.signDigest(
      mainnetReturnDigest({
        chainId: input.hubChainId,
        hub,
        message: {
          personId: burned.personId,
          hub,
          seller: burned.seller,
          pplAmount: burned.amount,
          sourceChainId: PEOPLE_MAINNET_CHAIN_ID,
          destChainId: Number(burned.destChainId),
          returnId: burned.returnId,
          deadline,
        },
      }),
    );
  } catch {
    return { ok: false, status: 503, error: "signer_unavailable" };
  }
  return {
    ok: true,
    status: 200,
    body: {
      personId: burned.personId,
      hub,
      seller: burned.seller,
      pplAmount: burned.amount.toString(),
      sourceChainId: PEOPLE_MAINNET_CHAIN_ID,
      destChainId: Number(burned.destChainId),
      returnId: burned.returnId,
      deadline: Number(deadline),
      signature,
      chainId: input.hubChainId,
    },
  };
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type CosignResult =
  | { ok: true; signature: Hex }
  | { ok: false; status: 202 | 503; error: string };

/**
 * Adds the independent cosigner's signature to a primary attestation. The hub needs both once
 * `returnCosigner` is set, and on Base mainnet a cosigner is mandatory, so this never returns a
 * single signature there. The cosigner's answer is checked against the on-chain `returnCosigner`
 * before it is used.
 */
export async function addCosignature(input: {
  primary: AttestationSuccess["body"];
  txHash: string;
  hubChainId: number;
  cosigner: () => Promise<Address>;
  cosignerUrl: string | undefined;
  cosignerToken: string | undefined;
  fetchImpl?: typeof fetch;
}): Promise<CosignResult> {
  let onchain: Address;
  try {
    onchain = getAddress(await input.cosigner());
  } catch {
    return { ok: false, status: 503, error: "onchain_unavailable" };
  }
  if (onchain === ZERO_ADDRESS) {
    if (input.hubChainId === 8453) return { ok: false, status: 503, error: "cosigner_required" };
    return { ok: true, signature: input.primary.signature };
  }
  const url = input.cosignerUrl?.trim();
  const token = input.cosignerToken?.trim();
  if (!url || !token) return { ok: false, status: 503, error: "cosigner_not_configured" };

  let res: Response;
  try {
    res = await (input.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        txHash: input.txHash,
        returnId: input.primary.returnId,
        deadline: input.primary.deadline,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, status: 503, error: "cosigner_unavailable" };
  }
  if (res.status === 202) return { ok: false, status: 202, error: "awaiting_confirmations" };
  if (!res.ok) return { ok: false, status: 503, error: "cosigner_refused" };
  let sig: unknown;
  try {
    sig = ((await res.json()) as { signature?: unknown }).signature;
  } catch {
    return { ok: false, status: 503, error: "cosigner_unavailable" };
  }
  if (typeof sig !== "string" || !isHex(sig) || size(sig) !== 65) {
    return { ok: false, status: 503, error: "cosigner_refused" };
  }
  const p = input.primary;
  const digest = mainnetReturnDigest({
    chainId: p.chainId,
    hub: p.hub,
    message: {
      personId: p.personId,
      hub: p.hub,
      seller: p.seller,
      pplAmount: BigInt(p.pplAmount),
      sourceChainId: p.sourceChainId,
      destChainId: p.destChainId,
      returnId: p.returnId,
      deadline: BigInt(p.deadline),
    },
  });
  let recovered: Address;
  try {
    recovered = getAddress(await recoverAddress({ hash: digest, signature: sig }));
  } catch {
    return { ok: false, status: 503, error: "cosigner_refused" };
  }
  if (recovered !== onchain) return { ok: false, status: 503, error: "cosigner_mismatch" };
  return { ok: true, signature: concatHex([p.signature, sig]) };
}

export function readHubChainId(raw: string | undefined): number {
  const parsed = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8453;
}
