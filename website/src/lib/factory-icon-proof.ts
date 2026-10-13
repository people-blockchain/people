import { verifyWalletProof } from "@/lib/partner/wallet.ts";

/**
 * api-cron.md L1: the free icon quota is a verified-founder perk, but the wallet address came
 * straight from the request body. Anyone could spend a founder's daily free generations by
 * naming a public address. The free path now requires a signature over a fresh, domain-separated
 * message proving the caller controls the wallet's key.
 *
 * The domain separator (leading `0x19`) keeps this off-chain proof from ever being byte-equal to
 * a signable transaction payload, so a captured proof cannot be replayed as a tx signature.
 */
export const ICON_QUOTA_PROOF_DOMAIN = "\x19People: AI icon wallet ownership v1\n";

/** Proofs are accepted only within this window around `issuedAt`. */
export const ICON_QUOTA_PROOF_MAX_AGE_MS = 5 * 60 * 1000;

const NONCE_RE = /^[A-Za-z0-9_-]{8,128}$/;

export function buildIconQuotaProofMessage(input: {
  wallet: string;
  nonce: string;
  issuedAt: number;
}): string {
  return (
    ICON_QUOTA_PROOF_DOMAIN +
    [
      "Prove wallet ownership for the AI icon generator free quota.",
      "This does not move funds.",
      `Wallet: ${input.wallet.trim().toLowerCase()}`,
      `Nonce: ${input.nonce}`,
      `Issued: ${input.issuedAt}`,
    ].join("\n")
  );
}

export type IconQuotaProofInput = {
  wallet: string;
  nonce: string;
  issuedAt: number;
  publicKey: string;
  signature: string;
};

export type IconQuotaProofResult = { ok: true } | { ok: false; code: string };

export function verifyIconQuotaProof(input: IconQuotaProofInput): IconQuotaProofResult {
  if (!NONCE_RE.test(input.nonce ?? "")) {
    return { ok: false, code: "ownership_proof_invalid" };
  }
  if (
    !Number.isFinite(input.issuedAt) ||
    Math.abs(Date.now() - input.issuedAt) > ICON_QUOTA_PROOF_MAX_AGE_MS
  ) {
    return { ok: false, code: "ownership_proof_expired" };
  }
  const message = buildIconQuotaProofMessage({
    wallet: input.wallet,
    nonce: input.nonce,
    issuedAt: input.issuedAt,
  });
  const verified = verifyWalletProof({
    address: input.wallet,
    publicKey: input.publicKey,
    signature: input.signature,
    message,
  });
  if (!verified.ok) {
    return { ok: false, code: "ownership_proof_invalid" };
  }
  return { ok: true };
}
