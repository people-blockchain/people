/**
 * Display formatting for the sale page. Kept apart from `curve.ts` so the math
 * stays free of locale concerns, and apart from the components so every block
 * shows the same number the same way.
 */

const LOCALE_BY_LANG: Record<string, string> = {
  en: "en-US",
  ru: "ru-RU",
  es: "es-ES",
  pt: "pt-BR",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  tr: "tr-TR",
  vi: "vi-VN",
  id: "id-ID",
  zh: "zh-CN",
  ar: "ar",
};

export function intlLocale(lang: string): string {
  return LOCALE_BY_LANG[lang] ?? "en-US";
}

/** Currency sign placement per language: `$` prefix, `US$` prefix, or `$` suffix. */
const NBSP = "\u00a0";
const CURRENCY_STYLE: Record<string, { prefix?: string; suffix?: string }> = {
  pt: { prefix: `US$${NBSP}` },
  es: { prefix: `US$${NBSP}` },
  id: { prefix: "US$" },
  tr: { prefix: "US$" },
  fr: { suffix: `${NBSP}$` },
  de: { suffix: `${NBSP}$` },
};

function withCurrency(numberText: string, lang: string): string {
  const style = CURRENCY_STYLE[lang] ?? { prefix: "$" };
  return `${style.prefix ?? ""}${numberText}${style.suffix ?? ""}`;
}

function compactNumber(amount: number, lang: string): string {
  return new Intl.NumberFormat(intlLocale(lang), {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Whole dollars, e.g. `$4,000,000` (thousands separators in every language). */
export function usd(amount: number, lang = "en"): string {
  return withCurrency(Math.round(amount).toLocaleString(intlLocale(lang), { useGrouping: true }), lang);
}

/** Compact dollars for axis labels and markers, e.g. `$1M`, `$500K`. */
export function usdCompact(amount: number, lang = "en"): string {
  return withCurrency(compactNumber(amount, lang), lang);
}

/**
 * A per-PPL price. Prices on this curve run from $0.005 to $0.25, so four
 * decimals keep every milestone distinguishable without noise.
 */
export function pricePerPpl(price: number, lang = "en"): string {
  return withCurrency(
    price.toLocaleString(intlLocale(lang), {
      minimumFractionDigits: price < 0.01 ? 4 : 2,
      maximumFractionDigits: 4,
      useGrouping: true,
    }),
    lang,
  );
}

/** Whole PPL, e.g. `1,234,567 PPL` (caller adds the ticker). */
export function ppl(amount: number, lang = "en"): string {
  return Math.round(amount).toLocaleString(intlLocale(lang), { useGrouping: true });
}

/** Compact PPL for stats and markers, e.g. `55.66M` / `55,66 млн`. */
export function pplCompact(amount: number, lang = "en"): string {
  return compactNumber(amount, lang);
}

/** Compact PPL for chart callouts — same two-decimal format as everywhere else. */
export function pplCompactChart(amount: number, lang = "en"): string {
  return compactNumber(amount, lang);
}

/** Percent in the language's own style (`1.5%`, `1,5 %`, `%1,5`). */
export function pct(value: number, lang = "en"): string {
  return new Intl.NumberFormat(intlLocale(lang), {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value / 100);
}

/** A number of months in the right plural form: `24 months`, `24 месяца`, `6 месяцев`. */
export function formatMonths(months: number, lang = "en"): string {
  return new Intl.NumberFormat(intlLocale(lang), {
    style: "unit",
    unit: "month",
    unitDisplay: "long",
  }).format(months);
}

/**
 * Joins names into one phrase the way the locale does it — `a, b and c` in EN,
 * `a, b и c` in RU.
 */
export function listCopy(items: readonly string[], lang = "en"): string {
  try {
    return new Intl.ListFormat(intlLocale(lang), { style: "long", type: "conjunction" }).format(
      items as string[],
    );
  } catch {
    return items.join(", ");
  }
}

/** Substitutes `{name}` placeholders in copy. */
export function fillCopy(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}
