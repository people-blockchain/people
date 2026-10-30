/**
 * Browser half of a direct upload: size check, checksum, wallet signature, original bytes, verify.
 * Localized text lives in `media-upload-copy`. This path does not call the legacy media routes.
 */

import { getAddress } from "viem";
import { mediaUploadMessage, type MediaUploadMessageCode } from "./media-upload-copy.ts";
import {
  DIRECT_UPLOAD_MAX_BYTES,
  directUploadSignMessage,
  type DirectUploadKind,
  mimeAllowedForKind,
  normalizeUploadMime,
  PINATA_FILE_ID,
  sha256Hex,
  validateDirectUploadFields,
} from "./media-upload-rules.ts";
import { getDirectUploadSigner, type DirectUploadSigner } from "./media-upload-signer.ts";
import type { Language } from "./preferences.ts";

export const MEDIA_UPLOAD_CODES = [
  "file_too_large",
  "unsupported_format",
  "link_expired",
  "sha256_mismatch",
  "rate_limited",
  "network",
  "wallet_rejected",
  "wallet_missing",
  "nonce_used",
  "nonce_expired",
  "nonce_missing",
  "content_mismatch",
  "size_mismatch",
  "storage_unavailable",
  "pin_failed",
  "bad_signature",
  "verify_unavailable",
  "invalid_request",
] as const;

export type MediaUploadCode = (typeof MEDIA_UPLOAD_CODES)[number];

const MESSAGE_CODE: Record<MediaUploadCode, MediaUploadMessageCode> = {
  file_too_large: "file_too_large",
  unsupported_format: "unsupported_format",
  link_expired: "link_expired",
  sha256_mismatch: "sha256_mismatch",
  rate_limited: "rate_limited",
  network: "network",
  wallet_rejected: "wallet_rejected",
  wallet_missing: "wallet_rejected",
  nonce_used: "nonce_used",
  nonce_expired: "nonce_expired",
  nonce_missing: "nonce_missing",
  content_mismatch: "content_mismatch",
  size_mismatch: "size_mismatch",
  storage_unavailable: "storage_unavailable",
  pin_failed: "pin_failed",
  bad_signature: "bad_signature",
  verify_unavailable: "verify_unavailable",
  invalid_request: "invalid_request",
};

export function isMediaUploadCode(value: string): value is MediaUploadCode {
  return (MEDIA_UPLOAD_CODES as readonly string[]).includes(value);
}

export function mediaUploadText(lang: Language, code: MediaUploadCode): string {
  return mediaUploadMessage(lang, MESSAGE_CODE[code]);
}

export class MediaUploadError extends Error {
  readonly code: MediaUploadCode;
  constructor(code: MediaUploadCode) {
    super(code);
    this.code = code;
    this.name = "MediaUploadError";
  }
}

export type UploadDirectOptions = {
  fetchImpl?: typeof fetch;
  signer?: DirectUploadSigner;
};

export type DirectUploadResult = {
  uri: string;
  gatewayUrl: string;
  size: number;
  mime: string;
  sha256: string;
};

/** Keeps the original file when its type already matches. Otherwise only the type label changes. */
export function fileForDirectUpload(file: File, mime: string): File {
  const type = normalizeUploadMime(mime);
  if (normalizeUploadMime(file.type) === type) return file;
  return new File([file], file.name || "upload", { type, lastModified: file.lastModified });
}

function isWalletRejection(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? error.code : undefined;
  if (code === 4001 || code === "ACTION_REJECTED") return true;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return /reject|denied|declin/i.test(message);
}

async function readCode(res: Response): Promise<MediaUploadCode> {
  const body = (await res.json().catch(() => ({}))) as { error?: unknown };
  if (typeof body.error === "string" && isMediaUploadCode(body.error)) return body.error;
  if (res.status === 413) return "file_too_large";
  if (res.status === 415) return "unsupported_format";
  if (res.status === 429) return "rate_limited";
  if (res.status === 409) return "nonce_used";
  if (res.status === 401) return "link_expired";
  if (res.status === 422) return "sha256_mismatch";
  if (res.status === 503) return "storage_unavailable";
  return "pin_failed";
}

async function requestJson<T>(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch {
    throw new MediaUploadError("network");
  }
  if (!res.ok) throw new MediaUploadError(await readCode(res));
  return (await res.json()) as T;
}

