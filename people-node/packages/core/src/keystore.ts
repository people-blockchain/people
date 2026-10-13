import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGO = "aes-256-gcm";

/**
 * scrypt parameters written into the payload. These are exactly node's `crypto.scryptSync`
 * defaults, so payloads produced before we recorded them still decrypt unchanged.
 */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const GCM_TAG_BYTES = 16;
const SALT_BYTES = 16;
const IV_BYTES = 12;

interface KeystorePayload {
  salt: string;
  iv: string;
  tag: string;
  data: string;
  /** scrypt cost params; absent on payloads written before they were recorded. */
  n?: number;
  r?: number;
  p?: number;
}

function readHex(value: unknown, label: string, expectedBytes?: number): Buffer {
  if (typeof value !== "string" || value.length === 0 || value.length % 2 !== 0) {
    throw new Error(`keystore: invalid ${label}`);
  }
  const buf = Buffer.from(value, "hex");
  if (buf.length !== value.length / 2) {
    throw new Error(`keystore: invalid ${label}`);
  }
  if (expectedBytes !== undefined && buf.length !== expectedBytes) {
    throw new Error(`keystore: invalid ${label} length`);
  }
  return buf;
}

export function encryptPrivateKey(privateKeyHex: string, password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = scryptSync(password, salt, 32, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(privateKeyHex, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted.toString("hex"),
    n: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  } satisfies KeystorePayload);
}

export function decryptPrivateKey(payload: string, password: string): string {
  const parsed = JSON.parse(payload) as Partial<KeystorePayload>;
  const salt = readHex(parsed.salt, "salt", SALT_BYTES);
  const iv = readHex(parsed.iv, "iv", IV_BYTES);
  // Enforce a full-length GCM tag: a short/forged tag must fail closed, not be handed to
  // setAuthTag, which would otherwise accept a truncated tag.
  const tag = readHex(parsed.tag, "tag", GCM_TAG_BYTES);
  const data = readHex(parsed.data, "data");
  const n = typeof parsed.n === "number" ? parsed.n : SCRYPT_N;
  const r = typeof parsed.r === "number" ? parsed.r : SCRYPT_R;
  const p = typeof parsed.p === "number" ? parsed.p : SCRYPT_P;
  // The KDF runs before the GCM tag is checked, so a tampered payload could name absurd
  // cost params and exhaust memory. Bound them, and require N to be a power of two.
  const validN = Number.isInteger(n) && n >= 2 && n <= 1 << 20 && (n & (n - 1)) === 0;
  if (!validN || !Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 16) {
    throw new Error("keystore: invalid scrypt parameters");
  }
  const key = scryptSync(password, salt, 32, { N: n, r, p, maxmem: 256 * n * r * 2 });
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}
