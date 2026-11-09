export type GeoFromHeaders = {
  country: string | null;
  region: string | null;
  city: string | null;
};

export function geoFromRequestHeaders(headers: Headers): GeoFromHeaders {
  const country = headers.get("x-vercel-ip-country")?.trim() || null;
  const region = headers.get("x-vercel-ip-country-region")?.trim() || null;
  const city = headers.get("x-vercel-ip-city")?.trim() || null;
  return { country, region, city };
}

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "0.0.0.0";
}
