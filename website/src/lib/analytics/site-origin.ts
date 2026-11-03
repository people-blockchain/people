import { SITE_URL } from "@/lib/site";

export function siteOrigin(): string {
  return new URL(SITE_URL).origin;
}

/** Browser track POST must come from this site (Origin or Referer). */
export function isSameSiteTrackRequest(headers: Headers): boolean {
  const expected = siteOrigin();
  const origin = headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin === expected;
    } catch {
      return false;
    }
  }
  const referer = headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === expected;
    } catch {
      return false;
    }
  }
  return false;
}
