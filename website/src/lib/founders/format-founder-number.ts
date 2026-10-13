/** Display founder sequence numbers with spaced thousands (e.g. 1 248). */
export function formatFounderDisplayNumber(n: number, lang: string): string {
  const safe = Math.max(1, Math.floor(n));
  return safe
    .toLocaleString(lang, { useGrouping: true })
    .replace(/\u00a0/g, " ")
    .replace(/,/g, " ");
}
