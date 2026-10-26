/**
 * secp256k1 address + signature helpers aligned with @people/sdk / @people/core:
 * compressed pubkey, canonical address = Ethereum keccak (policy 0a),
 * ECDSA over UTF-8 message bytes with SHA-256 prehash (noble default).
 * Private keys never leave the browser; the server only verifies.
 */
import * as secp from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  legacyAddressFromPublicKey,
  walletAddressFromPublicKey,
} from "@/lib/wallet-address-scheme";

secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);

const { bytesToHex, hexToBytes } = secp.etc;

export const WALLET_ADDRESS_RE = /^0x[0-9a-f]{40}$/;

export function normalizeHex(value: string): string {
  return value.trim().toLowerCase().replace(/^0x/, "");
}

export function addressFromPublicKey(publicKeyHex: string): string {
  return walletAddressFromPublicKey(normalizeHex(publicKeyHex));
}

export { legacyAddressFromPublicKey } from "@/lib/wallet-address-scheme";

export function isWalletAddress(value: string): boolean {
  return WALLET_ADDRESS_RE.test(value.trim().toLowerCase());
}

/**
 * EIP-191-style domain separator. The leading `0x19` byte keeps this off-chain proof from
 * ever being a byte string a wallet could be asked to sign as a transaction payload, so a
 * captured bind signature can never be replayed as a tx signature (or vice versa).
 */
export const WALLET_BIND_DOMAIN = "\x19PEOPLE Partner Portal: wallet bind v1\n";

export function buildWalletBindMessage(input: {
  email: string;
  nonce: string;
  issuedAt: string;
  origin: string;
}): string {
  return (
    WALLET_BIND_DOMAIN +
    [
      "PEOPLE Partner Portal",
      "Prove wallet ownership. This does not move funds.",
      `Email: ${input.email}`,
      `Nonce: ${input.nonce}`,
      `Issued: ${input.issuedAt}`,
      `Origin: ${input.origin}`,
    ].join("\n")
  );
}

export type WalletProof = {
  address: string;
  publicKey: string;
  signature: string;
  message: string;
};

export type WalletVerifyResult =
  | { ok: true; address: string; publicKey: string }
  | { ok: false; error: "invalid_input" | "address_mismatch" | "bad_signature" };

export function verifyWalletProof(proof: WalletProof): WalletVerifyResult {
  const address = proof.address.trim().toLowerCase();
  const publicKey = normalizeHex(proof.publicKey);
  const signature = normalizeHex(proof.signature);
  if (!isWalletAddress(address) || publicKey.length < 66 || signature.length < 128) {
    return { ok: false, error: "invalid_input" };
  }
  let derived: string;
  try {
    derived = walletAddressFromPublicKey(publicKey);
  } catch {
    return { ok: false, error: "invalid_input" };
  }
  if (derived !== address && legacyAddressFromPublicKey(publicKey) !== address) {
    return { ok: false, error: "address_mismatch" };
  }
  try {
    const message = new TextEncoder().encode(proof.message);
    const valid = secp.verify(hexToBytes(signature), message, hexToBytes(publicKey));
    if (!valid) {
      return { ok: false, error: "bad_signature" };
    }
  } catch {
    return { ok: false, error: "bad_signature" };
  }
  return { ok: true, address, publicKey };
}

export function signWalletMessage(privateKeyHex: string, message: string): {
  publicKey: string;
  address: string;
  signature: string;
} {
  const secretKey = hexToBytes(normalizeHex(privateKeyHex));
  const publicKey = bytesToHex(secp.getPublicKey(secretKey, true));
  const signature = bytesToHex(secp.sign(new TextEncoder().encode(message), secretKey));
  return {
    publicKey,
    address: addressFromPublicKey(publicKey),
    signature,
  };
}

/** Build the proof payload the bind API expects from a challenge message and local private key. */
export function buildWalletBindProof(privateKeyHex: string, message: string): WalletProof {
  const signed = signWalletMessage(privateKeyHex, message);
  return {
    address: signed.address,
    publicKey: signed.publicKey,
    signature: signed.signature,
    message,
  };
}

export function generateWalletKeyPair(): { privateKey: string; publicKey: string; address: string } {
  const privateKey = bytesToHex(secp.utils.randomSecretKey());
  const publicKey = bytesToHex(secp.getPublicKey(hexToBytes(privateKey), true));
  return { privateKey, publicKey, address: addressFromPublicKey(publicKey) };
}
