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

export { createLocalVerifierSigner, createKmsVerifierSigner };
