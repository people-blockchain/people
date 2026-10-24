/**
 * Single validator for same-origin in-app paths that come from user-controlled input
 * (`callbackUrl`, stored sign-in `returnTo`, link targets).
 *
 * The WHATWG URL parser silently strips tab / CR / LF and treats `\` as `/`, so a value such
 * as `/\t/evil.example` or `/\evil.example` looks like a plain path to a prefix check but is
 * resolved by the browser as a protocol-relative cross-origin URL. Reject those characters up
 * front, then confirm with a real parse that the origin did not change.
 */

const PLACEHOLDER_ORIGIN = "https://x.invalid";
const CONTROL_OR_BACKSLASH = new RegExp("[\\u0000-\\u001F\\u007F\\\\]");

/** True when the value contains any C0 control character, DEL or a backslash. */
export function hasControlOrBackslash(value: string): boolean {
  return CONTROL_OR_BACKSLASH.test(value);
}

/**
 * Returns the canonical `pathname + search + hash` for a safe in-app path, or `null`.
 * A safe path starts with exactly one `/` (not `//`), has no control characters or
 * backslashes, and keeps the placeholder origin when parsed.
 */
export function sanitizeInAppPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (hasControlOrBackslash(value)) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  try {
    const url = new URL(value, PLACEHOLDER_ORIGIN);
    if (url.origin !== PLACEHOLDER_ORIGIN) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

export function isSafeInAppPath(value: unknown): value is string {
  return sanitizeInAppPath(value) !== null;
}
