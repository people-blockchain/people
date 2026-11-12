import { ipfsGatewayUrlForUri } from "./ipfs.ts";
import { isAllowedMediaUri, NFT_METADATA_MAX_BYTES } from "./nft-media-rules.ts";

export const NFT_TOKEN_METADATA_TIMEOUT_MS = 4_000;

export type NftTokenMetadata = {
  name?: string;
  description?: string;
  imageUrl?: string;
};

/**
 * Public URL for a token URI. Only `ipfs://` (through the configured gateway) and absolute
 * `https://` addresses are read; `http:`, `data:` and `javascript:` are never fetched.
 */
export function resolveNftMetadataUrl(tokenUri: string): string | null {
  const uri = tokenUri.trim();
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) {
    try {
      return ipfsGatewayUrlForUri(uri);
    } catch {
      return null;
    }
  }
  return isAllowedMediaUri(uri) ? uri : null;
}

/** Turn the metadata `image` field into a browser-safe URL, or null when it is not allowed. */
export function resolveNftImageUrl(image: unknown): string | null {
  if (typeof image !== "string") return null;
  const uri = image.trim();
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) {
    try {
      return ipfsGatewayUrlForUri(uri);
    } catch {
      return null;
    }
  }
  return isAllowedMediaUri(uri) ? uri : null;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\r\n?/g, "\n").trim();
  return text || undefined;
}

/** Parses the useful display fields and drops everything else. */
export function parseNftTokenMetadata(body: unknown): NftTokenMetadata {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const record = body as Record<string, unknown>;
  const name = cleanText(record.name);
  const description = cleanText(record.description);
  return {
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(resolveNftImageUrl(record.image) ? { imageUrl: resolveNftImageUrl(record.image) as string } : {}),
  };
}

/**
 * Reads one token metadata JSON from IPFS or HTTPS with a short timeout. Any failure is a
 * missing metadata document, not a page error; the detail view shows its own fallback.
 */
export async function fetchNftTokenMetadata(
  tokenUri: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<NftTokenMetadata | null> {
  const url = resolveNftMetadataUrl(tokenUri);
  if (!url) return null;
  try {
    const res = await (options.fetchImpl ?? fetch)(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? NFT_TOKEN_METADATA_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > NFT_METADATA_MAX_BYTES) return null;
    return parseNftTokenMetadata(JSON.parse(text));
  } catch {
    return null;
  }
}
