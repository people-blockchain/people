import type { Language } from "./preferences";
import { withSocialLoginCopy } from "./social-login";
import { withCloudWalletCopy } from "./cloud-wallet";
import warmEn from "./locales/surfaces/hiw-warm-en.json" with { type: "json" };
import warmRu from "./locales/surfaces/hiw-warm-ru.json" with { type: "json" };

export type HiwWarmCopy = typeof warmEn;

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

/** /how-it-works in the /founders visual language. RU partial; other languages use English. */
export function hiwWarmCopy(lang: Language): HiwWarmCopy {
  const base = lang === "ru" ? mergeWithEnglishFallback(warmEn, warmRu) : warmEn;
  return withCloudWalletCopy(withSocialLoginCopy(base));
}