import type { BuyCopy } from "@/lib/buy-content";
import { CURVE, SALE } from "@/lib/sale/config";
import { fillCopy, formatMonths, intlLocale, pricePerPpl } from "@/lib/sale/format";

import type { V2StatsCopyKeys } from "./logic";

export type StatsStatusCopy = {
  label: string;
  value: string;
  hint: string;
};

export const V2_OPEN_DATE_DEFAULT = "2026-12-01";

/** Strict `YYYY-MM-DD` in UTC; anything else falls back to the default date. */
export function parseV2OpenDate(raw: string | null | undefined): Date {
  const value = (raw ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return date;
    }
  }
  const [year, month, day] = V2_OPEN_DATE_DEFAULT.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Day, month and year in the locale's own style, always in UTC. */
export function formatV2OpenDate(raw: string | null | undefined, lang: string): string {
  const locale = lang === "en" ? "en-GB" : intlLocale(lang);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseV2OpenDate(raw));
}

/** The V2 sale-window value: `{date}` is localised, `{term}` is the sale length. */
export function v2SaleWindowValue(input: {
  copy: BuyCopy;
  lang: string;
  openDate?: string | null;
}): string {
  return fillCopy(input.copy.stats.saleWindowV2, {
    date: formatV2OpenDate(input.openDate, input.lang),
    term: formatMonths(SALE.saleTermMonths, input.lang),
  });
}

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
