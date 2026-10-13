/** Convert 0x-prefixed 256-bit nullifier to decimal string for NUMERIC(78,0). */
export function nullifierHexToDecimal(nullifierHex: string): string {
  const trimmed = nullifierHex.trim();
  if (!/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    throw new Error("invalid_nullifier");
  }
  return BigInt(trimmed).toString(10);
}
