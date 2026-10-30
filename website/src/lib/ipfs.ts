import { ipfsGatewayBase } from "./factory-icon-config.ts";

const CID_V0 = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
const CID_V1 = /^b[a-z2-7]{58,}$/;

export function isValidIpfsCid(cid: string): boolean {
  const c = cid.trim();
  return CID_V0.test(c) || CID_V1.test(c);
}

export function parseIpfsUri(uri: string): string | null {
  const trimmed = uri.trim();
  if (trimmed.startsWith("ipfs://")) {
    const cid = trimmed.slice("ipfs://".length).split("/")[0] ?? "";
    return isValidIpfsCid(cid) ? cid : null;
  }
  if (isValidIpfsCid(trimmed)) return trimmed;
  return null;
}

export function toIpfsUri(cid: string): string {
  const parsed = parseIpfsUri(cid);
  if (!parsed) {
    throw new Error("invalid_cid");
  }
  return `ipfs://${parsed}`;
}

export function ipfsGatewayUrl(cidOrUri: string): string {
  const cid = parseIpfsUri(cidOrUri) ?? (isValidIpfsCid(cidOrUri) ? cidOrUri.trim() : null);
  if (!cid) {
    throw new Error("invalid_cid");
  }
  return `${ipfsGatewayBase()}/${cid}`;
}

/** HTTPS gateway URL for `ipfs://<cid>[/path]`, keeping the path (`.../metadata.json`). */
export function ipfsGatewayUrlForUri(uri: string): string {
  const cid = parseIpfsUri(uri);
  if (!cid || !uri.trim().startsWith("ipfs://")) {
    throw new Error("invalid_cid");
  }
  const path = uri.trim().slice("ipfs://".length + cid.length);
  return `${ipfsGatewayUrl(cid)}${path}`;
}

/**
 * Only inert media types may be proxied back to the browser from the site's own origin.
 * `text/html`/`image/svg+xml` (or any unlisted/missing type) must be rejected — serving them
 * from `/api/ipfs/*` would let arbitrary IPFS content run as same-origin script (M20-1).
 */
export const ALLOWED_IPFS_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/json",
]);

export const IPFS_MAX_BYTES = 10 * 1024 * 1024;

export const IPFS_SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Cross-Origin-Resource-Policy": "same-site",
};

/** Normalizes a raw `Content-Type` header (strips params, lower-cases) for the allowlist check. */
export function normalizeIpfsContentType(rawContentType: string | null): string | null {
  const type = (rawContentType ?? "").split(";")[0]?.trim().toLowerCase();
  return type || null;
}

export function isAllowedIpfsContentType(rawContentType: string | null): boolean {
  const type = normalizeIpfsContentType(rawContentType);
  return Boolean(type && ALLOWED_IPFS_CONTENT_TYPES.has(type));
}

/** Response headers for a successfully proxied IPFS object of the given (already-validated) content type. */
export function ipfsResponseHeaders(contentType: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
    ...IPFS_SECURITY_HEADERS,
  };
  if (contentType === "application/json") {
    headers["Content-Disposition"] = "attachment";
  }
  return headers;
}

export type PinataErrorCode = "pinata_not_configured" | "pinata_scope_missing" | "pin_failed";

export class PinataError extends Error {
  readonly code: PinataErrorCode;
  constructor(code: PinataErrorCode) {
    super(code);
    this.code = code;
    this.name = "PinataError";
  }
}

type FetchLike = typeof fetch;
const PINATA_TIMEOUT_MS = 25_000;

export function pinataJwt(): string {
  const jwt = process.env.PINATA_JWT?.trim();
  if (!jwt) throw new PinataError("pinata_not_configured");
  return jwt;
}

/** 401/403 mean the key lacks the scope for this endpoint; anything else non-2xx is a generic failure. */
export function pinataFailure(status: number): PinataError {
  return new PinataError(status === 401 || status === 403 ? "pinata_scope_missing" : "pin_failed");
}

export type PinOptions = {
  /** Pin the file inside a directory so it keeps its name (`ipfs://<dir>/<filename>`). */
  wrapWithDirectory?: boolean;
  /** Injected in tests. */
  fetchImpl?: FetchLike;
};

