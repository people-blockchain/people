/**
 * Shared rules for a direct browser upload (client and server).
 * Raster and video files use this 25 MB cap. SVG and the legacy proxy routes stay separate.
 */

export const DIRECT_UPLOAD_MAX_BYTES = 25_000_000;
export const DIRECT_UPLOAD_URL_TTL_SEC = 120;
export const DIRECT_UPLOAD_NONCE_TTL_MS = 5 * 60 * 1000;

export const DIRECT_UPLOAD_KINDS = ["nft-image", "token-icon", "nft-video"] as const;
export type DirectUploadKind = (typeof DIRECT_UPLOAD_KINDS)[number];

const MIME: Record<DirectUploadKind, readonly string[]> = {
  "nft-image": ["image/png", "image/jpeg", "image/webp", "image/gif"],
  "token-icon": ["image/png", "image/jpeg", "image/webp"],
  "nft-video": ["video/mp4", "video/webm"],
};

export const PINATA_FILE_ID = /^[A-Za-z0-9-]{8,80}$/;
export const SHA256_HEX = /^[0-9a-f]{64}$/;

export function isDirectUploadKind(value: unknown): value is DirectUploadKind {
  return value === "nft-image" || value === "token-icon" || value === "nft-video";
}

/** Strips parameters and treats `image/jpg` as JPEG. */
export function normalizeUploadMime(type: string): string {
  const base = type.split(";")[0]?.trim().toLowerCase() ?? "";
  return base === "image/jpg" ? "image/jpeg" : base;
}

export function mimeAllowedForKind(kind: DirectUploadKind, type: string): boolean {
  return MIME[kind].includes(normalizeUploadMime(type));
}

export function extensionForMime(type: string): string | null {
  switch (normalizeUploadMime(type)) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    default:
      return null;
  }
}

export function isUploadDomain(value: string): boolean {
  return value.length > 0 && value.length <= 255 && !/[\s/]/.test(value) && !value.includes("://");
}

/**
 * Pinata's file `size` is the UnixFS DAG size, which is larger than the file for multi-block
 * objects. The signed declaration is the file length. `recordSize` is only a sanity ceiling.
 */
export function declaredUploadSizeError(size: unknown): "invalid_request" | "file_too_large" | null {
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) return "invalid_request";
  if (size > DIRECT_UPLOAD_MAX_BYTES) return "file_too_large";
  return null;
}

export function downloadedBytesMatchDeclaration(
  declared: number,
  recordSize: number,
  downloaded: number,
  overflow: boolean,
): boolean {
  if (!Number.isInteger(recordSize) || recordSize < declared) return false;
  if (overflow || downloaded !== declared) return false;
  return true;
}

export type DirectUploadFields = {
  kind: DirectUploadKind;
  type: string;
  size: number;
  sha256: string;
};

export type DirectUploadFieldError = "unsupported_format" | "file_too_large" | "invalid_request";

/** Cheap checks shared by the sign route. Does not touch the network. */
export function validateDirectUploadFields(input: {
  kind: unknown;
  type: unknown;
  size: unknown;
  sha256: unknown;
}): { ok: true; fields: DirectUploadFields } | { ok: false; error: DirectUploadFieldError } {
  if (!isDirectUploadKind(input.kind)) return { ok: false, error: "unsupported_format" };
  if (typeof input.type !== "string") return { ok: false, error: "unsupported_format" };
  const type = normalizeUploadMime(input.type);
  if (!mimeAllowedForKind(input.kind, type)) return { ok: false, error: "unsupported_format" };
  if (typeof input.size !== "number" || !Number.isSafeInteger(input.size) || input.size <= 0) {
    return { ok: false, error: "invalid_request" };
  }
  if (input.size > DIRECT_UPLOAD_MAX_BYTES) return { ok: false, error: "file_too_large" };
  if (typeof input.sha256 !== "string" || !SHA256_HEX.test(input.sha256.trim().toLowerCase())) {
    return { ok: false, error: "invalid_request" };
  }
  return {
    ok: true,
    fields: { kind: input.kind, type, size: input.size, sha256: input.sha256.trim().toLowerCase() },
  };
}

export type DirectUploadMessageParts = {
  domain: string;
  address: string;
  nonce: string;
  kind: string;
  type: string;
  size: number;
  sha256: string;
  expiry: string;
};

/** Exact personal_sign payload. Client and server must both call this. */
export function directUploadSignMessage(parts: DirectUploadMessageParts): string {
  return [
    "PEOPLE Blockchain file upload",
    "",
    `Domain: ${parts.domain}`,
    `Address: ${parts.address}`,
    `Nonce: ${parts.nonce}`,
    `Kind: ${parts.kind}`,
    `Type: ${parts.type}`,
    `Size: ${parts.size}`,
    `SHA-256: ${parts.sha256}`,
    `Expiry: ${parts.expiry}`,
  ].join("\n");
}

export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", view.buffer as ArrayBuffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
