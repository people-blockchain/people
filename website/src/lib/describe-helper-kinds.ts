export const DESCRIBE_HELPER_KINDS = ["token", "nft", "contract", "discover", "lavka"] as const;

export type DescribeHelperKind = (typeof DESCRIBE_HELPER_KINDS)[number];

export function parseDescribeHelperKind(raw: unknown): DescribeHelperKind | null {
  if (typeof raw !== "string") return null;
  const kind = raw.trim().toLowerCase();
  return (DESCRIBE_HELPER_KINDS as readonly string[]).includes(kind)
    ? (kind as DescribeHelperKind)
    : null;
}

export function isHexAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}
