import type { Language } from "./preferences";
import warmEn from "./locales/surfaces/hiw-warm-en.json" with { type: "json" };
import warmRu from "./locales/surfaces/hiw-warm-ru.json" with { type: "json" };

export type HiwWarmCopy = typeof warmEn;

/** /how-it-works in the /founders visual language. RU and EN are maintained; other languages fall back to English. */
export function hiwWarmCopy(lang: Language): HiwWarmCopy {
  return lang === "ru" ? warmRu : warmEn;
}
