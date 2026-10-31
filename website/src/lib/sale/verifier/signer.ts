import type { Address, Hex } from "viem";
import { createLocalVerifierSigner } from "./local.ts";
import { createAwsKmsClient, createKmsVerifierSigner } from "./kms-aws.ts";

export type VerifierSigner = {
  getAddress(): Promise<Address>;
  signDigest(digest: Hex): Promise<Hex>;
};

export type VerifierMode = "kms" | "local";

export function readVerifierMode(): VerifierMode {
  const raw = (process.env.SALE_VERIFIER_MODE ?? "").trim().toLowerCase();
  if (raw === "kms" || raw === "local") return raw;
  throw new Error('SALE_VERIFIER_MODE must be "kms" or "local"');
}

/**
 * Resolves the attesting signer for the sale hub. `kms` is the production path; `local` is
 * Base Sepolia only and refuses every other chain (see local.ts).
 */
export async function getVerifierSigner(chainId: number): Promise<VerifierSigner> {
  const mode = readVerifierMode();
  if (mode === "local") return createLocalVerifierSigner(chainId);
  return createKmsVerifierSigner({ client: createAwsKmsClient() });
}

export type SaleVerifyVersion = "v1" | "v2";

function readNamedMode(raw: string | undefined, envName: string): VerifierMode {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "kms" || value === "local") return value;
  throw new Error(`${envName} must be "kms" or "local"`);
}

/**
 * v1 uses `SALE_VERIFIER_*` only. v2 uses `SALE_V2_VERIFIER_*` only.
 * A missing v2 key does not fall through to the v1 key.
 */
export async function getVerifierSignerForVersion(
  version: SaleVerifyVersion,
  chainId: number,
): Promise<VerifierSigner> {
  if (version === "v1") return getVerifierSigner(chainId);
  const mode = readNamedMode(process.env.SALE_V2_VERIFIER_MODE, "SALE_V2_VERIFIER_MODE");
  if (mode === "local") {
    const key = process.env.SALE_V2_VERIFIER_LOCAL_KEY?.trim();
    if (!key) throw new Error("SALE_V2_VERIFIER_LOCAL_KEY is not set");
    return createLocalVerifierSigner(chainId, key);
  }
  const keyId = process.env.SALE_V2_VERIFIER_KMS_KEY_ID?.trim();
  if (!keyId) throw new Error("SALE_V2_VERIFIER_KMS_KEY_ID is not set");
  return createKmsVerifierSigner({ client: createAwsKmsClient(), keyId });
}

export { createLocalVerifierSigner, createKmsVerifierSigner };
