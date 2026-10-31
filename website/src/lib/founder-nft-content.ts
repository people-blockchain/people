import type { Language } from "./preferences";
import founderNftAr from "./locales/surfaces/founder-nft-ar.json" with { type: "json" };
import founderNftDe from "./locales/surfaces/founder-nft-de.json" with { type: "json" };
import founderNftEn from "./locales/surfaces/founder-nft-en.json" with { type: "json" };
import founderNftEs from "./locales/surfaces/founder-nft-es.json" with { type: "json" };
import founderNftFr from "./locales/surfaces/founder-nft-fr.json" with { type: "json" };
import founderNftId from "./locales/surfaces/founder-nft-id.json" with { type: "json" };
import founderNftIt from "./locales/surfaces/founder-nft-it.json" with { type: "json" };
import founderNftPt from "./locales/surfaces/founder-nft-pt.json" with { type: "json" };
import founderNftRu from "./locales/surfaces/founder-nft-ru.json" with { type: "json" };
import founderNftTr from "./locales/surfaces/founder-nft-tr.json" with { type: "json" };
import founderNftVi from "./locales/surfaces/founder-nft-vi.json" with { type: "json" };
import founderNftZh from "./locales/surfaces/founder-nft-zh.json" with { type: "json" };

export type FounderNftCopy = typeof founderNftEn;

export const founderNftCopy: Record<Language, FounderNftCopy> = {
  en: founderNftEn,
  ru: founderNftRu,
  es: founderNftEs,
  pt: founderNftPt,
  fr: founderNftFr,
  de: founderNftDe,
  it: founderNftIt,
  tr: founderNftTr,
  vi: founderNftVi,
  id: founderNftId,
  zh: founderNftZh,
  ar: founderNftAr,
};

/** Replaces `{{name}}` placeholders. Unknown names become an empty string. */
export function fillFounderNftTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? "");
}
