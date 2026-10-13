import type { Language } from "./preferences";
import agentsAr from "./locales/surfaces/agents-ar.json" with { type: "json" };
import agentsDe from "./locales/surfaces/agents-de.json" with { type: "json" };
import agentsEn from "./locales/surfaces/agents-en.json" with { type: "json" };
import agentsEs from "./locales/surfaces/agents-es.json" with { type: "json" };
import agentsFr from "./locales/surfaces/agents-fr.json" with { type: "json" };
import agentsId from "./locales/surfaces/agents-id.json" with { type: "json" };
import agentsIt from "./locales/surfaces/agents-it.json" with { type: "json" };
import agentsPt from "./locales/surfaces/agents-pt.json" with { type: "json" };
import agentsRu from "./locales/surfaces/agents-ru.json" with { type: "json" };
import agentsTr from "./locales/surfaces/agents-tr.json" with { type: "json" };
import agentsVi from "./locales/surfaces/agents-vi.json" with { type: "json" };
import agentsZh from "./locales/surfaces/agents-zh.json" with { type: "json" };

export type AgentsPublicCopy = typeof agentsEn;

export const agentsPublic: Record<Language, AgentsPublicCopy> = {
  en: agentsEn,
  ru: agentsRu,
  es: agentsEs,
  pt: agentsPt,
  fr: agentsFr,
  de: agentsDe,
  it: agentsIt,
  tr: agentsTr,
  vi: agentsVi,
  id: agentsId,
  zh: agentsZh,
  ar: agentsAr,
};
