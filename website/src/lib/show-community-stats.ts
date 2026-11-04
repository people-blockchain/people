/**
 * Public aggregate founder/community counters (verified people, countries, million goal progress).
 * Off by default until the community is large enough; flip in Vercel with
 * `NEXT_PUBLIC_SHOW_COMMUNITY_STATS=true`.
 */
export function showCommunityStats(): boolean {
  const raw = process.env.NEXT_PUBLIC_SHOW_COMMUNITY_STATS?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}
