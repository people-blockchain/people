import { getAddress, isAddress, verifyMessage } from "viem";

/**
 * SIWE-style message proving ownership of a wallet to be linked as the founder's Human
 * Passport wallet. All fields come from the server (nonce row + founder record) except the
 * address, which the client fills in with whichever wallet it just connected — so a signature
 * only verifies if it was made for this exact founder, nonce and wallet.
 */
export function buildPassportWalletLinkMessage(input: {
  domain: string;
  address: string;
  founderNumber: number;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}): string {
  return [
    `${input.domain} wants you to link this wallet for Human Passport.`,
    "",
    "This proves wallet ownership only. It does not move funds.",
    `Address: ${input.address}`,
    `Founder: #${input.founderNumber}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    `Expiration Time: ${input.expiresAt}`,
  ].join("\n");
}

export async function verifyPassportWalletSignature(params: {
  address: string;
  message: string;
  signature: string;
}): Promise<boolean> {
  if (!isAddress(params.address) || !/^0x[0-9a-fA-F]{130}$/.test(params.signature)) {
    return false;
  }
  try {
    return await verifyMessage({
      address: getAddress(params.address),
      message: params.message,
      signature: params.signature as `0x${string}`,
    });
  } catch {
    return false;
  }
}

export type PassportWalletLinkDeps = {
  consumeNonce: (
    nonce: string,
    userId: string,
  ) => Promise<{ ok: true; issuedAt: Date; expiresAt: Date } | { ok: false }>;
  /** Any founder (self included) currently holding this address as walletAddress or passportWallet. */
  findWalletOwner: (address: string) => Promise<{ userId: string } | null>;
  setPassportWallet: (userId: string, address: string) => Promise<void>;
};

export type PassportWalletLinkResult =
  | { ok: true; address: string }
  | { ok: false; error: "invalid_input" | "nonce_invalid" | "invalid_signature" | "passport_wallet_taken" };

export async function linkPassportWalletForUser(
  params: {
    userId: string;
    founderNumber: number;
    domain: string;
    nonce: string;
    address: string;
    signature: string;
  },
  deps: PassportWalletLinkDeps,
): Promise<PassportWalletLinkResult> {
  if (!isAddress(params.address) || !params.nonce.trim() || !params.signature.trim()) {
    return { ok: false, error: "invalid_input" };
  }
  const address = getAddress(params.address);

  const consumed = await deps.consumeNonce(params.nonce, params.userId);
  if (!consumed.ok) {
    return { ok: false, error: "nonce_invalid" };
  }

  const message = buildPassportWalletLinkMessage({
    domain: params.domain,
    address,
    founderNumber: params.founderNumber,
    nonce: params.nonce,
    issuedAt: consumed.issuedAt.toISOString(),
    expiresAt: consumed.expiresAt.toISOString(),
  });
  const valid = await verifyPassportWalletSignature({ address, message, signature: params.signature });
  if (!valid) {
    return { ok: false, error: "invalid_signature" };
  }

  const normalized = address.toLowerCase();
  const owner = await deps.findWalletOwner(normalized);
  if (owner && owner.userId !== params.userId) {
    return { ok: false, error: "passport_wallet_taken" };
  }

  await deps.setPassportWallet(params.userId, normalized);
  return { ok: true, address: normalized };
}
