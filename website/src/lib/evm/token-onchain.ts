import {
  bytesToString,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  hexToBytes,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { tokenImageFromMetadataUri } from "@/lib/evm/chain-catalog";
import {
  fetchCachedMetadataImage,
  readTokenUriMetadata,
  resetTokenImageCacheForTests as resetMetadataImageCacheForTests,
  tokenImageCacheSizeForTests as metadataImageCacheSizeForTests,
  TOKEN_IMAGE_CACHE_MAX,
  type TokenUriMetadata,
} from "@/lib/evm/token-uri-metadata";

export { TOKEN_IMAGE_CACHE_MAX };

/**
 * Pure token reader. `call` is an injected `eth_call`: it resolves to the returned hex, or to null
 * when the contract reverted / answered nothing (the getter is absent), and it THROWS on transport
 * failures (timeout, backoff, HTTP 5xx). The reader keeps those apart: absent getter -> undefined
 * field, transport failure -> `TokenReadError`, so a transient node problem is never turned into
 * fabricated metadata (address-derived symbol, deployer as creator).
 */
export type TokenCall = (to: Address, data: Hex) => Promise<Hex | null>;

export class TokenReadError extends Error {
  readonly cause?: unknown;
  constructor(message = "token_read_failed", cause?: unknown) {
    super(message);
    this.name = "TokenReadError";
    this.cause = cause;
  }
}

export type TokenOnchain = {
  name?: string;
  symbol?: string;
  creator?: Address;
  metadataUri?: string;
  decimals?: number;
  totalSupply?: bigint;
};

/** Symbol shown when the contract truly has no `symbol()`; same as the catalog scan. */
export const FALLBACK_TOKEN_SYMBOL = "TKN";

const TOKEN_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function creator() view returns (address)",
  "function metadataURI() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
]);

type TokenGetter = "name" | "symbol" | "creator" | "metadataURI" | "decimals" | "totalSupply";

const BYTES32_HEX_LENGTH = 66;
const TEXT_MAX = 64;
const URI_MAX = 2048;

function cleanText(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

async function readGetter(call: TokenCall, token: Address, functionName: TokenGetter): Promise<Hex | null> {
  const data = encodeFunctionData({ abi: TOKEN_ABI, functionName });
  let out: Hex | null;
  try {
    out = await call(token, data);
  } catch (error) {
    throw error instanceof TokenReadError ? error : new TokenReadError(`token_read_failed:${functionName}`, error);
  }
  return !out || out === "0x" ? null : out;
}

function decodeText(out: Hex | null, functionName: "name" | "symbol" | "metadataURI", max: number): string | undefined {
  if (!out) return undefined;
  let text: string | undefined;
  try {
    text = decodeFunctionResult({ abi: TOKEN_ABI, functionName, data: out }) as string;
  } catch {
    // Non-standard tokens (MKR-style) return `bytes32` instead of an ABI string.
    if (out.length === BYTES32_HEX_LENGTH) {
      try {
        text = bytesToString(hexToBytes(out)).replace(/\u0000+$/, "");
      } catch {
        text = undefined;
      }
    }
  }
  if (text === undefined) return undefined;
  return cleanText(text, max) || undefined;
}

function decodeCreator(out: Hex | null): Address | undefined {
  if (!out) return undefined;
  try {
    const address = decodeFunctionResult({ abi: TOKEN_ABI, functionName: "creator", data: out }) as Address;
    return /^0x0{40}$/i.test(address) ? undefined : getAddress(address);
  } catch {
    return undefined;
  }
}

function decodeUint(out: Hex | null, functionName: "decimals" | "totalSupply"): bigint | undefined {
  if (!out) return undefined;
  try {
    return BigInt(decodeFunctionResult({ abi: TOKEN_ABI, functionName, data: out }) as bigint | number);
  } catch {
    return undefined;
  }
}

export async function readTokenOnchain(call: TokenCall, token: Address): Promise<TokenOnchain> {
  const [name, symbol, creator, metadataUri, decimals, totalSupply] = await Promise.all([
    readGetter(call, token, "name"),
    readGetter(call, token, "symbol"),
    readGetter(call, token, "creator"),
    readGetter(call, token, "metadataURI"),
    readGetter(call, token, "decimals"),
    readGetter(call, token, "totalSupply"),
  ]);
  const decimalsValue = decodeUint(decimals, "decimals");
  const supplyValue = decodeUint(totalSupply, "totalSupply");
  return {
    ...(decodeText(name, "name", TEXT_MAX) ? { name: decodeText(name, "name", TEXT_MAX) } : {}),
    ...(decodeText(symbol, "symbol", TEXT_MAX) ? { symbol: decodeText(symbol, "symbol", TEXT_MAX) } : {}),
    ...(decodeCreator(creator) ? { creator: decodeCreator(creator) } : {}),
    ...(decodeText(metadataUri, "metadataURI", URI_MAX)
      ? { metadataUri: decodeText(metadataUri, "metadataURI", URI_MAX) }
      : {}),
    ...(decimalsValue !== undefined && decimalsValue <= BigInt(255) ? { decimals: Number(decimalsValue) } : {}),
    ...(supplyValue !== undefined ? { totalSupply: supplyValue } : {}),
  };
}

export type FetchTokenMetadata = (uri: string) => Promise<TokenUriMetadata | null>;

const METADATA_JSON_SUFFIX = /\/metadata\.json(?:[?#].*)?$/i;

export function resetTokenImageCacheForTests(): void {
  resetMetadataImageCacheForTests();
}

export function tokenImageCacheSizeForTests(): number {
  return metadataImageCacheSizeForTests();
}

/**
 * Image for a token's on-chain `metadataURI`. A `/metadata.json` URI is a pinned JSON document:
 * its `image` (ipfs:// or https://) is used. Any other ipfs/https URI is a direct image. The legacy
 * `ipfs://people*` placeholder has none (and triggers no fetch). A fetch failure yields undefined,
 * never an error; results are cached briefly (failures for less time).
 */
export async function resolveTokenImageUri(
  metadataUri: string | null | undefined,
  fetchJson: FetchTokenMetadata = readTokenUriMetadata,
): Promise<string | undefined> {
  const uri = (metadataUri ?? "").trim();
  if (!uri) return undefined;
  if (!METADATA_JSON_SUFFIX.test(uri)) return tokenImageFromMetadataUri(uri) ?? undefined;
  if (uri === "ipfs://people" || uri.startsWith("ipfs://people/")) return undefined;
  const image = await fetchCachedMetadataImage(uri, fetchJson);
  return tokenImageFromMetadataUri(image) ?? undefined;
}