export async function pinBytesToIpfs(
  bytes: Uint8Array,
  filename: string,
  contentType = "image/png",
  options: PinOptions = {},
): Promise<{ cid: string; uri: string }> {
  const jwt = pinataJwt();
  const form = new FormData();
  const blob = new Blob([Buffer.from(bytes)], { type: contentType });
  form.append("file", blob, filename);
  if (options.wrapWithDirectory) {
    form.append("pinataOptions", JSON.stringify({ wrapWithDirectory: true }));
  }
  const res = await (options.fetchImpl ?? fetch)("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
    signal: AbortSignal.timeout(PINATA_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as { IpfsHash?: string; error?: string };
  if (!res.ok || !body.IpfsHash || !isValidIpfsCid(body.IpfsHash)) {
    throw res.ok ? new PinataError("pin_failed") : pinataFailure(res.status);
  }
  return { cid: body.IpfsHash, uri: options.wrapWithDirectory ? `ipfs://${body.IpfsHash}/${filename}` : `ipfs://${body.IpfsHash}` };
}

/**
 * Short-lived signed upload URL for a video (Pinata v3). The browser uploads straight to it, so
 * a 20 MB file never passes through a serverless function body limit. Pinata itself enforces the
 * size and MIME type recorded in the signature.
 */
export async function createPinataSignedVideoUpload(
  params: { filename: string; mimeType: "video/mp4" | "video/webm"; maxBytes: number; expiresSec?: number },
  fetchImpl: FetchLike = fetch,
): Promise<{ url: string }> {
  const { createPinataSignedUpload } = await import("./pinata-signed-upload.ts");
  return createPinataSignedUpload(
    {
      filename: params.filename,
      mimeTypes: [params.mimeType],
      maxBytes: params.maxBytes,
      expiresSec: params.expiresSec,
      // Legacy video route still verifies a public gateway read. Direct /sign stays private.
      network: "public",
    },
    fetchImpl,
  );
}

export type PinataFileNetwork = "public" | "private";

export type PinataFileRecord = { id: string; cid: string; size: number; mimeType: string };

export function pinataFileUrl(network: PinataFileNetwork, id: string): string {
  return `https://api.pinata.cloud/v3/files/${network}/${encodeURIComponent(id)}`;
}

function assertPinataFileId(id: string): void {
  if (!id || isValidIpfsCid(id)) throw new PinataError("pin_failed");
}

/** File record from this account's Pinata storage; a CID that belongs to someone else never resolves. */
export async function getPinataFile(
  id: string,
  fetchImpl: FetchLike = fetch,
  network: PinataFileNetwork = "public",
): Promise<PinataFileRecord> {
  assertPinataFileId(id);
  const jwt = pinataJwt();
  const res = await fetchImpl(pinataFileUrl(network, id), {
    headers: { Authorization: `Bearer ${jwt}` },
    signal: AbortSignal.timeout(PINATA_TIMEOUT_MS),
  });
  if (!res.ok) throw pinataFailure(res.status);
  const body = (await res.json().catch(() => ({}))) as {
    data?: { id?: string; cid?: string; size?: number; mime_type?: string };
  };
  const data = body.data;
  if (!data || typeof data.id !== "string" || typeof data.cid !== "string" || !isValidIpfsCid(data.cid) || typeof data.size !== "number") {
    throw new PinataError("pin_failed");
  }
  assertPinataFileId(data.id);
  return { id: data.id, cid: data.cid, size: data.size, mimeType: String(data.mime_type ?? "") };
}

export async function deletePinataFile(
  id: string,
  fetchImpl: FetchLike = fetch,
  network: PinataFileNetwork = "public",
): Promise<void> {
  assertPinataFileId(id);
  const jwt = pinataJwt();
  const res = await fetchImpl(pinataFileUrl(network, id), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${jwt}` },
    signal: AbortSignal.timeout(PINATA_TIMEOUT_MS),
  });
  if (!res.ok) throw pinataFailure(res.status);
}
