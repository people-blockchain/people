import {
  cleanNftText,
  isAllowedMediaUri,
  NFT_DESCRIPTION_MAX,
  NFT_METADATA_MAX_BYTES,
  NFT_NAME_MAX,
  NFT_NAME_MIN,
} from "./nft-media-rules.ts";

export const TOKEN_SYMBOL_MIN = 1;
export const TOKEN_SYMBOL_MAX = 32;

export type TokenMetadataErrorCode =
  | "invalid_name"
  | "invalid_symbol"
  | "invalid_description"
  | "invalid_image_uri"
  | "metadata_too_large";

export class TokenMetadataError extends Error {
  readonly code: TokenMetadataErrorCode;
  constructor(code: TokenMetadataErrorCode) {
    super(code);
    this.code = code;
    this.name = "TokenMetadataError";
  }
}

export type TokenMetadata = {
  name: string;
  symbol: string;
  description?: string;
  image?: string;
};

/** ERC-20 metadata JSON. A logo is optional; when present it must be permanent. */
export function buildTokenMetadata(input: {
  name: unknown;
  symbol: unknown;
  description?: unknown;
  image?: unknown;
}): TokenMetadata {
  const name = cleanNftText(typeof input.name === "string" ? input.name : "").trim();
  if (name.length < NFT_NAME_MIN || name.length > NFT_NAME_MAX) throw new TokenMetadataError("invalid_name");

  const symbol = cleanNftText(typeof input.symbol === "string" ? input.symbol : "").trim().toUpperCase();
  if (symbol.length < TOKEN_SYMBOL_MIN || symbol.length > TOKEN_SYMBOL_MAX || /\s/.test(symbol)) {
    throw new TokenMetadataError("invalid_symbol");
  }

  const description = cleanNftText(typeof input.description === "string" ? input.description : "").trim();
  if (description.length > NFT_DESCRIPTION_MAX) throw new TokenMetadataError("invalid_description");

  const hasImage = typeof input.image === "string" && input.image.trim().length > 0;
  if (hasImage && !isAllowedMediaUri((input.image as string).trim())) throw new TokenMetadataError("invalid_image_uri");
  const image = hasImage ? (input.image as string).trim() : undefined;

  const metadata: TokenMetadata = {
    name,
    symbol,
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
  };
  if (new TextEncoder().encode(JSON.stringify(metadata)).length > NFT_METADATA_MAX_BYTES) {
    throw new TokenMetadataError("metadata_too_large");
  }
  return metadata;
}
