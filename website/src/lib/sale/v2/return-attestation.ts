import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  MAINNET_RETURN_TYPES,
  PEOPLE_MAINNET_CHAIN_ID,
  decodeReturnBurned,
  type ReturnLog,
} from "./return-burn";

const ATTESTATION_TTL_SECONDS = 15 * 60;

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
    seller: Address;
    pplAmount: bigint;
    sourceChainId: number;
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
      seller: input.message.seller,
      pplAmount: input.message.pplAmount,
      sourceChainId: BigInt(input.message.sourceChainId),
      returnId: input.message.returnId,
      deadline: input.message.deadline,
    },
  });
}

export type AttestationFailure = { ok: false; status: 400 | 422 | 503; error: string };
export type AttestationSuccess = {
  ok: true;
  status: 200;
  body: {
    personId: Hex;
    seller: Address;
    pplAmount: string;
    sourceChainId: number;
    returnId: Hex;
    deadline: number;
    signature: Hex;
    hub: Address;
    chainId: number;
  };
};

function validBytes32(raw: string | undefined): Hex | undefined {
  if (!raw) return undefined;
  return isHex(raw) && raw.length === 66 ? raw : undefined;
}

/**
 * Confirms a PEOPLE-mainnet `ReturnBurned` receipt and signs `MainnetReturn`
 * for that exact burn. A missing key is a 503 and never falls through to a signature.
 */
export async function createReturnAttestation(input: {
  txHash: string;
  returnId?: string;
  key: string | null;
  burnAddress: string | undefined;
  hubAddress: string | undefined;
  hubChainId: number;
  nowSec: number;
  getReceipt: (txHash: Hex) => Promise<{ status: string; logs: readonly ReturnLog[] }>;
  returnVerifier: () => Promise<Address>;
}): Promise<AttestationSuccess | AttestationFailure> {
  if (!input.key) return { ok: false, status: 503, error: "signer_unavailable" };
  const key = readReturnVerifierKey(input.key);
  if (!key) return { ok: false, status: 503, error: "signer_unavailable" };
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
  let receipt: { status: string; logs: readonly ReturnLog[] };
  try {
    receipt = await input.getReceipt(input.txHash);
  } catch {
    return { ok: false, status: 503, error: "onchain_unavailable" };
  }
  if (receipt.status !== "success") return { ok: false, status: 422, error: "return_not_found" };

  const burned = decodeReturnBurned(receipt.logs, { burn, hub, returnId: requestedId });
  if (!burned) return { ok: false, status: 422, error: "return_not_found" };

  let verifier: Address;
  try {
    verifier = getAddress(await input.returnVerifier());
  } catch {
    return { ok: false, status: 503, error: "onchain_unavailable" };
  }
  const signer = privateKeyToAccount(key).address;
  if (getAddress(signer) !== verifier) return { ok: false, status: 503, error: "verifier_mismatch" };

  const deadline = BigInt(input.nowSec + ATTESTATION_TTL_SECONDS);
  const signature = await signMainnetReturn({
    privateKey: key,
    chainId: input.hubChainId,
    hub,
    message: {
      personId: burned.personId,
      seller: burned.seller,
      pplAmount: burned.amount,
      sourceChainId: PEOPLE_MAINNET_CHAIN_ID,
      returnId: burned.returnId,
      deadline,
    },
  });
  return {
    ok: true,
    status: 200,
    body: {
      personId: burned.personId,
      seller: burned.seller,
      pplAmount: burned.amount.toString(),
      sourceChainId: PEOPLE_MAINNET_CHAIN_ID,
      returnId: burned.returnId,
      deadline: Number(deadline),
      signature,
      hub,
      chainId: input.hubChainId,
    },
  };
}

export function readHubChainId(raw: string | undefined): number {
  const parsed = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8453;
}
