/**
 * Read env vars with legacy names as fallback (new name first).
 * For `NEXT_PUBLIC_*`, call sites must still use literal `process.env.NEXT_PUBLIC_…`
 * so Next.js can inline values at build time.
 */

export function readEnvWithLegacy(
  primary: string | undefined,
  legacy: string | undefined,
): string | undefined {
  const p = primary?.trim();
  if (p) return p;
  const l = legacy?.trim();
  return l || undefined;
}
