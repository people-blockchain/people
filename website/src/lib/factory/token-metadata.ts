/**
 * Token metadata JSON for the factory `createToken(..., metadataURI, ...)` argument.
 *
 * The create flow always pins `{name, symbol, description, image?}` BEFORE the transaction is sent
 * and passes the resulting `ipfs://<CID>/metadata.json` on-chain. Everything here is pure (the pin
 * and create steps are injected), so it runs in the browser, the route handler and tests.
 */
import { cleanNftText, isAllowedMediaUri, parseIpfsMediaUri } from "../nft-media-rules.ts";

export const TOKEN_NAME_MAX = 200;
export const TOKEN_SYMBOL_MAX = 64;
export const TOKEN_DESCRIPTION_MAX = 2000;
export const TOKEN_METADATA_FILENAME = "metadata.json";
export const TOKEN_METADATA_PIN_LOCALE_KEY = "tokenMetadataPinFailed";

export type TokenMetadataInput = {
  name: string;
  symbol: string;
  description?: string;
  /** Permanent `ipfs://` or `https://` icon address; omit when the token has no logo. */
  image?: string | null;
};

export type TokenMetadata = {
  name: string;
  symbol: string;
  description: string;
  image?: string;
};

export type TokenMetadataErrorCode =
  | "invalid_name"
  | "invalid_symbol"
  | "invalid_description"
  | "invalid_image_uri";

export class TokenMetadataError extends Error {
  readonly code: TokenMetadataErrorCode;
  constructor(code: TokenMetadataErrorCode) {
    super(code);
    this.code = code;
    this.name = "TokenMetadataError";
  }
}

function text(value: unknown, code: TokenMetadataErrorCode): string {
  if (typeof value !== "string") throw new TokenMetadataError(code);
  return cleanNftText(value).trim();
}

/** Builds the metadata JSON. The `image` key is omitted entirely when there is no logo. */
export function buildTokenMetadata(input: TokenMetadataInput): TokenMetadata {
  const name = text(input?.name, "invalid_name");
  if (name.length < 1 || name.length > TOKEN_NAME_MAX) throw new TokenMetadataError("invalid_name");
  const symbol = text(input.symbol, "invalid_symbol");
  if (symbol.length < 1 || symbol.length > TOKEN_SYMBOL_MAX) throw new TokenMetadataError("invalid_symbol");
  const description = input.description === undefined ? "" : text(input.description, "invalid_description");
  if (description.length > TOKEN_DESCRIPTION_MAX) throw new TokenMetadataError("invalid_description");
  const hasImage = input.image !== undefined && input.image !== null && input.image !== "";
  if (hasImage && !isAllowedMediaUri(input.image)) throw new TokenMetadataError("invalid_image_uri");
  return {
    name,
    symbol,
    description,
    ...(hasImage ? { image: input.image as string } : {}),
  };
}

/** Raised when the metadata could not be pinned; the create transaction must not be sent. */
export class TokenMetadataPinError extends Error {
  readonly code: string;
  readonly localeKey = TOKEN_METADATA_PIN_LOCALE_KEY;
  constructor(code: string, options?: { cause?: unknown }) {
    super(code, options);
    this.code = code;
    this.name = "TokenMetadataPinError";
  }
}

export type TokenMetadataPin = (json: TokenMetadata) => Promise<{ uri: string } | string>;

/** True for exactly `ipfs://<cid>/metadata.json`. */
export function isTokenMetadataUri(uri: unknown): uri is string {
  if (typeof uri !== "string") return false;
  const parsed = parseIpfsMediaUri(uri);
  return parsed !== null && parsed.path === TOKEN_METADATA_FILENAME;
}

/** Pins the JSON through the injected `pin` and returns the validated `ipfs://<CID>/metadata.json`. */
export async function pinTokenMetadataForCreate(input: TokenMetadataInput, pin: TokenMetadataPin): Promise<string> {
  let json: TokenMetadata;
  try {
    json = buildTokenMetadata(input);
  } catch (err) {
    throw new TokenMetadataPinError(err instanceof TokenMetadataError ? err.code : "invalid_metadata", { cause: err });
  }
  let uri: string;
  try {
    const pinned = await pin(json);
    uri = typeof pinned === "string" ? pinned : pinned?.uri;
  } catch (err) {
    throw new TokenMetadataPinError("pin_failed", { cause: err });
  }
  if (!isTokenMetadataUri(uri)) throw new TokenMetadataPinError("invalid_pin_uri");
  return uri;
}

/** Pins first, then calls `create(metadataURI)`; `create` never runs when pinning fails. */
export async function createTokenWithMetadata<T>(args: {
  input: TokenMetadataInput;
  pin: TokenMetadataPin;
  create: (metadataURI: string) => Promise<T>;
}): Promise<{ metadataURI: string; result: T }> {
  const metadataURI = await pinTokenMetadataForCreate(args.input, args.pin);
  const result = await args.create(metadataURI);
  return { metadataURI, result };
}
