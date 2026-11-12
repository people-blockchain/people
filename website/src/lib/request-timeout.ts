/**
 * Combine a caller's abort signal with a per-request timeout. A slow section of a page must
 * fail on its own budget without cancelling the rest of the page.
 */
export function withTimeoutSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
