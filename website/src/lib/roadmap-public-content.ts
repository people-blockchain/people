import type { Language } from "./preferences";
import roadmapAr from "./locales/surfaces/roadmap-ar.json" with { type: "json" };
import roadmapDe from "./locales/surfaces/roadmap-de.json" with { type: "json" };
import roadmapEn from "./locales/surfaces/roadmap-en.json" with { type: "json" };
import roadmapEs from "./locales/surfaces/roadmap-es.json" with { type: "json" };
import roadmapFr from "./locales/surfaces/roadmap-fr.json" with { type: "json" };
import roadmapId from "./locales/surfaces/roadmap-id.json" with { type: "json" };
import roadmapIt from "./locales/surfaces/roadmap-it.json" with { type: "json" };
import roadmapPt from "./locales/surfaces/roadmap-pt.json" with { type: "json" };
import roadmapRu from "./locales/surfaces/roadmap-ru.json" with { type: "json" };
import roadmapTr from "./locales/surfaces/roadmap-tr.json" with { type: "json" };
import roadmapVi from "./locales/surfaces/roadmap-vi.json" with { type: "json" };
import roadmapZh from "./locales/surfaces/roadmap-zh.json" with { type: "json" };

export type RoadmapPublicCopy = typeof roadmapEn;

export const roadmapPublic: Record<Language, RoadmapPublicCopy> = {
  en: roadmapEn,
  ru: roadmapRu,
  es: roadmapEs,
  pt: roadmapPt,
  fr: roadmapFr,
  de: roadmapDe,
  it: roadmapIt,
  tr: roadmapTr,
  vi: roadmapVi,
  id: roadmapId,
  zh: roadmapZh,
  ar: roadmapAr,
};
