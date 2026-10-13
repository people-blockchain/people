import type { Language } from "@/lib/preferences";
import discoverEn from "./locales/surfaces/discover-en.json" with { type: "json" };
import discoverRu from "./locales/surfaces/discover-ru.json" with { type: "json" };
import discoverEs from "./locales/surfaces/discover-es.json" with { type: "json" };
import discoverPt from "./locales/surfaces/discover-pt.json" with { type: "json" };
import discoverFr from "./locales/surfaces/discover-fr.json" with { type: "json" };
import discoverDe from "./locales/surfaces/discover-de.json" with { type: "json" };
import discoverIt from "./locales/surfaces/discover-it.json" with { type: "json" };
import discoverTr from "./locales/surfaces/discover-tr.json" with { type: "json" };
import discoverVi from "./locales/surfaces/discover-vi.json" with { type: "json" };
import discoverId from "./locales/surfaces/discover-id.json" with { type: "json" };
import discoverZh from "./locales/surfaces/discover-zh.json" with { type: "json" };
import discoverAr from "./locales/surfaces/discover-ar.json" with { type: "json" };

export type DiscoverCopy = typeof discoverEn;

const base: Record<Language, DiscoverCopy> = {
  en: discoverEn,
  ru: discoverRu,
  es: discoverEs,
  pt: discoverPt,
  fr: discoverFr,
  de: discoverDe,
  it: discoverIt,
  tr: discoverTr,
  vi: discoverVi,
  id: discoverId,
  zh: discoverZh,
  ar: discoverAr,
};

export const discoverCopy: Record<Language, DiscoverCopy> = new Proxy(base, {
  get: (target, prop: string) => target[prop as Language] ?? target.en,
});
