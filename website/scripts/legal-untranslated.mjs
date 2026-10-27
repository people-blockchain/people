/**
 * Helpers that spot untranslated English in the non-English legal surfaces.
 * Shared by legal-content.test.mjs and by one-off audit scripts.
 */

export const NON_EN_LEGAL_LOCALES = ["ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];

/** Phrases that legitimately stay in English (product, provider and protocol names). */
export const ENGLISH_ALLOWLIST = [
  "Terms of Service",
  "Privacy Policy",
  "Continue with Google",
  "Human Passport",
  "Community Pool",
  "Auth.js / NextAuth",
  "Neon Postgres",
  "PEOPLE Blockchain",
  "Base mainnet",
];

/** Common English function words that rarely occur in the other eleven languages. */
const ENGLISH_STOPWORDS = new Set([
  "the", "and", "of", "you", "your", "shall", "we", "our", "are", "with", "that", "this",
  "may", "not", "any", "will", "if", "or", "by", "from", "have", "has", "when", "which",
  "to", "is", "for", "on", "be", "do", "does", "no", "all", "can", "only",
]);

/** Words that are also valid in other target languages and must not count as English evidence. */
const AMBIGUOUS = new Set(["no", "on", "be", "do", "all", "can", "to", "is", "for", "only", "or"]);

/** Flatten `{ privacy: {..}, terms: {..} }` into `path -> string` pairs. */
export function flattenStrings(value, prefix = "", out = new Map()) {
  if (typeof value === "string") {
    out.set(prefix, value);
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => flattenStrings(item, `${prefix}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      flattenStrings(item, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

/** Same shape, values dropped: lists every key/array-length path so structures can be compared. */
export function structurePaths(value) {
  return [...flattenStrings(value).keys()].sort();
}

/** Number of English function words left in `text` once allowlisted phrases are removed. */
export function englishWordHits(text) {
  let rest = text;
  for (const phrase of ENGLISH_ALLOWLIST) rest = rest.split(phrase).join(" ");
  const words = rest.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
  const strong = words.filter((w) => ENGLISH_STOPWORDS.has(w) && !AMBIGUOUS.has(w));
  return { hits: strong.length, words: words.length, sample: [...new Set(strong)].slice(0, 6) };
}

/**
 * Strings that may legitimately equal the English source in a given locale
 * (a real cognate, e.g. French "Contact"). Keyed by locale, then by path.
 */
export const IDENTICAL_OK = {
  fr: ["privacy.contactTitle", "terms.contactTitle"],
};

/**
 * Reasons a localized string looks untranslated. Empty array means it looks fine.
 * `enValue` is the English source for the same path.
 */
export function untranslatedReasons(value, enValue) {
  const reasons = [];
  if (value.trim() === enValue.trim() && /\p{L}{3,}/u.test(value)) {
    reasons.push("identical to English");
  }
  const { hits, sample } = englishWordHits(value);
  if (hits >= 3) reasons.push(`English words: ${sample.join(", ")}`);
  else if (hits >= 2 && value.length < 160) reasons.push(`English words: ${sample.join(", ")}`);
  return reasons;
}

/** Every path in `doc` that looks untranslated against `en`, as `{ path, reasons }`. */
export function findUntranslated(doc, en, lang) {
  const enMap = flattenStrings(en);
  const okPaths = new Set(IDENTICAL_OK[lang] ?? []);
  const found = [];
  for (const [path, value] of flattenStrings(doc)) {
    const enValue = enMap.get(path);
    if (enValue === undefined) continue;
    const reasons = untranslatedReasons(value, enValue).filter(
      (r) => !(r === "identical to English" && okPaths.has(path)),
    );
    if (reasons.length) found.push({ path, reasons });
  }
  return found;
}
