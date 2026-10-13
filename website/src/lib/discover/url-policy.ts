/**
 * Server-side URL policy for user-supplied Discover links. These values are rendered as
 * link targets, so protocol-relative (`//evil.example`) and backslash variants (which
 * browsers treat as `/`) must never be stored — they would open a cross-origin redirect.
 */

/** In-app absolute path, or an absolute http(s) URL. Everything else is rejected. */
export function isSafeLinkTarget(value: string): boolean {
  if (!value) return false;
  if (value.startsWith("//") || value.includes("\\")) return false;
  if (value.startsWith("/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Video source: an absolute http(s) URL or an `ipfs://` URI. */
export function isSafeVideoUri(value: string): boolean {
  if (!value) return false;
  if (value.includes("\\")) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "ipfs:";
  } catch {
    return false;
  }
}
