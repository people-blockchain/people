import { resolveAssetImageUrl } from "@/lib/asset-image-src";

const METADATA_JSON = /\/metadata\.json(?:[?#].*)?$/i;

/** Same-origin image URL. A metadata JSON document is not an `<img>` src. */
export function tokenPageImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || METADATA_JSON.test(trimmed)) return null;
  return resolveAssetImageUrl(trimmed);
}

/** First displayable image from the fields the token page already has. */
export function tokenPageImageSrc(creationImage: unknown, imageUri: unknown): string | null {
  return tokenPageImageUrl(creationImage) ?? tokenPageImageUrl(imageUri);
}

/** URL of a metadata JSON document. Not an `<img>` src; the client reads `image` from it. */
export function metadataDocumentUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !METADATA_JSON.test(trimmed)) return null;
  return resolveAssetImageUrl(trimmed);
}
