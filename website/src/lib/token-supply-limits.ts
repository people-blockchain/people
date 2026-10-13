/** Minimum whole-token supply for user token launches (form + protocol). */
export const MIN_TOKEN_SUPPLY_WHOLE = 1_000_000;

export function wholeTokensToBaseUnits(supply: string, decimals: string): bigint | null {
  const d = Number(decimals);
  if (!Number.isInteger(d) || d < 0 || d > 18) return null;
  const clean = supply.replace(/[\s,_]/g, "");
  if (!/^\d+$/.test(clean)) return null;
  try {
    const units = BigInt(clean) * BigInt(10) ** BigInt(d);
    if (units <= BigInt(0)) return null;
    return units;
  } catch {
    return null;
  }
}

export function minTokenSupplyBaseUnits(decimals: number): bigint | null {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) return null;
  try {
    return BigInt(MIN_TOKEN_SUPPLY_WHOLE) * BigInt(10) ** BigInt(decimals);
  } catch {
    return null;
  }
}

export function isTokenSupplyWholeAmountValid(supply: string, decimals: string): boolean {
  const units = wholeTokensToBaseUnits(supply, decimals);
  const min = minTokenSupplyBaseUnits(Number(decimals));
  if (units === null || min === null) return false;
  if (units > BigInt(Number.MAX_SAFE_INTEGER)) return false;
  return units >= min;
}
