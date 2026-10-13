/**
 * WEB-M2: server-side length caps for user-authored Discover content.
 *
 * Everything a project author writes into the DB is handed to every feed/card visitor, so
 * unbounded text is both a distribution amplifier and a way to bloat the feed response. These
 * caps are far above any real submission (the seed copy is well under them) and exist only to
 * reject abuse early with a 400 instead of storing it.
 */
export const DISCOVER_FIELD_LIMITS = {
  title: 160,
  idea: 4000,
  audience: 2000,
  whyToken: 4000,
  tokenAssetId: 128,
  /** Any single URL field (token link, product URL, video). */
  url: 2048,
  screenshotUri: 2048,
  screenshotCount: 6,
} as const;

export type ProjectFieldInput = {
  title: string;
  idea: string;
  audience: string;
  whyToken: string;
  tokenAssetId: string;
  tokenLink: string;
  productUrl?: string | null;
  videoUri?: string | null;
  /** Raw (pre-serialization) screenshot URLs, when available. */
  screenshotUris?: readonly string[];
};

/**
 * Returns the `invalid_<field>` code of the first over-long text/url field, or null. Used by the
 * service layer, which only has the already-serialized screenshot blob.
 */
export function firstProjectTextFieldError(input: Omit<ProjectFieldInput, "screenshotUris">): string | null {
  const limits = DISCOVER_FIELD_LIMITS;
  if (input.title.length > limits.title) return "invalid_title";
  if (input.idea.length > limits.idea) return "invalid_idea";
  if (input.audience.length > limits.audience) return "invalid_audience";
  if (input.whyToken.length > limits.whyToken) return "invalid_why_token";
  if (input.tokenAssetId.length > limits.tokenAssetId) return "invalid_token_asset";
  if (input.tokenLink.length > limits.url) return "invalid_token_link";
  if ((input.productUrl?.length ?? 0) > limits.url) return "invalid_product_url";
  if ((input.videoUri?.length ?? 0) > limits.url) return "invalid_video_uri";
  return null;
}

/**
 * Returns the `invalid_<field>` code of the first offending field, or null when everything fits.
 * Callers map the code straight to a 400 so the author gets the field, not a generic error.
 */
export function firstProjectFieldError(input: ProjectFieldInput): string | null {
  const textCode = firstProjectTextFieldError(input);
  if (textCode) return textCode;
  const screenshots = input.screenshotUris ?? [];
  if (screenshots.length > DISCOVER_FIELD_LIMITS.screenshotCount) return "invalid_screenshots";
  if (screenshots.some((uri) => uri.length > DISCOVER_FIELD_LIMITS.screenshotUri)) {
    return "invalid_screenshots";
  }
  return null;
}

/** Throwing form used by the service layer so no caller can bypass the caps. */
export function assertProjectFieldLimits(
  input: Omit<ProjectFieldInput, "screenshotUris">,
): void {
  const code = firstProjectTextFieldError(input);
  if (code) throw new Error(code);
}
