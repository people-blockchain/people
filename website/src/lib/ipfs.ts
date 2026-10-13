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

export async function pinBytesToIpfs(
  bytes: Uint8Array,
  filename: string,
  contentType = "image/png",
): Promise<{ cid: string }> {
  const jwt = process.env.PINATA_JWT?.trim();
  if (!jwt) {
    throw new Error("pinata_not_configured");
  }
  const form = new FormData();
  const blob = new Blob([Buffer.from(bytes)], { type: contentType });
  form.append("file", blob, filename);
  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  const body = (await res.json().catch(() => ({}))) as { IpfsHash?: string; error?: string };
  if (!res.ok || !body.IpfsHash || !isValidIpfsCid(body.IpfsHash)) {
    throw new Error(body.error ?? "pin_failed");
  }
  return { cid: body.IpfsHash };
}
