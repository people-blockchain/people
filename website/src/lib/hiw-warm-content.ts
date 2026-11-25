import type { Language } from "./preferences";
import { withSocialLoginCopy } from "./social-login";
import { withCloudWalletCopy } from "./cloud-wallet";
import warmAr from "./locales/surfaces/hiw-warm-ar.json" with { type: "json" };
import warmDe from "./locales/surfaces/hiw-warm-de.json" with { type: "json" };
import warmEn from "./locales/surfaces/hiw-warm-en.json" with { type: "json" };
import warmEs from "./locales/surfaces/hiw-warm-es.json" with { type: "json" };
import warmFr from "./locales/surfaces/hiw-warm-fr.json" with { type: "json" };
import warmId from "./locales/surfaces/hiw-warm-id.json" with { type: "json" };
import warmIt from "./locales/surfaces/hiw-warm-it.json" with { type: "json" };
import warmPt from "./locales/surfaces/hiw-warm-pt.json" with { type: "json" };
import warmRu from "./locales/surfaces/hiw-warm-ru.json" with { type: "json" };
import warmTr from "./locales/surfaces/hiw-warm-tr.json" with { type: "json" };
import warmVi from "./locales/surfaces/hiw-warm-vi.json" with { type: "json" };
import warmZh from "./locales/surfaces/hiw-warm-zh.json" with { type: "json" };

export type HiwWarmCopy = typeof warmEn;

const hiwWarmRaw: Record<Language, HiwWarmCopy> = {
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

/** /how-it-works in the /founders visual language. */
export function hiwWarmCopy(lang: Language): HiwWarmCopy {
  return withCloudWalletCopy(withSocialLoginCopy(hiwWarmRaw[lang]));
}