import type { Language } from "./preferences";
import promoEn from "./locales/surfaces/founders-promo-en.json" with { type: "json" };
import promoRu from "./locales/surfaces/founders-promo-ru.json" with { type: "json" };
import cardAr from "./locales/surfaces/founders-card-ar.json" with { type: "json" };
import cardDe from "./locales/surfaces/founders-card-de.json" with { type: "json" };
import cardEs from "./locales/surfaces/founders-card-es.json" with { type: "json" };
import cardFr from "./locales/surfaces/founders-card-fr.json" with { type: "json" };
import cardId from "./locales/surfaces/founders-card-id.json" with { type: "json" };
import cardIt from "./locales/surfaces/founders-card-it.json" with { type: "json" };
import cardPt from "./locales/surfaces/founders-card-pt.json" with { type: "json" };
import cardTr from "./locales/surfaces/founders-card-tr.json" with { type: "json" };
import cardVi from "./locales/surfaces/founders-card-vi.json" with { type: "json" };
import cardZh from "./locales/surfaces/founders-card-zh.json" with { type: "json" };

export type FoundersPromoCopy = typeof promoEn;

/** Founder card strings translated for languages without a full promo translation. */
export const CARD_COPY_KEYS = [
  "eyebrow",
  "cardFounder",
  "cardNumberPlaceholder",
  "cardNetwork",
  "cardFlipHint",
  "cardBackTitle",
  "cardCountry",
  "cardRank",
  "cardPoints",
  "cardBackLines",
] as const;

type CardCopy = Pick<FoundersPromoCopy, (typeof CARD_COPY_KEYS)[number]>;

const cardOverrides: Record<Exclude<Language, "en" | "ru">, CardCopy> = {
  ar: cardAr,
  de: cardDe,
  es: cardEs,
  fr: cardFr,
  id: cardId,
  it: cardIt,
  pt: cardPt,
  tr: cardTr,
  vi: cardVi,
  zh: cardZh,
};

const promoByLanguage: Record<Language, FoundersPromoCopy> = {
  en: promoEn,
  ru: promoRu,
  ar: { ...promoEn, ...cardOverrides.ar },
  de: { ...promoEn, ...cardOverrides.de },
  es: { ...promoEn, ...cardOverrides.es },
  fr: { ...promoEn, ...cardOverrides.fr },
  id: { ...promoEn, ...cardOverrides.id },
  it: { ...promoEn, ...cardOverrides.it },
  pt: { ...promoEn, ...cardOverrides.pt },
  tr: { ...promoEn, ...cardOverrides.tr },
  vi: { ...promoEn, ...cardOverrides.vi },
  zh: { ...promoEn, ...cardOverrides.zh },
};

/** /founders promo page. RU and EN are maintained in full; other languages translate the founder card and fall back to English elsewhere. */
export function foundersPromoCopy(lang: Language): FoundersPromoCopy {
  return promoByLanguage[lang] ?? promoEn;
}
