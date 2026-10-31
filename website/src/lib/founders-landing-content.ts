import type { Language } from "./preferences";
import landingEn from "./locales/surfaces/founders-landing-en.json" with { type: "json" };
import landingRu from "./locales/surfaces/founders-landing-ru.json" with { type: "json" };

export type FoundersLandingCopy = typeof landingEn;

const COUNTER_AND_MAP_KEYS = [
  "counterLabel",
  "counterOfGoal",
  "counterGoal",
  "counterLive",
  "counterEmpty",
  "counterStub",
  "mapEyebrow",
  "mapTitle",
  "mapSub",
  "mapLegendLabel",
  "mapTooltipHint",
  "mapCountryCount",
  "mapCountriesActive",
  "mapEmptyTitle",
  "mapEmptyBody",
  "mapUnavailableBody",
] as const satisfies readonly (keyof FoundersLandingCopy)[];

/** Counter and world map UI copy is English on every locale (including RU hero copy). */
function withEnglishCounterAndMap(copy: FoundersLandingCopy): FoundersLandingCopy {
  const englishFields = Object.fromEntries(
    COUNTER_AND_MAP_KEYS.map((key) => [key, landingEn[key]]),
  ) as Pick<FoundersLandingCopy, (typeof COUNTER_AND_MAP_KEYS)[number]>;
  return { ...copy, ...englishFields };
}

/** /founders public landing sections. RU and EN are maintained for hero/FAQ; counter & map stay English. */
export function foundersLandingCopy(lang: Language): FoundersLandingCopy {
  if (lang === "ru") return withEnglishCounterAndMap(landingRu as FoundersLandingCopy);
  return landingEn;
}
