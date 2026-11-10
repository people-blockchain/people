import type { Language } from "./preferences";

/**
 * Locales a visitor can be served on the public site. `ru` is deliberately absent: public PEOPLE
 * materials are not offered in Russian (owner rule 2026-11-01), so a Russian browser, an
 * `Accept-Language: ru` header or an old `people_lang=ru` cookie all fall back to English.
 */
export const PUBLIC_LANGUAGE_CODES = ["en", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"] as const;

const SUPPORTED: ReadonlySet<string> = new Set(PUBLIC_LANGUAGE_CODES);

/** Retired public locales: old `/ru/buy` links land on the English page instead of a 404. */
const RETIRED_BUY_LOCALES: Record<string, Language> = { ru: "en" };

/** Legacy / alternate primary subtags that map onto a shipped locale. */
const ALIASES: Record<string, Language> = { in: "id" };

/** Map one BCP-47 tag ("pt-BR", "zh-Hans-CN", "in") to a shipped locale, or null. */
export function matchLanguageTag(tag: string): Language | null {
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0] ?? "";
  if (SUPPORTED.has(primary)) return primary as Language;
  return ALIASES[primary] ?? null;
}

/** First supported locale in an ordered preference list (navigator.languages). */
export function detectLanguage(preferred: readonly string[] | null | undefined): Language | null {
  for (const tag of preferred ?? []) {
    const hit = matchLanguageTag(tag);
    if (hit) return hit;
  }
  return null;
}

/** Parse an Accept-Language header into tags ordered by q-value (stable for ties). */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((e) => e.tag && e.tag !== "*" && e.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map((e) => e.tag);
}

/** Server-side: pick a locale for crawlers/visitors from Accept-Language, default EN. */
export function languageFromAcceptLanguage(header: string | null | undefined): Language {
  return detectLanguage(parseAcceptLanguage(header)) ?? "en";
}

/** Validate a locale cookie value against the shipped locale list. */
export function languageFromCookie(value: string | null | undefined): Language | null {
  return value && SUPPORTED.has(value) ? (value as Language) : null;
}

/** Server-side: the user's explicit locale cookie wins, else fall back to Accept-Language. */
export function languageFromRequest(
  cookieValue: string | null | undefined,
  acceptLanguageHeader: string | null | undefined,
): Language {
  return languageFromCookie(cookieValue) ?? languageFromAcceptLanguage(acceptLanguageHeader);
}

/** `/tr/buy` (or `/tr/buy/`) → "tr"; retired `/ru/buy` → "en"; any other path, or an unknown locale prefix → null. */
export function localeFromBuyPath(pathname: string): Language | null {
  const match = /^\/([a-z]{2})\/buy\/?$/.exec(pathname);
  if (!match) return null;
  return languageFromCookie(match[1]) ?? RETIRED_BUY_LOCALES[match[1]] ?? null;
}
