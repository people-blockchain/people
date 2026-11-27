/** Pure helpers for the browser Turnkey session. No I/O. */

export type KitSession = { organizationId?: string; expiry?: number | string } | undefined | null;

export function isUsableTurnkeySession(session: KitSession, subOrganizationId: string, nowMs = Date.now()): boolean {
  if (!session || session.organizationId !== subOrganizationId) return false;
  const raw = Number(session.expiry);
  if (!Number.isFinite(raw) || raw <= 0) return false;
  const expiryMs = raw < 1e12 ? raw * 1000 : raw;
  return expiryMs - nowMs > 60_000;
}

export function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function readStampLoginSession(json: unknown): string {
  const activity = asObject(asObject(json)?.activity);
  const result = asObject(asObject(activity?.result)?.stampLoginResult);
  const token = result?.session;
  return typeof token === "string" ? token : "";
}
