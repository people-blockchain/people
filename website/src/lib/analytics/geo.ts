import {
  clientIpFromHeaders as resolveClientIp,
  requestCameViaCloudflare,
} from "@/lib/request-client-ip";

export type GeoFromHeaders = {
  country: string | null;
  region: string | null;
  city: string | null;
};

function normalizeCountry(code: string | null | undefined): string | null {
  const c = code?.trim().toUpperCase() ?? "";
  if (!c || c === "XX" || c === "T1") return null;
  return c;
}

export function geoFromRequestHeaders(headers: Headers): GeoFromHeaders {
  const cfCountry = requestCameViaCloudflare(headers)
    ? normalizeCountry(headers.get("cf-ipcountry"))
    : null;
  const country =
    cfCountry ?? normalizeCountry(headers.get("x-vercel-ip-country")) ?? null;
  const region = headers.get("x-vercel-ip-country-region")?.trim() || null;
  const city = headers.get("x-vercel-ip-city")?.trim() || null;
  return { country, region, city };
}

/** Analytics ingest expects an IP string; maps shared `unknown` bucket to `0.0.0.0`. */
export function clientIpFromHeaders(headers: Headers): string {
  const ip = resolveClientIp(headers);
  return ip === "unknown" ? "0.0.0.0" : ip;
}