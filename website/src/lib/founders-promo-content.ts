import type { Language } from "./preferences";
import { withSocialLoginCopy } from "./social-login";
import { withCloudWalletCopy } from "./cloud-wallet";
import promoEn from "./locales/surfaces/founders-promo-en.json" with { type: "json" };

export type FoundersPromoCopy = typeof promoEn;

/**
 * /founders promo card and claim-flow strings.
 * Every locale, including `ru`, is served in English so public PEOPLE pages
 * never render Russian. `founders-promo-ru.json` stays on disk for fixtures.
 */
export function foundersPromoCopy(lang: Language): FoundersPromoCopy {
  const copy = promoEn;
  switch (lang) {
    case "en":
    case "es":
    case "pt":
    case "fr":
    case "de":
    case "it":
    case "tr":
    case "vi":
    case "id":
    case "zh":
    case "ar":
    case "ru":
      return withCloudWalletCopy(withSocialLoginCopy(copy));
  }
}
