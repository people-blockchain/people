/** Rows from a compat list, whether the body is the historical array or a partial envelope. */
export function compatList<T>(body: unknown, key: "assets" | "accounts" | "pools"): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === "object") {
    const rows = (body as Record<string, unknown>)[key];
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

/** True when a compat object says the read stopped early. Arrays cannot carry the flag in JSON. */
export function compatPartial(body: unknown): boolean {
  return Boolean(
    body && typeof body === "object" && !Array.isArray(body) && (body as { partial?: unknown }).partial === true,
  );
}
