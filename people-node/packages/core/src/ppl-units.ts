/** Native PPL has six decimal places. Growth accounting stores integer micro-PPL. */
export const PPL_SCALE = 1_000_000;
export function pplToAtoms(value: number): number {
  const scaled = value * PPL_SCALE;
  const atoms = Math.round(scaled);
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(atoms) || Math.abs(scaled - atoms) > Math.max(1e-7, Math.abs(scaled) * Number.EPSILON * 2)) {
    throw new Error("PPL amount must fit six decimal places and safe integer units");
  }
  return atoms;
}
