import { resolveFaucetIdentity } from "./faucet-identity.js";
import {
  addressFromPublicKey,
  isCanonicalAddressMatch,
  legacyAddressFromPublicKey
} from "./address-policy.js";
import * as secp from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type { Transaction, Block } from "@ovn/protocol";
import { transactionIdPayload } from "@ovn/protocol";

export {
  addressFromPublicKey,
  evmAddressFromPublicKey,
  legacyAddressFromPublicKey
} from "./address-policy.js";

secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);

const { bytesToHex, hexToBytes } = secp.etc;

export interface KeyPair {
  privateKey: string;
  publicKey: string;
  address: string;
}

const faucetIdentity = resolveFaucetIdentity(process.env, key => keyPairFromPrivateKey(key).address);
export const DEV_FAUCET_PRIVATE_KEY = faucetIdentity.privateKey;
export const FAUCET_KEYPAIR = DEV_FAUCET_PRIVATE_KEY ? keyPairFromPrivateKey(DEV_FAUCET_PRIVATE_KEY) : undefined;
export const FAUCET_ADDRESS = faucetIdentity.address;

export function generateKeyPair(): KeyPair {
  const privateKey = bytesToHex(secp.utils.randomSecretKey());
  const publicKey = bytesToHex(secp.getPublicKey(hexToBytes(privateKey), true));
  return {
    privateKey,
    publicKey,
    address: addressFromPublicKey(publicKey)
  };
}

export function keyPairFromPrivateKey(privateKeyHex: string): KeyPair {
  const publicKey = bytesToHex(secp.getPublicKey(hexToBytes(privateKeyHex), true));
  return {
    privateKey: privateKeyHex,
    publicKey,
    address: addressFromPublicKey(publicKey)
  };
}

export function canonicalTxPayload(tx: Transaction): string {
  const { signature: _s, publicKey: _p, ...rest } = tx;
  return JSON.stringify(rest);
}

export function contentTransactionId(tx: object): string {
  return bytesToHex(sha256(new TextEncoder().encode(transactionIdPayload(tx))));
}

export function signTransaction(privateKeyHex: string, tx: Transaction, contentId = false): Transaction {
  const secretKey = hexToBytes(privateKeyHex);
  const publicKey = bytesToHex(secp.getPublicKey(secretKey, true));
  tx = { ...tx, from: addressFromPublicKey(publicKey), chainId: tx.chainId ?? process.env.CHAIN_ID ?? "ovn-devnet" };
  if (contentId) tx = { ...tx, id: contentTransactionId(tx) };
  const message = new TextEncoder().encode(canonicalTxPayload(tx));
  const signature = bytesToHex(secp.sign(message, secretKey));
  return {
    ...tx,
    from: addressFromPublicKey(publicKey),
    publicKey,
    signature
  };
}

export function verifyTransaction(tx: Transaction): boolean {
  try {
  if (!tx.publicKey || !tx.signature) {
    return false;
  }
  if (!isCanonicalAddressMatch(tx.from, tx.publicKey)) {
    return false;
  }
  const message = new TextEncoder().encode(canonicalTxPayload(tx));
  return secp.verify(hexToBytes(tx.signature), message, hexToBytes(tx.publicKey));
  } catch { return false; }
}

/** Sign both the block hash and its network/version domain. */
function blockMessage(block: Block): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({domain:"people-block-v2",chainId:block.header.chainId,hash:block.hash}));
}
export function signBlock(block: Block, privateKey: string): Block {
  const key = keyPairFromPrivateKey(privateKey);
  return {...block,publicKey:key.publicKey,signature:bytesToHex(secp.sign(blockMessage(block),hexToBytes(privateKey)))};
}
export function verifyBlockSignature(block: Block, expectedAddress: string): boolean {
  try {
    const derivedLegacy = legacyAddressFromPublicKey(block.publicKey!);
    const derivedCanonical = addressFromPublicKey(block.publicKey!);
    const addressOk =
      expectedAddress === derivedLegacy || expectedAddress === derivedCanonical;
    return Boolean(
      expectedAddress &&
        block.publicKey &&
        block.signature &&
        addressOk &&
        secp.verify(hexToBytes(block.signature), blockMessage(block), hexToBytes(block.publicKey))
    );
  } catch { return false; }
}
