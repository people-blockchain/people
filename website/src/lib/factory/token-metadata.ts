/**
 * Token metadata JSON for the factory `createToken(..., metadataURI, ...)` argument.
 *
 * The create flow pins `{name, symbol, description, image?}` only after the duplicate check and the
 * transaction simulation both pass, then passes `ipfs://<CID>/metadata.json` on-chain. Everything
 * here is pure (the pin and create steps are injected), so it runs in the browser, the route handler
 * and tests.
 */
import { cleanNftText, isAllowedMediaUri, parseIpfsMediaUri } from "../nft-media-rules.ts";

export const TOKEN_NAME_MAX = 200;
export const TOKEN_SYMBOL_MAX = 64;
export const TOKEN_DESCRIPTION_MAX = 2000;
export const TOKEN_METADATA_FILENAME = "metadata.json";
export const TOKEN_METADATA_PIN_LOCALE_KEY = "tokenMetadataPinFailed";
/**
 * Stand-in `metadataURI` for simulating `createToken` before the JSON is pinned.
 * The factory only stores the string, so the real pin can wait until the simulation passes.
 */
export const TOKEN_CREATE_PREFLIGHT_METADATA_URI =
  "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/metadata.json";

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
  const provided = input.description === undefined ? "" : text(input.description, "invalid_description");
  if (provided.length > TOKEN_DESCRIPTION_MAX) throw new TokenMetadataError("invalid_description");
  const description = provided.length > 0 ? provided : `${name} (${symbol}) token on PEOPLE`;
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

export class TokenCreateGateError extends Error {
  readonly reason: "duplicate" | "preflight";
  constructor(reason: "duplicate" | "preflight") {
    super(reason);
    this.name = "TokenCreateGateError";
    this.reason = reason;
  }
}

export type TokenCreatePreflightResult = void | boolean | { ok: boolean };

function preflightFailed(result: TokenCreatePreflightResult): boolean {
  if (result === false) return true;
  return typeof result === "object" && result !== null && result.ok === false;
}

/**
 * Pins only after both gates pass. An unconfirmed duplicate skips `preflight` and `pin`.
 * A failing or throwing `preflight` skips `pin`. On success `pin` runs once.
 */
export async function pinTokenMetadataAfterChecks(
  input: TokenMetadataInput,
  pin: TokenMetadataPin,
  checks: {
    duplicates: readonly unknown[];
    confirmed: boolean;
    preflight: () => Promise<TokenCreatePreflightResult>;
  },
): Promise<string> {
  if (checks.duplicates.length > 0 && !checks.confirmed) {
    throw new TokenCreateGateError("duplicate");
  }
  const result = await checks.preflight();
  if (preflightFailed(result)) throw new TokenCreateGateError("preflight");
  return pinTokenMetadataForCreate(input, pin);
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
