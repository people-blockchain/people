import type { Language } from "@/lib/preferences";
import governanceAr from "./locales/surfaces/governance-ar.json" with { type: "json" };
import governanceDe from "./locales/surfaces/governance-de.json" with { type: "json" };
import governanceEn from "./locales/surfaces/governance-en.json" with { type: "json" };
import governanceEs from "./locales/surfaces/governance-es.json" with { type: "json" };
import governanceFr from "./locales/surfaces/governance-fr.json" with { type: "json" };
import governanceId from "./locales/surfaces/governance-id.json" with { type: "json" };
import governanceIt from "./locales/surfaces/governance-it.json" with { type: "json" };
import governancePt from "./locales/surfaces/governance-pt.json" with { type: "json" };
import governanceRu from "./locales/surfaces/governance-ru.json" with { type: "json" };
import governanceTr from "./locales/surfaces/governance-tr.json" with { type: "json" };
import governanceVi from "./locales/surfaces/governance-vi.json" with { type: "json" };
import governanceZh from "./locales/surfaces/governance-zh.json" with { type: "json" };

export type GovernanceCopy = typeof governanceEn;

const governancePublic: Record<Language, GovernanceCopy> = {
  en: governanceEn,
  ru: governanceRu,
  es: governanceEs,
  pt: governancePt,
  fr: governanceFr,
  de: governanceDe,
  it: governanceIt,
  tr: governanceTr,
  vi: governanceVi,
  id: governanceId,
  zh: governanceZh,
  ar: governanceAr,
};

export const governanceCopy: Record<Language, GovernanceCopy> = governancePublic;