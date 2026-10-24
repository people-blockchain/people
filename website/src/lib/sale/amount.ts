/**
 * Parses the dollar amount typed into the buy form.
 *
 * Accepts "," or "." as the decimal separator (at most two decimals). Thousands separators are
 * rejected on purpose: "1,000" must never be read as 1 and "10,5" must never become 105.
 */
export type ParsedAmount =
  | { ok: true; value: number }
  | { ok: false; reason: "empty" | "invalid" };

export function parseUsdAmount(raw: string): ParsedAmount {
  const cleaned = raw.replace(/[\s ]/g, "");
  if (cleaned === "") return { ok: false, reason: "empty" };
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(cleaned);
  if (!match) return { ok: false, reason: "invalid" };
  const value = Number(`${match[1]}.${match[2] ?? "0"}`);
  if (!Number.isFinite(value)) return { ok: false, reason: "invalid" };
  return { ok: true, value };
}
