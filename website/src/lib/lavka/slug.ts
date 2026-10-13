export function slugifyMerchantName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "shop";
}

export function withSlugSuffix(base: string, suffix: string): string {
  const trimmed = `${base}-${suffix}`.slice(0, 56);
  return trimmed.replace(/-+$/g, "");
}
