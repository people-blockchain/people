"use client";

/** Clears a stale body/html scroll lock (e.g. a sheet left open when a wallet
 * in-app browser backgrounded the page for a native warning). */
export function releaseScrollLock() {
  if (typeof document === "undefined") return;
  document.body.style.removeProperty("overflow");
  document.documentElement.style.removeProperty("overflow");
}

/** On mount and whenever the page regains focus/visibility, release any lock. */
export function installScrollLockGuard(): () => void {
  releaseScrollLock();
  const onVis = () => {
    if (document.visibilityState === "visible") releaseScrollLock();
  };
  window.addEventListener("focus", releaseScrollLock);
  window.addEventListener("pageshow", releaseScrollLock);
  document.addEventListener("visibilitychange", onVis);
  return () => {
    window.removeEventListener("focus", releaseScrollLock);
    window.removeEventListener("pageshow", releaseScrollLock);
    document.removeEventListener("visibilitychange", onVis);
  };
}
