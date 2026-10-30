import { ipfsUriToAppPath } from "./nft-explorer.ts";

/**
 * URL an `<img>` may load for a token or NFT icon.
 * `ipfs://` is rewritten to the same-origin `/api/ipfs/<cid>[/path]` proxy
 * (`ipfsUriToAppPath`). A public gateway URL is not used: when that request
 * fails, the card falls back to the ticker gradient and the stored icon never appears.
 */
export function resolveAssetImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  if (trimmed.startsWith("ipfs://")) return ipfsUriToAppPath(trimmed);
  try {
    const url = new URL(trimmed);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
