"use client";

import { useEffect } from "react";

/** Run `callback` on an interval only while the document tab is visible; re-run when the tab becomes visible again. */
export function useVisibleInterval(callback: () => void, ms: number, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === "visible") callback();
    };
    const id = window.setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [callback, ms, enabled]);
}