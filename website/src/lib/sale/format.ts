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

/** Whole dollars, e.g. `$4,000,000`. */
export function usd(amount: number, lang = "en"): string {
  return `$${Math.round(amount).toLocaleString(intlLocale(lang))}`;
}

/** Compact dollars for axis labels and markers, e.g. `$1M`, `$500K`. */
export function usdCompact(amount: number, lang = "en"): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `$${(Number.isInteger(m) ? m : Number(m.toFixed(2))).toLocaleString(intlLocale(lang))}M`;
  }
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return usd(amount, lang);
}

/**
 * A per-PPL price. Prices on this curve run from $0.005 to $0.25, so four
 * decimals keep every milestone distinguishable without noise.
 */
export function pricePerPpl(price: number, lang = "en"): string {
  return `$${price.toLocaleString(intlLocale(lang), {
    minimumFractionDigits: price < 0.01 ? 4 : 2,
    maximumFractionDigits: 4,
  })}`;
}

/** Whole PPL, e.g. `1,234,567 PPL` (caller adds the ticker). */
export function ppl(amount: number, lang = "en"): string {
  return Math.round(amount).toLocaleString(intlLocale(lang));
}

/** Compact PPL for stats and markers, e.g. `88.83M`. */
export function pplCompact(amount: number, lang = "en"): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toLocaleString(intlLocale(lang), {
      maximumFractionDigits: 2,
    })}M`;
  }
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}K`;
  return ppl(amount, lang);
}

/** Tighter PPL compact for small chart callouts (one decimal on millions). */
export function pplCompactChart(amount: number, lang = "en"): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toLocaleString(intlLocale(lang), {
      maximumFractionDigits: 1,
    })}M`;
  }
  return pplCompact(amount, lang);
}

export function pct(value: number, lang = "en"): string {
  return `${value.toLocaleString(intlLocale(lang), { maximumFractionDigits: 1 })}%`;
}

/**
 * Joins names into one phrase the way the locale does it — `a, b and c` in EN,
 * `a, b и c` in RU. Used for the audit list, so the models the copy names are
 * always exactly the ones in `AI_AUDITS`.
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
