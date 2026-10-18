import { isIP } from "node:net";

function stripZone(ip: string): string {
  const i = ip.indexOf("%");
  return i === -1 ? ip : ip.slice(0, i);
}

function ipv4ToHexets(ipv4: string): [string, string] {
  const [a, b, c, d] = ipv4.split(".").map((x) => Number(x));
  const hi = ((a << 8) | b).toString(16);
  const lo = ((c << 8) | d).toString(16);
  return [hi.padStart(4, "0"), lo.padStart(4, "0")];
}

/** Replace a trailing dotted-quad with two 16-bit groups before `::` expansion. */
function normalizeIpv6ForExpansion(ip: string): string {
  let lower = stripZone(ip).toLowerCase();
  const v4tail = lower.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4tail && isIP(v4tail[2]) === 4) {
    const [hi, lo] = ipv4ToHexets(v4tail[2]);
    lower = `${v4tail[1]}${hi}:${lo}`;
  }
  return lower;
}

function expandIpv6(ip: string): string[] {
  const lower = normalizeIpv6ForExpansion(ip);
  const [head, tail = ""] = lower.split("::");
  const left = head ? head.split(":").filter(Boolean) : [];
  const right = tail ? tail.split(":").filter(Boolean) : [];
  const fill = 8 - left.length - right.length;
  if (fill < 0) return lower.split(":");
  const parts = [...left, ...Array(fill).fill("0"), ...right];
  return parts.map((h) => h.padStart(4, "0"));
}

function mappedIpv4FromGroups(groups: string[]): string | null {
  if (groups.length !== 8) return null;
  if (!groups.slice(0, 5).every((g) => g === "0000") || groups[5] !== "ffff") return null;
  const hi = parseInt(groups[6], 16);
  const lo = parseInt(groups[7], 16);
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

/** Collapse IPv6 to a /64 prefix for shared rate-limit buckets; IPv4 and unknown pass through. */
export function rateLimitSubject(ip: string): string {
  const bare = stripZone(ip);
  if (bare === "unknown" || isIP(bare) === 4) return bare;
  if (isIP(bare) === 6) {
    const groups = expandIpv6(bare);
    const mapped = mappedIpv4FromGroups(groups);
    if (mapped) return mapped;
    return groups.slice(0, 4).join(":");
  }
  return ip;
}
