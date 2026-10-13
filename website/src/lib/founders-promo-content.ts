import type { Language } from "./preferences";
import promoEn from "./locales/surfaces/founders-promo-en.json" with { type: "json" };
import promoRu from "./locales/surfaces/founders-promo-ru.json" with { type: "json" };

export type FoundersPromoCopy = typeof promoEn;

/** /founders promo page. RU and EN are maintained; other languages fall back to English. */
export function foundersPromoCopy(lang: Language): FoundersPromoCopy {
  return lang === "ru" ? promoRu : promoEn;
}
