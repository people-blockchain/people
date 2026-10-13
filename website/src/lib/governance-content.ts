import type { Language } from "@/lib/preferences";
import governanceEn from "./locales/surfaces/governance-en.json" with { type: "json" };
import governanceRu from "./locales/surfaces/governance-ru.json" with { type: "json" };

export type GovernanceCopy = typeof governanceEn;

const baseGovernanceCopy: Record<string, GovernanceCopy> = {
  en: governanceEn,
  ru: governanceRu,
};

/** Only EN/RU are translated; every other language falls back to EN. */
export const governanceCopy: Record<Language, GovernanceCopy> = new Proxy(
  baseGovernanceCopy as unknown as Record<Language, GovernanceCopy>,
  {
    get: (target, prop: string) => target[prop as keyof typeof target] ?? target.en,
  }
);
