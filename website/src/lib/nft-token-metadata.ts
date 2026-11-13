import { ipfsGatewayBase } from "./factory-icon-config.ts";
import { ipfsGatewayUrlForUri } from "./ipfs.ts";
import { isAllowedMediaUri, NFT_METADATA_MAX_BYTES } from "./nft-media-rules.ts";
import { readCappedText } from "./read-capped-text.ts";

export const NFT_TOKEN_METADATA_TIMEOUT_MS = 10_000;

export type NftTokenMetadata = {
  name?: string;
  description?: string;
  imageUrl?: string;
};

/** Host of the configured IPFS gateway. Only HTTPS token URIs on this host are fetched server-side. */
function ipfsGatewayHost(): string | null {
  try {
    return new URL(ipfsGatewayBase()).host.toLowerCase();
  } catch {
    return null;
  }
}

function isIpfsGatewayHttpsUrl(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = ipfsGatewayHost();
  return host !== null && url.host.toLowerCase() === host;
}

/**
 * Server-readable URL for a token URI. Only `ipfs://` (through the configured gateway) and
 * `https://` addresses on the configured IPFS gateway host are read. Any other HTTPS host,
 * `http:`, `data:` and `javascript:` are never fetched.
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
  return isIpfsGatewayHttpsUrl(uri) ? uri : null;
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
 * Reads one token metadata JSON from IPFS or the configured gateway with a short timeout. Any
 * failure is a missing metadata document, not a page error; the detail view shows its own
 * fallback. Redirects are refused so the fetch cannot leave the allowed gateway. The size cap
 * is enforced while streaming, and a successful IPFS response is cached as immutable content.
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
      redirect: "error",
      signal: AbortSignal.timeout(options.timeoutMs ?? NFT_TOKEN_METADATA_TIMEOUT_MS),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const text = await readCappedText(res, NFT_METADATA_MAX_BYTES);
    if (text === null) return null;
    return parseNftTokenMetadata(JSON.parse(text));
  } catch {
    return null;
  }
}