function uploadId(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("data" in body)) return null;
  const data = body.data;
  if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string") return null;
  return PINATA_FILE_ID.test(data.id) ? data.id : null;
}

/**
 * Uploads the original file. The size is rejected before any request. GIF bytes are not re-encoded.
 */
export async function uploadDirect(
  file: File,
  kind: DirectUploadKind,
  options: UploadDirectOptions = {},
): Promise<DirectUploadResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new MediaUploadError("invalid_request");
  if (file.size > DIRECT_UPLOAD_MAX_BYTES) throw new MediaUploadError("file_too_large");
  const type = normalizeUploadMime(file.type);
  if (!mimeAllowedForKind(kind, type)) throw new MediaUploadError("unsupported_format");

  const signer = options.signer ?? getDirectUploadSigner();
  if (!signer) throw new MediaUploadError("wallet_missing");
  let address: string;
  try {
    address = getAddress(signer.address);
  } catch {
    throw new MediaUploadError("wallet_missing");
  }

  const sha256 = await sha256Hex(await file.arrayBuffer());
  const fields = validateDirectUploadFields({ kind, type, size: file.size, sha256 });
  if (!fields.ok) throw new MediaUploadError(fields.error);

  const issued = await requestJson<{ nonce?: unknown; expiry?: unknown; domain?: unknown }>(
    `/api/factory/upload/nonce?address=${encodeURIComponent(address)}`,
    { method: "GET" },
    fetchImpl,
  );
  if (typeof issued.nonce !== "string" || typeof issued.expiry !== "string" || typeof issued.domain !== "string") {
    throw new MediaUploadError("invalid_request");
  }
  const message = directUploadSignMessage({
    domain: issued.domain,
    address,
    nonce: issued.nonce,
    kind: fields.fields.kind,
    type: fields.fields.type,
    size: fields.fields.size,
    sha256: fields.fields.sha256,
    expiry: issued.expiry,
  });
  let signature: string;
  try {
    signature = await signer.signMessage(message);
  } catch (error) {
    throw new MediaUploadError(isWalletRejection(error) ? "wallet_rejected" : "network");
  }

  const signed = await requestJson<{ url?: unknown }>(
    "/api/factory/upload/sign",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: fields.fields.kind,
        type: fields.fields.type,
        size: fields.fields.size,
        sha256: fields.fields.sha256,
        address,
        signature,
        nonce: issued.nonce,
      }),
    },
    fetchImpl,
  );
  if (typeof signed.url !== "string" || !signed.url.startsWith("https://")) throw new MediaUploadError("pin_failed");

  const uploadFile = file.type === type ? file : fileForDirectUpload(file, type);
  let uploaded: Response;
  try {
    const form = new FormData();
    form.append("file", uploadFile, uploadFile.name);
    uploaded = await fetchImpl(signed.url, { method: "POST", body: form });
  } catch {
    throw new MediaUploadError("network");
  }
  if (!uploaded.ok) {
    if (uploaded.status === 413) throw new MediaUploadError("file_too_large");
    if (uploaded.status === 401 || uploaded.status === 403 || uploaded.status === 410) {
      throw new MediaUploadError("link_expired");
    }
    throw new MediaUploadError("pin_failed");
  }
  const id = uploadId(await uploaded.json().catch(() => null));
  if (!id) throw new MediaUploadError("pin_failed");

  const verified = await requestJson<Partial<DirectUploadResult>>(
    "/api/factory/upload/verify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, kind, sha256, size: fields.fields.size }),
    },
    fetchImpl,
  );
  if (
    typeof verified.uri !== "string" ||
    !verified.uri.startsWith("ipfs://") ||
    typeof verified.gatewayUrl !== "string" ||
    typeof verified.size !== "number" ||
    typeof verified.mime !== "string" ||
    typeof verified.sha256 !== "string"
  ) {
    throw new MediaUploadError("pin_failed");
  }
  if (verified.sha256 !== sha256) throw new MediaUploadError("sha256_mismatch");
  return {
    uri: verified.uri,
    gatewayUrl: verified.gatewayUrl,
    size: verified.size,
    mime: verified.mime,
    sha256: verified.sha256,
  };
}
