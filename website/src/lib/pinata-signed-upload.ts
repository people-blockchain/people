import { PinataError, pinataFailure, pinataJwt } from "./ipfs.ts";
import { DIRECT_UPLOAD_MAX_BYTES } from "./media-upload-rules.ts";

const PINATA_TIMEOUT_MS = 25_000;
type FetchLike = typeof fetch;

/**
 * Signed uploads land on the private network. Verify reads them through a
 * private link and only then copies the checked bytes to public.
 */
export const PINATA_UPLOAD_NETWORK = "private" as const;

/** Pinata counts the whole multipart body, not the file alone. At least 64 KiB, or 2%. */
export const PINATA_MULTIPART_HEADROOM_MIN_BYTES = 64 * 1024;

export function pinataMultipartHeadroom(declaredBytes: number): number {
  return Math.max(PINATA_MULTIPART_HEADROOM_MIN_BYTES, Math.ceil((declaredBytes * 2) / 100));
}

/**
 * `max_file_size` for `POST /v3/files/sign`, in bytes. Declared size plus multipart headroom,
 * never above the 25 MB ceiling plus that same headroom.
 */
export function pinataSignedUploadMaxBytes(declaredBytes: number, ceiling = DIRECT_UPLOAD_MAX_BYTES): number {
  const cap = ceiling + pinataMultipartHeadroom(ceiling);
  return Math.min(declaredBytes + pinataMultipartHeadroom(declaredBytes), cap);
}

/**
 * Short-lived Pinata v3 signed upload URL. The signature fixes the MIME list, the maximum
 * size and the lifetime. The browser then sends the original file straight to that URL.
 */
export async function createPinataSignedUpload(
  params: {
    filename: string;
    mimeTypes: readonly string[];
    maxBytes: number;
    expiresSec?: number;
    network?: "public" | "private";
  },
  fetchImpl: FetchLike = fetch,
): Promise<{ url: string }> {
  if (params.mimeTypes.length === 0 || !Number.isSafeInteger(params.maxBytes) || params.maxBytes <= 0) {
    throw new PinataError("pin_failed");
  }
  const jwt = pinataJwt();
  const res = await fetchImpl("https://uploads.pinata.cloud/v3/files/sign", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      date: Math.floor(Date.now() / 1000),
      expires: params.expiresSec ?? 120,
      filename: params.filename,
      max_file_size: pinataSignedUploadMaxBytes(params.maxBytes),
      allow_mime_types: [...params.mimeTypes],
      network: params.network ?? PINATA_UPLOAD_NETWORK,
    }),
    signal: AbortSignal.timeout(PINATA_TIMEOUT_MS),
  });
  if (!res.ok) throw pinataFailure(res.status);
  const body = (await res.json().catch(() => ({}))) as { data?: unknown };
  if (typeof body.data !== "string" || !body.data.startsWith("https://")) throw new PinataError("pin_failed");
  return { url: body.data };
}
