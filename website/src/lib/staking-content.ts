import type { Language } from "@/lib/preferences";
import stakingEn from "./locales/surfaces/staking-en.json" with { type: "json" };
import stakingRu from "./locales/surfaces/staking-ru.json" with { type: "json" };

export type StakingCopy = typeof stakingEn;

const baseStakingCopy: Record<string, StakingCopy> = {
  en: stakingEn,
  ru: stakingRu,
};

/** Only EN/RU are translated; every other language falls back to EN. */
export const stakingCopy: Record<Language, StakingCopy> = new Proxy(
  baseStakingCopy as unknown as Record<Language, StakingCopy>,
  {
    get: (target, prop: string) => target[prop as keyof typeof target] ?? target.en,
  }
);
