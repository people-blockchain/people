import { ipfsGatewayUrl, parseIpfsUri } from "@/lib/ipfs";

export function parseScreenshotUris(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
  } catch {
    return [];
  }
}

export function serializeScreenshotUris(uris: string[]): string {
  return JSON.stringify(uris.filter((u) => u.trim()).slice(0, 8));
}

export function resolveScreenshotUrl(uri: string): string {
  const trimmed = uri.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  const cid = parseIpfsUri(trimmed);
  if (cid) {
    try {
      return ipfsGatewayUrl(cid);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}
