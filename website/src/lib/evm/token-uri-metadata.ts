import { ipfsGatewayUrlForUri } from "@/lib/ipfs";
import { isPublicHttpsHost } from "@/lib/nft-media-rules";
import { readCappedText } from "@/lib/read-capped-text";
import {
  RequestDeadlineError,
  boundedTimeoutMs,
  currentDeadline,
  deadlineExpired,
  linkAbort,
} from "@/lib/evm/request-deadline";

export type TokenUriMetadata = { name?: string; description?: string; image?: string };

export const TOKEN_URI_FETCH_TIMEOUT_MS = 8_000;
export const TOKEN_URI_MAX_BYTES = 64 * 1024;

export function metadataImage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const uri = value.trim();
  return /^(ipfs|https):\/\/[^\s]+$/i.test(uri) ? uri : undefined;
}

/** `https://` URL with no credentials, default port and a public host name; else null. */
function safeHttpsUrl(uri: string): string | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (url.port && url.port !== "443") return null;
    return isPublicHttpsHost(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Fetches a JSON metadata document (`ipfs://` through the fixed gateway, or a public `https://`
 * URL) with a timeout and a size cap. Any failure yields null.
 */
export async function readTokenUriMetadata(
  tokenUri: string,
  timeoutMs = TOKEN_URI_FETCH_TIMEOUT_MS,
  deadlineAt?: number,
  detach = false,
): Promise<TokenUriMetadata | null> {
  const uri = tokenUri.trim();
  let url: string | null;
  if (/^ipfs:\/\//i.test(uri)) {
    try {
      url = ipfsGatewayUrlForUri(uri);
    } catch {
      return null;
    }
  } else if (/^https:\/\//i.test(uri)) {
    url = safeHttpsUrl(uri);
  } else {
    url = null;
  }
  if (!url) return null;
  const at = deadlineAt ?? currentDeadline()?.at;
  const attempt = linkAbort(boundedTimeoutMs(timeoutMs, at), detach ? null : currentDeadline()?.signal);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: attempt.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = await Promise.race([
      readCappedText(res, TOKEN_URI_MAX_BYTES),
      new Promise<null>((resolve) => {
        if (attempt.signal.aborted) {
          resolve(null);
          return;
        }
        attempt.signal.addEventListener("abort", () => resolve(null), { once: true });
      }),
    ]);
    if (attempt.signal.aborted) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    if (!text) return null;
    const json = JSON.parse(text) as { name?: unknown; description?: unknown; image?: unknown };
    return {
      ...(typeof json.name === "string" && json.name.trim() ? { name: json.name.trim().slice(0, 200) } : {}),
      ...(typeof json.description === "string" && json.description.trim()
        ? { description: json.description.trim().slice(0, 2_000) }
        : {}),
      ...(metadataImage(json.image) ? { image: metadataImage(json.image) } : {}),
    };
  } catch (error) {
    if (error instanceof RequestDeadlineError) return null;
    return null;
  } finally {
    attempt.cancel();
  }
}

export const TOKEN_IMAGE_CACHE_TTL_MS = 5 * 60_000;
export const TOKEN_IMAGE_NEGATIVE_TTL_MS = 30_000;
export const TOKEN_IMAGE_CACHE_MAX = 500;

const imageCache = new Map<string, { expiresAt: number; value: string | undefined }>();
let imageReads: Promise<void> = Promise.resolve();

export function resetTokenImageCacheForTests(): void {
  imageCache.clear();
  imageReads = Promise.resolve();
}

export function tokenImageCacheSizeForTests(): number {
  return imageCache.size;
}

/** In-memory hit only. A miss is `undefined` and does not start a gateway read. */
export function peekCachedMetadataImage(uri: string): string | undefined {
  const entry = peekCachedMetadataImageEntry(uri);
  return entry.hit ? entry.value : undefined;
}

/** Distinguishes a cache miss from a cached "no image", so a miss can still return the document URL. */
export function peekCachedMetadataImageEntry(uri: string): { hit: true; value: string | undefined } | { hit: false } {
  const cached = imageCache.get(uri.trim());
  if (!cached || cached.expiresAt <= Date.now()) return { hit: false };
  return { hit: true, value: cached.value };
}

/** Resolves when metadata reads started so far have settled. Tests use this; it does not start a read. */
export function settleTokenImageReadsForTests(): Promise<void> {
  return imageReads;
}

function trackImageRead(work: Promise<unknown>): void {
  imageReads = Promise.all([imageReads.catch(() => undefined), work.catch(() => undefined)]).then(() => undefined);
}

function rememberImage(uri: string, value: string | undefined): void {
  imageCache.delete(uri);
  imageCache.set(uri, {
    expiresAt: Date.now() + (value ? TOKEN_IMAGE_CACHE_TTL_MS : TOKEN_IMAGE_NEGATIVE_TTL_MS),
    value,
  });
  while (imageCache.size > TOKEN_IMAGE_CACHE_MAX) {
    const oldest = imageCache.keys().next().value;
    if (oldest === undefined) break;
    imageCache.delete(oldest);
  }
}

/**
 * Fetches a pinned metadata JSON and returns its `image` (ipfs:// or https://), or undefined.
 * Failures are cached for a shorter time than hits so a blip does not stick.
 */
export function fetchCachedMetadataImage(
  uri: string,
  fetchJson?: (tokenUri: string) => Promise<TokenUriMetadata | null>,
  deadlineAt?: number,
): Promise<string | undefined> {
  const work = fetchCachedMetadataImageNow(uri, fetchJson, deadlineAt);
  trackImageRead(work);
  return work;
}

async function fetchCachedMetadataImageNow(
  uri: string,
  fetchJson?: (tokenUri: string) => Promise<TokenUriMetadata | null>,
  deadlineAt?: number,
): Promise<string | undefined> {
  const key = uri.trim();
  const cached = imageCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const at = deadlineAt ?? currentDeadline()?.at;
  // Detached from the compat request: a slow gateway must not abort the asset list or mark it partial.
  const read = fetchJson ?? ((tokenUri: string) => readTokenUriMetadata(tokenUri, boundedTimeoutMs(TOKEN_URI_FETCH_TIMEOUT_MS, at), at, true));
  let image: string | undefined;
  try {
    const meta = await read(key);
    image = metadataImage(meta?.image);
  } catch {
    image = undefined;
  }
  // A deadline abort is not a real miss: the next request must be allowed to fetch the image.
  if (deadlineExpired(at)) return image;
  rememberImage(key, image);
  return image;
}
