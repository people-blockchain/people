import type { Language } from "./preferences";
import { withSocialLoginCopy } from "./social-login";
import { withCloudWalletCopy } from "./cloud-wallet";
import promoAr from "./locales/surfaces/founders-promo-ar.json" with { type: "json" };
import promoDe from "./locales/surfaces/founders-promo-de.json" with { type: "json" };
import promoEn from "./locales/surfaces/founders-promo-en.json" with { type: "json" };
import promoEs from "./locales/surfaces/founders-promo-es.json" with { type: "json" };
import promoFr from "./locales/surfaces/founders-promo-fr.json" with { type: "json" };
import promoId from "./locales/surfaces/founders-promo-id.json" with { type: "json" };
import promoIt from "./locales/surfaces/founders-promo-it.json" with { type: "json" };
import promoPt from "./locales/surfaces/founders-promo-pt.json" with { type: "json" };
import promoRu from "./locales/surfaces/founders-promo-ru.json" with { type: "json" };
import promoTr from "./locales/surfaces/founders-promo-tr.json" with { type: "json" };
import promoVi from "./locales/surfaces/founders-promo-vi.json" with { type: "json" };
import promoZh from "./locales/surfaces/founders-promo-zh.json" with { type: "json" };

export type FoundersPromoCopy = typeof promoEn;

const foundersPromoRaw: Record<Language, FoundersPromoCopy> = {
  en: promoEn,
  ru: promoRu,
  es: promoEs,
  pt: promoPt,
  fr: promoFr,
  de: promoDe,
  it: promoIt,
  tr: promoTr,
  vi: promoVi,
  id: promoId,
  zh: promoZh,
  ar: promoAr,
};

export const foundersPromo: Record<Language, FoundersPromoCopy> = Object.fromEntries(
  Object.entries(foundersPromoRaw).map(([lang, copy]) => [lang, withCloudWalletCopy(withSocialLoginCopy(copy))]),
) as Record<Language, FoundersPromoCopy>;

/** /founders promo card and claim-flow strings. */
export function foundersPromoCopy(lang: Language): FoundersPromoCopy {
  return foundersPromo[lang];
}