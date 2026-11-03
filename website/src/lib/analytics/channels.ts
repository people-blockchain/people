/** GA-style default channel grouping from session attribution (first touch in session row). */

export type AcquisitionChannel =
  | "Direct"
  | "Organic Search"
  | "Organic Social"
  | "Referral"
  | "Email"
  | "Paid Search"
  | "Paid Social"
  | "Display"
  | "Other";

const SOCIAL_HOSTS =
  /facebook\.|instagram\.|twitter\.|x\.com|t\.co|linkedin\.|reddit\.|youtube\.|tiktok\.|telegram\.|vk\.com/i;
const SEARCH_HOSTS = /google\.|bing\.|yahoo\.|duckduckgo\.|yandex\.|baidu\./i;

export function classifyAcquisitionChannel(input: {
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
}): AcquisitionChannel {
  const medium = (input.utmMedium ?? "").toLowerCase();
  const source = (input.utmSource ?? "").toLowerCase();
  const ref = (input.referrer ?? "").trim();

  if (medium.includes("cpc") || medium.includes("ppc") || medium === "paidsearch") return "Paid Search";
  if (medium.includes("paid") && (medium.includes("social") || SOCIAL_HOSTS.test(source))) return "Paid Social";
  if (medium.includes("display") || medium.includes("banner") || medium.includes("cpm")) return "Display";
  if (medium.includes("email") || medium === "newsletter") return "Email";

  if (ref) {
    try {
      const host = new URL(ref).hostname.toLowerCase();
      if (SEARCH_HOSTS.test(host)) return "Organic Search";
      if (SOCIAL_HOSTS.test(host)) return "Organic Social";
      return "Referral";
    } catch {
      return "Referral";
    }
  }

  if (source && !medium) return "Referral";
  if (!ref && !source && !medium) return "Direct";
  return "Other";
}

export function referrerDomain(referrer: string | null): string {
  if (!referrer?.trim()) return "(direct)";
  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return "(invalid)";
  }
}
