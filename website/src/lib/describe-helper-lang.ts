/**
 * Locales allowed in describe-helper system prompts.
 * `ru` exists on the site but is never forwarded to the model.
 */
export const DESCRIBE_HELPER_LANGS = [
  "en",
  "ar",
  "de",
  "es",
  "fr",
  "id",
  "it",
  "pt",
  "tr",
  "vi",
  "zh",
] as const;

export type DescribeHelperLang = (typeof DESCRIBE_HELPER_LANGS)[number];

const ALLOWED = new Set<string>(DESCRIBE_HELPER_LANGS);

/** Default `en`. Unknown, empty, or `ru` become `en` before any prompt is built. */
export function allowlistDescribeLang(raw: unknown): DescribeHelperLang {
  if (typeof raw !== "string") return "en";
  const lang = raw.trim().toLowerCase().slice(0, 8);
  if (ALLOWED.has(lang)) return lang as DescribeHelperLang;
  return "en";
}

export function sanitizeDescribeText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
}
