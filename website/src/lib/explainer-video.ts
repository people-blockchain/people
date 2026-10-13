import type { Language } from "./preferences";

/**
 * Site locale → explainer asset id (`/public/video/explainer-{id}.mp4` + `.jpg`).
 * Omit a language to fall back to English.
 */
const LOCALE_TO_EXPLAINER_ASSET: Partial<Record<Language, string>> = {
  ru: "ru",
  es: "es",
  pt: "pt",
  id: "id",
  vi: "vi",
  zh: "zh",
  de: "de",
  ar: "ar",
  fr: "fr",
  it: "it",
  tr: "tr",
};

export function getExplainerVideoSources(lang: Language) {
  const assetId = LOCALE_TO_EXPLAINER_ASSET[lang] ?? "en";
  return {
    mp4: `/video/explainer-${assetId}.mp4`,
    poster: `/video/explainer-${assetId}.jpg`,
  };
}
