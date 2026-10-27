import type { BuyCopy } from "@/lib/buy-content";
import { CURVE } from "@/lib/sale/config";
import { fillCopy, pricePerPpl } from "@/lib/sale/format";

import type { V2StatsCopyKeys } from "./logic";

export type StatsStatusCopy = {
  label: string;
  value: string;
  hint: string;
};

/** Resolves the phase-mapped stats row to final, localised strings. */
export function resolveStatsStatus(input: {
  copy: BuyCopy;
  lang: string;
  keys: V2StatsCopyKeys;
  v2Enabled: boolean;
  spotPriceUsd: number | null;
}): StatsStatusCopy {
  const { copy, lang, keys } = input;
  const stats = copy.stats;
  const start = pricePerPpl(CURVE.startPriceUsd, lang);
  const label = keys.statusLabel === "price" ? stats.price : stats.saleStatus;
  const value =
    keys.statusValue === "spotPrice"
      ? input.spotPriceUsd === null
        ? input.v2Enabled
          ? stats.none
          : stats.notOpenYet
        : pricePerPpl(input.spotPriceUsd, lang)
      : keys.statusValue === "whitelistStatus"
        ? stats.whitelistStatus
        : keys.statusValue === "openStatus"
          ? stats.openStatus
          : stats.notOpenYet;
  const hint =
    keys.statusHint === "priceStartHint"
      ? fillCopy(stats.priceStartHint, { start })
      : keys.statusHint === "startPriceOnOpen"
        ? fillCopy(stats.startPriceOnOpen, { start })
        : keys.statusHint === "whitelistStatus"
          ? stats.whitelistStatus
          : keys.statusHint === "openStatus"
            ? stats.openStatus
            : "";

  return { label, value, hint };
}
