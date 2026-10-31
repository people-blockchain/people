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

/** Public gateways tried in order when the first one rate-limits or times out. */
export const PUBLIC_IPFS_GATEWAY_BASES = [
  "https://gateway.pinata.cloud/ipfs",
  "https://ipfs.io/ipfs",
  "https://dweb.link/ipfs",
  "https://w3s.link/ipfs",
  "https://cloudflare-ipfs.com/ipfs",
] as const;

const GATEWAY_IPFS_PATH = /\/ipfs\/([^/?#]+)([^?#]*)/i;

/** CID plus the path after it (`/image.png`), from `ipfs://` or a `/ipfs/<cid>` gateway URL. */
export function extractIpfsPath(uri: string | null | undefined): { cid: string; suffix: string } | null {
  const trimmed = (uri ?? "").trim();
  if (!trimmed) return null;
  if (/^ipfs:\/\//i.test(trimmed)) {
    const rest = trimmed.slice("ipfs://".length).replace(/^\/+/, "");
    const slash = rest.indexOf("/");
    const cid = slash === -1 ? rest : rest.slice(0, slash);
    if (!isValidIpfsCid(cid)) return null;
    return { cid, suffix: slash === -1 ? "" : rest.slice(slash) };
  }
  const match = trimmed.match(GATEWAY_IPFS_PATH);
  if (!match || !isValidIpfsCid(match[1] ?? "")) return null;
  return { cid: match[1], suffix: match[2] ?? "" };
}

/** Stable identity for one IPFS object, so a gateway swap does not look like a new image. */
export function ipfsContentKey(uri: string | null | undefined): string | null {
  const parsed = extractIpfsPath(uri);
  return parsed ? `${parsed.cid}${parsed.suffix}` : null;
}

/**
 * Same CID on each public gateway, Pinata first. The first URL is repeated at the end so a
 * transient failure gets one short retry before the image is given up.
 */
export function ipfsGatewayCandidates(uri: string | null | undefined): string[] {
  const parsed = extractIpfsPath(uri);
  if (!parsed) {
    const value = (uri ?? "").trim();
    return value ? [value] : [];
  }
  const urls = PUBLIC_IPFS_GATEWAY_BASES.map((base) => `${base}/${parsed.cid}${parsed.suffix}`);
  return [...urls, urls[0]];
}

/** Sources an `<img>` should try. IPFS walks the gateway list; anything else is retried once. */
export function assetImageSources(url: string | null | undefined): string[] {
  const value = (url ?? "").trim();
  if (!value) return [];
  const candidates = ipfsGatewayCandidates(value);
  if (candidates.length > 1) return candidates;
  return [value, value];
}

/** Next source after `onError`. `failed` means every source, including the short retry, missed. */
export function assetImageAfterError(index: number, count: number): { index: number; failed: boolean } {
  const next = index + 1;
  return { index: next, failed: count <= 0 || next >= count };
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
 * URL an `<img>` can load. `ipfs://<cid>/image.png` keeps the path on the configured gateway.
 * Site-relative and public https URLs pass through. Anything else (including a metadata JSON
 * document — resolve that first) is not an image URL.
 */
export function displayTokenImageUrl(uri: string | null | undefined): string | null {
  const value = (uri ?? "").trim();
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (/^ipfs:\/\//i.test(value)) {
    try {
      return ipfsGatewayUrlForUri(value);
    } catch {
      return null;
    }
  }
  if (/^https:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (url.username || url.password) return null;
      return url.href;
    } catch {
      return null;
    }
  }
  return null;
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

function pinataJwt(): string {
  const jwt = process.env.PINATA_JWT?.trim();
  if (!jwt) throw new PinataError("pinata_not_configured");
  return jwt;
}

/** 401/403 mean the key lacks the scope for this endpoint; anything else non-2xx is a generic failure. */
function pinataFailure(status: number): PinataError {
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
  const jwt = pinataJwt();
  const res = await fetchImpl("https://uploads.pinata.cloud/v3/files/sign", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      date: Math.floor(Date.now() / 1000),
      expires: params.expiresSec ?? 120,
      filename: params.filename,
      max_file_size: params.maxBytes,
      allow_mime_types: [params.mimeType],
      network: "public",
    }),
    signal: AbortSignal.timeout(PINATA_TIMEOUT_MS),
  });
  if (!res.ok) throw pinataFailure(res.status);
  const body = (await res.json().catch(() => ({}))) as { data?: unknown };
  if (typeof body.data !== "string" || !body.data.startsWith("https://")) throw new PinataError("pin_failed");
  return { url: body.data };
}

export type PinataFileRecord = { id: string; cid: string; size: number; mimeType: string };

/** File record from this account's Pinata storage; a CID that belongs to someone else never resolves. */
export async function getPinataFile(id: string, fetchImpl: FetchLike = fetch): Promise<PinataFileRecord> {
  const jwt = pinataJwt();
  const res = await fetchImpl(`https://api.pinata.cloud/v3/files/public/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${jwt}` },
    signal: AbortSignal.timeout(PINATA_TIMEOUT_MS),
  });
  if (!res.ok) throw pinataFailure(res.status);
  const body = (await res.json().catch(() => ({}))) as {
    data?: { id?: string; cid?: string; size?: number; mime_type?: string };
  };
  const data = body.data;
  if (!data || typeof data.cid !== "string" || !isValidIpfsCid(data.cid) || typeof data.size !== "number") {
    throw new PinataError("pin_failed");
  }
  return { id: String(data.id ?? id), cid: data.cid, size: data.size, mimeType: String(data.mime_type ?? "") };
}

export async function deletePinataFile(id: string, fetchImpl: FetchLike = fetch): Promise<void> {
  const jwt = pinataJwt();
  const res = await fetchImpl(`https://api.pinata.cloud/v3/files/public/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${jwt}` },
    signal: AbortSignal.timeout(PINATA_TIMEOUT_MS),
  });
  if (!res.ok) throw pinataFailure(res.status);
}
