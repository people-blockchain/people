import type { Language } from "@/lib/preferences";
import stakingAr from "./locales/surfaces/staking-ar.json" with { type: "json" };
import stakingDe from "./locales/surfaces/staking-de.json" with { type: "json" };
import stakingEn from "./locales/surfaces/staking-en.json" with { type: "json" };
import stakingEs from "./locales/surfaces/staking-es.json" with { type: "json" };
import stakingFr from "./locales/surfaces/staking-fr.json" with { type: "json" };
import stakingId from "./locales/surfaces/staking-id.json" with { type: "json" };
import stakingIt from "./locales/surfaces/staking-it.json" with { type: "json" };
import stakingPt from "./locales/surfaces/staking-pt.json" with { type: "json" };
import stakingRu from "./locales/surfaces/staking-ru.json" with { type: "json" };
import stakingTr from "./locales/surfaces/staking-tr.json" with { type: "json" };
import stakingVi from "./locales/surfaces/staking-vi.json" with { type: "json" };
import stakingZh from "./locales/surfaces/staking-zh.json" with { type: "json" };

export type StakingCopy = typeof stakingEn;

const stakingPublic: Record<Language, StakingCopy> = {
  en: stakingEn,
  ru: stakingRu,
  es: stakingEs,
  pt: stakingPt,
  fr: stakingFr,
  de: stakingDe,
  it: stakingIt,
  tr: stakingTr,
  vi: stakingVi,
  id: stakingId,
  zh: stakingZh,
  ar: stakingAr,
};

export const stakingCopy: Record<Language, StakingCopy> = stakingPublic;