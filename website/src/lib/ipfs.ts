import { ipfsGatewayBase } from "./factory-icon-config.ts";
import { sniffImageType, sniffVideoType } from "./media-sniff.ts";

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

// ---------------------------------------------------------------------------
// Path-inside-CID support for /api/ipfs/<cid>[/<path>]
// ---------------------------------------------------------------------------

const IPFS_SUBSEGMENT_RE = /^[A-Za-z0-9._\-+~()]+$/;
const IPFS_MAX_SEGMENT_LEN = 128;
const IPFS_MAX_DEPTH = 8;
const IPFS_MAX_SUBPATH_LEN = 512;

/** Hosts the proxy is ever allowed to contact. Host/scheme never come from user input. */
export const IPFS_GATEWAY_HOST_ALLOWLIST: readonly string[] = [
  "gateway.pinata.cloud",
  "ipfs.io",
  "cloudflare-ipfs.com",
  "dweb.link",
];

function isSafeSubSegment(seg: string): boolean {
  if (seg.length === 0 || seg.length > IPFS_MAX_SEGMENT_LEN) return false;
  if (/^\.+$/.test(seg)) return false; // ".", "..", "..."
  return IPFS_SUBSEGMENT_RE.test(seg);
}

function isSafeSubPath(subPath: string): boolean {
  if (subPath === "") return true;
  if (subPath.length > IPFS_MAX_SUBPATH_LEN) return false;
  const parts = subPath.split("/");
  return parts.length <= IPFS_MAX_DEPTH && parts.every(isSafeSubSegment);
}

/**
 * Strictly validates the catch-all segments of `/api/ipfs/[...path]`: first segment is a CID,
 * the rest is a file path inside it. Returns null on anything suspicious (traversal, encoded
 * separators, control chars, odd characters, oversize). `subPath` is "" for a bare CID.
 */
export function parseIpfsRequestPath(segments: string[]): { cid: string; subPath: string } | null {
  if (!Array.isArray(segments) || segments.length === 0) return null;
  const [cid, ...rest] = segments;
  if (typeof cid !== "string" || cid !== cid.trim() || !isValidIpfsCid(cid)) return null;
  if (rest.length > IPFS_MAX_DEPTH) return null;
  for (const seg of rest) {
    if (typeof seg !== "string" || !isSafeSubSegment(seg)) return null;
  }
  const subPath = rest.join("/");
  if (subPath.length > IPFS_MAX_SUBPATH_LEN) return null;
  return { cid, subPath };
}

function allowlistedGatewayBase(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return null;
  if (!IPFS_GATEWAY_HOST_ALLOWLIST.includes(url.hostname.toLowerCase())) return null;
  return `https://${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
}

function isAllowlistedGatewayUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      IPFS_GATEWAY_HOST_ALLOWLIST.includes(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

/**
 * Ordered upstream URLs for `<cid>/<subPath>`: the configured gateway first (only if it is https and
 * its host is allowlisted), then the fixed public gateways. Returns [] for an invalid cid/subPath.
 */
export function ipfsGatewayCandidates(cid: string, subPath = ""): string[] {
  if (!isValidIpfsCid(cid) || cid !== cid.trim() || !isSafeSubPath(subPath)) return [];
  const bases: string[] = [];
  const configured = allowlistedGatewayBase(ipfsGatewayBase());
  if (configured) bases.push(configured);
  for (const host of IPFS_GATEWAY_HOST_ALLOWLIST) {
    const base = `https://${host}/ipfs`;
    if (!bases.includes(base)) bases.push(base);
  }
  const suffix = subPath ? `/${subPath.split("/").map(encodeURIComponent).join("/")}` : "";
  return bases.map((b) => `${b}/${cid}${suffix}`).filter(isAllowlistedGatewayUrl);
}

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  json: "application/json",
};

const GENERIC_UPSTREAM_TYPES = new Set(["application/octet-stream", "binary/octet-stream", "text/plain"]);

/**
 * Final content type to serve, or null (-> 415). Allowlisted upstream types pass as-is; a missing or
 * generic type is inferred from the file extension; everything else (html, svg, ...) is rejected.
 */
export function resolveIpfsContentType(rawContentType: string | null, subPath: string): string | null {
  const type = normalizeIpfsContentType(rawContentType);
  if (type && ALLOWED_IPFS_CONTENT_TYPES.has(type)) return type;
  if (type && !GENERIC_UPSTREAM_TYPES.has(type)) return null;
  const last = subPath.split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  if (dot <= 0) return null;
  return EXTENSION_CONTENT_TYPES[last.slice(dot + 1).toLowerCase()] ?? null;
}

