/**
 * Character caps for merchant-authored strings (LAV-M6).
 *
 * `displayName` is rendered on the public venue page and `title` in the venue/program
 * listings, so an unbounded value is a page-weight and layout-abuse vector. The caps are
 * enforced at the route boundary *and* again in the service layer (defense in depth).
 */
export const MAX_MERCHANT_DISPLAY_NAME = 80;
export const MAX_PROGRAM_TITLE = 120;

/** Returns the route error code when a display name is out of range, else null. */
export function displayNameError(value: string): "invalid_name" | null {
  const length = value.trim().length;
  if (length < 2 || length > MAX_MERCHANT_DISPLAY_NAME) return "invalid_name";
  return null;
}

/** Returns the route error code when a program title is out of range, else null. */
export function programTitleError(value: string): "invalid_title" | null {
  const length = value.trim().length;
  if (length < 2 || length > MAX_PROGRAM_TITLE) return "invalid_title";
  return null;
}
