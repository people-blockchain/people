import { displayTokenImageUrl } from "@/lib/ipfs";

const METADATA_JSON = /\/metadata\.json(?:[?#].*)?$/i;

/**
 * Gateway URL for a token logo at every viewport. A metadata JSON document is not an image.
 * Raw `ipfs://` values are rewritten through the same gateway the catalog uses.
 */
export function tokenPageImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || METADATA_JSON.test(trimmed)) return null;
  return displayTokenImageUrl(trimmed);
}

/** First displayable image from the fields the token page already has. */
export function tokenPageImageSrc(creationImage: unknown, imageUri: unknown): string | null {
  return tokenPageImageUrl(creationImage) ?? tokenPageImageUrl(imageUri);
}
