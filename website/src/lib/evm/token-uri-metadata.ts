import { ipfsGatewayUrlForUri } from "@/lib/ipfs";
import { isPublicHttpsHost } from "@/lib/nft-media-rules";
import { readCappedText } from "@/lib/read-capped-text";

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
export async function readTokenUriMetadata(tokenUri: string): Promise<TokenUriMetadata | null> {
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
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TOKEN_URI_FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = await readCappedText(res, TOKEN_URI_MAX_BYTES);
    if (!text) return null;
    const json = JSON.parse(text) as { name?: unknown; description?: unknown; image?: unknown };
    return {
      ...(typeof json.name === "string" && json.name.trim() ? { name: json.name.trim().slice(0, 200) } : {}),
      ...(typeof json.description === "string" && json.description.trim()
        ? { description: json.description.trim().slice(0, 2_000) }
        : {}),
      ...(metadataImage(json.image) ? { image: metadataImage(json.image) } : {}),
    };
  } catch {
    return null;
  }
}

export const TOKEN_IMAGE_CACHE_TTL_MS = 5 * 60_000;
export const TOKEN_IMAGE_NEGATIVE_TTL_MS = 30_000;
export const TOKEN_IMAGE_CACHE_MAX = 500;

const imageCache = new Map<string, { expiresAt: number; value: string | undefined }>();

export function resetTokenImageCacheForTests(): void {
  imageCache.clear();
}

export function tokenImageCacheSizeForTests(): number {
  return imageCache.size;
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
export async function fetchCachedMetadataImage(
  uri: string,
  fetchJson: (tokenUri: string) => Promise<TokenUriMetadata | null> = readTokenUriMetadata,
): Promise<string | undefined> {
  const key = uri.trim();
  const cached = imageCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let image: string | undefined;
  try {
    const meta = await fetchJson(key);
    image = metadataImage(meta?.image);
  } catch {
    image = undefined;
  }
  rememberImage(key, image);
  return image;
}
