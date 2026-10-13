/**
 * Guessing a founder's country from the browser, so the number can be claimed without asking
 * for it first. The API requires a country code, so we pick one here and let the person correct
 * it from the claim/success block. Pure helpers take their inputs as arguments; the browser
 * wrapper is the only part that touches `navigator`/`Intl`, so tests can drive the logic directly.
 */

import { normalizeCountryCode } from "./config.ts";
import { FOUNDER_COUNTRY_OPTIONS } from "./countries.ts";

const CURATED = new Set(FOUNDER_COUNTRY_OPTIONS.map((option) => option.code));

/** Existing default when nothing can be detected — Georgia, the program's home base. */
export const FALLBACK_COUNTRY = "GE";

/**
 * ISO zone → ISO 3166-1 alpha-2. A small hand-kept map: there is no built-in JS mapping and a
 * full CLDR table would be hundreds of KB for a single guess. Unlisted zones fall through to
 * the locale subtag, then to `FALLBACK_COUNTRY`.
 */
const TIMEZONE_COUNTRY: Record<string, string> = {
  "Africa/Cairo": "EG",
  "Africa/Casablanca": "MA",
  "Africa/Johannesburg": "ZA",
  "Africa/Lagos": "NG",
  "Africa/Nairobi": "KE",
  "America/Argentina/Buenos_Aires": "AR",
  "America/Bogota": "CO",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Halifax": "CA",
  "America/Lima": "PE",
  "America/Los_Angeles": "US",
  "America/Mexico_City": "MX",
  "America/Montevideo": "UY",
  "America/New_York": "US",
  "America/Phoenix": "US",
  "America/Santiago": "CL",
  "America/Sao_Paulo": "BR",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "Asia/Almaty": "KZ",
  "Asia/Amman": "JO",
  "Asia/Baghdad": "IQ",
  "Asia/Baku": "AZ",
  "Asia/Bangkok": "TH",
  "Asia/Beirut": "LB",
  "Asia/Colombo": "LK",
  "Asia/Dhaka": "BD",
  "Asia/Dubai": "AE",
  "Asia/Ho_Chi_Minh": "VN",
  "Asia/Hong_Kong": "HK",
  "Asia/Jakarta": "ID",
  "Asia/Jerusalem": "IL",
  "Asia/Karachi": "PK",
  "Asia/Kathmandu": "NP",
  "Asia/Kolkata": "IN",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Manila": "PH",
  "Asia/Riyadh": "SA",
  "Asia/Seoul": "KR",
  "Asia/Shanghai": "CN",
  "Asia/Singapore": "SG",
  "Asia/Taipei": "TW",
  "Asia/Tashkent": "UZ",
  "Asia/Tbilisi": "GE",
  "Asia/Tehran": "IR",
  "Asia/Tokyo": "JP",
  "Asia/Yerevan": "AM",
  "Australia/Adelaide": "AU",
  "Australia/Brisbane": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Perth": "AU",
  "Australia/Sydney": "AU",
  "Europe/Amsterdam": "NL",
  "Europe/Athens": "GR",
  "Europe/Belgrade": "RS",
  "Europe/Berlin": "DE",
  "Europe/Brussels": "BE",
  "Europe/Bucharest": "RO",
  "Europe/Budapest": "HU",
  "Europe/Copenhagen": "DK",
  "Europe/Dublin": "IE",
  "Europe/Helsinki": "FI",
  "Europe/Istanbul": "TR",
  "Europe/Kyiv": "UA",
  "Europe/Lisbon": "PT",
  "Europe/London": "GB",
  "Europe/Madrid": "ES",
  "Europe/Minsk": "BY",
  "Europe/Moscow": "RU",
  "Europe/Oslo": "NO",
  "Europe/Paris": "FR",
  "Europe/Prague": "CZ",
  "Europe/Riga": "LV",
  "Europe/Rome": "IT",
  "Europe/Sofia": "BG",
  "Europe/Stockholm": "SE",
  "Europe/Tallinn": "EE",
  "Europe/Vienna": "AT",
  "Europe/Vilnius": "LT",
  "Europe/Warsaw": "PL",
  "Europe/Zurich": "CH",
  "Pacific/Auckland": "NZ",
  "Pacific/Fiji": "FJ",
};

/** Region subtag of a BCP-47 tag ("pt-BR" → "BR", "zh-Hans-CN" → "CN"); null when absent. */
export function regionFromLocaleTag(tag: string): string | null {
  const parts = tag.trim().split(/[-_]/).filter(Boolean);
  for (let i = 1; i < parts.length; i += 1) {
    if (/^[A-Za-z]{2}$/.test(parts[i])) return parts[i].toUpperCase();
  }
  return null;
}

/**
 * Pick a country from ordered locale tags and an IANA timezone. Curated countries win over
 * merely valid ones, so a `en-GB` browser that claims to be `US` still resolves predictably.
 */
export function detectCountryFromHints(input: {
  languages?: readonly string[] | null;
  timeZone?: string | null;
  fallback?: string;
}): string {
  const languages = input.languages ?? [];
  const regionFromTags = (predicate: (code: string) => boolean): string | null => {
    for (const tag of languages) {
      const region = regionFromLocaleTag(tag);
      if (region && predicate(region)) return region;
    }
    return null;
  };

  const curatedTag = regionFromTags((code) => CURATED.has(code));
  if (curatedTag) return curatedTag;

  const zone = input.timeZone ? TIMEZONE_COUNTRY[input.timeZone] : undefined;
  if (zone && CURATED.has(zone)) return zone;

  const anyTag = regionFromTags((code) => normalizeCountryCode(code) !== null);
  if (anyTag) return anyTag;
  if (zone && normalizeCountryCode(zone)) return zone;

  return input.fallback ?? FALLBACK_COUNTRY;
}

/** Browser-side wrapper. Safe on the server (returns the fallback). */
export function detectBrowserCountryCode(): string {
  if (typeof navigator === "undefined") return FALLBACK_COUNTRY;
  let timeZone: string | null = null;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    /* keep null */
  }
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return detectCountryFromHints({ languages, timeZone });
}
