/**
 * Pure logic for `/explorer/nft/<collection>/<id>`: route-param validation, IPFS URI mapping,
 * metadata normalisation and the SSRF-safe rules for the server-side metadata fetch.
 *
 * Rules: only `ipfs://` token URIs are ever fetched server-side, and only from allowlisted
 * gateways (no redirects off the allowlist, capped body); `http(s)` URIs are displayed, never
 * fetched. Images are rendered only through the app's own `/api/ipfs/...` proxy (which refuses
 * SVG/HTML), never from an attacker-supplied origin.
 */

import { getAddress, isAddress } from "viem";
import { parseIpfsMediaUri } from "./nft-media-rules.ts";

export const NFT_METADATA_MAX_BYTES = 256 * 1024;
export const NFT_METADATA_TIMEOUT_MS = 6_000;
export const PUBLIC_IPFS_GATEWAY = "https://ipfs.io/ipfs";
const MAX_UINT256 = (BigInt(1) << BigInt(256)) - BigInt(1);

/** `collection` must be an EVM address and `id` a canonical decimal uint256; otherwise null (-> 404). */
export function parseNftParams(collection: string, id: string): { collection: `0x${string}`; tokenId: string } | null {
  if (typeof collection !== "string" || typeof id !== "string") return null;
  if (!isAddress(collection, { strict: false })) return null;
  if (!/^(0|[1-9]\d{0,77})$/.test(id)) return null;
  if (BigInt(id) > MAX_UINT256) return null;
  return { collection: getAddress(collection), tokenId: id };
}

/** `ipfs://<cid>[/path]` -> same-origin `/api/ipfs/<cid>[/path]`; anything else -> null. */
export function ipfsUriToAppPath(uri: string): string | null {
  const parsed = parseIpfsMediaUri(typeof uri === "string" ? uri.trim() : "");
  if (!parsed) return null;
  return `/api/ipfs/${parsed.cid}${parsed.path ? `/${parsed.path}` : ""}`;
}

/** `ipfs://<cid>[/path]` -> public gateway link for people to open; non-ipfs -> null. */
export function ipfsUriToPublicGateway(uri: string): string | null {
  const parsed = parseIpfsMediaUri(typeof uri === "string" ? uri.trim() : "");
  if (!parsed) return null;
  return `${PUBLIC_IPFS_GATEWAY}/${parsed.cid}${parsed.path ? `/${parsed.path}` : ""}`;
}

/** Allowlisted gateway URLs for fetching metadata server-side (ipfs:// only), preferred first. */
export function metadataFetchUrls(tokenUri: string, configuredGatewayBase?: string): string[] {
  const parsed = parseIpfsMediaUri(typeof tokenUri === "string" ? tokenUri.trim() : "");
  if (!parsed) return [];
  const suffix = `${parsed.cid}${parsed.path ? `/${parsed.path}` : ""}`;
  const bases = [configuredGatewayBase, PUBLIC_IPFS_GATEWAY]
    .map(base => (base ?? "").trim().replace(/\/$/, ""))
    .filter((base, i, all) => base.startsWith("https://") && all.indexOf(base) === i);
  return bases.map(base => `${base}/${suffix}`);
}

/** Redirects are followed only to https hosts that are the gateway or its subdomains (CID subdomain gateways). */
export function isAllowedGatewayRedirect(target: string, gatewayBases: string[]): boolean {
  let url: URL;
  try { url = new URL(target); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return gatewayBases.some(base => {
    try {
      const gateway = new URL(base).hostname.toLowerCase();
      return host === gateway || host.endsWith(`.${gateway}`) || host === "dweb.link" || host.endsWith(".ipfs.dweb.link");
    } catch { return false; }
  });
}

export type NftMetadata = {
  name: string | null;
  description: string | null;
  /** Raw `image` value as stored in the metadata (display only). */
  imageUri: string | null;
  /** Same-origin proxied URL; null unless the image is an `ipfs://` URI. */
  imageUrl: string | null;
  animationUrl: string | null;
};

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g, "").trim();
  return clean ? clean.slice(0, max) : null;
}

/** Normalises untrusted metadata JSON; never throws. Unknown shapes yield nulls. */
export function normalizeNftMetadata(json: unknown): NftMetadata {
  const obj = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  const imageUri = text(obj.image ?? obj.image_url, 400);
  const animation = text(obj.animation_url ?? obj.animationUrl, 400);
  return {
    name: text(obj.name, 120),
    description: text(obj.description, 2000),
    imageUri,
    imageUrl: imageUri ? ipfsUriToAppPath(imageUri) : null,
    animationUrl: animation ? ipfsUriToAppPath(animation) : null,
  };
}

/** Display name: metadata name, else "<collection name> #<id>", else "#<id>". */
export function nftDisplayName(metadataName: string | null, collectionName: string | null, tokenId: string): string {
  if (metadataName) return metadataName;
  return collectionName ? `${collectionName} #${tokenId}` : `#${tokenId}`;
}

/** Reads a response body but gives up (null) once it exceeds `maxBytes`. */
export async function readCappedText(res: Response, maxBytes = NFT_METADATA_MAX_BYTES): Promise<string | null> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) { await reader.cancel().catch(() => undefined); return null; }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Fetches the metadata JSON for an `ipfs://` token URI via allowlisted gateways only. Returns null
 * for non-ipfs URIs, errors, oversized or non-JSON bodies. Redirects are checked hop by hop.
 */
export async function fetchNftMetadata(
  tokenUri: string,
  options: { gatewayBase?: string; fetchImpl?: FetchLike; timeoutMs?: number; maxBytes?: number } = {},
): Promise<unknown | null> {
  const { gatewayBase, fetchImpl = fetch as FetchLike, timeoutMs = NFT_METADATA_TIMEOUT_MS, maxBytes = NFT_METADATA_MAX_BYTES } = options;
  const urls = metadataFetchUrls(tokenUri, gatewayBase);
  const bases = [gatewayBase ?? "", PUBLIC_IPFS_GATEWAY].filter(Boolean);
  for (const first of urls) {
    try {
      let target = first;
      for (let hop = 0; hop < 3; hop++) {
        const res = await fetchImpl(target, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" }, cache: "no-store" });
        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get("location");
          const next = location ? new URL(location, target).toString() : "";
          if (!next || !isAllowedGatewayRedirect(next, bases)) break;
          target = next;
          continue;
        }
        if (!res.ok) break;
        const body = await readCappedText(res, maxBytes);
        if (body === null) break;
        try { return JSON.parse(body) as unknown; } catch { break; }
      }
    } catch { /* try the next allowlisted gateway */ }
  }
  return null;
}

/** True when a viem read error means the call reverted (token does not exist), not a transport failure. */
export function isRevertLike(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const { name, shortMessage, message } = current as { name?: string; shortMessage?: string; message?: string };
    if (name === "ContractFunctionRevertedError" || name === "ContractFunctionZeroDataError") return true;
    if (/reverted|execution revert|returned no data|zero data/i.test(`${shortMessage ?? ""} ${message ?? ""}`)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
