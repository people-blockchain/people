/** Short, secret-free description of an error: URLs and long bodies are never logged. */
export function describeCatalogError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "unknown_error";
  return message.replace(/https?:\/\/\S+/gi, "<url>").replace(/\s+/g, " ").slice(0, 160);
}

/** Logs a swallowed catalog/scan failure with its scope and non-sensitive context. */
export function warnCatalog(scope: string, error: unknown, context: Record<string, string | number | boolean> = {}): void {
  const fields = Object.entries(context)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  console.warn(`[evm-catalog] ${scope} failed${fields ? ` ${fields}` : ""}: ${describeCatalogError(error)}`);
}
