/**
 * Pure validation and signed-message rules for optional ERC-20 token icons.
 *
 * The upload route accepts PNG/JPEG/WEBP up to 1 MB; the browser additionally checks the image
 * dimensions so a 1×1 pixel cannot be used as a token icon. Kept dependency-free for node tests.
 */

export const TOKEN_ICON_MAX_BYTES = 1024 * 1024;
export const TOKEN_ICON_MIN_PX = 64;
export const TOKEN_ICON_ACCEPT = "image/png,image/jpeg,image/webp";
export const TOKEN_ICON_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"] as const;

export type TokenIconError = "type" | "size" | "dimensions" | "read";

export type TokenIconMeta = {
  type: string;
  size: number;
  width?: number | null;
  height?: number | null;
};

export type TokenIconValidation = { ok: true } | { ok: false; error: TokenIconError };

function isAllowedType(type: string): boolean {
  const normalized = type.trim().toLowerCase();
  return (TOKEN_ICON_MIME_TYPES as readonly string[]).includes(normalized);
}

/** Validate declared MIME type + byte size, and dimensions when the caller has read them. */
export function validateTokenIcon(meta: TokenIconMeta): TokenIconValidation {
  if (!isAllowedType(meta.type)) return { ok: false, error: "type" };
  if (!Number.isFinite(meta.size) || meta.size <= 0 || meta.size > TOKEN_ICON_MAX_BYTES) {
    return { ok: false, error: "size" };
  }
  if (meta.width !== undefined && meta.height !== undefined) {
    const width = Number(meta.width);
    const height = Number(meta.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < TOKEN_ICON_MIN_PX || height < TOKEN_ICON_MIN_PX) {
      return { ok: false, error: "dimensions" };
    }
  }
  return { ok: true };
}

/** Exact EIP-191 message the creator signs to override a token icon off-chain. */
export function tokenIconMessage(token: string, imageUri: string, issuedAt: string): string {
  return `PEOPLE token icon update\nToken: ${token}\nImage: ${imageUri}\nIssued: ${issuedAt}`;
}

/** Permanent-looking image address accepted by the token-icon update route. */
export function isTokenIconUri(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const uri = value.trim();
  if (!uri) return false;
  if (/^ipfs:\/\/[^\s]+$/i.test(uri)) return true;
  return /^https:\/\/[^\s]+$/i.test(uri);
}
