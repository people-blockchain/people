import * as secp from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";

/** Must match `EIP155_CHAIN_ID` in people-node when JSON-RPC is live. */
export const PEOPLE_EIP155_CHAIN_ID = 97401;

export type WalletAddressScheme = "legacy" | "evm";

const { bytesToHex, hexToBytes } = secp.etc;

export function legacyAddressFromPublicKey(publicKeyHex: string): string {
  const bytes = hexToBytes(publicKeyHex.replace(/^0x/i, ""));
  return `0x${bytesToHex(sha256(bytes)).slice(0, 40)}`;
}

export function evmAddressFromPublicKey(publicKeyHex: string): string {
  const hex = publicKeyHex.replace(/^0x/i, "");
  const uncompressed = secp.Point.fromHex(hex).toBytes(false);
  const hash = keccak_256(uncompressed.slice(1));
  return `0x${bytesToHex(hash.slice(-20))}`;
}

export type WalletAddressSchemeConfig = "legacy" | "evm" | "auto";

/** Off by default — prod keeps sha256 addresses until operators enable EVM canonical. */
export function readWalletAddressSchemeConfig(): WalletAddressSchemeConfig {
  const raw = process.env.NEXT_PUBLIC_EVM_CANONICAL_ADDRESSES?.trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "evm") return "evm";
  if (raw === "auto") return "auto";
  return "legacy";
}

let resolvedAutoScheme: WalletAddressScheme | null = null;

export function getWalletAddressScheme(): WalletAddressScheme {
  const config = readWalletAddressSchemeConfig();
  if (config === "legacy") return "legacy";
  if (config === "evm") return "evm";
  return resolvedAutoScheme ?? "legacy";
}

export function setResolvedWalletAddressScheme(scheme: WalletAddressScheme): void {
  resolvedAutoScheme = scheme;
}

export function walletAddressFromPublicKey(
  publicKeyHex: string,
  scheme: WalletAddressScheme = getWalletAddressScheme()
): string {
  return scheme === "evm" ? evmAddressFromPublicKey(publicKeyHex) : legacyAddressFromPublicKey(publicKeyHex);
}

export async function probeWalletAddressScheme(
  rpcProxyUrl = "/api/network/rpc"
): Promise<WalletAddressScheme> {
  try {
    const res = await fetch(rpcProxyUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      cache: "no-store",
    });
    if (!res.ok) return "legacy";
    const body = (await res.json()) as { result?: string };
    const hex = body.result?.toLowerCase();
    const expected = `0x${PEOPLE_EIP155_CHAIN_ID.toString(16)}`;
    return hex === expected ? "evm" : "legacy";
  } catch {
    return "legacy";
  }
}

/**
 * Whether `address` belongs to this public key under either address scheme. The scheme is
 * resolved at runtime (legacy sha256 vs EVM keccak), so a keystore or vault written under one
 * scheme must still open after the site switched to the other; comparing against the current
 * scheme only reported a correct password as "wrong" and broke cloud sign-in (address_mismatch).
 */
export function addressMatchesPublicKey(address: string, publicKeyHex: string): boolean {
  const a = address.toLowerCase();
  return (
    legacyAddressFromPublicKey(publicKeyHex).toLowerCase() === a ||
    evmAddressFromPublicKey(publicKeyHex).toLowerCase() === a
  );
}
