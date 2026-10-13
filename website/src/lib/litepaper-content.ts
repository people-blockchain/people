import type { Language } from "./preferences";
import litepaperAr from "./locales/surfaces/litepaper-ar.json" with { type: "json" };
import litepaperDe from "./locales/surfaces/litepaper-de.json" with { type: "json" };
import litepaperEn from "./locales/surfaces/litepaper-en.json" with { type: "json" };
import litepaperEs from "./locales/surfaces/litepaper-es.json" with { type: "json" };
import litepaperFr from "./locales/surfaces/litepaper-fr.json" with { type: "json" };
import litepaperId from "./locales/surfaces/litepaper-id.json" with { type: "json" };
import litepaperIt from "./locales/surfaces/litepaper-it.json" with { type: "json" };
import litepaperPt from "./locales/surfaces/litepaper-pt.json" with { type: "json" };
import litepaperRu from "./locales/surfaces/litepaper-ru.json" with { type: "json" };
import litepaperTr from "./locales/surfaces/litepaper-tr.json" with { type: "json" };
import litepaperVi from "./locales/surfaces/litepaper-vi.json" with { type: "json" };
import litepaperZh from "./locales/surfaces/litepaper-zh.json" with { type: "json" };

export type LitepaperCopy = typeof litepaperEn;

/**
 * Chart/UI keys land in `litepaper-en.json` first; other locales keep only the
 * keys they already translate. Missing keys fall back to EN rather than
 * crashing or showing `undefined`, until a later pass translates them.
 */
function withEnFallback(partial: Partial<LitepaperCopy>): LitepaperCopy {
  return { ...litepaperEn, ...partial };
}

const rawByLanguage: Record<Language, Partial<LitepaperCopy>> = {
  en: litepaperEn,
  ru: litepaperRu as Partial<LitepaperCopy>,
  es: litepaperEs as Partial<LitepaperCopy>,
  pt: litepaperPt as Partial<LitepaperCopy>,
  fr: litepaperFr as Partial<LitepaperCopy>,
  de: litepaperDe as Partial<LitepaperCopy>,
  it: litepaperIt as Partial<LitepaperCopy>,
  tr: litepaperTr as Partial<LitepaperCopy>,
  vi: litepaperVi as Partial<LitepaperCopy>,
  id: litepaperId as Partial<LitepaperCopy>,
  zh: litepaperZh as Partial<LitepaperCopy>,
  ar: litepaperAr as Partial<LitepaperCopy>,
};

export const litepaperPublic: Record<Language, LitepaperCopy> = Object.fromEntries(
  Object.entries(rawByLanguage).map(([lang, copy]) => [lang, withEnFallback(copy)]),
) as Record<Language, LitepaperCopy>;