/**
 * Media type from the file's magic bytes, limited to the inert types above; null otherwise.
 * Used only when the gateway sends a generic/missing type for a path without a known extension
 * (a bare `ipfs://<cid>` image): without it such WebP/PNG/GIF NFTs were refused with 415.
 */
export function sniffIpfsContentType(bytes: Uint8Array): string | null {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return sniffImageType(buf) ?? sniffVideoType(buf);
}

export type IpfsFetchResult =
  | { ok: true; body: Uint8Array; contentType: string }
  | { ok: false; status: 404 | 413 | 415 | 502; error: "not_found" | "payload_too_large" | "unsupported_media_type" | "gateway_error" };

export type FetchIpfsOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
};

type GatewayAttempt =
  | { kind: "ok"; body: Uint8Array; contentType: string }
  | { kind: "retry"; status: number }
  | { kind: "fatal"; status: 413 | 415 };

async function fetchFromGateway(
  url: string,
  subPath: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  maxBytes: number,
): Promise<GatewayAttempt> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, timeoutMs);
  });
  const work = (async (): Promise<GatewayAttempt> => {
    let res = await fetchImpl(url, { redirect: "manual", signal: controller.signal });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      let target: string | null = null;
      try {
        target = location ? new URL(location, url).toString() : null;
      } catch {
        target = null;
      }
      void res.body?.cancel().catch(() => undefined);
      if (!target || !isAllowlistedGatewayUrl(target)) return { kind: "retry", status: 502 };
      res = await fetchImpl(target, { redirect: "manual", signal: controller.signal });
      if (res.status >= 300 && res.status < 400) {
        void res.body?.cancel().catch(() => undefined);
        return { kind: "retry", status: 502 };
      }
    }
    if (!res.ok) {
      void res.body?.cancel().catch(() => undefined);
      return { kind: "retry", status: res.status };
    }
    const upstreamType = normalizeIpfsContentType(res.headers.get("content-type"));
    let contentType = resolveIpfsContentType(upstreamType, subPath);
    // A generic/missing type on a path without a known extension is decided from the bytes below.
    const sniff = !contentType && (!upstreamType || GENERIC_UPSTREAM_TYPES.has(upstreamType));
    if (!contentType && !sniff) {
      void res.body?.cancel().catch(() => undefined);
      return { kind: "fatal", status: 415 };
    }
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > maxBytes) {
      void res.body?.cancel().catch(() => undefined);
      return { kind: "fatal", status: 413 };
    }
    if (!res.body) return { kind: "retry", status: 502 };
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          return { kind: "fatal", status: 413 };
        }
        chunks.push(value);
      }
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      body.set(c, offset);
      offset += c.byteLength;
    }
    contentType ??= sniffIpfsContentType(body);
    if (!contentType) return { kind: "fatal", status: 415 };
    return { kind: "ok", body, contentType };
  })();
  try {
    return await Promise.race([work, timeout]);
  } catch {
    return { kind: "retry", status: 502 };
  } finally {
    clearTimeout(timer);
    work.catch(() => undefined);
  }
}

/**
 * Fetches `<cid>/<subPath>` through the allowlisted gateways in order, falling back on network
 * error / timeout / 5xx / 404. Content problems (413, 415) are final: another gateway would serve
 * the same bytes. All-404 maps to 404, any other total failure to 502.
 */
export async function fetchIpfsFromGateways(
  cid: string,
  subPath: string,
  options: FetchIpfsOptions = {},
): Promise<IpfsFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const maxBytes = options.maxBytes ?? IPFS_MAX_BYTES;
  const urls = ipfsGatewayCandidates(cid, subPath);
  if (urls.length === 0) return { ok: false, status: 502, error: "gateway_error" };
  let allNotFound = true;
  for (const url of urls) {
    const attempt = await fetchFromGateway(url, subPath, fetchImpl, timeoutMs, maxBytes);
    if (attempt.kind === "ok") return { ok: true, body: attempt.body, contentType: attempt.contentType };
    if (attempt.kind === "fatal") {
      return attempt.status === 413
        ? { ok: false, status: 413, error: "payload_too_large" }
        : { ok: false, status: 415, error: "unsupported_media_type" };
    }
    if (attempt.status !== 404) allNotFound = false;
  }
  return allNotFound
    ? { ok: false, status: 404, error: "not_found" }
    : { ok: false, status: 502, error: "gateway_error" };
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
