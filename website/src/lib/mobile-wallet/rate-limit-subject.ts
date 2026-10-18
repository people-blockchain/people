import { isIP } from "node:net";

function expandIpv6(ip: string): string[] {
  const lower = ip.toLowerCase();
  const [head, tail = ""] = lower.split("::");
  const left = head ? head.split(":").filter(Boolean) : [];
  const right = tail ? tail.split(":").filter(Boolean) : [];
  const fill = 8 - left.length - right.length;
  if (fill < 0) return lower.split(":");
  const parts = [...left, ...Array(fill).fill("0"), ...right];
  return parts.map((h) => h.padStart(4, "0"));
}

/** Collapse IPv6 to a /64 prefix for shared rate-limit buckets; IPv4 and unknown pass through. */
export function rateLimitSubject(ip: string): string {
  if (ip === "unknown" || isIP(ip) === 4) return ip;
  if (isIP(ip) === 6) return expandIpv6(ip).slice(0, 4).join(":");
  return ip;
}
