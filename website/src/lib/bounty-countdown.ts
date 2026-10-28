export const PPL_V2_OPEN_DATE_ENV = "NEXT_PUBLIC_PPL_V2_OPEN_DATE";
export const PPL_V2_OPEN_DATE_FALLBACK = "2026-12-01T00:00:00.000Z";

export type CountdownParts = {
  open: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export function resolvePplSaleOpenDate(raw?: string | null): Date | null {
  const value = (raw ?? process.env.NEXT_PUBLIC_PPL_V2_OPEN_DATE ?? "").trim();
  const date = new Date(value || PPL_V2_OPEN_DATE_FALLBACK);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function pplSaleCountdown(target: Date | null, now: number): CountdownParts | null {
  if (!target) return null;
  const remaining = target.getTime() - now;
  if (remaining <= 0) {
    return { open: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  const totalSeconds = Math.floor(remaining / 1000);
  return {
    open: false,
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}
