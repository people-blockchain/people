/**
 * Combine a caller's abort signal with a per-request timeout. A slow section of a page must
 * fail on its own budget without cancelling the rest of the page.
 *
 * A regular `setTimeout` keeps the event loop alive until the budget fires (unlike
 * `AbortSignal.timeout`, whose timer can be silently dropped on an otherwise idle loop), and
 * it is cleared as soon as either side aborts.
 */
export function withTimeoutSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  function onCallerAbort() {
    clearTimeout(timer);
    controller.abort(signal?.reason);
  }
  const timer = setTimeout(() => {
    signal?.removeEventListener("abort", onCallerAbort);
    controller.abort(new DOMException("The operation timed out", "TimeoutError"));
  }, timeoutMs);
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      controller.abort(signal.reason);
    } else {
      signal.addEventListener("abort", onCallerAbort, { once: true });
    }
  }
  return controller.signal;
}
