import { getAddress, isAddress, verifyMessage, type Hex } from "viem";

/**
 * EIP-191 message the wallet signs before the server will issue a Founder NFT Mint or Rebind
 * signature. The server rebuilds this exact text from the stored nonce row, so a client cannot
 * swap the address, nonce, chain or expiry. Not localized: both sides must produce the same bytes.
 */
export function buildFounderNftWalletAuthMessage(input: {
  address: string;
  nonce: string;
  chainId: number;
  expiresAt: string;
}): string {
  return [
    "People Founder NFT",
    "",
    "Sign to authorize a Founder NFT mint or move for this wallet.",
    "This signature proves you control the wallet. It does not move funds.",
    `Address: ${getAddress(input.address)}`,
    `Nonce: ${input.nonce}`,
    `Chain ID: ${input.chainId}`,
    `Expiration Time: ${input.expiresAt}`,
  ].join("\n");
}

export type FounderNftWalletAuthRow = {
  chainId: number;
  /** Exact ISO timestamp embedded in the signed message. */
  expiresAt: string;
  used: boolean;
};

export type FounderNftWalletAuthFailure = "missing" | "invalid_signature" | "expired" | "replayed" | "wrong_chain";

export type FounderNftWalletAuthProof = {
  nonce?: string;
  signature?: string;
  chainId?: number;
};

/**
 * Checks a wallet proof and consumes the nonce only after the signature matches.
 * A bad signature does not burn the nonce. Replay, expiry and a chain id other than the one
 * stored with the nonce are rejected.
 */
export async function verifyFounderNftWalletAuth(input: {
  address: string;
  proof: FounderNftWalletAuthProof | null | undefined;
  /** Unix milliseconds. An expiry at this instant is already rejected. */
  nowMs: number;
  readNonce: (nonce: string) => Promise<FounderNftWalletAuthRow | null>;
  consumeNonce: (nonce: string) => Promise<boolean>;
}): Promise<{ ok: true } | { ok: false; reason: FounderNftWalletAuthFailure }> {
  const nonce = input.proof?.nonce?.trim() ?? "";
  const signature = input.proof?.signature?.trim() ?? "";
  if (!nonce || !signature) return { ok: false, reason: "missing" };
  if (!isAddress(input.address, { strict: false }) || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    return { ok: false, reason: "invalid_signature" };
  }
  const chainId = input.proof?.chainId;
  if (!Number.isInteger(chainId)) return { ok: false, reason: "wrong_chain" };

  const row = await input.readNonce(nonce);
  if (!row) return { ok: false, reason: "invalid_signature" };
  if (row.chainId !== chainId) return { ok: false, reason: "wrong_chain" };
  if (row.used) return { ok: false, reason: "replayed" };
  const expiresMs = Date.parse(row.expiresAt);
  if (!Number.isFinite(expiresMs) || expiresMs <= input.nowMs) return { ok: false, reason: "expired" };

  const address = getAddress(input.address);
  const message = buildFounderNftWalletAuthMessage({
    address,
    nonce,
    chainId: row.chainId,
    expiresAt: row.expiresAt,
  });
  let valid = false;
  try {
    valid = await verifyMessage({ address, message, signature: signature as Hex });
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "invalid_signature" };

  const won = await input.consumeNonce(nonce);
  if (!won) return { ok: false, reason: "replayed" };
  return { ok: true };
}
