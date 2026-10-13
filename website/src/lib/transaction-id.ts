/**
 * Stable JSON of signed transaction content, excluding its ID and signature envelope.
 *
 * Mirror of `packages/protocol/src/transaction-id.ts` in the People's node monorepo.
 * Kept inside `website/` so Turbopack never has to resolve files outside the
 * project root (local `next build` fails on the cross-root import).
 * `scripts/audit-signing.test.mjs` signs with the protocol copy; keep both identical.
 */
export function transactionIdPayload(tx: object): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- omit id/signature/publicKey from canonical payload
  const { id, signature, publicKey, ...content } = tx as Record<string, unknown>;
  function sorted(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted((value as Record<string, unknown>)[key])]));
    }
    return value;
  }
  return JSON.stringify({ domain: "people-transaction-id-v1", content: sorted(content) });
}
