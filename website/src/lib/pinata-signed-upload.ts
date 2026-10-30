import { PinataError, pinataFailure, pinataJwt } from "./ipfs.ts";

const PINATA_TIMEOUT_MS = 25_000;
type FetchLike = typeof fetch;

/**
 * Short-lived Pinata v3 signed upload URL. The signature fixes the MIME list, the maximum
 * size and the lifetime. The browser then sends the original file straight to that URL.
 */
export async function createPinataSignedUpload(
  params: { filename: string; mimeTypes: readonly string[]; maxBytes: number; expiresSec?: number },
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
      max_file_size: params.maxBytes,
      allow_mime_types: [...params.mimeTypes],
      network: "public",
    }),
    signal: AbortSignal.timeout(PINATA_TIMEOUT_MS),
  });
  if (!res.ok) throw pinataFailure(res.status);
  const body = (await res.json().catch(() => ({}))) as { data?: unknown };
  if (typeof body.data !== "string" || !body.data.startsWith("https://")) throw new PinataError("pin_failed");
  return { url: body.data };
}
