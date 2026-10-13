import type { Language } from "./preferences";
import warmEn from "./locales/surfaces/home-warm-en.json" with { type: "json" };
import warmRu from "./locales/surfaces/home-warm-ru.json" with { type: "json" };
import warmEs from "./locales/surfaces/home-warm-es.json" with { type: "json" };
import warmPt from "./locales/surfaces/home-warm-pt.json" with { type: "json" };
import warmFr from "./locales/surfaces/home-warm-fr.json" with { type: "json" };
import warmDe from "./locales/surfaces/home-warm-de.json" with { type: "json" };
import warmIt from "./locales/surfaces/home-warm-it.json" with { type: "json" };
import warmTr from "./locales/surfaces/home-warm-tr.json" with { type: "json" };
import warmVi from "./locales/surfaces/home-warm-vi.json" with { type: "json" };
import warmId from "./locales/surfaces/home-warm-id.json" with { type: "json" };
import warmZh from "./locales/surfaces/home-warm-zh.json" with { type: "json" };
import warmAr from "./locales/surfaces/home-warm-ar.json" with { type: "json" };

export type HomeWarmCopy = typeof warmEn;

/**
 * Recursively fills in any missing/empty key from `locale` with the English
 * value, so a partially-translated surface never renders `undefined` or a
 * blank string. Arrays merge element-by-element when lengths match (same
 * shape as `en`, e.g. the `stages`/`cards`/`tiles` lists); when a locale
 * legitimately wraps a headline into a different number of lines (e.g.
 * `headlineMainLines`), its own array is used as-is instead of being forced
 * to English's line count.
 */
function mergeWithEnglishFallback<T>(en: T, locale: unknown): T {
  if (Array.isArray(en)) {
    if (!Array.isArray(locale)) return en;
    if (locale.length !== en.length) return locale as unknown as T;
    return en.map((item, i) => mergeWithEnglishFallback(item, locale[i])) as unknown as T;
  }
  if (en && typeof en === "object") {
    if (!locale || typeof locale !== "object" || Array.isArray(locale)) return en;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(en as Record<string, unknown>)) {
      result[key] = mergeWithEnglishFallback(
        (en as Record<string, unknown>)[key],
        (locale as Record<string, unknown>)[key],
      );
    }
    return result as T;
  }
  return typeof locale === "string" && locale.length > 0 ? (locale as unknown as T) : en;
}

const RAW_BY_LANG: Record<Language, unknown> = {
  en: warmEn,
  ru: warmRu,
  es: warmEs,
  pt: warmPt,
  fr: warmFr,
  de: warmDe,
  it: warmIt,
  tr: warmTr,
  vi: warmVi,
  id: warmId,
  zh: warmZh,
  ar: warmAr,
};

const MERGED_BY_LANG = new Map<Language, HomeWarmCopy>();

/** Homepage sections in the /founders visual language, merged with English fallback per key. */
export function homeWarmCopy(lang: Language): HomeWarmCopy {
  if (lang === "en") return warmEn;
  const cached = MERGED_BY_LANG.get(lang);
  if (cached) return cached;
  const merged = mergeWithEnglishFallback(warmEn, RAW_BY_LANG[lang] ?? {});
  MERGED_BY_LANG.set(lang, merged);
  return merged;
}
