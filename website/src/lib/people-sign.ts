import * as secp from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { transactionIdPayload } from "./transaction-id.ts";
import { walletAddressFromPublicKey } from "./wallet-address-scheme.ts";

secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);

const { bytesToHex, hexToBytes } = secp.etc;

export interface FactoryKeyPair {
  privateKey: string;
  publicKey: string;
  address: string;
}

export interface UnsignedTx {
  chainId: string;
  id: string;
  from: string;
  to: string;
  amount: number;
  fee: number;
  nonce: number;
  timestamp: number;
  type: string;
  payload?: Record<string, unknown>;
  assetId?: string;
}

export function generateFactoryKey(): FactoryKeyPair {
  const privateKey = bytesToHex(secp.utils.randomSecretKey());
  return keyFromPrivate(privateKey);
}

/** Trim, optional 0x/0X, upper or lower hex. Anything else is not a key. */
export function normalizePrivateKeyHex(privateKey: string): string {
  const hex = privateKey.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("invalid_private_key");
  return hex.toLowerCase();
}

export function keyFromPrivate(privateKeyHex: string): FactoryKeyPair {
  const secretHex = normalizePrivateKeyHex(privateKeyHex);
  const secretKey = hexToBytes(secretHex);
  const publicKey = bytesToHex(secp.getPublicKey(secretKey, true));
  return {
    privateKey: secretHex,
    publicKey,
    address: walletAddressFromPublicKey(publicKey),
  };
}

function canonicalTxPayload(tx: UnsignedTx & { signature?: string; publicKey?: string }): string {
  const rest = { ...tx };
  delete rest.signature;
  delete rest.publicKey;
  return JSON.stringify(rest);
}

export function signFactoryTx(privateKeyHex: string, tx: UnsignedTx) {
  if (!tx.chainId) throw new Error("Transaction chainId is required");
  const key = keyFromPrivate(privateKeyHex);
  tx = { ...tx, from: key.address };
  tx = { ...tx, id: bytesToHex(sha256(new TextEncoder().encode(transactionIdPayload(tx)))) };
  const message = new TextEncoder().encode(canonicalTxPayload({ ...tx, from: key.address }));
  const signature = bytesToHex(secp.sign(message, hexToBytes(key.privateKey)));
  return {
    ...tx,
    from: key.address,
    publicKey: key.publicKey,
    signature,
  };
}

export async function fetchAccount(rpcUrl: string, address: string): Promise<{ nonce: number; balance: number }> {
  const res = await fetch(`${rpcUrl}/address/${encodeURIComponent(address)}`);
  if (!res.ok) {
    throw new Error(`account ${res.status}`);
  }
  const body = (await res.json()) as { nonce?: number; balance?: number };
  return {
    nonce: Number(body.nonce ?? 0),
    balance: Number(body.balance ?? 0),
  };
}

export async function submitSignedTx(rpcUrl: string, tx: unknown): Promise<{ accepted: boolean; error?: string }> {
  const res = await fetch(`${rpcUrl}/tx`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(tx),
  });
  const body = (await res.json().catch(() => ({}))) as { accepted?: boolean; error?: string };
  if (!res.ok) {
    return { accepted: false, error: body.error ?? `http_${res.status}` };
  }
  return { accepted: Boolean(body.accepted), error: body.error };
}
