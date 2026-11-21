import { BlockList, isIP } from "node:net";

/**
 * Published Cloudflare proxy egress ranges (https://www.cloudflare.com/ips-v4 and /ips-v6).
 * Snapshot 2026-11-21 — refresh when Cloudflare updates their list.
 */
export const CLOUDFLARE_IPV4_CIDRS = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
] as const;

export const CLOUDFLARE_IPV6_CIDRS = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
] as const;

const blockList = new BlockList();
for (const cidr of CLOUDFLARE_IPV4_CIDRS) {
  const [addr, prefix] = cidr.split("/");
  blockList.addSubnet(addr, Number(prefix), "ipv4");
}
for (const cidr of CLOUDFLARE_IPV6_CIDRS) {
  const [addr, prefix] = cidr.split("/");
  blockList.addSubnet(addr, Number(prefix), "ipv6");
}

/** Whether `ip` is a published Cloudflare anycast/proxy range (v4 or v6). */
export function isCloudflareIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return blockList.check(ip, "ipv4");
  if (v === 6) return blockList.check(ip, "ipv6");
  return false;
}