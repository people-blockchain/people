/** Stable JSON of signed transaction content, excluding its ID and signature envelope. */
export function transactionIdPayload(tx: object): string {
  const { id: _id, signature: _signature, publicKey: _publicKey, ...content } = tx as Record<string, unknown>;
  function sorted(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted((value as Record<string, unknown>)[key])]));
    }
    return value;
  }
  return JSON.stringify({ domain: "people-transaction-id-v1", content: sorted(content) });
}
