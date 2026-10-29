/**
 * Shared browser-side handling of image uploads to `/api/factory/media` and
 * `/api/factory/nft/image`: a size pre-check that mirrors the server limit, and a response
 * parser that never surfaces raw body text. Platform errors (for example a hosting-level
 * "413 FUNCTION_PAYLOAD_TOO_LARGE" text body, an HTML 502 page, an empty body) are mapped to a
 * stable code by status, so the UI can show a localized message instead.
 */

/** Same value as `NFT_IMAGE_MAX_BYTES` and the limit in `app/api/factory/media/route.ts`. */
export const UPLOAD_MAX_BYTES = 1_500_000;

/** Image types accepted by the upload routes (GIF is stored as is, not re-encoded). */
export const UPLOAD_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export type UploadErrorCode =
  | "file_too_large"
  | "unsupported_type"
  | "content_type_mismatch"
  | "rate_limited"
  | "sign_in_required"
  | "missing_file"
  | "storage_unavailable"
  | "pin_failed"
  | "svg_rejected"
  | "network"
  | "upload_failed";

const KNOWN_CODES: ReadonlySet<string> = new Set<UploadErrorCode>([
  "file_too_large",
  "unsupported_type",
  "content_type_mismatch",
  "rate_limited",
  "sign_in_required",
  "missing_file",
  "storage_unavailable",
  "pin_failed",
  "svg_rejected",
  "network",
  "upload_failed",
]);

/** Localized messages, from the `upload` block of the factory copy. */
export type UploadCopy = {
  hint: string;
  tooLarge: string;
  unsupportedType: string;
  contentMismatch: string;
  rateLimited: string;
  signIn: string;
  missingFile: string;
  network: string;
  failed: string;
};

export type UploadParsed<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: UploadErrorCode };

/** Client-side size check. Returns an error code, or `null` when the file may be sent. */
export function checkUploadSize(size: number): UploadErrorCode | null {
  if (!Number.isFinite(size) || size <= 0) return "missing_file";
  if (size > UPLOAD_MAX_BYTES) return "file_too_large";
  return null;
}

function codeForStatus(status: number): UploadErrorCode {
  if (status === 413) return "file_too_large";
  if (status === 415) return "unsupported_type";
  if (status === 429) return "rate_limited";
  if (status === 401) return "sign_in_required";
  return "upload_failed";
}

/**
 * Reads the response as text, tries JSON, and returns either the parsed body or a code. The body
 * text is never returned on failure. Unknown JSON error strings fall back to the status mapping.
 */
export async function parseUploadResponse<T = Record<string, unknown>>(res: Response): Promise<UploadParsed<T>> {
  let text = "";
  try {
    text = await res.text();
  } catch {
    text = "";
  }
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (res.ok) {
    if (record) return { ok: true, data: record as T };
    return { ok: false, status: res.status, code: "upload_failed" };
  }
  const serverCode = typeof record?.error === "string" ? record.error : "";
  const code = KNOWN_CODES.has(serverCode) ? (serverCode as UploadErrorCode) : codeForStatus(res.status);
  return { ok: false, status: res.status, code };
}

/** POSTs a form and parses the answer. A thrown fetch (offline, aborted) becomes `network`. */
export async function postUploadForm<T = Record<string, unknown>>(
  url: string,
  body: FormData,
  fetchImpl: typeof fetch = fetch,
): Promise<UploadParsed<T>> {
  let res: Response;
  try {
    res = await fetchImpl(url, { method: "POST", body });
  } catch {
    return { ok: false, status: 0, code: "network" };
  }
  return parseUploadResponse<T>(res);
}

/** Localized text for an upload error code. Anything unmapped reads as a generic failure. */
export function uploadErrorMessage(code: UploadErrorCode, copy: UploadCopy): string {
  switch (code) {
    case "file_too_large":
      return copy.tooLarge;
    case "unsupported_type":
      return copy.unsupportedType;
    case "content_type_mismatch":
      return copy.contentMismatch;
    case "rate_limited":
      return copy.rateLimited;
    case "sign_in_required":
      return copy.signIn;
    case "missing_file":
      return copy.missingFile;
    case "network":
      return copy.network;
    default:
      return copy.failed;
  }
}
