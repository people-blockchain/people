/**
 * Client-stamped Turnkey import activities. The parent org API key must never stamp these:
 * import must be signed by the sub-org root (the browser P-256 key).
 */

export const INIT_IMPORT_PRIVATE_KEY_TYPE = "ACTIVITY_TYPE_INIT_IMPORT_PRIVATE_KEY";
export const IMPORT_PRIVATE_KEY_TYPE = "ACTIVITY_TYPE_IMPORT_PRIVATE_KEY";
export const TURNKEY_API_P256_SCHEME = "SIGNATURE_SCHEME_TK_API_P256";

export const INIT_IMPORT_PATH = "/public/v1/submit/init_import_private_key";
export const IMPORT_PRIVATE_KEY_PATH = "/public/v1/submit/import_private_key";

const MAX_STAMPED_BODY_BYTES = 32 * 1024;
const MAX_STAMP_CHARS = 8 * 1024;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export type ClientStampedActivity = {
  stampedBody: string;
  stamp: string;
};

export type InitImportActivity = {
  type: typeof INIT_IMPORT_PRIVATE_KEY_TYPE;
  timestampMs: string;
  organizationId: string;
  parameters: { userId: string };
};

export type ImportPrivateKeyActivity = {
  type: typeof IMPORT_PRIVATE_KEY_TYPE;
  timestampMs: string;
  organizationId: string;
  parameters: {
    userId: string;
    privateKeyName: string;
    encryptedBundle: string;
    curve: "CURVE_SECP256K1";
    addressFormats: ["ADDRESS_FORMAT_ETHEREUM"];
  };
};

export function buildInitImportActivity(input: {
  organizationId: string;
  userId: string;
  timestampMs?: string;
}): InitImportActivity {
  return {
    type: INIT_IMPORT_PRIVATE_KEY_TYPE,
    timestampMs: input.timestampMs ?? String(Date.now()),
    organizationId: input.organizationId,
    parameters: { userId: input.userId },
  };
}

export function buildImportPrivateKeyActivity(input: {
  organizationId: string;
  userId: string;
  encryptedBundle: string;
  privateKeyName?: string;
  timestampMs?: string;
}): ImportPrivateKeyActivity {
  return {
    type: IMPORT_PRIVATE_KEY_TYPE,
    timestampMs: input.timestampMs ?? String(Date.now()),
    organizationId: input.organizationId,
    parameters: {
      userId: input.userId,
      privateKeyName: input.privateKeyName ?? "PEOPLE Wallet",
      encryptedBundle: input.encryptedBundle,
      curve: "CURVE_SECP256K1",
      addressFormats: ["ADDRESS_FORMAT_ETHEREUM"],
    },
  };
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.replace(/^0x/i, "");
  if (normalized.length % 2 !== 0) throw new Error("invalid_stamp");
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Minimal unsigned integer encoding for DER: drop leading zeros, then add one back if the high bit
 * is set so the value is not read as negative.
 */
function toUnsignedDerInteger(bytes: Uint8Array): Uint8Array {
  let start = 0;
  while (start < bytes.length && bytes[start] === 0) start += 1;
  if (start === bytes.length) start = bytes.length - 1;
  const extraZero = (bytes[start]! & 0x80) === 0x80 ? 1 : 0;
  const out = new Uint8Array(bytes.length - start + extraZero);
  out.set(bytes.subarray(start), extraZero);
  return out;
}

/**
 * Turnkey X-Stamp signatures are DER-encoded ECDSA. `@turnkey/core` `signWithApiKey` returns
 * IEEE P1363 (`r||s`, 64 bytes for P-256). Encode that as DER so the relayed activity verifies.
 */
export function ieeeP1363SignatureToDer(ieeeHex: string): string {
  const ieee = hexToBytes(ieeeHex);
  if (ieee.length % 2 !== 0 || ieee.length === 0 || ieee.length > 132) {
    throw new Error("invalid_stamp");
  }
  const r = toUnsignedDerInteger(ieee.subarray(0, ieee.length / 2));
  const s = toUnsignedDerInteger(ieee.subarray(ieee.length / 2));
  const contentLength = 1 + 1 + r.length + 1 + 1 + s.length;
  let der: Uint8Array;
  let offset = 0;
  if (contentLength >= 128) {
    der = new Uint8Array(contentLength + 3);
    der[offset++] = 0x30;
    der[offset++] = 0x81;
    der[offset++] = contentLength;
  } else {
    der = new Uint8Array(contentLength + 2);
    der[offset++] = 0x30;
    der[offset++] = contentLength;
  }
  der[offset++] = 0x02;
  der[offset++] = r.length;
  der.set(r, offset);
  offset += r.length;
  der[offset++] = 0x02;
  der[offset++] = s.length;
  der.set(s, offset);
  return bytesToHex(der);
}

/** Accept kit Raw (64-byte IEEE) or an already-DER hex signature. */
export function normalizeTurnkeyP256Signature(signature: string): string {
  const hex = signature.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length < 64 || hex.length > 800 || hex.length % 2 !== 0) {
    throw new Error("invalid_stamp");
  }
  const bytes = hexToBytes(hex);
  if (bytes.length === 64) return ieeeP1363SignatureToDer(hex);
  if (bytes[0] === 0x30) return hex.toLowerCase();
  throw new Error("invalid_stamp");
}

