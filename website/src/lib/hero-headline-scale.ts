/** Longest word length in the hero h1 (main + accent), for fluid desktop sizing. */
export function heroHeadlineMaxWordChars(headlineMain: string, headlineAccent: string): number {
  const words = `${headlineMain} ${headlineAccent}`.split(/\s+/).filter(Boolean);
  const lengths = words.map((word) => word.replace(/[''']/g, "").length);
  return Math.max(1, ...lengths);
}

const WIDE_SCRIPT_RE = /[\u0400-\u04FF\u0500-\u052F\u0590-\u05FF\u0600-\u06FF\u0900-\u097F]/;

/** True when headline copy uses scripts whose uppercase glyphs run wider than Latin in our display face. */
export function heroHeadlineUsesWideGlyphs(headlineMain: string, headlineAccent: string): boolean {
  return WIDE_SCRIPT_RE.test(`${headlineMain}${headlineAccent}`);
}

/**
 * cqi multiplier for SSR clamp (before client measurement). Conservative for long / wide-script words.
 * Client hook may scale up toward the display max when space allows (e.g. EN).
 */
export function heroHeadlineCqiMultiplier(
  maxWordChars: number,
  headlineMain: string,
  headlineAccent: string
): number {
  const wide = heroHeadlineUsesWideGlyphs(headlineMain, headlineAccent);
  let mult = wide ? 1.42 : 1.78;
  if (maxWordChars >= 12) mult *= 0.9;
  else if (maxWordChars >= 10) mult *= 0.94;
  return Math.round(mult * 1000) / 1000;
}

export const HERO_HEADLINE_MIN_REM = 2.25;
export const HERO_HEADLINE_MAX_REM = 5.25;
/** Homepage hero with side card — slightly below full display max */
export const HERO_HEADLINE_HOME_MAX_REM = 3.5;

/** Longest word on any single headline line (for per-line fluid sizing). */
export function heroHeadlineMaxWordCharsFromLines(lines: string[]): number {
  let max = 1;
  for (const line of lines) {
    for (const word of line.split(/\s+/).filter(Boolean)) {
      max = Math.max(max, word.replace(/[''']/g, "").length);
    }
  }
  return max;
}
