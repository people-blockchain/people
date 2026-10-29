import {
  GetPublicKeyCommand,
  KMSClient,
  SignCommand,
  type KMSClientConfig,
} from "@aws-sdk/client-kms";
import {
  bytesToBigInt,
  bytesToHex,
  concat,
  getAddress as checksumAddress,
  hexToBytes,
  isAddressEqual,
  numberToHex,
  recoverAddress,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { publicKeyToAddress } from "viem/accounts";
import type { VerifierSigner } from "./signer.ts";

/** secp256k1 group order. */
export const SECP256K1_N = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
export const SECP256K1_HALF_N = SECP256K1_N / BigInt(2);

/** Minimal injectable KMS surface used by the adapter (fake clients in tests implement this). */
export type KmsClientLike = {
  send(command: GetPublicKeyCommand | SignCommand): Promise<{
    PublicKey?: Uint8Array | string;
    Signature?: Uint8Array | string;
  }>;
};

export type KmsVerifierSignerOptions = {
  client: KmsClientLike;
  /** Defaults to SALE_VERIFIER_KMS_KEY_ID. */
  keyId?: string;
};

function asBytes(value: Uint8Array | string | undefined, label: string): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return hexToBytes(value.startsWith("0x") ? (value as Hex) : (`0x${value}` as Hex));
  throw new Error(`KMS ${label} response is empty or malformed`);
}

/** DER length prefix parser. Returns the length and the offset of the first content byte. */
function readDerLength(bytes: Uint8Array, offset: number): { length: number; next: number } {
  if (offset >= bytes.length) throw new Error("malformed DER signature: missing length");
  const first = bytes[offset];
  if (first < 0x80) return { length: first, next: offset + 1 };
  const count = first & 0x7f;
  if (count === 0 || count > 4) throw new Error("malformed DER signature: unsupported length");
  if (offset + 1 + count > bytes.length) throw new Error("malformed DER signature: truncated length");
  let length = 0;
  for (let i = 0; i < count; i += 1) {
    length = (length << 8) | bytes[offset + 1 + i];
  }
  return { length, next: offset + 1 + count };
}

/**
 * Parses an ASN.1 DER `SEQUENCE { INTEGER r, INTEGER s }` ECDSA signature. AWS KMS returns
 * DER even for MessageType=DIGEST; the contract needs the raw 64-byte r||s form instead.
 */
export function parseDerSignature(input: Uint8Array | Hex): { r: bigint; s: bigint } {
  const bytes = typeof input === "string" ? hexToBytes(input) : input;
  let offset = 0;
  if (bytes[offset++] !== 0x30) throw new Error("malformed DER signature: expected SEQUENCE");
  const sequence = readDerLength(bytes, offset);
  offset = sequence.next;
  if (offset + sequence.length !== bytes.length) {
    throw new Error("malformed DER signature: length mismatch");
  }

  if (bytes[offset++] !== 0x02) throw new Error("malformed DER signature: expected INTEGER r");
  const rLength = readDerLength(bytes, offset);
  offset = rLength.next;
  const rBytes = bytes.slice(offset, offset + rLength.length);
  offset += rLength.length;

  if (bytes[offset++] !== 0x02) throw new Error("malformed DER signature: expected INTEGER s");
  const sLength = readDerLength(bytes, offset);
  offset = sLength.next;
  const sBytes = bytes.slice(offset, offset + sLength.length);
  offset += sLength.length;

  if (offset !== bytes.length || rBytes.length === 0 || sBytes.length === 0) {
    throw new Error("malformed DER signature: trailing or empty integer");
  }

  return { r: bytesToBigInt(rBytes), s: bytesToBigInt(sBytes) };
}

/** EIP-2 low-s: values above n/2 are replaced by n - s. */
export function normalizeS(s: bigint): bigint {
  if (s < BigInt(0) || s >= SECP256K1_N) throw new Error("invalid ECDSA s value");
  return s > SECP256K1_HALF_N ? SECP256K1_N - s : s;
}

/**
 * Parses an SPKI DER SubjectPublicKeyInfo for secp256k1. The last 65 bytes are the
 * uncompressed public key (0x04 || X || Y); viem derives the Ethereum address from it.
 */
export function spkiToAddress(spki: Uint8Array): Address {
  const bytes = spki instanceof Uint8Array ? spki : asBytes(spki, "public key");
  if (bytes.length < 65 || bytes[bytes.length - 65] !== 0x04) {
    throw new Error("malformed SPKI public key: expected uncompressed secp256k1 point");
  }
  const publicKey = bytesToHex(bytes.slice(bytes.length - 65));
  return publicKeyToAddress(publicKey);
}

function signatureWithV(r: bigint, s: bigint, v: 27 | 28): Hex {
  return concat([toHex(r, { size: 32 }), toHex(s, { size: 32 }), numberToHex(v, { size: 1 })]);
}

/** Tries recovery ids 27/28 against the KMS address; only the real signer recovers. */
export async function recoverKmsV(input: {
  digest: Hex;
  r: bigint;
  s: bigint;
  expected: Address;
}): Promise<27 | 28> {
  for (const v of [27, 28] as const) {
    try {
      const recovered = await recoverAddress({
        hash: input.digest,
        signature: signatureWithV(input.r, input.s, v),
      });
      if (isAddressEqual(recovered, input.expected)) return v;
    } catch {
      /* wrong recovery id: try the other one */
    }
  }
  throw new Error("KMS signature does not recover to the configured public key");
}

/** AWS KMS-backed signer. The client is injectable so tests never touch AWS. */
export function createKmsVerifierSigner(options: KmsVerifierSignerOptions): VerifierSigner {
  const keyId = (options.keyId ?? process.env.SALE_VERIFIER_KMS_KEY_ID)?.trim();
  if (!keyId) throw new Error("SALE_VERIFIER_KMS_KEY_ID is not set");

  let cachedAddress: Address | null = null;

  const getAddress = async (): Promise<Address> => {
    if (cachedAddress) return cachedAddress;
    const result = await options.client.send(new GetPublicKeyCommand({ KeyId: keyId }));
    cachedAddress = spkiToAddress(asBytes(result.PublicKey, "public key"));
    return cachedAddress;
  };

  return {
    getAddress,
    signDigest: async (digest: Hex): Promise<Hex> => {
      const expected = await getAddress();
      const result = await options.client.send(
        new SignCommand({
          KeyId: keyId,
          Message: hexToBytes(digest),
          MessageType: "DIGEST",
          SigningAlgorithm: "ECDSA_SHA_256",
        }),
      );
      const parsed = parseDerSignature(asBytes(result.Signature, "signature"));
      const r = parsed.r;
      const s = normalizeS(parsed.s);
      const v = await recoverKmsV({ digest, r, s, expected });
      return signatureWithV(r, s, v);
    },
  };
}

/** Builds the production AWS KMS client from SALE_VERIFIER_KMS_KEY_ID + AWS_REGION. */
export function createAwsKmsClient(config: KMSClientConfig = {}): KMSClient {
  const region = config.region ?? process.env.AWS_REGION?.trim() ?? "us-east-1";
  return new KMSClient({ ...config, region });
}

export function getKmsVerifierSigner(chainId?: number): VerifierSigner {
  void chainId;
  return createKmsVerifierSigner({ client: createAwsKmsClient() });
}

/** Exported for diagnostics: checksum address without leaking key material. */
export function normalizeKmsAddress(address: Address): Address {
  return checksumAddress(address);
}