function utf8ToBase64Url(value: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(value, "utf8").toString("base64url");
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToUtf8(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  if (typeof Buffer !== "undefined") return Buffer.from(padded, "base64").toString("utf8");
  return atob(padded);
}

export function encodeTurnkeyApiStamp(input: { publicKey: string; signature: string }): string {
  const publicKey = input.publicKey.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64,264}$/.test(publicKey)) throw new Error("invalid_client_key");
  const signature = normalizeTurnkeyP256Signature(input.signature);
  return utf8ToBase64Url(
    JSON.stringify({
      publicKey,
      signature,
      scheme: TURNKEY_API_P256_SCHEME,
    }),
  );
}

export function parseTurnkeyApiStamp(stamp: string): { publicKey: string; signature: string; scheme: string } {
  if (typeof stamp !== "string" || stamp.length < 16 || stamp.length > MAX_STAMP_CHARS) {
    throw new Error("invalid_stamp");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(stamp)) throw new Error("invalid_stamp");
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlToUtf8(stamp));
  } catch {
    throw new Error("invalid_stamp");
  }
  const rec = asRecord(parsed);
  const publicKey = asString(rec?.publicKey);
  const signature = asString(rec?.signature);
  const scheme = asString(rec?.scheme);
  if (!publicKey || !signature || scheme !== TURNKEY_API_P256_SCHEME) throw new Error("invalid_stamp");
  if (!/^[0-9a-fA-F]{64,264}$/.test(publicKey)) throw new Error("invalid_stamp");
  return { publicKey, signature, scheme };
}

export function parseClientStampedActivity(input: unknown): ClientStampedActivity {
  const rec = asRecord(input);
  const stampedBody = asString(rec?.stampedBody);
  const stamp = asString(rec?.stamp);
  if (!stampedBody || !stamp) throw new Error("client_stamp_required");
  if (stampedBody.length > MAX_STAMPED_BODY_BYTES) throw new Error("invalid_stamp");
  parseTurnkeyApiStamp(stamp);
  return { stampedBody, stamp };
}

function parseActivityJson(stampedBody: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stampedBody);
  } catch {
    throw new Error("invalid_stamp");
  }
  const rec = asRecord(parsed);
  if (!rec) throw new Error("invalid_stamp");
  return rec;
}

export function assertStampedImportActivity(
  stampedBody: string,
  expected: { type: string; organizationId: string; userId: string },
): Record<string, unknown> {
  const rec = parseActivityJson(stampedBody);
  const type = asString(rec.type);
  const organizationId = asString(rec.organizationId);
  const parameters = asRecord(rec.parameters);
  const userId = asString(parameters?.userId);
  if (type !== expected.type) throw new Error("invalid_stamp");
  if (!organizationId || organizationId !== expected.organizationId) throw new Error("turnkey_org_mismatch");
  if (!userId || userId !== expected.userId) throw new Error("turnkey_user_mismatch");
  if (type === IMPORT_PRIVATE_KEY_TYPE) {
    const bundle = asString(parameters?.encryptedBundle);
    if (!bundle) throw new Error("invalid_stamp");
    const curve = asString(parameters?.curve);
    if (curve && curve !== "CURVE_SECP256K1") throw new Error("invalid_stamp");
  }
  return rec;
}
