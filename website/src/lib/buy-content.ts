/**
 * Copy for `/buy` (the PPL sale page).
 *
 * EN is primary; all twelve locales have full `buy-<lang>.json` surfaces.
 * Translation status is tracked in `website/docs/ppl-sale-i18n-status.md`.
 */

import type { Language } from "./preferences";
import buyEn from "./locales/surfaces/buy-en.json" with { type: "json" };
import buyRu from "./locales/surfaces/buy-ru.json" with { type: "json" };
import buyEs from "./locales/surfaces/buy-es.json" with { type: "json" };
import buyPt from "./locales/surfaces/buy-pt.json" with { type: "json" };
import buyFr from "./locales/surfaces/buy-fr.json" with { type: "json" };
import buyDe from "./locales/surfaces/buy-de.json" with { type: "json" };
import buyIt from "./locales/surfaces/buy-it.json" with { type: "json" };
import buyTr from "./locales/surfaces/buy-tr.json" with { type: "json" };
import buyVi from "./locales/surfaces/buy-vi.json" with { type: "json" };
import buyId from "./locales/surfaces/buy-id.json" with { type: "json" };
import buyZh from "./locales/surfaces/buy-zh.json" with { type: "json" };
import buyAr from "./locales/surfaces/buy-ar.json" with { type: "json" };

export type BuyCopy = typeof buyEn;

function withEnFallback(partial: Partial<BuyCopy>): BuyCopy {
  return { ...buyEn, ...partial };
}

const rawByLanguage: Record<Language, Partial<BuyCopy>> = {
  en: buyEn,
  ru: buyRu as Partial<BuyCopy>,
  es: buyEs as Partial<BuyCopy>,
  pt: buyPt as Partial<BuyCopy>,
  fr: buyFr as Partial<BuyCopy>,
  de: buyDe as Partial<BuyCopy>,
  it: buyIt as Partial<BuyCopy>,
  tr: buyTr as Partial<BuyCopy>,
  vi: buyVi as Partial<BuyCopy>,
  id: buyId as Partial<BuyCopy>,
  zh: buyZh as Partial<BuyCopy>,
  ar: buyAr as Partial<BuyCopy>,
};

/** Locales still rendering EN on `/buy`. Keep in sync with the doc above. */
export const BUY_UNTRANSLATED_LOCALES = Object.entries(rawByLanguage)
  .filter(([, copy]) => Object.keys(copy).length === 0)
  .map(([lang]) => lang as Language);

export const buyCopy: Record<Language, BuyCopy> = Object.fromEntries(
  Object.entries(rawByLanguage).map(([lang, copy]) => [lang, withEnFallback(copy)]),
) as Record<Language, BuyCopy>;
